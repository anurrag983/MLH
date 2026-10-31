"""Workspace actions shared by the local API and CLI."""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from pathlib import PurePosixPath
from typing import Any

from dotenv import load_dotenv, set_key, unset_key

from . import ai_engine, scanner

ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env"
STATE_PATH = ROOT / "backend" / "state.json"
IMPORTS_DIR = ROOT / ".freebuf" / "imports"
MAX_IMPORT_FILE_BYTES = 1_000_000
MAX_IMPORT_TOTAL_BYTES = 25 * 1024 * 1024
MAX_IMPORT_FILES = 4000
load_dotenv(ENV_PATH)
STATE_LOCK = threading.RLock()


def _workspace() -> Path:
    raw = os.getenv("FREEBUF_WORKSPACE", "").strip()
    try:
        candidate = Path(raw).expanduser().resolve(strict=True) if raw else ROOT.resolve()
    except (OSError, RuntimeError):
        candidate = ROOT.resolve()
    return candidate if candidate.is_dir() else ROOT.resolve()


def _workspace_is_selected() -> bool:
    raw = os.getenv("FREEBUF_WORKSPACE", "").strip()
    if not raw:
        return False
    try:
        return Path(raw).expanduser().resolve(strict=True).is_dir()
    except (OSError, RuntimeError):
        return False


def _selected_workspace() -> Path:
    if not _workspace_is_selected():
        raise ValueError("Choose your application's project folder above before running this action.")
    return _workspace()


def _initial_state() -> dict[str, Any]:
    return {
        "scan": {"score": 0, "status": "SELECT A PROJECT", "findings": [], "audits": [], "files_scanned": 0, "git": {"available": False, "remote": "", "github_remote": False, "branch": "", "status": "Choose a project folder to begin.", "changed_files": []}},
        "ship": {"commit_message": "", "review": [], "release_notes": "", "git_status": ""},
        "activity": [],
        "ai": {"provider": "Local Analyzer", "model": "Local Analyzer", "status": "Offline analysis is ready; no source is sent to an AI service."},
        "workspace": {},
        "fix": {},
    }


def _public_state(state: dict[str, Any]) -> dict[str, Any]:
    state = dict(state)
    state.pop("crash", None)
    selected = _workspace_is_selected()
    root = _workspace()
    imported = False
    if selected:
        try:
            imported = root.is_relative_to(IMPORTS_DIR.resolve()) and root != IMPORTS_DIR.resolve()
        except (OSError, RuntimeError):
            imported = False
    state["workspace"] = {"path": str(root) if selected else "", "name": (root.name or str(root)) if selected else "", "selected": selected, "imported": imported}
    return state


def read_state() -> dict[str, Any]:
    with STATE_LOCK:
        try:
            raw = json.loads(STATE_PATH.read_text(encoding="utf-8"))
            state = _initial_state()
            if isinstance(raw, dict):
                state.update({key: value for key, value in raw.items() if key not in {"crash", "workspace"}})
            state.setdefault("ship", _initial_state()["ship"])
            state.setdefault("activity", [])
            state.setdefault("ai", _initial_state()["ai"])
            state.setdefault("fix", {})
        except (OSError, json.JSONDecodeError):
            state = _initial_state()
        return _public_state(state)


def write_state(state: dict[str, Any]) -> dict[str, Any]:
    with STATE_LOCK:
        state["updated_at"] = datetime.now(timezone.utc).isoformat()
        STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        serializable = dict(state)
        serializable.pop("workspace", None)
        serializable.pop("crash", None)
        fd, tmp = tempfile.mkstemp(prefix="state-", suffix=".json", dir=STATE_PATH.parent)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(serializable, handle, indent=2, ensure_ascii=False)
                handle.write("\n")
            os.replace(tmp, STATE_PATH)
        finally:
            if os.path.exists(tmp):
                os.unlink(tmp)
        return _public_state(state)


def log_activity(message: str, state: dict | None = None) -> dict:
    state = state or read_state()
    events = state.setdefault("activity", [])
    now = datetime.now(timezone.utc)
    if events and events[0].get("message") == message:
        try:
            previous = datetime.fromisoformat(events[0]["time"])
            if (now - previous).total_seconds() < 2:
                return state
        except (KeyError, TypeError, ValueError):
            pass
    events.insert(0, {"time": now.isoformat(), "message": message})
    state["activity"] = events[:80]
    return state


def initialize() -> dict[str, Any]:
    """Refresh local status on startup; never edits or executes project files."""
    state = read_state()
    state["scan"] = scanner.scan(_workspace()) if _workspace_is_selected() else _initial_state()["scan"]
    state["fix"] = {}
    state["ship"] = {"commit_message": "", "review": [], "release_notes": "", "git_status": state["scan"]["git"]["status"], "git": state["scan"]["git"]}
    return write_state(state)


def reset_local_account_data() -> None:
    """Clear FreeBuff's saved workspace selection and history, not project files."""
    with STATE_LOCK:
        if ENV_PATH.is_symlink():
            raise ValueError("The FreeBuff settings file cannot be a symbolic link.")
        try:
            if ENV_PATH.exists():
                unset_key(str(ENV_PATH), "FREEBUF_WORKSPACE")
        except OSError as exc:
            raise ValueError("Could not clear the saved FreeBuff workspace selection.") from exc
        os.environ.pop("FREEBUF_WORKSPACE", None)
        write_state(_initial_state())


