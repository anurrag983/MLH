"""Single-account, local-only authentication for the FreeBuff desktop workflow."""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import tempfile
import threading
import time
from pathlib import Path
from typing import Any

DATA_DIR = Path(os.getenv("FREEBUF_DATA_DIR", str(Path.home() / ".local" / "share" / "freebuf"))).expanduser()
AUTH_PATH = DATA_DIR / "auth.json"
PBKDF2_ITERATIONS = 390_000
SESSION_TTL = 14 * 24 * 60 * 60
LOCK = threading.RLock()


def _read() -> dict[str, Any]:
    if AUTH_PATH.is_symlink():
        raise ValueError("The local account file cannot be a symbolic link.")
    try:
        raw = json.loads(AUTH_PATH.read_text(encoding="utf-8"))
        return raw if isinstance(raw, dict) else {}
    except FileNotFoundError:
        return {}
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError("The local account file cannot be read. Preserve it and contact support.") from exc


def _write(data: dict[str, Any]) -> None:
    DATA_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    try:
        os.chmod(DATA_DIR, 0o700)
    except OSError:
        pass
    if AUTH_PATH.is_symlink():
        raise ValueError("The local account file cannot be a symbolic link.")
    fd, temporary = tempfile.mkstemp(prefix=".auth-", suffix=".json", dir=DATA_DIR)
    try:
        if hasattr(os, "fchmod"):
            try:
                os.fchmod(fd, 0o600)
            except OSError:
                pass
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(data, handle, ensure_ascii=True)
            handle.write("\n")
        os.replace(temporary, AUTH_PATH)
        try:
            os.chmod(AUTH_PATH, 0o600)
        except OSError:
            pass
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def _public_user(data: dict[str, Any]) -> dict[str, str] | None:
    user = data.get("user")
    if not isinstance(user, dict):
        return None
    return {"name": str(user.get("name", "")), "email": str(user.get("email", ""))}


def status(token: str | None = None) -> dict[str, Any]:
    with LOCK:
        data = _read()
        user = _public_user(data)
        authenticated = False
        if user and token:
            session = data.get("session", {})
            supplied = hashlib.sha256(token.encode("utf-8")).hexdigest()
            try:
                authenticated = (
                    isinstance(session, dict)
                    and int(session.get("expires_at", 0)) > int(time.time())
                    and hmac.compare_digest(str(session.get("token_hash", "")), supplied)
                )
            except (TypeError, ValueError):
                authenticated = False
        return {"registered": user is not None, "authenticated": authenticated, "user": user if authenticated else None}


def _issue_session(data: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    token = secrets.token_urlsafe(32)
    data["session"] = {
        "token_hash": hashlib.sha256(token.encode("utf-8")).hexdigest(),
        "expires_at": int(time.time()) + SESSION_TTL,
    }
    _write(data)
    return token, {"registered": True, "authenticated": True, "user": _public_user(data)}


def register(name: str, email: str, password: str) -> tuple[str, dict[str, Any]]:
    name, email = name.strip(), email.strip().lower()
    if not name or len(name) > 80:
        raise ValueError("Enter a name up to 80 characters long.")
    if len(email) > 254 or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise ValueError("Enter a valid email address.")
    if len(password) < 12 or len(password) > 1024:
        raise ValueError("Use a password with at least 12 characters.")
    with LOCK:
        data = _read()
        if _public_user(data):
            raise ValueError("A local account already exists. Sign in with that account.")
        salt = secrets.token_bytes(16)
        data["version"] = 1
        data["user"] = {
            "name": name,
            "email": email,
            "salt": salt.hex(),
            "password_hash": hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS).hex(),
        }
        data["created_at"] = int(time.time())
        return _issue_session(data)


def login(email: str, password: str) -> tuple[str, dict[str, Any]]:
    email = email.strip().lower()
    with LOCK:
        data = _read()
        user = data.get("user", {})
        if not isinstance(user, dict) or user.get("email") != email:
            raise ValueError("Email or password is incorrect.")
        try:
            salt = bytes.fromhex(str(user["salt"]))
            expected = bytes.fromhex(str(user["password_hash"]))
        except (KeyError, ValueError) as exc:
            raise ValueError("The local account is invalid. Preserve the account file and contact support.") from exc
        supplied = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
        if not hmac.compare_digest(expected, supplied):
            raise ValueError("Email or password is incorrect.")
        return _issue_session(data)


def logout() -> None:
    with LOCK:
        data = _read()
        data["session"] = {}
        if data:
            _write(data)


def delete_account(token: str | None, confirmation: str) -> None:
    """Delete the authenticated local account, keeping project files untouched."""
    if confirmation != "DELETE":
        raise ValueError('Type "DELETE" to confirm account removal.')
    with LOCK:
        current = status(token)
        if not current["authenticated"]:
            raise ValueError("Sign in again before deleting this local account.")
        if AUTH_PATH.is_symlink():
            raise ValueError("The local account file cannot be a symbolic link.")
        try:
            AUTH_PATH.unlink()
        except FileNotFoundError:
            raise ValueError("The local account was already removed. Refresh this page.")
        except OSError as exc:
            raise ValueError("Could not remove the local account file.") from exc
