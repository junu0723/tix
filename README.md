# relay-cli

A tool that analyzes meeting/call transcripts with AI and automatically converts them into Linear issues.

```
Transcript → Claude AI (parse into tickets) → Linear API (create issues) → Human just approves
```

## Install

```bash
pip install git+https://github.com/junu0723/relay-cli.git
```

### Prerequisites

- Python 3.11+
- [Claude Code CLI](https://github.com/anthropics/claude-code) installed and authenticated

## Usage

### CLI

```bash
# Parse a transcript file
relay parse meeting.txt

# Parse and create Linear issues
relay parse meeting.txt --push

# Output raw JSON
relay parse meeting.txt --json-output

# Pipe from stdin
cat meeting.txt | relay parse
```

### Web Dashboard

```bash
relay dashboard
# opens http://127.0.0.1:8000

# Custom port
relay dashboard --port 3000
```

Features:
- Paste or upload transcript files (.txt, .md, .srt, .vtt)
- Edit tickets (title, description, priority, labels) before creating
- Create issues in Linear individually or in bulk
- History of past analyses

## Configuration

Create a `.env` file in your working directory:

```bash
LINEAR_API_KEY=lin_api_...
LINEAR_TEAM_ID=your-team-uuid
```

| Variable | Required | Description |
|----------|----------|-------------|
| `LINEAR_API_KEY` | For issue creation | [Linear API key](https://linear.app/settings/account/security) |
| `LINEAR_TEAM_ID` | For issue creation | Linear team UUID |

Transcript parsing works via Claude Code CLI — no API key needed. Linear issue creation requires both variables above.

## Uninstall

```bash
pip uninstall relay-cli
```

To also remove history data:

```bash
rm -rf ~/.relay-cli
```

## Development

```bash
git clone https://github.com/junu0723/relay-cli.git
cd relay-cli
python -m venv .venv && source .venv/bin/activate
pip install -e .
relay dashboard
```

## License

MIT
