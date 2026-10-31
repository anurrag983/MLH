"""Local, read-only source scanner. Findings never include credential values."""
from __future__ import annotations

import ast
import hashlib
import math
import os
import re
import subprocess
from pathlib import Path

EXCLUDED_DIRS = {
    ".git", ".venv", "venv", "node_modules", "vendor", "dist", "build",
    "coverage", ".next", ".cache", "__pycache__", ".idea", ".vscode",
    ".freebuf", ".freebuf-backups", "work", ".npm", ".yarn", ".tox", ".pytest_cache",
    ".mypy_cache", ".ruff_cache", ".turbo", "target", ".gradle",
}
MAX_FILES = 8000
MAX_FILE_BYTES = 1_000_000
SECRET_PATTERNS = [
    ("Live API key", re.compile(r"\bsk_live_[A-Za-z0-9_-]{8,}\b")),
    ("API token", re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b")),
    ("Google API key", re.compile(r"\bAIza[0-9A-Za-z_-]{30,}\b")),
    ("AWS access key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("GitHub token", re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b")),
    ("Private key material", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")),
    ("Credential assignment", re.compile(r"(?i)(?:api[_-]?key|secret|token|password|credential)\s*[:=]\s*(['\"])([^'\"]{8,})\1")),
    # Match literal values only. A generated value such as
    # `token = secrets.token_urlsafe(32)` is code, not a hardcoded secret.
    ("Unquoted credential assignment", re.compile(r"(?i)\b(?:api[_-]?key|secret|token|password|credential)\s*[:=]\s*([A-Za-z0-9_./+=-]{12,})(?![\w.(])")),
]
PLACEHOLDERS = ("your_", "example", "placeholder", "changeme", "fake", "dummy", "redacted", "xxx")
CREDENTIAL_VALUE = re.compile(
    r"(?i)(?:\bapi[_-]?key\b|\btoken\b|\bsecret\b|\bpassword\b|\bcredential\b)"
    r"\s*[:=]\s*(['\"])([^'\"]{16,})\1"
)


def _redact_source_line(line: str) -> str:
    """Mask credential values before source context is returned to the browser."""
    redacted = line
    for label, pattern in SECRET_PATTERNS:
        def mask(match: re.Match[str]) -> str:
            if label == "Credential assignment":
                value = match.group(2)
            elif label == "Unquoted credential assignment":
                value = match.group(1)
            else:
                value = match.group(0)
            return match.group(0).replace(value, "[REDACTED]", 1)

        redacted = pattern.sub(mask, redacted)
    redacted = CREDENTIAL_VALUE.sub(lambda m: m.group(0).replace(m.group(2), "[REDACTED]", 1), redacted)
    return redacted.rstrip("\r\n")


def shannon_entropy(value: str) -> float:
    if not value:
        return 0.0
    return -sum((value.count(char) / len(value)) * math.log2(value.count(char) / len(value)) for char in set(value))


def _candidate_files(root: Path) -> list[Path]:
    root = root.resolve()
    files: list[Path] = []
    try:
        tracked = set(subprocess.run(["git", "ls-files", "-z"], cwd=root, capture_output=True, text=True, timeout=5).stdout.split("\0"))
    except (OSError, subprocess.SubprocessError):
        tracked = set()
    for folder, dirs, names in os.walk(root, followlinks=False):
        dirs[:] = [d for d in dirs if d not in EXCLUDED_DIRS and not d.startswith(".git")]
        for name in names:
            path = Path(folder) / name
            is_env_file = name == ".env" or name.startswith(".env.")
            rel = path.relative_to(root).as_posix()
            if is_env_file and name != ".env.example" and rel not in tracked:
                # Local environment files are intentionally private and usually ignored.
                # Unignored local env files are scanned because `git add -A` could stage them.
                try:
                    ignored = subprocess.run(["git", "check-ignore", "-q", "--", rel], cwd=root, timeout=5).returncode == 0
                except (OSError, subprocess.SubprocessError):
                    ignored = False
                if ignored:
                    continue
            try:
                if path.is_symlink() or not path.resolve().is_relative_to(root):
                    continue
                if path.stat().st_size <= MAX_FILE_BYTES:
                    files.append(path)
            except OSError:
                continue
            if len(files) >= MAX_FILES:
                return files
    return files


def _relative(path: Path, root: Path) -> str:
    try:
        return path.resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return path.name


def _is_guarded(lines: list[str], line_number: int, denominator: str) -> bool:
    previous = "\n".join(lines[max(0, line_number - 7): line_number - 1])
    name = re.escape(denominator)
    return bool(re.search(rf"\bif\s+(?:not\s+)?{name}\b|\bif\s+{name}\s*==\s*0\b", previous))


def scan_file(path: Path, root: Path) -> list[dict]:
    findings: list[dict] = []
    try:
        content = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return findings
    lines = content.splitlines()
    relative = _relative(path, root)
    for number, line in enumerate(lines, 1):
        if re.search(r"(?i)os\.(?:getenv|environ)|process\.env|import\.meta\.env", line):
            continue
        secret = None
        secret_value = None
        for label, pattern in SECRET_PATTERNS:
            match = pattern.search(line)
            if not match:
                continue
            value = match.group(2) if label == "Credential assignment" else match.group(1) if label == "Unquoted credential assignment" else match.group(0)
            if len(value) < 10 or any(word in value.lower() for word in PLACEHOLDERS):
                continue
            secret, secret_value = label, value
            break
        if not secret:
            # Entropy catches opaque assignments while avoiding short labels and common placeholders.
            assignment = CREDENTIAL_VALUE.search(line)
            if assignment and shannon_entropy(assignment.group(2)) >= 3.7:
                secret, secret_value = "High-entropy credential", assignment.group(2)
        if secret:
            assignment = re.match(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(['\"])", line)
            is_python_assignment = path.suffix == ".py" and bool(assignment and re.search(r"API[_-]?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL", assignment.group(1), re.I))
            findings.append({
                "type": "secret", "severity": "high", "rule": secret,
                "file": relative, "line": number,
                "entropy": round(shannon_entropy(secret_value or ""), 2),
                "detail": "Credential-like value found; the value is hidden. Revoke or rotate it if real.",
                "remediation": "Move the value to a private environment variable. If it is real, revoke or rotate it and remove it from Git history.",
                "fixable": is_python_assignment,
            })
        if path.suffix == ".py":
            division = re.search(r"\breturn\s+([A-Za-z_]\w*)\s*/\s*([A-Za-z_]\w*)\b", line)
            if division and not _is_guarded(lines, number, division.group(2)):
                findings.append({
                    "type": "bug", "severity": "high", "rule": "Unprotected division",
                    "file": relative, "line": number, "entropy": 0,
                    "detail": "This return can raise ZeroDivisionError when its denominator is zero.",
                    "remediation": "Check the denominator before dividing, then choose a fallback that matches your application's expected behavior.",
                    "fixable": True,
                })
    for finding in findings:
        center = int(finding["line"])
        first = max(1, center - 3)
        last = min(len(lines), center + 3)
        finding["code_context"] = [
            {"line": number, "text": _redact_source_line(lines[number - 1]), "current": number == center}
            for number in range(first, last + 1)
        ]
    return findings


def git_info(root: Path) -> dict:
    def run(args: list[str]) -> subprocess.CompletedProcess:
        return subprocess.run(args, cwd=root, capture_output=True, text=True, timeout=8)

    try:
        inside = run(["git", "rev-parse", "--is-inside-work-tree"])
        if inside.returncode:
            return {"available": False, "branch": "", "remote": "", "github_remote": False, "status": "This folder is not a Git repository.", "changed_files": []}
        branch = run(["git", "branch", "--show-current"]).stdout.strip()
        status = run(["git", "status", "--short", "--branch"]).stdout.strip()
        remotes = run(["git", "remote", "-v"]).stdout.splitlines()
        remote_url = ""
        origin = next((line for line in remotes if line.startswith("origin\t") and line.endswith("(fetch)")), "")
        if origin:
            remote_url = origin.split()[1]
            remote_url = re.sub(r"(https?://)[^/@]+@", r"\1***@", remote_url)
        porcelain = run(["git", "status", "--porcelain", "--untracked-files=all"]).stdout
        files = []
        for row in porcelain.splitlines():
            name = row[3:].split(" -> ")[-1] if len(row) >= 4 else ""
            if name:
                files.append(name)
        github_remote = bool(re.match(r"(?:https://(?:[^/@]+@)?github\.com/|git@github\.com:)", remote_url))
        return {"available": True, "branch": branch or "(detached HEAD)", "remote": remote_url, "github_remote": github_remote, "status": status, "changed_files": sorted(set(files))}
    except (OSError, subprocess.SubprocessError):
        return {"available": False, "branch": "", "remote": "", "github_remote": False, "status": "Git is unavailable.", "changed_files": []}


def git_diff(root: Path) -> str:
    try:
        unstaged = subprocess.run(["git", "diff", "--no-ext-diff", "--unified=0", "--"], cwd=root, capture_output=True, text=True, timeout=10)
        staged = subprocess.run(["git", "diff", "--cached", "--no-ext-diff", "--unified=0", "--"], cwd=root, capture_output=True, text=True, timeout=10)
        return staged.stdout + "\n" + unstaged.stdout
    except (OSError, subprocess.SubprocessError):
        return ""


def scan(root: Path) -> dict:
    root = root.resolve()
    files = _candidate_files(root)
    findings: list[dict] = []
    for path in files:
        findings.extend(scan_file(path, root))

    info = git_info(root)
    # Also inspect staged and unstaged additions in ignored/large files that are outside the regular walk.
    existing_secret_files = {finding["file"] for finding in findings if finding["type"] == "secret"}
    current_file = ""
    new_line_number: int | None = None
    for diff_line in git_diff(root).splitlines():
        if diff_line.startswith("+++ b/"):
            current_file = diff_line[6:]
            new_line_number = None
            continue
        hunk = re.match(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@", diff_line)
        if hunk:
            new_line_number = int(hunk.group(1))
            continue
        if not current_file or diff_line.startswith("\\"):
            continue
        if diff_line.startswith("+") and not diff_line.startswith("+++"):
            addition = diff_line[1:]
            line_number = new_line_number
            if new_line_number is not None:
                new_line_number += 1
            if current_file in existing_secret_files:
                continue
            # The same safe environment-backed patterns are ignored in scan_file().
            # Keep Git-diff scanning consistent so API_KEY = os.environ.get(...)
            # is not misreported as an unquoted hardcoded credential.
            if re.search(r"(?i)os\.(?:getenv|environ)|process\.env|import\.meta\.env", addition):
                continue
            for label, pattern in SECRET_PATTERNS:
                match = pattern.search(addition)
                if not match:
                    continue
                value = match.group(2) if label == "Credential assignment" else match.group(1) if label == "Unquoted credential assignment" else match.group(0)
                if len(value) >= 10 and not any(word in value.lower() for word in PLACEHOLDERS):
                    code_context = []
                    relative = Path(current_file)
                    if not relative.is_absolute() and ".." not in relative.parts and line_number:
                        candidate = (root / relative).resolve()
                        if candidate.is_relative_to(root) and candidate.is_file() and not candidate.is_symlink():
                            try:
                                source_lines = candidate.read_text(encoding="utf-8").splitlines()
                                if 1 <= line_number <= len(source_lines):
                                    first = max(1, line_number - 3)
                                    last = min(len(source_lines), line_number + 3)
                                    code_context = [
                                        {"line": number, "text": _redact_source_line(source_lines[number - 1]), "current": number == line_number}
                                        for number in range(first, last + 1)
                                    ]
                            except (OSError, UnicodeError):
                                pass
                    if not code_context and line_number:
                        code_context = [{"line": line_number, "text": _redact_source_line(addition), "current": True}]
                    findings.append({
                        "type": "secret", "severity": "high", "rule": f"Git diff: {label}",
                        "file": current_file, "line": line_number,
                        "entropy": round(shannon_entropy(value), 2),
                        "detail": "A credential-like value was added in Git changes; the value is hidden.",
                        "remediation": "Inspect this exact changed line. Replace a hardcoded value with a private environment variable. If the credential is real, revoke or rotate it; removing it from the current file does not erase Git history.",
                        "fixable": False, "code_context": code_context, "source": "git_diff",
                    })
                    existing_secret_files.add(current_file)
                break
        elif diff_line.startswith(" ") and new_line_number is not None:
            new_line_number += 1
    unique = {(f["type"], f["rule"], f["file"], f["line"]): f for f in findings}
    findings = list(unique.values())
    high = sum(f["severity"] == "high" for f in findings)
    medium = sum(f["severity"] == "medium" for f in findings)
    score = max(0, 100 - high * 30 - medium * 12)
    status = "COMMIT BLOCKED" if high else "REVIEW REQUIRED" if medium else "READY TO SHIP"
    audits = [
        {"category": "Secret handling", "status": "Review required" if any(f["type"] == "secret" for f in findings) else "No findings", "detail": "Scans source files for common credential patterns; this cannot prove a repository has no secrets."},
        {"category": "Runtime safety", "status": "Review required" if any(f["type"] == "bug" for f in findings) else "No findings", "detail": "Checks a small set of obvious unsafe division patterns; it does not execute or fully analyze the program."},
        {"category": "Performance", "status": "Not analyzed", "detail": "FreeBuff does not currently run a performance profiler."},
    ]
    return {"score": score, "status": status, "findings": findings, "audits": audits, "files_scanned": len(files), "git": info}


def make_fix(root: Path, finding: dict) -> dict:
    """Return a narrowly-scoped patch preview for known safe Python edits."""
    root = root.resolve()
    relative = Path(str(finding.get("file", "")))
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError("Finding path is not a safe workspace-relative path.")
    unresolved_path = root / relative
    if unresolved_path.is_symlink():
        raise ValueError("FreeBuff will not edit a symbolic link.")
    path = unresolved_path.resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise ValueError("The selected file is outside the workspace or is not a regular file.")
    original_source = path.read_text(encoding="utf-8")
    lines = original_source.splitlines(keepends=True)
    number = int(finding.get("line") or 0)
    if number < 1 or number > len(lines):
        raise ValueError("The finding is stale; scan the project again.")
    original = lines[number - 1]
    replacement = None
    explanation = ""
    import_position = None
    if finding.get("type") == "secret" and path.suffix == ".py":
        match = re.match(r"^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(['\"])(.*?)\3(\s*(?:#.*)?\n?)$", original, re.I)
        if match:
            indent, variable, _quote, _value, suffix = match.groups()
            if re.search(r"API[_-]?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL", variable, re.I):
                replacement = f'{indent}{variable} = os.environ.get("{variable}", ""){suffix}'
                explanation = f"Replaces the literal with an environment lookup. Set {variable} in your private environment configuration before running the app; FreeBuff will not copy the old value. If it was real, revoke/rotate it because removing it from this file does not erase Git history."
                source = "".join(lines)
                try:
                    tree = ast.parse(source)
                except SyntaxError as exc:
                    raise ValueError(f"Cannot safely edit invalid Python: {exc}") from exc
                imports_os = any(isinstance(n, ast.Import) and any(a.name == "os" and a.asname is None for a in n.names) for n in tree.body)
                if not imports_os:
                    insertion = 0
                    if tree.body and isinstance(tree.body[0], ast.Expr) and isinstance(tree.body[0].value, (ast.Str, ast.Constant)) and isinstance(getattr(tree.body[0].value, "value", None), str):
                        insertion = tree.body[0].end_lineno or tree.body[0].lineno
                    for node in tree.body:
                        if isinstance(node, ast.ImportFrom) and node.module == "__future__":
                            insertion = max(insertion, node.end_lineno or node.lineno)
                    import_position = insertion
                lines[number - 1] = replacement
    elif finding.get("type") == "bug" and path.suffix == ".py":
        match = re.match(r"^(\s*)return\s+([A-Za-z_]\w*)\s*/\s*([A-Za-z_]\w*)\s*(#.*)?(\n?)$", original)
        if match:
            indent, numerator, denominator, _comment, newline = match.groups()
            newline = newline or "\n"
            replacement = f"{indent}if {denominator} == 0:{newline}{indent}    return 0.0{newline}{indent}return {numerator} / {denominator}{newline}"
            explanation = "Adds a zero-denominator fallback of 0.0. Review that this fallback matches your application's expected behavior."
    if replacement is None:
        raise ValueError("FreeBuff has no verified automatic fix for this finding yet. Review it manually.")
    lines[number - 1] = replacement
    if import_position is not None:
        lines.insert(import_position, "import os\n")
        if import_position and lines[import_position - 1].strip():
            lines.insert(import_position, "\n")
    updated = "".join(lines)
    try:
        ast.parse(updated)
    except SyntaxError as exc:
        raise ValueError(f"Proposed edit does not pass Python syntax validation: {exc}") from exc
    import difflib
    diff = "".join(difflib.unified_diff(original_source.splitlines(keepends=True), updated.splitlines(keepends=True), fromfile=finding["file"], tofile=finding["file"] + " (proposed)"))
    if finding.get("type") == "secret":
        old_line = original_source.splitlines()[int(finding["line"]) - 1]
        old_assignment = re.match(r"^(\s*[A-Za-z_][A-Za-z0-9_]*\s*=\s*)(['\"])(.*?)\2(\s*(?:#.*)?)$", old_line)
        if old_assignment:
            prefix, quote, _value, suffix = old_assignment.groups()
            redacted_line = f'{prefix}{quote}[REDACTED]{quote}{suffix}'
            diff_lines = diff.splitlines(keepends=True)
            for index, diff_line in enumerate(diff_lines):
                if diff_line.startswith("-") and not diff_line.startswith("---") and diff_line[1:].rstrip("\r\n") == old_line:
                    ending = "\r\n" if diff_line.endswith("\r\n") else "\n" if diff_line.endswith("\n") else ""
                    diff_lines[index] = "-" + redacted_line + ending
            diff = "".join(diff_lines)
    if not diff:
        raise ValueError("The selected issue has already changed; scan again.")
    source_hash = hashlib.sha256(original_source.encode("utf-8")).hexdigest()
    return {"file": finding["file"], "line": finding.get("line"), "rule": finding.get("rule"), "diff": diff, "explanation": explanation, "source_hash": source_hash, "updated_source": updated}