def set_workspace(raw_path: str) -> dict[str, Any]:
    if not raw_path or len(raw_path) > 2048:
        raise ValueError("Enter the full path to a project folder.")
    try:
        candidate = Path(raw_path).expanduser().resolve(strict=True)
    except (OSError, RuntimeError) as exc:
        raise ValueError("That folder does not exist or cannot be opened.") from exc
    if not candidate.is_dir() or candidate == Path(candidate.anchor) or candidate == Path.home().resolve():
        raise ValueError("Choose a project folder, not a drive root or your entire home folder.")
    try:
        if not ENV_PATH.exists():
            ENV_PATH.touch(mode=0o600, exist_ok=True)
        set_key(str(ENV_PATH), "FREEBUF_WORKSPACE", str(candidate))
    except Exception:
        pass
    os.environ["FREEBUF_WORKSPACE"] = str(candidate)
    state = read_state()
    state["scan"] = scanner.scan(candidate)
    state["fix"] = {}
    state["ship"] = {"commit_message": "", "review": [], "release_notes": "", "git_status": state["scan"]["git"]["status"]}
    log_activity(f"Workspace changed to {candidate.name}", state)
    return write_state(state)


def clone_github_repository(raw_url: str) -> dict[str, Any]:
    """Clone a GitHub repository into the user's Documents folder and select it."""
    value = (raw_url or "").strip()
    if len(value) > 500:
        raise ValueError("That GitHub link is too long. Paste the repository's main page URL.")
    match = re.fullmatch(
        r"(?:https://github\.com/|git@github\.com:)([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+?)(?:\.git)?/?",
        value,
        re.IGNORECASE,
    )
    if not match:
        raise ValueError("Paste a GitHub repository URL like https://github.com/owner/repository.")
    owner, repository = match.groups()
    if owner in {".", ".."} or repository in {".", ".."}:
        raise ValueError("That GitHub repository link is not valid.")

    # Rebuild the network URL from validated components so embedded credentials,
    # query strings, and non-GitHub hosts can never reach the Git subprocess.
    clone_url = f"https://github.com/{owner}/{repository}.git"
    parent = Path.home() / "Documents" / "FreeBuff Projects"
    if parent.is_symlink():
        raise ValueError("The FreeBuff Projects folder cannot be a symbolic link.")
    try:
        parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        parent = parent.resolve(strict=True)
    except OSError as exc:
        raise ValueError(f"Could not create {parent}. Allow the terminal running FreeBuff to access Documents, then try again. ({exc})") from exc
    if not parent.is_dir():
        raise ValueError("The FreeBuff Projects location is not a folder.")

    folder_name = re.sub(r"[^A-Za-z0-9._-]+", "-", repository).strip(".-_")[:80] or "github-project"
    destination = parent / folder_name
    suffix = 2
    while True:
        try:
            # Reserve an empty destination atomically, so failure cleanup can
            # only remove the directory created by this clone request.
            destination.mkdir(mode=0o700)
            break
        except FileExistsError:
            destination = parent / f"{folder_name}-{suffix}"
            suffix += 1

    gh = _github_cli()
    gh_authenticated = False
    env = dict(os.environ, GIT_TERMINAL_PROMPT="0", GH_PROMPT_DISABLED="1", GH_NO_UPDATE_NOTIFIER="1")
    if gh:
        try:
            auth_status = subprocess.run(
                [gh, "auth", "status", "--hostname", "github.com"],
                cwd=ROOT,
                capture_output=True,
                text=True,
                timeout=15,
                env=env,
            )
            gh_authenticated = auth_status.returncode == 0
        except (OSError, subprocess.SubprocessError):
            gh_authenticated = False

    command = [gh, "repo", "clone", f"{owner}/{repository}", str(destination)] if gh_authenticated else ["git", "clone", "--", clone_url, str(destination)]
    try:
        cloned = subprocess.run(command, cwd=parent, capture_output=True, text=True, timeout=300, env=env)
    except subprocess.TimeoutExpired as exc:
        shutil.rmtree(destination, ignore_errors=True)
        raise ValueError("Cloning took too long. Check the repository size and your internet connection, then try again.") from exc
    except OSError as exc:
        shutil.rmtree(destination, ignore_errors=True)
        raise ValueError(f"Could not start Git to clone this project: {exc}") from exc
    if cloned.returncode:
        shutil.rmtree(destination, ignore_errors=True)
        details = (cloned.stderr or cloned.stdout or "GitHub could not clone this repository.").strip()
        lowered = details.lower()
        if "authentication" in lowered or "permission denied" in lowered or "repository not found" in lowered or "could not read username" in lowered:
            raise ValueError("GitHub could not access that repository. Check the URL and visibility. For a private repository, sign in to GitHub CLI once and retry.")
        raise ValueError(details[:1200])

    state = set_workspace(str(destination))
    state = read_state()
    log_activity(f"Cloned GitHub project {owner}/{repository}", state)
    return write_state(state)


