import sys
import json
import click
from pathlib import Path
from relay.parser import parse_transcript
from relay.linear import create_issue as linear_create
from relay.github import create_issue as github_create
from relay.history import add_entry, get_entries, update_entry
from relay.config import LINEAR_API_KEY, LINEAR_TEAM_ID, GITHUB_TOKEN, GITHUB_REPO

ENV_FILE = Path.cwd() / ".env"
GLOBAL_ENV = Path.home() / ".relay-cli" / ".env"

PRIORITY_LABELS = {1: "Urgent", 2: "High", 3: "Medium", 4: "Low"}
PRIORITY_COLORS = {1: "red", 2: "yellow", 3: "blue", 4: "white"}


TARGETS = {
    "linear": linear_create,
    "github": github_create,
}


def _create_issue(ticket, target="linear"):
    fn = TARGETS.get(target)
    if not fn:
        _error(f"Unknown target '{target}'. Choose: linear, github")
    return fn(ticket)


def _output(data, pretty=False):
    """Print JSON to stdout."""
    click.echo(json.dumps(data, ensure_ascii=False, indent=2 if pretty else None))


def _error(message, code=1):
    """Print JSON error to stderr and exit."""
    click.echo(json.dumps({"error": message}), err=True)
    sys.exit(code)


@click.group()
@click.version_option(version="0.1.0", prog_name="relay")
def cli():
    """relay — Convert meeting/call transcripts into Linear or GitHub issues.

    \b
    Designed for both human and AI agent usage.
    All commands output structured JSON to stdout.
    Status messages go to stderr (won't interfere with JSON parsing).
    Supports Linear and GitHub Issues as output targets (--target flag).

    \b
    Quick start:
      relay setup --linear-api-key KEY --linear-team-id ID
      relay setup --github-token TOKEN --github-repo owner/repo
      relay parse meeting.txt
      relay parse meeting.txt --push
      relay parse meeting.txt --push --target github
      relay dashboard

    \b
    Commands:
      setup      Configure API credentials (Linear / GitHub)
      parse      Parse transcript into tickets (file, stdin, or --text)
      create     Create issues from JSON input (Linear or GitHub)
      history    List, view, or clear parsing history
      status     Show current configuration status
      dashboard  Launch the web UI
    """
    pass


# ── setup ──────────────────────────────────────────────────────────────

