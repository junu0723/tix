import { execFileSync, execSync } from 'child_process';
import { getOpenIssues, getRepoInfo } from './github.js';

const BASE_PROMPT = `You are an expert at converting any type of input into actionable tickets.

Your input may be one of:
- Meeting/call transcript
- A to-do list or bullet points
- Freeform notes or braindump
- A document or spec
- Spreadsheet data (CSV/table format)
- Email thread
- QA feedback / bug reports
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
`;

function buildContextBlock(project) {
  if (!project) return '';

  const lines = ['[Project Context]'];
  if (project.name) lines.push(`Name: ${project.name}`);
  if (project.description) lines.push(`Description: ${project.description}`);
  if (project.stack) lines.push(`Tech stack: ${project.stack}`);
  if (project.status) lines.push(`Current status: ${project.status}`);
  if (project.philosophy) lines.push(`Philosophy/principles:\n${project.philosophy}`);

  // Fetch GitHub context if repo is connected
  const repo = project.github_repo;
  if (repo) {
    const issues = getOpenIssues(repo);
    if (issues.length > 0) {
      lines.push('');
      lines.push(`[Existing Open Issues in ${repo}]`);
      issues.forEach(i => {
        const labels = (i.labels || []).map(l => l.name || l).join(', ');
        lines.push(`- #${i.number}: ${i.title}${labels ? ` [${labels}]` : ''}`);
      });
    }

    const repoInfo = getRepoInfo(repo);
    if (repoInfo?.languages) {
      const langs = repoInfo.languages.map(l => l.node?.name || l.name || l).join(', ');
      if (langs) lines.push(`\nRepo languages: ${langs}`);
    }
  }

  lines.push('');
  lines.push('Use this context to:');
  lines.push('- Make ticket titles and descriptions technically specific to this project');
  lines.push('- Align priorities with the project\'s current status and goals');
  lines.push('- Use labels that match the project\'s tech stack and domain');
  lines.push('- Flag items that conflict with the project philosophy');
  if (repo) {
    lines.push('- Check existing issues for duplicates — if an item matches an existing issue, note it in the description (e.g. "Related: #42") and set priority accordingly');
    lines.push('- Do NOT create tickets for things that are already covered by open issues');
  }
  lines.push('');

  return lines.join('\n');
}

function findClaude() {
  try {
    return execSync('which claude', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return 'claude';
  }
}

const MAX_INPUT_CHARS = 30_000;

export function parseTranscript(text, project = null) {
  const claudePath = findClaude();

  // Truncate overly long input
  if (text.length > MAX_INPUT_CHARS) {
    text = text.slice(0, MAX_INPUT_CHARS) + '\n\n[... truncated, ' + (text.length - MAX_INPUT_CHARS) + ' chars omitted]';
  }

  const contextBlock = buildContextBlock(project);
  const fullPrompt = contextBlock + BASE_PROMPT + 'input:\n' + text;

  const result = execFileSync(claudePath, [
    '-p', fullPrompt,
    '--output-format', 'text',
  ], {
    encoding: 'utf8',
    timeout: 300_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let raw = result.trim();
  // Strip markdown code fences
  if (raw.includes('```')) {
    const match = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    if (match) raw = match[1].trim();
  }
  // Extract JSON array if Claude added extra text
  if (!raw.startsWith('[')) {
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    if (start !== -1 && end !== -1) raw = raw.slice(start, end + 1);
  }

  return JSON.parse(raw);
}