def import_folder(name: str, files: list[dict[str, str]]) -> dict[str, Any]:
    """Create a safe, local review copy for browsers that hide dropped folder paths."""
    normalized_name = re.sub(r"[^A-Za-z0-9._-]+", "-", name.strip()).strip(".-_")[:64] or "project"
    normalized_files: list[tuple[PurePosixPath, bytes]] = []
    seen: set[str] = set()
    total_bytes = 0
    private_names = {".netrc", ".npmrc", "id_rsa", "id_ed25519", "credentials.json"}

    for item in files:
        raw_path = item.get("path", "")
        if not isinstance(raw_path, str) or not raw_path or "\\" in raw_path or "\x00" in raw_path:
            raise ValueError("A dropped file has an invalid path. Try dropping the project folder again.")
        relative = PurePosixPath(raw_path)
        if not relative.parts or relative.is_absolute() or any(part in {"", ".", ".."} for part in relative.parts) or (relative.parts and ":" in relative.parts[0]):
            raise ValueError("A dropped file path tried to leave the selected folder; no files were imported.")
        if any(part in scanner.EXCLUDED_DIRS or part.startswith(".git") for part in relative.parts[:-1]):
            continue
        basename = relative.name.lower()
        if basename in private_names or (basename.startswith(".env") and basename != ".env.example") or basename.endswith((".pem", ".p12", ".pfx")):
            continue
        content = item.get("content", "")
        if not isinstance(content, str):
            raise ValueError("A dropped file could not be read as text.")
        encoded = content.encode("utf-8")
        if len(encoded) > MAX_IMPORT_FILE_BYTES or b"\x00" in encoded:
            continue
        normalized = relative.as_posix()
        if normalized in seen:
            raise ValueError("The dropped folder contains duplicate file paths; no files were imported.")
        seen.add(normalized)
        total_bytes += len(encoded)
        if total_bytes > MAX_IMPORT_TOTAL_BYTES:
            raise ValueError("The readable files are larger than FreeBuff's 25 MB import limit. Paste the original folder path below to scan it directly.")
        if len(normalized_files) >= MAX_IMPORT_FILES:
            raise ValueError(f"The project has more than {MAX_IMPORT_FILES} supported text files to import. Paste the original folder path below to work with the full folder and its Git history.")
        normalized_files.append((relative, encoded))

    if not normalized_files:
        raise ValueError("No supported text files were found. Paste the original folder path below to scan it directly.")

    IMPORTS_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    try:
        os.chmod(IMPORTS_DIR.parent, 0o700)
        os.chmod(IMPORTS_DIR, 0o700)
    except OSError:
        pass
    destination = IMPORTS_DIR / normalized_name
    index = 2
    while True:
        try:
            destination.mkdir(mode=0o700)
            break
        except FileExistsError:
            destination = IMPORTS_DIR / f"{normalized_name}-{index}"
            index += 1

    try:
        safe_root = destination.resolve(strict=True)
        for relative, content in normalized_files:
            target = safe_root.joinpath(*relative.parts)
            if not target.resolve(strict=False).is_relative_to(safe_root):
                raise ValueError("A dropped file path escaped the local import folder.")
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            with target.open("xb") as handle:
                handle.write(content)
    except Exception:
        shutil.rmtree(destination, ignore_errors=True)
        raise

    state = set_workspace(str(destination))
    state = read_state()
    log_activity(f"Imported a local review copy ({len(normalized_files)} text files); original folder unchanged", state)
    return write_state(state)


def browse_folder() -> dict[str, str | bool]:
    """The backend cannot open a desktop picker; folder selection happens in the browser."""
    raise ValueError("Use FreeBuff's browser folder picker, or paste the full local folder path to work with the original and its Git history.")


def run_scan() -> dict:
    root = _selected_workspace()
    state = read_state()
    state["scan"] = scanner.scan(root)
    state["fix"] = {}
    state["ship"] = {"commit_message": "", "review": [], "release_notes": "", "git_status": state["scan"]["git"]["status"], "git": state["scan"]["git"]}
    log_activity(f"Project scan finished: {state['scan']['status']} ({state['scan']['score']}/100)", state)
    return write_state(state)


def _fresh_finding(file: str, line: int, rule: str) -> dict:
    current = scanner.scan(_selected_workspace())
    for finding in current["findings"]:
        if finding.get("file") == file and finding.get("line") == line and finding.get("rule") == rule:
            return finding
    raise ValueError("This finding has changed or is no longer present. Scan the project again.")


def preview_fix(file: str, line: int, rule: str) -> dict:
    root = _selected_workspace()
    finding = _fresh_finding(file, line, rule)
    preview = scanner.make_fix(root, finding)
    safe_preview = {key: value for key, value in preview.items() if key != "updated_source"}
    state = read_state()
    state["fix"] = safe_preview
    log_activity(f"Prepared a fix preview for {file}:{line}", state)
    write_state(state)
    return safe_preview


def apply_fix(file: str, line: int, rule: str, source_hash: str) -> dict:
    root = _selected_workspace()
    finding = _fresh_finding(file, line, rule)
    preview = scanner.make_fix(root, finding)
    if not source_hash or preview["source_hash"] != source_hash:
        raise ValueError("This file changed after the preview. Review a fresh preview before saving.")
    target_path = root / finding["file"]
    if target_path.is_symlink():
        raise ValueError("FreeBuff will not replace a symbolic link.")
    target = target_path.resolve()
    backup_root = Path(os.getenv("FREEBUF_DATA_DIR", str(Path.home() / ".local" / "share" / "freebuf"))).expanduser() / "backups"
    try:
        backup_root.mkdir(parents=True, exist_ok=True)
        os.chmod(backup_root, 0o700)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        backup = backup_root / f"{stamp}-{target.name}.bak"
        shutil.copy2(target, backup)
        os.chmod(backup, 0o600)
        mode = target.stat().st_mode
        fd, tmp = tempfile.mkstemp(prefix=f".{target.name}.", suffix=".freebuf-tmp", dir=target.parent)
        try:
            with os.fdopen(fd, "w", encoding="utf-8", newline="") as handle:
                handle.write(preview["updated_source"])
            os.chmod(tmp, mode)
            os.replace(tmp, target)
        finally:
            if os.path.exists(tmp):
                os.unlink(tmp)
    except OSError as exc:
        raise ValueError(f"Could not safely save the change: {exc}") from exc
    state = read_state()
    state["scan"] = scanner.scan(root)
    state["fix"] = {"file": finding["file"], "line": line, "rule": rule, "saved": True, "backup": str(backup), "explanation": preview["explanation"]}
    log_activity(f"Saved reviewed fix to {finding['file']} (backup created)", state)
    return write_state(state)


