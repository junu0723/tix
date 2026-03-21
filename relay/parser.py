import json
import shutil
import subprocess

PROMPT = """You are an expert at analyzing meeting/call transcripts and converting them into Linear tickets.

Rules:
- Each ticket must be an independently executable unit
- Split into mutually exclusive items with no duplicates
- Output ONLY a JSON array (no other text)
- Write tickets in the same language as the transcript

Output format:
[
  {
    "title": "...",
    "description": "...",
    "priority": 1,
    "labels": ["bug", "frontend"]
  }
]

Priority levels:
1 = Urgent (service outage, data loss, etc.)
2 = High (critical bug, important request)
3 = Medium (improvement, general request)
4 = Low (nice-to-have, can be done later)

transcript:
"""


def parse_transcript(transcript: str) -> list[dict]:
    result = subprocess.run(
        [shutil.which("claude") or "/Users/junu/.local/bin/claude", "-p", PROMPT + transcript, "--output-format", "text"],
        capture_output=True,
        text=True,
        timeout=120,
        stdin=subprocess.DEVNULL,
    )

    if result.returncode != 0:
        raise RuntimeError(f"claude CLI error (code={result.returncode}): stderr={result.stderr.strip()} stdout={result.stdout.strip()}")

    raw = result.stdout.strip()
    # Strip markdown code fences if present
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1]
        raw = raw.rsplit("```", 1)[0]
    return json.loads(raw)
