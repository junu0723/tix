# relay-cli

A tool that analyzes meeting/call transcripts with AI and automatically converts them into Linear or GitHub issues.

```
Transcript → Claude AI (parse into tickets) → Linear / GitHub (create issues) → Human just approves
```

## Install

```bash
pip install git+https://github.com/junu0723/relay-cli.git
```

### Prerequisites

- Python 3.11+
- [Claude Code CLI](https://github.com/anthropics/claude-code) installed and authenticated

### Optional (auto-detected)

- [GitHub CLI (`gh`)](https://cli.github.com/) — if installed, GitHub issues work without a token

## Setup

```bash
# Interactive (prompts for all credentials)
relay setup

# Linear only
relay setup --linear-api-key lin_api_xxx --linear-team-id your-team-uuid

# GitHub only (or skip if you have gh CLI)
relay setup --github-token ghp_xxx --github-repo owner/repo

# Both, saved globally (~/.relay-cli/.env)
relay setup --global \
  --linear-api-key lin_api_xxx --linear-team-id uuid \
  --github-token ghp_xxx --github-repo owner/repo
```

Check your configuration:

```bash
relay status
```

## Projects

Projects let you manage multiple output targets (different repos, teams) and switch between them.

```bash
# Create a project (auto-detects GitHub repo and Linear team from env)
relay project create webapp
relay project create webapp --github-repo owner/webapp --linear-team-id uuid

# List all projects
relay project list --pretty

# Switch active project
relay project use webapp

# Show project details
relay project show
relay project show webapp --pretty

# Delete a project
relay project delete old-project --yes
```

When a project is active, `relay parse --push` and `relay create` automatically use that project's config.

## CLI Usage

All commands output structured JSON to stdout. Status messages go to stderr.
Use `--target linear` (default) or `--target github` to choose where issues are created.

### Parse transcripts

```bash
# From file
relay parse meeting.txt

# From stdin
cat meeting.txt | relay parse

# Direct text input
relay parse --text "We need to fix the login bug by Friday"

# Parse and create in Linear
relay parse meeting.txt --push

# Parse and create as GitHub issues
relay parse meeting.txt --push --target github

# Pretty-print JSON
relay parse meeting.txt --pretty

# Human-readable output
relay parse meeting.txt --human
```

### Create issues

```bash
# Pipe from parse output
relay parse meeting.txt | jq '.tickets' | relay create

# Create as GitHub issues
relay parse meeting.txt | jq '.tickets' | relay create --target github

# From a JSON file
relay create tickets.json

# Single ticket with flags
relay create --title "Fix login bug" --description "Session expires" --priority 2 --labels "bug,backend"

# Single ticket via stdin
echo '{"title":"Fix bug","priority":1}' | relay create --target github
```

### History

```bash
# List recent entries
relay history list
relay history list --limit 5 --pretty

# Get full details of an entry
relay history get 0 --pretty

# Clear all history
relay history clear --yes
```

## Web Dashboard

```bash
relay dashboard
# opens http://127.0.0.1:8000

relay dashboard --port 3000
relay dashboard --host 0.0.0.0 --port 8080
```

Features:
- Paste or upload transcript files (.txt, .md, .srt, .vtt)
- Edit tickets (title, description, priority, labels) before creating
- Create issues in Linear individually or in bulk
- History with creation status tracking

## Configuration

### Integration backends

Each integration supports multiple backends (auto-selected):

| Integration | CLI backend | API backend |
|------------|-------------|-------------|
| Claude (parsing) | `claude` CLI (Claude Code) | — |
| GitHub (issues) | `gh` CLI (auto-detected) | REST API via `GITHUB_TOKEN` |
| Linear (issues) | — | GraphQL API via `LINEAR_API_KEY` |

### Environment variables

| Variable | Required for | Description |
|----------|-------------|-------------|
| `LINEAR_API_KEY` | Linear issues | [Linear API key](https://linear.app/settings/account/security) |
| `LINEAR_TEAM_ID` | Linear issues | Linear team UUID (or set per-project) |
| `GITHUB_TOKEN` | GitHub issues (API) | [GitHub token](https://github.com/settings/tokens) (not needed if `gh` CLI is installed) |
| `GITHUB_REPO` | GitHub issues | `owner/repo` format (or set per-project, or auto-detected) |

Credentials are loaded from `.env` (local) or `~/.relay-cli/.env` (global).
Per-project targets are stored in `~/.relay-cli/projects/`.

## Uninstall

```bash
pip uninstall relay-cli
```

To also remove config, projects, and history:

```bash
rm -rf ~/.relay-cli
```

## Development

```bash
git clone https://github.com/junu0723/relay-cli.git
cd relay-cli
python -m venv .venv && source .venv/bin/activate
pip install -e .
relay status
relay dashboard
```

## License

MIT