def ship() -> dict:
    root = _selected_workspace()
    scan = scanner.scan(root)
    status = scan["git"]["status"]
    diff = scanner.git_diff(root)
    summary = ai_engine.create_ship_summary(diff, status, scan["git"].get("changed_files", []))
    summary["git"] = scan["git"]
    state = read_state()
    state["scan"] = scan
    state["ship"] = summary
    log_activity("Generated local Git review and release notes", state)
    return write_state(state)


def _append_commit_changelog(root: Path, message: str) -> tuple[int, bytes | None, int | None]:
    path = root / "CHANGELOG.md"
    if path.is_symlink() or not path.resolve().is_relative_to(root):
        raise ValueError("FreeBuff will not write a changelog outside the selected project.")
    original = path.read_bytes() if path.exists() else None
    mode = path.stat().st_mode if path.exists() else None
    existing = original.decode("utf-8") if original is not None else "# Changelog\n"
    numbers = [int(value) for value in re.findall(r"(?m)^## Commit (\d+)(?:\s|$)", existing)]
    number = max(numbers, default=0) + 1

    changed = subprocess.run(["git", "diff", "--cached", "--name-only"], cwd=root, capture_output=True, text=True, timeout=10)
    if changed.returncode:
        raise ValueError((changed.stderr or "Could not read the staged file list for the changelog.").strip())
    files = changed.stdout.splitlines()
    if "CHANGELOG.md" not in files:
        files.append("CHANGELOG.md")
    safe_message = " ".join(message.replace("\r", " ").replace("\n", " ").split())

    def code(value: str) -> str:
        safe = value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("`", "\\`")
        return f"`{safe}`"

    entry = [f"## Commit {number} — {safe_message}", "", f"- Date: {datetime.now().astimezone().strftime('%Y-%m-%d %H:%M %Z')}", f"- Files changed: {len(files)}"]
    for file in files[:50]:
        entry.append(f"  - {code(file)}")
    if len(files) > 50:
        entry.append(f"  - and {len(files) - 50} more files")
    updated = existing.rstrip() + "\n\n" + "\n".join(entry) + "\n"
    fd, temporary = tempfile.mkstemp(prefix=".CHANGELOG.", suffix=".tmp", dir=root)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as handle:
            handle.write(updated)
        if mode is not None:
            os.chmod(temporary, mode)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)

    staged = subprocess.run(["git", "add", "--", "CHANGELOG.md"], cwd=root, capture_output=True, text=True, timeout=10)
    if staged.returncode:
        try:
            _restore_changelog_after_failed_commit(root, original, mode)
        except OSError:
            pass
        raise ValueError((staged.stderr or "Could not stage the automatic changelog entry.").strip())
    return number, original, mode


def _restore_changelog_after_failed_commit(root: Path, original: bytes | None, mode: int | None) -> None:
    path = root / "CHANGELOG.md"
    if original is None:
        if path.exists() or path.is_symlink():
            path.unlink()
        subprocess.run(["git", "rm", "--cached", "--ignore-unmatch", "--", "CHANGELOG.md"], cwd=root, capture_output=True, text=True, timeout=10)
        return
    fd, temporary = tempfile.mkstemp(prefix=".CHANGELOG.", suffix=".tmp", dir=root)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(original)
        if mode is not None:
            os.chmod(temporary, mode)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    subprocess.run(["git", "add", "--", "CHANGELOG.md"], cwd=root, capture_output=True, text=True, timeout=10)


