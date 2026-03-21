import sys
import json
import click
from relay.parser import parse_transcript
from relay.linear import create_issue
from relay.history import add_entry


PRIORITY_LABELS = {1: "Urgent", 2: "High", 3: "Medium", 4: "Low"}
PRIORITY_COLORS = {1: "red", 2: "yellow", 3: "blue", 4: "white"}


@click.group()
def cli():
    """relay — Convert meeting/call transcripts into Linear issues."""
    pass


@cli.command()
@click.argument("file", type=click.File("r"), default="-")
@click.option("--push", is_flag=True, help="Create issues in Linear after parsing.")
@click.option("--json-output", "json_out", is_flag=True, help="Output raw JSON.")
def parse(file, push, json_out):
    """Parse a transcript file into tickets.

    Pass a file path or pipe from stdin:

      relay parse meeting.txt

      cat meeting.txt | relay parse
    """
    transcript = file.read().strip()
    if not transcript:
        click.echo("Error: empty transcript.", err=True)
        sys.exit(1)

    click.echo("Analyzing transcript...", err=True)
    tickets = parse_transcript(transcript)
    add_entry(tickets, source=getattr(file, 'name', 'stdin'))

    if json_out:
        click.echo(json.dumps(tickets, ensure_ascii=False, indent=2))
        if not push:
            return

    if not json_out:
        click.echo(f"\nFound {len(tickets)} ticket(s):\n", err=True)
        for i, t in enumerate(tickets):
            p = t.get("priority", 3)
            color = PRIORITY_COLORS.get(p, "white")
            labels = ", ".join(t.get("labels", []))
            click.echo(click.style(f"  [{i+1}] P{p} {PRIORITY_LABELS.get(p, '')}", fg=color, bold=True))
            click.echo(f"      {t['title']}")
            click.echo(click.style(f"      {t.get('description', '')}", dim=True))
            if labels:
                click.echo(click.style(f"      labels: {labels}", dim=True))
            click.echo()

    if push:
        if not json_out:
            click.confirm("Create these issues in Linear?", abort=True)
        for t in tickets:
            result = create_issue(t)
            click.echo(click.style(f"  Created {result['id']}", fg="green") + f" — {result['title']}")
            click.echo(click.style(f"  {result['url']}", dim=True))
    elif not json_out:
        click.echo("Use --push to create these in Linear.", err=True)


@cli.command()
@click.option("--port", default=8000, help="Port to serve on.")
@click.option("--host", default="127.0.0.1", help="Host to bind to.")
def dashboard(port, host):
    """Launch the web dashboard."""
    import uvicorn
    click.echo(f"Starting dashboard at http://{host}:{port}")
    uvicorn.run("relay.main:app", host=host, port=port, reload=True)


if __name__ == "__main__":
    cli()
