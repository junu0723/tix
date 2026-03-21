import { execFileSync } from 'child_process';
import { GITHUB_TOKEN, GITHUB_REPO } from './config.js';

const PRIORITY_LABELS = { 1: 'P1: urgent', 2: 'P2: high', 3: 'P3: medium', 4: 'P4: low' };

export function getOpenIssues(repo = null) {
  repo = repo || detectRepo();
  if (!repo || !hasGhCli()) return [];
  try {
    const result = execFileSync('gh', [
      'issue', 'list', '--repo', repo, '--state', 'open',
      '--json', 'number,title,labels,state', '--limit', '50',
    ], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 15_000 });
    return JSON.parse(result);
  } catch {
    return [];
  }
}

export function getRepoInfo(repo = null) {
  repo = repo || detectRepo();
  if (!repo || !hasGhCli()) return null;
  try {
    const result = execFileSync('gh', [
      'repo', 'view', repo, '--json', 'name,description,primaryLanguage,languages',
    ], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 10_000 });
    return JSON.parse(result);
  } catch {
    return null;
  }
}

function hasGhCli() {
  try {
    execFileSync('which', ['gh'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function detectRepo() {
  if (GITHUB_REPO) return GITHUB_REPO;
  try {
    const result = execFileSync('gh', [
      'repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner',
    ], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 10_000 });
    return result.trim() || null;
  } catch {
    return null;
  }
}

function buildLabels(ticket) {
  const labels = [...(ticket.labels || [])];
  const pl = PRIORITY_LABELS[ticket.priority];
  if (pl) labels.push(pl);
  return labels;
}

function createIssueCli(ticket, repo) {
  repo = repo || detectRepo();
  if (!repo) throw new Error('No GitHub repo found. Set GITHUB_REPO, pass --github-repo, or run inside a git repo with a GitHub remote.');

  const cmd = ['issue', 'create', '--repo', repo, '--title', ticket.title, '--body', ticket.description || ''];
  for (const label of buildLabels(ticket)) {
    cmd.push('--label', label);
  }

  const result = execFileSync('gh', cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30_000 });
  const url = result.trim();
  const number = url.split('/').pop();

  return { id: `#${number}`, title: ticket.title, url };
}

async function createIssueApi(ticket, repo) {
  repo = repo || GITHUB_REPO;
  if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN is not set. Check your .env file.');
  if (!repo) throw new Error('GITHUB_REPO is not set. Check your .env file. (format: owner/repo)');

  const resp = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
    },
    body: JSON.stringify({
      title: ticket.title,
      body: ticket.description || '',
      labels: buildLabels(ticket),
    }),
  });
  if (!resp.ok) throw new Error(`GitHub API HTTP ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();

  return { id: `#${data.number}`, title: data.title, url: data.html_url };
}

export async function createIssue(ticket, repo = null) {
  if (hasGhCli()) return createIssueCli(ticket, repo);
  return createIssueApi(ticket, repo);
}