@cli.command()
@click.option("--linear-api-key", default=None, help="Linear API key (lin_api_...).")
@click.option("--linear-team-id", default=None, help="Linear team UUID.")
@click.option("--github-token", default=None, help="GitHub personal access token.")
@click.option("--github-repo", default=None, help="GitHub repo (owner/repo format).")
@click.option("--global", "use_global", is_flag=True, help="Save to ~/.relay-cli/.env instead of ./.env.")
def setup(linear_api_key, linear_team_id, github_token, github_repo, use_global):
    """Configure API credentials for Linear and/or GitHub.

    \b
    Saves credentials to a .env file. By default writes to ./.env
    in the current directory. Use --global to save to ~/.relay-cli/.env.

    \b
    Examples:
      # Interactive (prompts for each value)
      relay setup

    \b
      # Linear only (non-interactive)
      relay setup --linear-api-key lin_api_xxx --linear-team-id uuid-here

    \b
      # GitHub only
      relay setup --github-token ghp_xxx --github-repo owner/repo

    \b
      # Both targets, saved globally
      relay setup --global \\
        --linear-api-key lin_api_xxx --linear-team-id uuid \\
        --github-token ghp_xxx --github-repo owner/repo
    """
    env_target = GLOBAL_ENV if use_global else ENV_FILE

    existing = {}
    if env_target.exists():
        for line in env_target.read_text().splitlines():
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                existing[k.strip()] = v.strip()

    all_none = all(v is None for v in [linear_api_key, linear_team_id, github_token, github_repo])

    if all_none or linear_api_key is not None or linear_team_id is not None:
        if linear_api_key is None and all_none:
            linear_api_key = click.prompt("LINEAR_API_KEY", default=existing.get("LINEAR_API_KEY", ""), show_default=True)
        if linear_team_id is None and all_none:
            linear_team_id = click.prompt("LINEAR_TEAM_ID", default=existing.get("LINEAR_TEAM_ID", ""), show_default=True)

    if all_none or github_token is not None or github_repo is not None:
        if github_token is None and all_none:
            github_token = click.prompt("GITHUB_TOKEN", default=existing.get("GITHUB_TOKEN", ""), show_default=True)
        if github_repo is None and all_none:
            github_repo = click.prompt("GITHUB_REPO", default=existing.get("GITHUB_REPO", ""), show_default=True)

    if linear_api_key is not None:
        existing["LINEAR_API_KEY"] = linear_api_key
    if linear_team_id is not None:
        existing["LINEAR_TEAM_ID"] = linear_team_id
    if github_token is not None:
        existing["GITHUB_TOKEN"] = github_token
    if github_repo is not None:
        existing["GITHUB_REPO"] = github_repo

    env_target.parent.mkdir(parents=True, exist_ok=True)
    env_target.write_text("\n".join(f"{k}={v}" for k, v in existing.items()) + "\n")

    result = {"ok": True, "file": str(env_target)}
    if existing.get("LINEAR_API_KEY"):
        result["linear_api_key"] = existing["LINEAR_API_KEY"][:12] + "..."
    if existing.get("LINEAR_TEAM_ID"):
        result["linear_team_id"] = existing["LINEAR_TEAM_ID"]
    if existing.get("GITHUB_TOKEN"):
        result["github_token"] = existing["GITHUB_TOKEN"][:12] + "..."
    if existing.get("GITHUB_REPO"):
        result["github_repo"] = existing["GITHUB_REPO"]

    _output(result, pretty=True)


# ── status ─────────────────────────────────────────────────────────────

@cli.command()
def status():
    """Show current configuration and connection status.

    \b
    Checks:
      - Whether LINEAR_API_KEY and LINEAR_TEAM_ID are set
      - Whether .env file exists (local and global)
      - Whether claude CLI is available

    \b
    Example:
      relay status
    """
    import shutil

    claude_path = shutil.which("claude")
    local_env = ENV_FILE.exists()
    global_env = GLOBAL_ENV.exists()

    _output({
        "linear_api_key": (LINEAR_API_KEY[:12] + "...") if LINEAR_API_KEY else None,
        "linear_team_id": LINEAR_TEAM_ID or None,
        "github_token": (GITHUB_TOKEN[:12] + "...") if GITHUB_TOKEN else None,
        "github_repo": GITHUB_REPO or None,
        "claude_cli": claude_path,
        "env_files": {
            "local": str(ENV_FILE) if local_env else None,
            "global": str(GLOBAL_ENV) if global_env else None,
        },
        "ready": {
            "parse": bool(claude_path),
            "linear": bool(LINEAR_API_KEY and LINEAR_TEAM_ID),
            "github": bool(GITHUB_TOKEN and GITHUB_REPO),
        },
    }, pretty=True)


# ── parse ──────────────────────────────────────────────────────────────

