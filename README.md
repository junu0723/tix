# @junu0723/relay

AI-powered CLI that turns any text into actionable tickets.

Feed it meeting transcripts, notes, braindumps, to-do lists, Google Docs, Sheets — it extracts actionable items and creates Linear or GitHub issues automatically. Designed primarily for AI agents, with a web dashboard for humans.

## Install

```bash
# Global install
npm install -g @junu0723/relay
relay --help

# Or run without installing
npx @junu0723/relay --help
```

### Prerequisites

- Node.js 18+
- [Claude Code CLI](https://github.com/anthropics/claude-code) — used for AI-powered parsing

### Optional (auto-detected)

- [GitHub CLI (`gh`)](https://cli.github.com/) — create GitHub issues without a token
- [Linear CLI (`lin`)](https://www.npmjs.com/package/@linear/cli) — create Linear issues without an API key
- [Google Workspace CLI (`gws`)](https://github.com/nicholasgasior/gws) — import from Google Docs, Sheets, and Meet

## Quick Start

```bash
# 1. Configure credentials
relay setup

# 2. Create a project (auto-detects GitHub repo and Linear team)
relay project create my-project

# 3. Add project context for smarter ticket generation
relay project update my-project \
  --description "E-commerce platform" \
  --stack "Next.js, Prisma, PostgreSQL" \
  --philosophy "Ship fast, user experience over features"

# 4. Parse any text into tickets
relay parse meeting.txt --human

# 5. Parse and create issues in one step
relay parse meeting.txt --push
```

## CLI Reference

All commands output structured JSON to stdout. Status messages go to stderr.

### `relay parse`

Parse any text into tickets. Accepts transcripts, notes, to-do lists, braindumps, docs, spreadsheet data — anything with actionable items.

When a project is active, its context (description, stack, status, philosophy) and existing GitHub issues are injected into the prompt. This means Claude generates project-specific tickets, checks for duplicate issues, and aligns priorities with your project's goals.

```bash
relay parse meeting.txt                        # from file
cat notes.md | relay parse                     # from stdin
relay parse --text "Fix the login bug"         # inline text
relay parse meeting.txt --push                 # parse + create in Linear
relay parse meeting.txt --push --target github # parse + create in GitHub
relay parse meeting.txt --pretty               # pretty JSON output
relay parse meeting.txt --human                # human-readable output
```

Output includes analysis stats (duration, tokens, cost):
```json
{
  "tickets": [{ "title": "...", "description": "...", "priority": 1, "labels": ["bug"] }],
  "count": 3,
  "source": "meeting.txt",
  "stats": { "duration_ms": 15800, "input_tokens": 520, "output_tokens": 220, "cost_usd": 0.1166 }
}
```

### `relay create`

Create issues directly from JSON or flags.

```bash
relay parse notes.txt | jq '.tickets' | relay create         # pipe from parse
relay create tickets.json                                     # from JSON file
relay create --title "Fix bug" --priority 2 --labels "bug"    # from flags
relay create --target github                                  # target GitHub
```

### `relay fetch`

Import content from Google Workspace (requires `gws` CLI).

```bash
relay fetch doc <docId>                              # Google Doc
relay fetch doc <docId> --push                       # fetch + parse + create
relay fetch sheet <spreadsheetId>                    # Google Sheet (auto-detects first tab)
relay fetch sheet <spreadsheetId> "Sheet2!A1:D20"    # specific range
relay fetch meet --list                              # list recent meetings
relay fetch meet <conferenceId> --push               # fetch transcript + create
```

### `relay project`

Manage projects with per-project output targets and context.

Each project stores output targets (GitHub repo, Linear team) and context (description, tech stack, current status, philosophy). When active, this context is used during parsing — Claude generates technically specific tickets aligned with your project.

```bash
relay project create my-app                                  # auto-detect repo/team
relay project create my-app --github-repo owner/repo
relay project update my-app --description "..." --stack "..."
relay project update my-app --philosophy "Keep it simple"
relay project update my-app --status "Beta, launching next month"
relay project use my-app                                      # set active
relay project list --pretty
relay project show --pretty
relay project delete old-project --yes
```

### `relay setup`

Configure API credentials.

```bash
relay setup                                                  # interactive
relay setup --linear-api-key KEY --linear-team-id ID         # Linear
relay setup --github-token TOKEN --github-repo owner/repo    # GitHub
relay setup --global                                         # save to ~/.relay-cli/.env
```

### `relay status`

Show configuration, detected CLIs, and readiness.

```bash
relay status
```

### `relay history`

View and manage parsing history.

```bash
relay history list --pretty
relay history get 0 --pretty
relay history clear --yes
```

### `relay dashboard`

Launch the web UI for humans.

```bash
relay dashboard                  # http://127.0.0.1:8000
relay dashboard --port 3000
```

Dashboard features:
- Paste text or upload files (.txt, .md, .srt, .vtt, .csv)
- Import from Google Docs and Sheets
- Real-time analysis progress (elapsed time + token count)
- Cancel button to abort analysis
- Edit tickets (title, description, priority, labels) before creating
- Project selector with context editor
- Target selector (Linear / GitHub)
- History with creation status tracking and delete mode

## Integration Backends

Each integration auto-detects the best available backend:

| Integration | CLI backend | API backend |
|------------|-------------|-------------|
| Claude (parsing) | `claude` CLI | — |
| GitHub (issues) | `gh` CLI (auto-detected) | REST API via `GITHUB_TOKEN` |
| Linear (issues) | `lin` CLI (auto-detected) | GraphQL API via `LINEAR_API_KEY` |
| Google Workspace (input) | `gws` CLI | — |

### Environment Variables

| Variable | Required for | Description |
|----------|-------------|-------------|
| `LINEAR_API_KEY` | Linear (API mode) | [Linear API key](https://linear.app/settings/account/security) |
| `LINEAR_TEAM_ID` | Linear (API mode) | Linear team UUID (or set per-project) |
| `GITHUB_TOKEN` | GitHub (API mode) | [GitHub token](https://github.com/settings/tokens) (not needed with `gh` CLI) |
| `GITHUB_REPO` | GitHub | `owner/repo` (or per-project, or auto-detected from git) |

Credentials load from `.env` (local) or `~/.relay-cli/.env` (global).
Per-project config stored at `~/.relay-cli/projects/`.

## Uninstall

```bash
npm uninstall -g @junu0723/relay
rm -rf ~/.relay-cli   # remove config, projects, and history
```

## Development

```bash
git clone https://github.com/junu0723/relay-cli.git
cd relay-cli
npm install
node bin/relay.js status
node bin/relay.js dashboard
```

## License

MIT
