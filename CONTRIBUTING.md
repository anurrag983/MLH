# Contributing to FreeBuf Local

Keep changes focused and explain their effect for a developer using a real project folder. Never add real credentials or put credential values in logs, screenshots, examples, or review text.

## Local workflow

1. Create and activate a Python environment: `python3 -m venv .venv && source .venv/bin/activate`.
2. Install backend packages: `pip install -r backend/requirements.txt`.
3. Install UI packages: `cd frontend && npm install && cd ..`.
4. Start the local app with `./start.sh`.
5. Select a project folder in the dashboard. Useful CLI commands include `python backend/cli.py check --workspace /path/to/project` and `python backend/cli.py ship --workspace /path/to/project`.

## Review and safety

- The scanner is read-only. A file change must have a visible preview and explicit approval.
- Automatic edits are limited to supported Python cases, syntax-checked, and backed up privately.
- Never execute an arbitrary project file from a web request.
- Git commit and GitHub push are separate user actions. Do not force-push or store GitHub tokens in FreeBuf.
- Keep runtime state, local environment files, backups, and generated build output out of version control.
- The local analyzer is heuristic. It must not claim complete security, performance, or AI review coverage.

## Architecture

```text
React + Vite (127.0.0.1:5174) ──HTTP/polling──> FastAPI (127.0.0.1:8001)
                                                      ├─ read-only project scan
                                                      ├─ approved Python edits + private backup
                                                      └─ explicit local Git commit / GitHub push
```

This build is a single-user local tool. Public hosting requires authentication, per-user isolation, and a secure project workspace design before the API can be exposed.
