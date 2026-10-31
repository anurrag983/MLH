"""Deterministic local release-summary helpers.

This module does not call a hosted model or send source code over the network.
"""
from __future__ import annotations

import re
from typing import Any


def create_ship_summary(diff: str, status: str, changed_files: list[str] | None = None) -> dict[str, Any]:
    """Build a heuristic review from the selected project's Git state."""
    files = sorted(set(changed_files or []))
    files.extend(name for name in re.findall(r"^\+\+\+ b/(.+)$", diff, flags=re.M) if name != "/dev/null")
    files = sorted(set(files))
    lowered = diff.lower()
    security = any(word in lowered for word in ("secret", "password", "token", "api_key", "auth", "permission"))
    bugfix = any(word in lowered for word in ("fix", "bug", "guard", "exception", "validation", "== 0"))
    prefix = "fix(security)" if security else "fix" if bugfix else "chore"
    focus = files[0].rsplit("/", 1)[-1] if len(files) == 1 else f"{len(files)} project files" if files else "project review"
    message = f"{prefix}: update {focus}"
    source_suffixes = (".py", ".js", ".jsx", ".ts", ".tsx", ".go", ".rs", ".java")
    review = []
    for name in files:
        risky = any(part in name.lower() for part in ("auth", "security", "payment", "deploy", "config", "permission"))
        notes = "Review this change and run the project's checks before merging."
        if name.lower().endswith((".env", ".pem", ".key")):
            risky = True
            notes = "Sensitive configuration file changed; verify no credential value is committed."
        elif name.endswith(source_suffixes):
            notes = "Source file changed; review behavior and run relevant project checks."
        review.append({"file": name, "risk": "High" if risky else "Medium" if name.endswith(source_suffixes) else "Low", "notes": notes})
    if not review:
        review = [{"file": "Working tree", "risk": "Low", "notes": "No changed files detected. Edit the project, then prepare this review again."}]
    sections = []
    if security:
        sections.append("### Security Fixes\n- Review security-related changes and rotate any exposed credentials.")
    if bugfix:
        sections.append("### Bug Fixes\n- Review the changed validation and error handling behavior.")
    if not security and not bugfix:
        sections.append("### Improvements\n- Update " + (", ".join(files[:5]) if files else "the project review") + ("." if len(files) <= 5 else f" and {len(files) - 5} more files."))
    return {"commit_message": message, "review": review, "release_notes": "\n\n".join(sections), "git_status": status}
