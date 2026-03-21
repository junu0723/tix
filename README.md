# @junu0723/relay

A tool that analyzes meeting/call transcripts with AI and automatically converts them into Linear or GitHub issues.

```
Transcript → Claude AI (parse into tickets) → Linear / GitHub (create issues) → Human just approves
```

## Install

```bash
# Global install (recommended)
npm install -g @junu0723/relay
relay --help

# Or run without installing
npx @junu0723/relay parse meeting.txt
```

### Prerequisites

- Node.js 18+
- [Claude Code CLI](https://github.com/anthropics/claude-code) installed and authenticated

### Optional (auto-detected)

- [GitHub CLI (`gh`)](https://cli.github.com/) — if installed, GitHub issues work without a token
- [Google Workspace CLI (`gws`)](https://github.com/nicholasgasior/gws) — for importing from Google Docs, Sheets, and Meet

## Setup

```bash
# Interactive (prompts for all credentials)
relay setup

# Linear only
relay setup --linear-api-key lin_api_xxx --linear-team-id your-team-uuid

# GitHub only (or skip if you have gh CLI)
relay setup --github-token ghp_xxx --github-repo owner/repo

# Save globally (~/.relay-cli/.env)
relay setup --global --linear-api-key lin_api_xxx --linear-team-id uuid
```

Check your configuration:

```bash
relay status
```

## Projects

Projects let you manage multiple output targets (different repos, teams) and switch between them.

```bash
# Create a project (auto-detects GitHub repo and Linear team)
relay project create webapp
relay project create webapp --github-repo owner/webapp --linear-team-id uuid

# List / switch / show / delete
relay project list --pretty
relay project use webapp
relay project show --pretty
relay project delete old-project --yes
```

## CLI Usage

All commands output structured JSON to stdout. Status messages go to stderr.
Use `--target linear` (default) or `--target github` to choose where issues are created.

### Parse any input

Accepts transcripts, notes, to-do lists, braindumps, docs — anything with actionable items.

```bash
relay parse meeting.txt
cat notes.md | relay parse
relay parse --text "Fix the login bug by Friday"
relay parse meeting.txt --push
relay parse meeting.txt --push --target github
relay parse meeting.txt --pretty
relay parse meeting.txt --human
```

### Fetch from Google Workspace

Requires [gws CLI](https://github.com/nicholasgasior/gws).

```bash
# Google Doc
relay fetch doc <docId>
relay fetch doc <docId> --push --target linear

# Google Sheet
relay fetch sheet <spreadsheetId>
relay fetch sheet <spreadsheetId> "Sheet2!A1:D20"
relay fetch sheet <spreadsheetId> --push --target github

# Google Meet (list recent meetings)
relay fetch meet --list
relay fetch meet <conferenceId> --push
```

Also available in the web dashboard via the "Import from Google" button.

### Create issues

```bash
relay parse meeting.txt | jq '.tickets' | relay create
relay create tickets.json
relay create --title "Fix login bug" --description "Session expires" --priority 2
echo '{"title":"Fix bug","priority":1}' | relay create --target github
```

### History

```bash
relay history list --pretty
relay history get 0 --pretty
relay history clear --yes
```

## Web Dashboard

```bash
relay dashboard
relay dashboard --port 3000
```

Features:
- Paste or upload transcript files (.txt, .md, .srt, .vtt)
- Edit tickets before creating
- Project and target selection
- History with creation status tracking

## Configuration

### Integration backends

| Integration | CLI backend | API backend |
|------------|-------------|-------------|
| Claude (parsing) | `claude` CLI | — |
| GitHub (issues) | `gh` CLI (auto-detected) | REST API via `GITHUB_TOKEN` |
| Linear (issues) | — | GraphQL API via `LINEAR_API_KEY` |
| Google Workspace (input) | `gws` CLI | — |

### Environment variables

| Variable | Required for | Description |
|----------|-------------|-------------|
| `LINEAR_API_KEY` | Linear issues | [Linear API key](https://linear.app/settings/account/security) |
| `LINEAR_TEAM_ID` | Linear issues | Linear team UUID (or set per-project) |
| `GITHUB_TOKEN` | GitHub issues (API) | [GitHub token](https://github.com/settings/tokens) (not needed if `gh` CLI is installed) |
| `GITHUB_REPO` | GitHub issues | `owner/repo` format (or set per-project, or auto-detected) |

## Uninstall

```bash
npm uninstall -g @junu0723/relay
```

To also remove config, projects, and history:

```bash
rm -rf ~/.relay-cli
```

## Development

```bash
git clone https://github.com/junu0723/relay-cli.git
cd relay-cli
npm install
node bin/relay.js --help
node bin/relay.js dashboard
```

## License

MIT
