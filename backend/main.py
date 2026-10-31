"""Loopback-only API for the local FreeBuff workspace assistant."""
from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from fastapi.responses import JSONResponse

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from backend import auth, service

app = FastAPI(title="FreeBuff Workspace Assistant", version="2.1.0", docs_url="/docs")
origins = [origin.strip() for origin in os.getenv("FREEBUF_CORS_ORIGINS", "").split(",") if origin.strip()]
default_origins = [
    "https://mlh-six.vercel.app",
    "https://mlh.vercel.app",
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
]
for origin in default_origins:
    if origin not in origins:
        origins.append(origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?|https://.*\.vercel\.app|https://.*\.onrender\.com",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

SESSION_COOKIE = "freebuf_session"


def _extract_token(request: Request) -> str | None:
    auth_header = request.headers.get("authorization", "") or request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
        if token:
            return token
    return request.cookies.get(SESSION_COOKIE)


def _is_request_https(request: Request) -> bool:
    if request.url.scheme == "https":
        return True
    forwarded_proto = (request.headers.get("x-forwarded-proto") or "").lower()
    return "https" in forwarded_proto


def _set_session_cookie(response: Response, token: str, request: Request) -> None:
    is_https = _is_request_https(request)
    samesite = "none" if is_https else "lax"
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=auth.SESSION_TTL,
        httponly=True,
        secure=is_https,
        samesite=samesite,
        path="/",
    )


def _delete_session_cookie(response: Response, request: Request) -> None:
    is_https = _is_request_https(request)
    samesite = "none" if is_https else "lax"
    response.delete_cookie(
        SESSION_COOKIE,
        path="/",
        httponly=True,
        samesite=samesite,
        secure=is_https,
    )


@app.get("/")
def root():
    return {
        "status": "online",
        "app": "FreeBuff API",
        "version": "2.1.0",
        "docs": "/docs",
    }


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.middleware("http")
async def require_local_account(request: Request, call_next):
    path = request.url.path
    if path.startswith("/api/") and not path.startswith("/api/auth/") and request.method != "OPTIONS":
        try:
            token = _extract_token(request)
            session = auth.status(token)
        except ValueError as exc:
            return JSONResponse(status_code=500, content={"detail": str(exc)})
        if not session["authenticated"]:
            return JSONResponse(status_code=401, content={"detail": "Sign in to your FreeBuff account to continue."})
    return await call_next(request)


@app.on_event("startup")
def initialize_workspace():
    service.initialize()


class WorkspaceRequest(BaseModel):
    path: str = Field(min_length=1, max_length=2048)


class ImportedProjectFile(BaseModel):
    path: str = Field(min_length=1, max_length=1024)
    content: str = Field(max_length=1_000_000)


class ImportFolderRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    files: list[ImportedProjectFile] = Field(min_length=1, max_length=4000)


class FindingRequest(BaseModel):
    file: str = Field(min_length=1, max_length=1024)
    line: int = Field(ge=1, le=2_000_000)
    rule: str = Field(min_length=1, max_length=200)


class ApplyFixRequest(FindingRequest):
    source_hash: str = Field(min_length=64, max_length=64)


class CommitRequest(BaseModel):
    message: Optional[str] = Field(default=None, max_length=200)


class RemoteRequest(BaseModel):
    url: str = Field(min_length=1, max_length=500)


class CloneRepositoryRequest(BaseModel):
    url: str = Field(min_length=1, max_length=500)


class BranchRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class PullRequestRequest(BaseModel):
    title: Optional[str] = Field(default=None, max_length=256)
    body: Optional[str] = Field(default=None, max_length=10000)


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=12, max_length=1024)


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=1024)


class DeleteAccountRequest(BaseModel):
    confirmation: str = Field(min_length=1, max_length=10)


def _action(fn, *args):
    try:
        return fn(*args)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/auth/status")
def get_auth_status(request: Request):
    token = _extract_token(request)
    return _action(auth.status, token)


@app.post("/api/auth/register")
def register_local_account(request: Request, body: RegisterRequest):
    token, result = _action(auth.register, body.name, body.email, body.password)
    result_with_token = dict(result)
    result_with_token["token"] = token
    response = JSONResponse(content=result_with_token)
    _set_session_cookie(response, token, request)
    return response


@app.post("/api/auth/login")
def login_local_account(request: Request, body: LoginRequest):
    token, result = _action(auth.login, body.email, body.password)
    result_with_token = dict(result)
    result_with_token["token"] = token
    response = JSONResponse(content=result_with_token)
    _set_session_cookie(response, token, request)
    return response


@app.post("/api/auth/logout")
def logout_local_account(response: Response, request: Request):
    _action(auth.logout)
    _delete_session_cookie(response, request)
    return {"registered": True, "authenticated": False, "user": None}


@app.post("/api/auth/delete")
def delete_local_account(request: Request, response: Response, body: DeleteAccountRequest):
    if body.confirmation != "DELETE":
        raise HTTPException(status_code=400, detail='Type "DELETE" to confirm account removal.')
    token = _extract_token(request)
    if not _action(auth.status, token)["authenticated"]:
        raise HTTPException(status_code=400, detail="Sign in again before deleting this local account.")
    _action(service.reset_local_account_data)
    _action(auth.delete_account, token, body.confirmation)
    _delete_session_cookie(response, request)
    return {"registered": False, "authenticated": False, "user": None}


@app.get("/api/state")
def get_state():
    return service.read_state()


@app.post("/api/workspace")
def choose_workspace(request: WorkspaceRequest):
    return _action(service.set_workspace, request.path)


@app.post("/api/clone")
def clone_repository(request: CloneRepositoryRequest):
    return _action(service.clone_github_repository, request.url)


@app.post("/api/import-folder")
def import_dropped_folder(request: ImportFolderRequest):
    return _action(service.import_folder, request.name, [file.model_dump() for file in request.files])


@app.post("/api/browse-folder")
def browse_folder():
    return _action(service.browse_folder)


@app.post("/api/scan")
def scan_workspace():
    return service.run_scan()


@app.post("/api/fix-preview")
def fix_preview(request: FindingRequest):
    return _action(service.preview_fix, request.file, request.line, request.rule)


@app.post("/api/apply-fix")
def apply_fix(request: ApplyFixRequest):
    return _action(service.apply_fix, request.file, request.line, request.rule, request.source_hash)


@app.post("/api/ship")
def generate_review():
    return service.ship()


@app.post("/api/commit")
def create_commit(request: Optional[CommitRequest] = None):
    return service.commit(request.message if request else None)


@app.post("/api/push")
def push_to_github():
    return service.push()


@app.post("/api/branch")
def create_work_branch(request: BranchRequest):
    return _action(service.create_branch, request.name)


@app.post("/api/pull-request")
def open_pull_request(request: PullRequestRequest):
    return _action(service.create_pull_request, request.title, request.body)


@app.post("/api/fork-pull-request")
def open_fork_pull_request(request: PullRequestRequest):
    return _action(service.create_fork_pull_request, request.title, request.body)


@app.post("/api/remote")
def configure_remote(request: RemoteRequest):
    return _action(service.set_remote, request.url)


@app.post("/api/changelog")
def save_changelog():
    return service.save_changelog()


@app.post("/api/clear-activity")
def clear_activity():
    return service.clear_activity()
