# tix

AI-powered CLI that turns any text into actionable tickets.

Feed it meeting transcripts, notes, braindumps, to-do lists — it extracts actionable items and creates Linear or GitHub issues automatically. Designed for AI agents, with a web dashboard for humans.

## Try It

```bash
# No install needed
npx @junu0723/tix parse --text "Fix the login bug by Friday, add dark mode support" --human
```

## Install

```bash
npm install -g @junu0723/tix
tix --help
```

### Prerequisites

- Node.js 18+
- [Claude Code CLI](https://github.com/anthropics/claude-code) — used for AI-powered parsing

### Optional (auto-detected)

- [GitHub CLI (`gh`)](https://cli.github.com/) — create GitHub issues without a token
- [Linear CLI (`lin`)](https://www.npmjs.com/package/@linear/cli) — create Linear issues without an API key

## Quick Start

```bash
# 1. Configure credentials
tix setup

# 2. Create a project (auto-detects GitHub repo and Linear team)
tix project create my-project

# 3. Add project context for smarter tickets
tix project update my-project \
  --description "E-commerce platform" \
  --stack "Next.js, Prisma, PostgreSQL" \
  --philosophy "Ship fast, user experience over features"

# 4. Parse any text into tickets
tix parse meeting.txt --human

# 5. Parse and create issues in one step
tix parse meeting.txt --push
```

## CLI Reference

All commands output structured JSON to stdout. Status messages go to stderr.

### `tix parse`

Parse any text into tickets. Accepts transcripts, notes, to-do lists, braindumps, docs, spreadsheet data — anything with actionable items.

When a project is active, its context (description, stack, status, philosophy) and existing GitHub issues are injected into the prompt. Claude generates project-specific tickets, checks for duplicates, and aligns priorities with your project's goals.

```bash
tix parse meeting.txt                        # from file
cat notes.md | tix parse                     # from stdin
tix parse --text "Fix the login bug"         # inline text
tix parse meeting.txt --push                 # parse + create in Linear
tix parse meeting.txt --push --target github # parse + create in GitHub
tix parse meeting.txt --pretty               # pretty JSON output
tix parse meeting.txt --human                # human-readable output
```

Output includes analysis stats (duration, tokens, cost):
```json
{
  "tickets": [{ "title": "...", "description": "...", "priority": 1, "labels": ["bug"] }],
  "count": 3,
  "stats": { "duration_ms": 15800, "input_tokens": 520, "output_tokens": 220, "cost_usd": 0.1166 }
}
```

### `tix create`

Create issues directly from JSON or flags.

```bash
tix parse notes.txt | jq '.tickets' | tix create         # pipe from parse
tix create tickets.json                                    # from JSON file
tix create --title "Fix bug" --priority 2 --labels "bug"   # from flags
tix create --target github                                 # target GitHub
```

### `tix project`

Manage projects with per-project output targets and context.

```bash
tix project create my-app
tix project update my-app --description "..." --stack "..." --philosophy "..."
tix project use my-app
tix project list --pretty
tix project show --pretty
tix project delete old-project --yes
```

### `tix setup`

Configure API credentials.

```bash
tix setup                                                  # interactive
tix setup --linear-api-key KEY --linear-team-id ID         # Linear
tix setup --github-token TOKEN --github-repo owner/repo    # GitHub
tix setup --global                                         # save to ~/.tix/.env
```

### `tix status` · `tix history` · `tix dashboard`

```bash
tix status                       # show config and readiness
tix history list --pretty        # view parsing history
tix history clear --yes          # clear history
tix dashboard                    # launch web UI at http://127.0.0.1:8000
tix dashboard --port 3000
```

## Dashboard

The web UI provides a human-friendly interface:

- Paste text or upload files (.txt, .md, .srt, .vtt, .csv)
- Real-time analysis progress with token count and cancel button
- Edit tickets (title, description, priority, labels) before creating
- Project selector with context editor
- Target selector (Linear / GitHub)
- History with creation status tracking

## Integration Backends

| Integration | CLI backend | API backend |
|------------|-------------|-------------|
| Claude (parsing) | `claude` CLI | — |
| GitHub (issues) | `gh` CLI (auto-detected) | REST API via `GITHUB_TOKEN` |
| Linear (issues) | `lin` CLI (auto-detected) | GraphQL API via `LINEAR_API_KEY` |

### Environment Variables

| Variable | Required for | Description |
|----------|-------------|-------------|
| `LINEAR_API_KEY` | Linear (API mode) | [Linear API key](https://linear.app/settings/account/security) |
| `LINEAR_TEAM_ID` | Linear (API mode) | Linear team UUID (or set per-project) |
| `GITHUB_TOKEN` | GitHub (API mode) | [GitHub token](https://github.com/settings/tokens) (not needed with `gh` CLI) |
| `GITHUB_REPO` | GitHub | `owner/repo` (or per-project, or auto-detected) |

Credentials load from `.env` (local) or `~/.tix/.env` (global).

## Claude Code Skill

tix is available as a [Claude Code skill](https://skills.sh). Install it to let Claude Code use tix automatically when you ask to create tickets.

```bash
# Install the skill
npx skills add junu0723/tix -g -y

# Then just ask Claude Code:
# "turn these meeting notes into Linear issues"
# "create tickets from this braindump"
```

## Uninstall

```bash
npm uninstall -g @junu0723/tix
rm -rf ~/.tix
```

## Development

```bash
git clone https://github.com/junu0723/tix.git
cd tix
npm install
node bin/tix.js status
node bin/tix.js dashboard
```

## License

MIT