def commit(message: str | None = None) -> dict:
    root = _selected_workspace()
    state = read_state()
    message = (message or state.get("ship", {}).get("commit_message") or "").strip()
    state.setdefault("ship", {})["commit_succeeded"] = False
    state["ship"]["push_succeeded"] = False
    if not message:
        state["ship"]["commit_result"] = "Generate or enter a commit message first."
    elif not re.match(r"^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^)]+\))?!?: .+", message):
        state["ship"]["commit_result"] = "Use a Conventional Commit message, for example: fix(auth): validate the login token."
    else:
        scan = scanner.scan(root)
        state["scan"] = scan
        if any(item["severity"] == "high" for item in scan["findings"]):
            state["ship"]["commit_result"] = "Commit stopped: high-severity findings remain. Review the scan findings first."
        elif not scan["git"]["available"]:
            state["ship"]["commit_result"] = "This folder is not a Git repository. Run `git init` here or select a Git project."
        else:
            changelog_snapshot: bytes | None = None
            changelog_mode: int | None = None
            changelog_number: int | None = None
            head_before = ""
            try:
                subprocess.run(["git", "add", "-A"], cwd=root, capture_output=True, text=True, timeout=20, check=True)
                staged = subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=root, capture_output=True, text=True, timeout=8)
                if staged.returncode == 0:
                    state["ship"]["commit_result"] = "Nothing new to commit; the working tree has no staged changes."
                else:
                    before = subprocess.run(["git", "rev-parse", "--verify", "HEAD"], cwd=root, capture_output=True, text=True, timeout=8)
                    head_before = before.stdout.strip() if before.returncode == 0 else ""
                    changelog_number, changelog_snapshot, changelog_mode = _append_commit_changelog(root, message)
                    made = subprocess.run(["git", "commit", "-m", message], cwd=root, capture_output=True, text=True, timeout=30)
                    result_text = (made.stdout if made.returncode == 0 else made.stderr).strip()
                    after = subprocess.run(["git", "rev-parse", "--verify", "HEAD"], cwd=root, capture_output=True, text=True, timeout=8)
                    commit_created = after.returncode == 0 and after.stdout.strip() != head_before
                    state["ship"]["commit_succeeded"] = made.returncode == 0 or commit_created
                    if state["ship"]["commit_succeeded"]:
                        detail = f"\nAdded Commit {changelog_number} to CHANGELOG.md." if changelog_number else ""
                        if made.returncode and commit_created:
                            result_text = (result_text + "\nGit created the commit, but a post-commit hook reported an error.").strip()
                        state["ship"]["commit_result"] = (result_text or "Git commit finished without output.") + detail
                    else:
                        try:
                            _restore_changelog_after_failed_commit(root, changelog_snapshot, changelog_mode)
                        except OSError as restore_error:
                            result_text += f"\nCould not restore CHANGELOG.md after the failed commit: {restore_error}"
                        state["ship"]["commit_result"] = result_text or "Git commit failed; no changelog entry was saved."
            except subprocess.CalledProcessError as exc:
                if changelog_number and not state["ship"].get("commit_succeeded"):
                    try:
                        _restore_changelog_after_failed_commit(root, changelog_snapshot, changelog_mode)
                    except OSError:
                        pass
                state["ship"]["commit_result"] = (exc.stderr or exc.stdout or "Git could not stage project files.").strip()
            except ValueError as exc:
                if changelog_number and not state["ship"].get("commit_succeeded"):
                    try:
                        _restore_changelog_after_failed_commit(root, changelog_snapshot, changelog_mode)
                    except OSError:
                        pass
                state["ship"]["commit_result"] = str(exc)
            except (OSError, subprocess.SubprocessError) as exc:
                if changelog_number and not state["ship"].get("commit_succeeded"):
                    try:
                        _restore_changelog_after_failed_commit(root, changelog_snapshot, changelog_mode)
                    except OSError:
                        pass
                state["ship"]["commit_result"] = str(exc)
    state["ship"]["commit_message"] = message
    state["ship"]["git"] = scanner.git_info(root)
    log_activity("Local Git commit created" if state["ship"].get("commit_succeeded") else "Local commit did not complete", state)
    return write_state(state)


def push() -> dict:
    root = _selected_workspace()
    state = read_state()
    state.setdefault("ship", {})["push_succeeded"] = False
    info = scanner.git_info(root)
    if not info["available"]:
        result = "This folder is not a Git repository."
    else:
        remotes = subprocess.run(["git", "remote"], cwd=root, capture_output=True, text=True, timeout=8).stdout.split()
        current_branch = subprocess.run(["git", "branch", "--show-current"], cwd=root, capture_output=True, text=True, timeout=8).stdout.strip()
        tracking = subprocess.run(["git", "config", "--get", f"branch.{current_branch}.remote"], cwd=root, capture_output=True, text=True, timeout=8).stdout.strip() if current_branch else ""
        remote = tracking if tracking in remotes else ("freebuf-fork" if "freebuf-fork" in remotes else ("origin" if "origin" in remotes else (remotes[0] if len(remotes) == 1 else "")))
        if not remote:
            result = "No GitHub remote is configured. Add your GitHub repository in the Git & release panel first."
        elif not info.get("github_remote"):
            result = "The origin remote is not a GitHub URL. Connect a GitHub repository before using this action."
        elif subprocess.run(["git", "rev-parse", "--verify", "HEAD"], cwd=root, capture_output=True, text=True, timeout=8).returncode:
            result = "There is no local commit to push yet. Create a local commit first."
        else:
            env = dict(os.environ, GIT_TERMINAL_PROMPT="0")
            try:
                proc = subprocess.run(["git", "push", "-u", remote, "HEAD"], cwd=root, capture_output=True, text=True, timeout=90, env=env)
                result = (proc.stdout if proc.returncode == 0 else proc.stderr).strip()
                result = re.sub(r"(https?://)[^/\s@]+@", r"\1***@", result)
                state["ship"]["push_succeeded"] = proc.returncode == 0
                if proc.returncode and ("terminal prompts disabled" in result.lower() or "authentication" in result.lower()):
                    result += "\nSign in first with GitHub CLI (`gh auth login`) or configure SSH credentials, then retry."
            except (OSError, subprocess.SubprocessError) as exc:
                result = str(exc)
    state["ship"]["push_result"] = result or "Git push finished without output."
    state["ship"]["git"] = scanner.git_info(root)
    log_activity("Pushed commit to GitHub" if state["ship"]["push_succeeded"] else "GitHub push did not complete", state)
    return write_state(state)


def _github_cli() -> str:
    bundled = ROOT / "work" / "tools" / "gh" / "2.103.3" / "bin" / "gh"
    return str(bundled) if bundled.is_file() and os.access(bundled, os.X_OK) else (shutil.which("gh") or "")


