import sys
import json
import click
from pathlib import Path
from relay.parser import parse_transcript
from relay.linear import create_issue
from relay.history import add_entry, get_entries, update_entry
from relay.config import LINEAR_API_KEY, LINEAR_TEAM_ID

ENV_FILE = Path.cwd() / ".env"
GLOBAL_ENV = Path.home() / ".relay-cli" / ".env"

PRIORITY_LABELS = {1: "Urgent", 2: "High", 3: "Medium", 4: "Low"}
PRIORITY_COLORS = {1: "red", 2: "yellow", 3: "blue", 4: "white"}


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
    """relay — Convert meeting/call transcripts into Linear issues.

    \b
    Designed for both human and AI agent usage.
    All commands output structured JSON to stdout.
    Status messages go to stderr (won't interfere with JSON parsing).

    \b
    Quick start:
      relay setup --linear-api-key KEY --linear-team-id ID
      relay parse meeting.txt
      relay parse meeting.txt --push
      relay dashboard

    \b
    Commands:
      setup      Configure Linear API credentials
      parse      Parse transcript into tickets (file, stdin, or --text)
      create     Create Linear issues from JSON input
      history    List, view, or clear parsing history
      status     Show current configuration status
      dashboard  Launch the web UI
    """
    pass


# ── setup ──────────────────────────────────────────────────────────────

@cli.command()
@click.option("--linear-api-key", default=None, help="Linear API key (lin_api_...).")
@click.option("--linear-team-id", default=None, help="Linear team UUID.")
@click.option("--global", "use_global", is_flag=True, help="Save to ~/.relay-cli/.env instead of ./.env.")
def setup(linear_api_key, linear_team_id, use_global):
    """Configure API credentials.

    \b
    Saves credentials to a .env file. By default writes to ./.env
    in the current directory. Use --global to save to ~/.relay-cli/.env.

    \b
    Examples:
      # Interactive (prompts for each value)
      relay setup

    \b
      # Non-interactive (for AI agents / scripts)
      relay setup --linear-api-key lin_api_xxx --linear-team-id uuid-here

    \b
      # Save globally
      relay setup --global --linear-api-key lin_api_xxx --linear-team-id uuid-here
    """
    target = GLOBAL_ENV if use_global else ENV_FILE

    # Load existing values
    existing = {}
    if target.exists():
        for line in target.read_text().splitlines():
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                existing[k.strip()] = v.strip()

    # Prompt if not provided via flags
    if linear_api_key is None:
        linear_api_key = click.prompt(
            "LINEAR_API_KEY",
            default=existing.get("LINEAR_API_KEY", ""),
            show_default=True,
        )
    if linear_team_id is None:
        linear_team_id = click.prompt(
            "LINEAR_TEAM_ID",
            default=existing.get("LINEAR_TEAM_ID", ""),
            show_default=True,
        )

    existing["LINEAR_API_KEY"] = linear_api_key
    existing["LINEAR_TEAM_ID"] = linear_team_id

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        "\n".join(f"{k}={v}" for k, v in existing.items()) + "\n"
    )

    _output({
        "ok": True,
        "file": str(target),
        "linear_api_key": linear_api_key[:12] + "..." if len(linear_api_key) > 12 else "(empty)",
        "linear_team_id": linear_team_id or "(empty)",
    }, pretty=True)


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
        "claude_cli": claude_path,
        "env_files": {
            "local": str(ENV_FILE) if local_env else None,
            "global": str(GLOBAL_ENV) if global_env else None,
        },
        "ready": {
            "parse": bool(claude_path),
            "create": bool(LINEAR_API_KEY and LINEAR_TEAM_ID),
        },
    }, pretty=True)


# ── parse ──────────────────────────────────────────────────────────────

@cli.command()
@click.argument("file", type=click.File("r"), default="-", required=False)
@click.option("--text", default=None, help="Pass transcript text directly as a string.")
@click.option("--push", is_flag=True, help="Create issues in Linear immediately after parsing.")
@click.option("--pretty", is_flag=True, help="Pretty-print JSON output.")
@click.option("--human", is_flag=True, help="Human-readable output instead of JSON.")
def parse(file, text, push, pretty, human):
    """Parse a transcript into Linear tickets.

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
            click.confirm("Create these issues in Linear?", abort=True)
            _push_tickets_human(tickets)
        else:
            click.echo("Use --push to create these in Linear.", err=True)
        return

    result = {"tickets": tickets, "count": len(tickets), "source": source}

    if push:
        created = []
        for t in tickets:
            issue = create_issue(t)
            t["linearId"] = issue["id"]
            t["linearUrl"] = issue["url"]
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
@click.option("--pretty", is_flag=True, help="Pretty-print JSON output.")
def create(input, title, description, priority, labels, pretty):
    """Create Linear issues from JSON or flags.

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
        issue = create_issue(t)
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


def _push_tickets_human(tickets):
    for t in tickets:
        result = create_issue(t)
        click.echo(click.style(f"  Created {result['id']}", fg="green") + f" — {result['title']}")
        click.echo(click.style(f"  {result['url']}", dim=True))


if __name__ == "__main__":
    cli()
