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

## Setup

```bash
# Interactive (prompts for all credentials)
relay setup

# Linear only
relay setup --linear-api-key lin_api_xxx --linear-team-id your-team-uuid

# GitHub only
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

| Variable | Required for | Description |
|----------|-------------|-------------|
| `LINEAR_API_KEY` | Linear issues | [Linear API key](https://linear.app/settings/account/security) |
| `LINEAR_TEAM_ID` | Linear issues | Linear team UUID |
| `GITHUB_TOKEN` | GitHub issues | [GitHub personal access token](https://github.com/settings/tokens) |
| `GITHUB_REPO` | GitHub issues | Repository in `owner/repo` format |

Transcript parsing uses Claude Code CLI — no additional API key needed.
Credentials are loaded from `.env` (local) or `~/.relay-cli/.env` (global).

## Uninstall

```bash
pip uninstall relay-cli
```

To also remove config and history:

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