def create_branch(name: str) -> dict:
    root = _selected_workspace()
    state = read_state()
    name = name.strip()
    state.setdefault("ship", {})["branch_succeeded"] = False
    if not name or len(name) > 120:
        result = "Enter a branch name between 1 and 120 characters."
    else:
        info = scanner.git_info(root)
        if not info["available"]:
            result = "Choose a Git repository before creating a work branch."
        else:
            valid = subprocess.run(["git", "check-ref-format", "--branch", name], cwd=root, capture_output=True, text=True, timeout=8)
            if valid.returncode:
                result = "Use a simple branch name such as freebuf/my-change."
            elif info["branch"] == name:
                result = f"You are already working on {name}. Make a commit, push it, then create a pull request."
                state["ship"]["branch_succeeded"] = True
            else:
                try:
                    exists = subprocess.run(["git", "show-ref", "--verify", "--quiet", f"refs/heads/{name}"], cwd=root, capture_output=True, text=True, timeout=8).returncode == 0
                    command = ["git", "switch", name] if exists else ["git", "switch", "-c", name]
                    proc = subprocess.run(command, cwd=root, capture_output=True, text=True, timeout=20)
                    result = (proc.stdout if proc.returncode == 0 else proc.stderr).strip()
                    state["ship"]["branch_succeeded"] = proc.returncode == 0
                    if proc.returncode == 0:
                        result = f"{'Switched to' if exists else 'Created and switched to'} {name}. Your uncommitted work stays in this folder."
                except (OSError, subprocess.SubprocessError) as exc:
                    result = str(exc)
    state["ship"]["branch_result"] = result or "Branch action finished."
    state["scan"] = scanner.scan(root)
    state["ship"]["git"] = state["scan"]["git"]
    log_activity("Created a Git work branch" if state["ship"]["branch_succeeded"] else "Git work branch was not created", state)
    return write_state(state)


def create_pull_request(title: str | None = None, body: str | None = None) -> dict:
    root = _selected_workspace()
    state = read_state()
    ship = state.setdefault("ship", {})
    ship["pr_succeeded"] = False
    ship["pr_url"] = ""
    info = scanner.git_info(root)
    result = ""
    gh = _github_cli()
    if not info["available"]:
        result = "Choose a Git repository before creating a pull request."
    elif not info.get("github_remote"):
        result = "Save a GitHub repository URL for this project first."
    elif not gh:
        result = "GitHub CLI is not available. Install GitHub CLI (`gh`) and sign in once, then retry."
    else:
        env = dict(os.environ, GIT_TERMINAL_PROMPT="0", GH_PROMPT_DISABLED="1", GH_NO_UPDATE_NOTIFIER="1")
        try:
            auth = subprocess.run([gh, "auth", "status", "--hostname", "github.com"], cwd=root, capture_output=True, text=True, timeout=15, env=env)
            if auth.returncode:
                result = "GitHub CLI is not signed in. Sign in once with `gh auth login`, then retry."
            else:
                current = subprocess.run(["git", "branch", "--show-current"], cwd=root, capture_output=True, text=True, timeout=8).stdout.strip()
                repo = subprocess.run([gh, "repo", "view", "--json", "defaultBranchRef", "--jq", ".defaultBranchRef.name"], cwd=root, capture_output=True, text=True, timeout=20, env=env)
                if repo.returncode:
                    result = (repo.stderr or "GitHub CLI could not access the saved repository. Check the URL and write access for the signed-in account.").strip()
                else:
                    base = repo.stdout.strip()
                    if not base:
                        result = "GitHub did not return a default branch for this repository. Check that the repository has an initial commit."
                    elif current == base:
                        result = f"You are on the default branch ({base}). Create a work branch first, then commit and push your change before opening a pull request."
                    elif not current:
                        result = "Switch to a named work branch before opening a pull request."
                    else:
                        remote_ref = subprocess.run(["git", "ls-remote", "--exit-code", "--heads", "origin", current], cwd=root, capture_output=True, text=True, timeout=30, env=env)
                        if remote_ref.returncode:
                            result = f"Push branch `{current}` to GitHub first. Then create the pull request."
                        else:
                            commit_title = (title or "").strip()
                            if not commit_title:
                                latest = subprocess.run(["git", "log", "-1", "--pretty=%s"], cwd=root, capture_output=True, text=True, timeout=8)
                                commit_title = latest.stdout.strip() or "Changes from FreeBuff"
                            if len(commit_title) > 256:
                                result = "Pull request title must be 256 characters or fewer."
                            else:
                                description = (body or "").strip() or "Created from FreeBuff. Please review the changes before merging."
                                proc = subprocess.run([gh, "pr", "create", "--base", base, "--head", current, "--title", commit_title, "--body", description], cwd=root, capture_output=True, text=True, timeout=90, env=env)
                                result = (proc.stdout if proc.returncode == 0 else proc.stderr).strip()
                                if proc.returncode == 0:
                                    match = re.search(r"https://github\.com/\S+/pull/\d+", result)
                                    ship["pr_url"] = match.group(0) if match else ""
                                    ship["pr_succeeded"] = True
                                    result = f"Pull request created: {ship['pr_url']}" if ship["pr_url"] else (result or "Pull request created.")
        except (OSError, subprocess.SubprocessError) as exc:
            result = f"Could not create the pull request: {exc}"
    ship["pr_result"] = result or "Pull request action finished."
    ship["git"] = scanner.git_info(root)
    log_activity("Opened a GitHub pull request" if ship["pr_succeeded"] else "Pull request was not created", state)
    return write_state(state)


