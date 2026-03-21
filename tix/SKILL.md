---
name: tix
description: Turn any text into actionable Linear or GitHub issues. Parse transcripts, notes, braindumps, to-do lists into tickets with AI. Supports project context for smarter ticket generation.
version: 0.1.0
triggers:
  - "create tickets"
  - "create issues"
  - "parse transcript"
  - "parse notes"
  - "make tickets from"
  - "turn this into tickets"
  - "tix"
  - "linear issues"
  - "github issues"
---

# tix — AI-powered text → ticket CLI

## What This Skill Does

tix turns any text (transcripts, notes, braindumps, to-do lists) into actionable Linear or GitHub issues using Claude AI.

## Prerequisites

Install tix globally:

```bash
npm install -g @junu0723/tix
```

Requires [Claude Code CLI](https://github.com/anthropics/claude-code) installed and authenticated.

Optional: [GitHub CLI (`gh`)](https://cli.github.com/) and/or [Linear CLI (`lin`)](https://www.npmjs.com/package/@linear/cli) for issue creation without API keys.

## Setup

```bash
# Configure credentials
tix setup --linear-api-key KEY --linear-team-id ID
tix setup --github-token TOKEN --github-repo owner/repo

# Or interactive
tix setup

# Create a project with context
tix project create my-project \
  --description "What this project does" \
  --stack "Node.js, React, PostgreSQL" \
  --philosophy "Ship fast, keep it simple"

tix project use my-project
```

## How to Use

### Parse text into tickets

When the user wants to create tickets from text, notes, or a transcript:

```bash
# From a file
tix parse meeting.txt --pretty

# From inline text
tix parse --text "Fix login bug, add dark mode, update API docs" --pretty

# From stdin
cat notes.md | tix parse --pretty

# Human-readable output
tix parse meeting.txt --human
```

### Parse and create issues immediately

```bash
# Create in Linear (default)
tix parse meeting.txt --push

# Create in GitHub
tix parse meeting.txt --push --target github
```

### Create issues from JSON

```bash
# Pipe from parse
tix parse notes.txt | jq '.tickets' | tix create

# Single ticket
tix create --title "Fix login bug" --priority 2 --labels "bug,frontend"

# Batch from JSON
echo '[{"title":"Task A","priority":3},{"title":"Task B","priority":2}]' | tix create
```

### Check configuration

```bash
tix status
```

### Manage projects

```bash
tix project list --pretty
tix project show --pretty
tix project use my-project
tix project update my-project --status "Launched, collecting feedback"
```

### View history

```bash
tix history list --pretty
tix history get 0 --pretty
```

### Launch web dashboard

```bash
tix dashboard
```

## Output Format

All commands output JSON to stdout. Status messages go to stderr.

### Parse output

```json
{
  "tickets": [
    {
      "title": "Fix login session timeout",
      "description": "Session expires after 24h, should be 2h per security requirements",
      "priority": 2,
      "labels": ["bug", "security"]
    }
  ],
  "count": 1,
  "source": "meeting.txt",
  "stats": {
    "duration_ms": 15800,
    "input_tokens": 520,
    "output_tokens": 220,
    "cost_usd": 0.1166
  }
}
```

### Create output

```json
{
  "created": [
    { "id": "ENG-42", "title": "Fix login session timeout", "url": "https://..." }
  ],
  "count": 1
}
```

## Priority Levels

| Priority | Meaning |
|----------|---------|
| 1 | Urgent — service outage, data loss |
| 2 | High — critical bug, upcoming deadline |
| 3 | Medium — improvement, general request |
| 4 | Low — nice-to-have |

## Tips

- **Project context matters**: Set description, stack, and philosophy on your project. tix uses this to generate technically specific tickets aligned with your project.
- **GitHub duplicate check**: If a project has a GitHub repo connected, tix checks existing open issues and avoids creating duplicates.
- **Pipe-friendly**: `tix parse` outputs JSON, `tix create` accepts JSON. Chain them or use `jq` to filter.
- **--human flag**: Use `--human` for readable output when reviewing tickets before creating.
