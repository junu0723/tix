import { execFileSync } from 'child_process';
import { execSync } from 'child_process';

const PROMPT = `You are an expert at converting any type of input into actionable tickets.

Your input may be one of:
- Meeting/call transcript
- A to-do list or bullet points
- Freeform notes or braindump
- A document or spec
- Spreadsheet data (CSV/table format)
- Email thread
- Any other text containing actionable items

Your job: Identify every actionable item and convert each into a ticket.

Rules:
- Each ticket must be an independently executable unit
- Split into mutually exclusive items with no duplicates
- Output ONLY a JSON array (no other text)
- Write tickets in the same language as the input
- Infer priority from context (urgency, deadlines, severity)
- Infer appropriate labels from context

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
1 = Urgent (service outage, data loss, blocking issue)
2 = High (critical bug, important request, upcoming deadline)
3 = Medium (improvement, general request)
4 = Low (nice-to-have, can be done later)

input:
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