def create_fork_pull_request(title: str | None = None, body: str | None = None) -> dict:
    """Push the current work branch to the signed-in user's fork, then open an upstream PR."""
    root = _selected_workspace()
    state = read_state()
    ship = state.setdefault("ship", {})
    ship["pr_succeeded"] = False
    ship["pr_url"] = ""
    info = scanner.git_info(root)
    result = ""
    gh = _github_cli()

    if not info["available"]:
        result = "Choose a Git repository before creating a pull request."
    elif not info.get("github_remote"):
        result = "Save the upstream GitHub repository URL first."
    elif not gh:
        result = "GitHub CLI is not available. Install GitHub CLI (`gh`) and sign in once, then retry."
    else:
        env = dict(os.environ, GIT_TERMINAL_PROMPT="0", GH_PROMPT_DISABLED="1", GH_NO_UPDATE_NOTIFIER="1")
        try:
            auth = subprocess.run([gh, "auth", "status", "--hostname", "github.com"], cwd=root, capture_output=True, text=True, timeout=15, env=env)
            if auth.returncode:
                result = "Sign in to your own GitHub account once with `gh auth login`, then retry. You do not need write access to the upstream repository."
            else:
                origin = subprocess.run(["git", "remote", "get-url", "origin"], cwd=root, capture_output=True, text=True, timeout=8)
                remote_url = origin.stdout.strip()
                match = re.fullmatch(r"(?:https://github\.com/|git@github\.com:)([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+?)(?:\.git)?", remote_url)
                if origin.returncode or not match:
                    result = "The saved origin must be a GitHub repository URL."
                else:
                    upstream = f"{match.group(1)}/{match.group(2)}"
                    repo_name = match.group(2)
                    user_proc = subprocess.run([gh, "api", "user", "--jq", ".login"], cwd=root, capture_output=True, text=True, timeout=20, env=env)
                    base_proc = subprocess.run([gh, "repo", "view", upstream, "--json", "defaultBranchRef", "--jq", ".defaultBranchRef.name"], cwd=root, capture_output=True, text=True, timeout=20, env=env)
                    username = user_proc.stdout.strip()
                    base = base_proc.stdout.strip()
                    current = subprocess.run(["git", "branch", "--show-current"], cwd=root, capture_output=True, text=True, timeout=8).stdout.strip()
                    if user_proc.returncode or not username:
                        result = (user_proc.stderr or "Could not read the signed-in GitHub username.").strip()
                    elif base_proc.returncode or not base:
                        result = (base_proc.stderr or "Could not read the upstream default branch. Check that the repository is visible to your GitHub account.").strip()
                    elif username.casefold() == match.group(1).casefold():
                        result = "This repository is already under your GitHub account. Use the direct pull request action instead of creating a fork."
                    elif not current:
                        result = "Switch to a named work branch before opening a pull request."
                    elif current == base:
                        result = f"You are on the default branch ({base}). Create a work branch first, then commit your change."
                    elif subprocess.run(["git", "rev-parse", "--verify", "HEAD"], cwd=root, capture_output=True, text=True, timeout=8).returncode:
                        result = "Create a local commit on this work branch before opening a pull request."
                    else:
                        fork_slug = f"{username}/{repo_name}"
                        fork_query = "[(.clone_url // \"\"), ((.fork // false) | tostring), (.parent.full_name // \"\")] | @tsv"
                        fork_check = subprocess.run([gh, "api", f"repos/{fork_slug}", "--jq", fork_query], cwd=root, capture_output=True, text=True, timeout=20, env=env)
                        if fork_check.returncode:
                            fork_create = subprocess.run([gh, "api", "--method", "POST", f"repos/{upstream}/forks"], cwd=root, capture_output=True, text=True, timeout=45, env=env)
                            if fork_create.returncode:
                                result = (fork_create.stderr or "GitHub could not create your fork. Check that forking is allowed and that your account can create repositories.").strip()
                            else:
                                for _ in range(20):
                                    fork_check = subprocess.run([gh, "api", f"repos/{fork_slug}", "--jq", fork_query], cwd=root, capture_output=True, text=True, timeout=15, env=env)
                                    fork_parts = fork_check.stdout.strip().split("\t")
                                    if fork_check.returncode == 0 and len(fork_parts) == 3 and fork_parts[0] and fork_parts[1] == "true" and fork_parts[2].casefold() == upstream.casefold():
                                        break
                                    time.sleep(1)
                        fork_parts = fork_check.stdout.strip().split("\t")
                        if not result and fork_check.returncode:
                            result = "GitHub accepted the fork request, but the fork is not ready yet. Wait a few seconds and click Fork & create pull request again."
                        elif not result and (len(fork_parts) != 3 or not fork_parts[0]):
                            result = "GitHub returned incomplete details for your fork; no files were pushed."
                        elif not result and (fork_parts[1] != "true" or fork_parts[2].casefold() != upstream.casefold()):
                            result = f"A repository named `{repo_name}` already exists in your account, but it is not a fork of `{upstream}`. Rename it or create the fork manually first."
                        if not result:
                            clone_url = fork_parts[0]
                            if not re.fullmatch(r"https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:\.git)?", clone_url):
                                result = "GitHub returned an unexpected fork URL; no remote was changed."
                            else:
                                remotes = subprocess.run(["git", "remote"], cwd=root, capture_output=True, text=True, timeout=8).stdout.split()
                                existing = subprocess.run(["git", "remote", "get-url", "freebuf-fork"], cwd=root, capture_output=True, text=True, timeout=8) if "freebuf-fork" in remotes else None
                                if existing and existing.returncode == 0 and existing.stdout.strip().rstrip("/").removesuffix(".git").casefold() != clone_url.rstrip("/").removesuffix(".git").casefold():
                                    result = "A different repository is already saved as `freebuf-fork`. Rename or remove that remote before continuing."
                                else:
                                    remote_cmd = ["git", "remote", "set-url", "freebuf-fork", clone_url] if existing else ["git", "remote", "add", "freebuf-fork", clone_url]
                                    configured = subprocess.run(remote_cmd, cwd=root, capture_output=True, text=True, timeout=8)
                                    if configured.returncode:
                                        result = (configured.stderr or "Could not configure your personal fork remote.").strip()
                                    else:
                                        pushed = subprocess.run(["git", "push", "-u", "freebuf-fork", "HEAD"], cwd=root, capture_output=True, text=True, timeout=90, env=env)
                                        if pushed.returncode:
                                            result = (pushed.stderr or "Could not push the work branch to your fork.").strip()
                                            if "authentication" in result.lower() or "403" in result:
                                                result += "\nCheck that your GitHub CLI account can push to its own fork and that Git uses the same account."
                                        else:
                                            pr_title = (title or "").strip()
                                            if not pr_title:
                                                latest = subprocess.run(["git", "log", "-1", "--pretty=%s"], cwd=root, capture_output=True, text=True, timeout=8)
                                                pr_title = latest.stdout.strip() or "Changes from FreeBuff"
                                            if len(pr_title) > 256:
                                                result = "Pull request title must be 256 characters or fewer."
                                            else:
                                                description = (body or "").strip() or "Created from FreeBuff. Please review the changes before merging."
                                                created = subprocess.run([gh, "pr", "create", "--repo", upstream, "--base", base, "--head", f"{username}:{current}", "--title", pr_title, "--body", description], cwd=root, capture_output=True, text=True, timeout=90, env=env)
                                                result = (created.stdout if created.returncode == 0 else created.stderr).strip()
                                                if created.returncode == 0:
                                                    pr_match = re.search(r"https://github\.com/\S+/pull/\d+", result)
                                                    ship["pr_url"] = pr_match.group(0) if pr_match else ""
                                                    ship["pr_succeeded"] = True
                                                    result = f"Pull request created from {fork_slug}:{current}: {ship['pr_url']}" if ship["pr_url"] else (result or "Pull request created from your fork.")
        except (OSError, subprocess.SubprocessError) as exc:
            result = f"Could not create the pull request from your fork: {exc}"

    ship["pr_result"] = result or "Fork pull request action finished."
    ship["git"] = scanner.git_info(root)
    log_activity("Opened a pull request from a personal fork" if ship["pr_succeeded"] else "Fork pull request was not created", state)
    return write_state(state)