@cli.command()
@click.argument("file", type=click.File("r"), default="-", required=False)
@click.option("--text", default=None, help="Pass transcript text directly as a string.")
@click.option("--push", is_flag=True, help="Create issues immediately after parsing.")
@click.option("--target", type=click.Choice(["linear", "github"]), default="linear", help="Target platform for --push (default: linear).")
@click.option("--pretty", is_flag=True, help="Pretty-print JSON output.")
@click.option("--human", is_flag=True, help="Human-readable output instead of JSON.")
def parse(file, text, push, target, pretty, human):
    """Parse a transcript into tickets.

    \b
    Reads transcript from a file, stdin, or --text flag.
    Outputs a JSON object with a "tickets" array.

    \b
    Examples:
      # From file
      relay parse meeting.txt

    \b
      # From stdin (piping)
      cat meeting.txt | relay parse

    \b
      # Direct text input
      relay parse --text "We need to fix the login bug by Friday"

    \b
      # Parse and create in Linear
      relay parse meeting.txt --push

    \b
      # Parse and create as GitHub issues
      relay parse meeting.txt --push --target github

    \b
      # Human-readable output
      relay parse meeting.txt --human

    \b
    Output format:
      {
        "tickets": [
          {
            "title": "...",
            "description": "...",
            "priority": 1,
            "labels": ["bug"]
          }
        ],
        "count": 1,
        "source": "meeting.txt"
      }
    """
    if text:
        transcript = text.strip()
        source = "text"
    else:
        transcript = file.read().strip()
        source = getattr(file, "name", "stdin")

    if not transcript:
        _error("Empty transcript. Provide a file, stdin, or --text.")

    click.echo("Analyzing transcript...", err=True)
    tickets = parse_transcript(transcript)
    add_entry(tickets, source=source)

    if human:
        _print_tickets_human(tickets)
        if push:
            click.confirm(f"Create these issues in {target}?", abort=True)
            _push_tickets_human(tickets, target)
        else:
            click.echo("Use --push to create issues.", err=True)
        return

    result = {"tickets": tickets, "count": len(tickets), "source": source, "target": target}

    if push:
        created = []
        for t in tickets:
            issue = _create_issue(t, target)
            t["issueId"] = issue["id"]
            t["issueUrl"] = issue["url"]
            created.append(issue)
            click.echo(f"Created {issue['id']}", err=True)
        result["created"] = created

    _output(result, pretty=pretty)


# ── create ─────────────────────────────────────────────────────────────

@cli.command()
@click.argument("input", type=click.File("r"), default="-", required=False)
@click.option("--title", default=None, help="Ticket title (for single-ticket creation).")
@click.option("--description", default=None, help="Ticket description.")
@click.option("--priority", type=int, default=None, help="Priority 1-4 (1=Urgent, 4=Low).")
@click.option("--labels", default=None, help="Comma-separated labels.")
@click.option("--target", type=click.Choice(["linear", "github"]), default="linear", help="Target platform (default: linear).")
@click.option("--pretty", is_flag=True, help="Pretty-print JSON output.")
def create(input, title, description, priority, labels, target, pretty):
    """Create issues in Linear or GitHub from JSON or flags.

    \b
    Accepts input in three ways:
      1. JSON array of tickets via stdin/file
      2. Single JSON ticket object via stdin/file
      3. Inline flags (--title, --description, etc.)

    \b
    Examples:
      # From parse output (pipe)
      relay parse meeting.txt | jq '.tickets' | relay create

    \b
      # From a JSON file
      relay create tickets.json

    \b
      # Single ticket with flags
      relay create --title "Fix login bug" --description "Session expires" --priority 2

    \b
      # Single ticket JSON via stdin
      echo '{"title":"Fix bug","priority":1}' | relay create

    \b
    Output format:
      {
        "created": [
          {"id": "ENG-42", "title": "...", "url": "..."}
        ],
        "count": 1
      }
    """
    if title:
        ticket_list = [{
            "title": title,
            "description": description or "",
            "priority": priority or 3,
            "labels": [l.strip() for l in labels.split(",")] if labels else [],
        }]
    else:
        raw = input.read().strip()
        if not raw:
            _error("No input. Provide JSON via stdin/file or use --title flag.")
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as e:
            _error(f"Invalid JSON: {e}")

        if isinstance(data, list):
            ticket_list = data
        elif isinstance(data, dict):
            if "tickets" in data:
                ticket_list = data["tickets"]
            else:
                ticket_list = [data]
        else:
            _error("Expected a JSON array or object.")

    created = []
    for t in ticket_list:
        issue = _create_issue(t, target)
        created.append(issue)
        click.echo(f"Created {issue['id']}: {issue['title']}", err=True)

    _output({"created": created, "count": len(created)}, pretty=pretty)


# ── history ────────────────────────────────────────────────────────────

