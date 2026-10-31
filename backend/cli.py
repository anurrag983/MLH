"""Rich CLI for scanning and preparing real project changes."""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from backend import service

console = Console()


def use_workspace(path: str | None) -> None:
    if path or not os.getenv("FREEBUF_WORKSPACE", "").strip():
        try:
            service.set_workspace(path or str(Path.cwd()))
        except ValueError as exc:
            console.print(f"[red]{exc}[/red]")
            raise SystemExit(2) from exc


def main() -> None:
    parser = argparse.ArgumentParser(prog="freebuf", description="Local project security and Git assistant")
    sub = parser.add_subparsers(dest="command", required=True)
    for command, help_text in (("check", "Scan the selected project for common risks"), ("ship", "Prepare a Git review and release notes"), ("commit", "Create a local Git commit"), ("push", "Push the current branch to GitHub")):
        item = sub.add_parser(command, help=help_text)
        item.add_argument("--workspace", help="Project folder; saved as your local default")
    args = parser.parse_args()
    use_workspace(args.workspace)
    if args.command == "check":
        scan = service.run_scan()["scan"]
        table = Table(title=f"Project scan · {scan['score']}/100 · {scan['status']}")
        table.add_column("Severity")
        table.add_column("Rule")
        table.add_column("Location")
        table.add_column("Finding")
        for finding in scan["findings"]:
            table.add_row(finding["severity"], finding["rule"], f"{finding['file']}:{finding.get('line') or 'diff'}", finding["detail"])
        console.print(table)
        console.print(f"Scanned {scan['files_scanned']} source files · performance profiling is not included.")
    elif args.command == "ship":
        summary = service.ship()["ship"]
        console.print(Panel(f"[bold]Suggested commit[/bold]\n{summary['commit_message']}\n\n[bold]Changed files[/bold]\n" + "\n".join(f"{row['file']} · {row['risk']} — {row['notes']}" for row in summary["review"]) + f"\n\n[bold]Release notes[/bold]\n{summary['release_notes']}", title="Local Git review", border_style="cyan"))
    elif args.command == "commit":
        message = input("Commit message (Conventional Commit format): ").strip()
        state = service.commit(message)
        console.print(state["ship"].get("commit_result", "Commit finished."))
    elif args.command == "push":
        state = service.push()
        console.print(state["ship"].get("push_result", "Push finished."))


if __name__ == "__main__":
    main()
