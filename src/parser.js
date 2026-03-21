import { execFileSync, execSync, spawn } from 'child_process';
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

function buildPrompt(text, project) {
  if (text.length > MAX_INPUT_CHARS) {
    text = text.slice(0, MAX_INPUT_CHARS) + '\n\n[... truncated, ' + (text.length - MAX_INPUT_CHARS) + ' chars omitted]';
  }
  return buildContextBlock(project) + BASE_PROMPT + 'input:\n' + text;
}

function extractTickets(raw) {
  if (raw.includes('```')) {
    const match = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    if (match) raw = match[1].trim();
  }
  if (!raw.startsWith('[')) {
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    if (start !== -1 && end !== -1) raw = raw.slice(start, end + 1);
  }
  return JSON.parse(raw);
}

// Synchronous version (for CLI)
export function parseTranscript(text, project = null) {
  const claudePath = findClaude();
  const fullPrompt = buildPrompt(text, project);

  const output = execFileSync(claudePath, [
    '-p', fullPrompt, '--output-format', 'json',
  ], { encoding: 'utf8', timeout: 300_000, stdio: ['pipe', 'pipe', 'pipe'] });

  const claudeResult = JSON.parse(output);
  const tickets = extractTickets((claudeResult.result || '').trim());

  const stats = {
    duration_ms: claudeResult.duration_ms || 0,
    input_tokens: claudeResult.usage?.input_tokens || 0,
    output_tokens: claudeResult.usage?.output_tokens || 0,
    cost_usd: claudeResult.total_cost_usd || 0,
  };

  return { tickets, stats };
}

// Streaming version (for dashboard SSE)
export function parseTranscriptStream(text, project = null, onEvent) {
  return new Promise((resolve, reject) => {
    const claudePath = findClaude();
    const fullPrompt = buildPrompt(text, project);

    const proc = spawn(claudePath, [
      '-p', fullPrompt, '--output-format', 'stream-json', '--verbose',
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    let buffer = '';
    let outputTokens = 0;
    let resultData = null;

    proc.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);

          if (event.type === 'assistant' && event.message?.usage) {
            outputTokens = event.message.usage.output_tokens || outputTokens;
            onEvent({
              type: 'progress',
              output_tokens: outputTokens,
              input_tokens: event.message.usage.input_tokens || 0,
            });
          }

          if (event.type === 'result') {
            resultData = event;
          }
        } catch {}
      }
    });

    proc.on('close', (code) => {
      if (!resultData) {
        reject(new Error('Claude CLI exited without result (code ' + code + ')'));
        return;
      }

      try {
        const tickets = extractTickets((resultData.result || '').trim());
        const stats = {
          duration_ms: resultData.duration_ms || 0,
          input_tokens: resultData.usage?.input_tokens || 0,
          output_tokens: resultData.usage?.output_tokens || 0,
          cost_usd: resultData.total_cost_usd || 0,
        };
        onEvent({ type: 'done', tickets, stats });
        resolve({ tickets, stats });
      } catch (e) {
        reject(e);
      }
    });

    proc.on('error', reject);
  });
}
