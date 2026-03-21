# relay-cli

A tool that analyzes meeting/call transcripts with AI and automatically converts them into Linear issues.

```
Transcript → Claude CLI (parse into tickets) → Linear API (create issues) → Human just approves
```

## Setup

```bash
pip install -r requirements.txt
cp .env.example .env
# Fill in API keys in .env
```

Requires [Claude Code CLI](https://github.com/anthropics/claude-code) installed and authenticated.

## Run

```bash
uvicorn relay.main:app --reload --port 8000
```

Open http://localhost:8000, paste a transcript, analyze, and create Linear issues.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `LINEAR_API_KEY` | Linear API key |
| `LINEAR_TEAM_ID` | Linear team ID |

Transcript parsing works via Claude Code CLI (no API key needed). Linear issue creation requires both keys above.