def set_remote(url: str) -> dict:
    root = _selected_workspace()
    url = url.strip()
    if len(url) > 500 or re.search(r"https?://[^/]+@", url):
        raise ValueError("Use a GitHub repository URL without embedded username or token.")
    if not re.fullmatch(r"https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:\.git)?|git@github\.com:[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:\.git)?", url):
        raise ValueError("Enter a GitHub URL like https://github.com/your-name/your-repo.git")
    info = scanner.git_info(root)
    if not info["available"]:
        raise ValueError("This folder is not a Git repository. Initialize Git before connecting GitHub.")
    remotes = subprocess.run(["git", "remote"], cwd=root, capture_output=True, text=True, timeout=8).stdout.split()
    command = ["git", "remote", "set-url", "origin", url] if "origin" in remotes else ["git", "remote", "add", "origin", url]
    result = subprocess.run(command, cwd=root, capture_output=True, text=True, timeout=8)
    if result.returncode:
        raise ValueError((result.stderr or "Could not configure the GitHub remote.").strip())
    state = read_state()
    state["ship"]["git"] = scanner.git_info(root)
    log_activity("Connected the project to its GitHub remote", state)
    return write_state(state)


def save_changelog() -> dict:
    root = _selected_workspace()
    state = read_state()
    notes = state.get("ship", {}).get("release_notes", "").strip()
    if not notes:
        state["ship"]["changelog_saved"] = False
        state["ship"]["changelog_result"] = "Generate release notes before saving the changelog."
        return write_state(state)
    path = root / "CHANGELOG.md"
    if path.is_symlink() or not path.resolve().is_relative_to(root):
        raise ValueError("FreeBuff will not write a changelog outside the selected project.")
    existing = path.read_text(encoding="utf-8") if path.exists() else "# Changelog\n"
    if notes not in existing:
        updated = existing.rstrip() + "\n\n" + notes + "\n"
        mode = path.stat().st_mode if path.exists() else None
        fd, tmp = tempfile.mkstemp(prefix=".CHANGELOG.", suffix=".tmp", dir=root)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                handle.write(updated)
            if mode is not None:
                os.chmod(tmp, mode)
            os.replace(tmp, path)
        finally:
            if os.path.exists(tmp):
                os.unlink(tmp)
    state["ship"]["changelog_saved"] = True
    state["ship"]["changelog_result"] = f"Saved release notes to {path.name}."
    log_activity(f"Saved release notes to {path.name}", state)
    state["ship"]["git"] = scanner.git_info(root)
    return write_state(state)


def clear_activity() -> dict:
    state = read_state()
    state["activity"] = []
    return write_state(state)