@cli.group()
def history():
    """View and manage parsing history.

    \b
    History is stored in ~/.relay-cli/history.json.
    Each entry records the timestamp, source, and parsed tickets.

    \b
    Subcommands:
      list   Show all history entries (summary)
      get    Get full details of a specific entry
      clear  Delete all history
    """
    pass


@history.command("list")
@click.option("--limit", default=20, help="Max entries to show.")
@click.option("--pretty", is_flag=True, help="Pretty-print JSON output.")
def history_list(limit, pretty):
    """List recent parsing history.

    \b
    Example:
      relay history list
      relay history list --limit 5

    \b
    Output format:
      {
        "entries": [
          {
            "index": 0,
            "timestamp": "...",
            "source": "meeting.txt",
            "ticket_count": 5,
            "created_count": 3
          }
        ],
        "total": 10
      }
    """
    entries = get_entries()
    summary = []
    for i, e in enumerate(entries[:limit]):
        created = sum(1 for t in e["tickets"] if t.get("linearId"))
        summary.append({
            "index": i,
            "timestamp": e["timestamp"],
            "source": e.get("source", ""),
            "ticket_count": len(e["tickets"]),
            "created_count": created,
        })
    _output({"entries": summary, "total": len(entries)}, pretty=pretty)


@history.command("get")
@click.argument("index", type=int)
@click.option("--pretty", is_flag=True, help="Pretty-print JSON output.")
def history_get(index, pretty):
    """Get full details of a history entry by index.

    \b
    Example:
      relay history get 0
      relay history get 2 --pretty

    \b
    Output: the full history entry with all ticket data.
    """
    entries = get_entries()
    if index < 0 or index >= len(entries):
        _error(f"Invalid index {index}. Total entries: {len(entries)}")
    _output(entries[index], pretty=pretty)


@history.command("clear")
@click.option("--yes", is_flag=True, help="Skip confirmation prompt.")
def history_clear(yes):
    """Clear all parsing history.

    \b
    Example:
      relay history clear
      relay history clear --yes
    """
    if not yes:
        click.confirm("Delete all history?", abort=True)
    from relay.history import HISTORY_FILE
    if HISTORY_FILE.exists():
        HISTORY_FILE.unlink()
    _output({"ok": True, "message": "History cleared."})


# ── dashboard ──────────────────────────────────────────────────────────

@cli.command()
@click.option("--port", default=8000, help="Port to serve on.")
@click.option("--host", default="127.0.0.1", help="Host to bind to.")
def dashboard(port, host):
    """Launch the web dashboard.

    \b
    Starts a local web server with the relay UI.
    Features: paste/upload transcript, edit tickets, create in Linear, history.

    \b
    Examples:
      relay dashboard
      relay dashboard --port 3000
      relay dashboard --host 0.0.0.0 --port 8080
    """
    import uvicorn
    click.echo(f"Starting dashboard at http://{host}:{port}", err=True)
    uvicorn.run("relay.main:app", host=host, port=port, reload=True)


# ── helpers ────────────────────────────────────────────────────────────

def _print_tickets_human(tickets):
    click.echo(f"\nFound {len(tickets)} ticket(s):\n", err=True)
    for i, t in enumerate(tickets):
        p = t.get("priority", 3)
        color = PRIORITY_COLORS.get(p, "white")
        labels_str = ", ".join(t.get("labels", []))
        click.echo(click.style(f"  [{i+1}] P{p} {PRIORITY_LABELS.get(p, '')}", fg=color, bold=True))
        click.echo(f"      {t['title']}")
        click.echo(click.style(f"      {t.get('description', '')}", dim=True))
        if labels_str:
            click.echo(click.style(f"      labels: {labels_str}", dim=True))
        click.echo()


def _push_tickets_human(tickets, target="linear"):
    for t in tickets:
        result = _create_issue(t, target)
        click.echo(click.style(f"  Created {result['id']}", fg="green") + f" — {result['title']}")
        click.echo(click.style(f"  {result['url']}", dim=True))


if __name__ == "__main__":
    cli()
