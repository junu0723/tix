import { execFileSync } from 'child_process';
import { execSync } from 'child_process';

const PROMPT = `You are an expert at analyzing meeting/call transcripts and converting them into Linear tickets.

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
`;

function findClaude() {
  try {
    return execSync('which claude', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return 'claude';
  }
}

export function parseTranscript(transcript) {
  const claudePath = findClaude();

  const result = execFileSync(claudePath, [
    '-p', PROMPT + transcript,
    '--output-format', 'text',
  ], {
    encoding: 'utf8',
    timeout: 120_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let raw = result.trim();
  if (raw.startsWith('```')) {
    raw = raw.split('\n').slice(1).join('\n');
    raw = raw.split('```').slice(0, -1).join('```');
  }

  return JSON.parse(raw);
}
