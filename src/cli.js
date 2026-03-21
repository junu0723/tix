import { program } from 'commander';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { execFileSync } from 'child_process';
import { createInterface } from 'readline';
import chalk from 'chalk';

import { LINEAR_API_KEY, LINEAR_TEAM_ID, GITHUB_TOKEN, GITHUB_REPO } from './config.js';
import { parseTranscript } from './parser.js';
import { createIssue as linearCreate } from './linear.js';
import { createIssue as githubCreate, detectRepo } from './github.js';
import { addEntry, getEntries, clearHistory } from './history.js';
import {
  createProject, getProject, listProjects, deleteProject,
  setActiveProject, getActiveProject, getActiveProjectName,
} from './projects.js';

const ENV_FILE = join(process.cwd(), '.env');
const GLOBAL_ENV = join(homedir(), '.relay-cli', '.env');

const PRIORITY_LABELS = { 1: 'Urgent', 2: 'High', 3: 'Medium', 4: 'Low' };
const PRIORITY_COLORS = { 1: 'red', 2: 'yellow', 3: 'blue', 4: 'white' };

function output(data, pretty = false) {
  console.log(JSON.stringify(data, null, pretty ? 2 : undefined));
}

function error(message, code = 1) {
  console.error(JSON.stringify({ error: message }));
  process.exit(code);
}

async function createIssue(ticket, target, project) {
  if (target === 'linear') {
    const teamId = project?.linear_team_id;
    return linearCreate(ticket, teamId || undefined);
  } else if (target === 'github') {
    const repo = project?.github_repo;
    return githubCreate(ticket, repo || undefined);
  }
  error(`Unknown target '${target}'. Choose: linear, github`);
}

function readInput(filePath) {
  if (filePath && filePath !== '-') return readFileSync(filePath, 'utf8');
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

async function prompt(question, defaultValue = '') {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise(resolve => {
    const suffix = defaultValue ? ` (${defaultValue})` : '';
    rl.question(`${question}${suffix}: `, answer => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
  });
}

async function confirm(question) {
  const answer = await prompt(`${question} (y/N)`);
  if (!answer.toLowerCase().startsWith('y')) process.exit(0);
}

// ── setup ──────────────────────────────────────────────────────────────

program
  .name('relay')
  .description('relay — Convert meeting/call transcripts into Linear or GitHub issues.')
  .version('0.1.0');

program
  .command('setup')
  .description('Configure API credentials for Linear and/or GitHub.')
  .option('--linear-api-key <key>', 'Linear API key')
  .option('--linear-team-id <id>', 'Linear team UUID')
  .option('--github-token <token>', 'GitHub personal access token')
  .option('--github-repo <repo>', 'GitHub repo (owner/repo)')
  .option('--global', 'Save to ~/.relay-cli/.env')
  .action(async (opts) => {
    const target = opts.global ? GLOBAL_ENV : ENV_FILE;
    const existing = {};
    if (existsSync(target)) {
      for (const line of readFileSync(target, 'utf8').split('\n')) {
        if (line.includes('=') && !line.startsWith('#')) {
          const [k, ...v] = line.split('=');
          existing[k.trim()] = v.join('=').trim();
        }
      }
    }

    const allNone = !opts.linearApiKey && !opts.linearTeamId && !opts.githubToken && !opts.githubRepo;

    if (allNone || opts.linearApiKey !== undefined || opts.linearTeamId !== undefined) {
      if (!opts.linearApiKey && allNone) opts.linearApiKey = await prompt('LINEAR_API_KEY', existing.LINEAR_API_KEY || '');
      if (!opts.linearTeamId && allNone) opts.linearTeamId = await prompt('LINEAR_TEAM_ID', existing.LINEAR_TEAM_ID || '');
    }
    if (allNone || opts.githubToken !== undefined || opts.githubRepo !== undefined) {
      if (!opts.githubToken && allNone) opts.githubToken = await prompt('GITHUB_TOKEN', existing.GITHUB_TOKEN || '');
      if (!opts.githubRepo && allNone) opts.githubRepo = await prompt('GITHUB_REPO', existing.GITHUB_REPO || '');
    }

    if (opts.linearApiKey) existing.LINEAR_API_KEY = opts.linearApiKey;
    if (opts.linearTeamId) existing.LINEAR_TEAM_ID = opts.linearTeamId;
    if (opts.githubToken) existing.GITHUB_TOKEN = opts.githubToken;
    if (opts.githubRepo) existing.GITHUB_REPO = opts.githubRepo;

    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, Object.entries(existing).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');

    const result = { ok: true, file: target };
    if (existing.LINEAR_API_KEY) result.linear_api_key = existing.LINEAR_API_KEY.slice(0, 12) + '...';
    if (existing.LINEAR_TEAM_ID) result.linear_team_id = existing.LINEAR_TEAM_ID;
    if (existing.GITHUB_TOKEN) result.github_token = existing.GITHUB_TOKEN.slice(0, 12) + '...';
    if (existing.GITHUB_REPO) result.github_repo = existing.GITHUB_REPO;
    output(result, true);
  });

// ── status ─────────────────────────────────────────────────────────────

program
  .command('status')
  .description('Show current configuration and connection status.')
  .action(() => {
    let claudePath = null;
    try { claudePath = execFileSync('which', ['claude'], { encoding: 'utf8', stdio: 'pipe' }).trim(); } catch {}

    let ghPath = null;
    try { ghPath = execFileSync('which', ['gh'], { encoding: 'utf8', stdio: 'pipe' }).trim(); } catch {}

    output({
      linear_api_key: LINEAR_API_KEY ? LINEAR_API_KEY.slice(0, 12) + '...' : null,
      linear_team_id: LINEAR_TEAM_ID || null,
      github_token: GITHUB_TOKEN ? GITHUB_TOKEN.slice(0, 12) + '...' : null,
      github_repo: GITHUB_REPO || null,
      claude_cli: claudePath,
      env_files: {
        local: existsSync(ENV_FILE) ? ENV_FILE : null,
        global: existsSync(GLOBAL_ENV) ? GLOBAL_ENV : null,
      },
      active_project: getActiveProjectName(),
      ready: {
        parse: !!claudePath,
        linear: !!(LINEAR_API_KEY && LINEAR_TEAM_ID),
        github: !!(GITHUB_TOKEN || ghPath),
      },
    }, true);
  });

// ── parse ──────────────────────────────────────────────────────────────

program
  .command('parse [file]')
  .description('Parse a transcript into tickets.')
  .option('--text <text>', 'Pass transcript text directly')
  .option('--push', 'Create issues immediately after parsing')
  .option('--target <target>', 'Target platform: linear or github', 'linear')
  .option('--pretty', 'Pretty-print JSON output')
  .option('--human', 'Human-readable output')
  .action(async (file, opts) => {
    const transcript = opts.text ? opts.text.trim() : readInput(file).trim();
    if (!transcript) error('Empty transcript. Provide a file, stdin, or --text.');

    console.error('Analyzing transcript...');
    const tickets = parseTranscript(transcript);
    const source = opts.text ? 'text' : (file || 'stdin');
    addEntry(tickets, source);

    const proj = getActiveProject();
    if (proj) console.error(`Using project: ${proj.name}`);

    if (opts.human) {
      printTicketsHuman(tickets);
      if (opts.push) {
        await confirm(`Create these issues in ${opts.target}?`);
        await pushTicketsHuman(tickets, opts.target, proj);
      } else {
        console.error('Use --push to create issues.');
      }
      return;
    }

    const result = { tickets, count: tickets.length, source, target: opts.target };
    if (proj) result.project = proj.name;

    if (opts.push) {
      const created = [];
      for (const t of tickets) {
        const issue = await createIssue(t, opts.target, proj);
        t.issueId = issue.id;
        t.issueUrl = issue.url;
        created.push(issue);
        console.error(`Created ${issue.id}`);
      }
      result.created = created;
    }

    output(result, opts.pretty);
  });

// ── create ─────────────────────────────────────────────────────────────

program
  .command('create [input]')
  .description('Create issues in Linear or GitHub from JSON or flags.')
  .option('--title <title>', 'Ticket title')
  .option('--description <desc>', 'Ticket description')
  .option('--priority <n>', 'Priority 1-4', parseInt)
  .option('--labels <labels>', 'Comma-separated labels')
  .option('--target <target>', 'Target platform: linear or github', 'linear')
  .option('--pretty', 'Pretty-print JSON output')
  .action(async (input, opts) => {
    let ticketList;

    if (opts.title) {
      ticketList = [{
        title: opts.title,
        description: opts.description || '',
        priority: opts.priority || 3,
        labels: opts.labels ? opts.labels.split(',').map(s => s.trim()).filter(Boolean) : [],
      }];
    } else {
      const raw = readInput(input).trim();
      if (!raw) error('No input. Provide JSON via stdin/file or use --title flag.');
      let data;
      try { data = JSON.parse(raw); } catch (e) { error(`Invalid JSON: ${e.message}`); }
      if (Array.isArray(data)) ticketList = data;
      else if (data.tickets) ticketList = data.tickets;
      else ticketList = [data];
    }

    const proj = getActiveProject();
    const created = [];
    for (const t of ticketList) {
      const issue = await createIssue(t, opts.target, proj);
      created.push(issue);
      console.error(`Created ${issue.id}: ${issue.title}`);
    }

    output({ created, count: created.length }, opts.pretty);
  });

// ── history ────────────────────────────────────────────────────────────

const history = program.command('history').description('View and manage parsing history.');

history
  .command('list')
  .description('List recent parsing history.')
  .option('--limit <n>', 'Max entries', parseInt, 20)
  .option('--pretty', 'Pretty-print JSON output')
  .action((opts) => {
    const entries = getEntries();
    const summary = entries.slice(0, opts.limit).map((e, i) => ({
      index: i,
      timestamp: e.timestamp,
      source: e.source || '',
      ticket_count: e.tickets.length,
      created_count: e.tickets.filter(t => t.linearId || t.issueId).length,
    }));
    output({ entries: summary, total: entries.length }, opts.pretty);
  });

history
  .command('get <index>')
  .description('Get full details of a history entry.')
  .option('--pretty', 'Pretty-print JSON output')
  .action((index, opts) => {
    const entries = getEntries();
    const i = parseInt(index);
    if (i < 0 || i >= entries.length) error(`Invalid index ${i}. Total entries: ${entries.length}`);
    output(entries[i], opts.pretty);
  });

history
  .command('clear')
  .description('Clear all parsing history.')
  .option('--yes', 'Skip confirmation')
  .action(async (opts) => {
    if (!opts.yes) await confirm('Delete all history?');
    clearHistory();
    output({ ok: true, message: 'History cleared.' });
  });

// ── project ────────────────────────────────────────────────────────────

const project = program.command('project').description('Manage projects with per-project output targets.');

project
  .command('create <name>')
  .description('Create a new project.')
  .option('--github-repo <repo>', 'GitHub repo (owner/repo)')
  .option('--linear-team-id <id>', 'Linear team UUID')
  .option('--pretty', 'Pretty-print JSON output')
  .action((name, opts) => {
    const config = {};
    if (opts.githubRepo) {
      config.github_repo = opts.githubRepo;
    } else {
      const detected = detectRepo();
      if (detected) {
        config.github_repo = detected;
        console.error(`Auto-detected GitHub repo: ${detected}`);
      }
    }
    if (opts.linearTeamId) {
      config.linear_team_id = opts.linearTeamId;
    } else if (LINEAR_TEAM_ID) {
      config.linear_team_id = LINEAR_TEAM_ID;
      console.error(`Using default Linear team: ${LINEAR_TEAM_ID}`);
    }
    output(createProject(name, config), opts.pretty);
  });

project
  .command('list')
  .description('List all projects.')
  .option('--pretty', 'Pretty-print JSON output')
  .action((opts) => {
    const projects = listProjects();
    output({ projects, count: projects.length }, opts.pretty);
  });

project
  .command('use <name>')
  .description('Set the active project.')
  .action((name) => {
    setActiveProject(name);
    const proj = getProject(name);
    output({ ok: true, active: name, ...proj });
  });

project
  .command('show [name]')
  .description('Show project details.')
  .option('--pretty', 'Pretty-print JSON output')
  .action((name, opts) => {
    if (!name) name = getActiveProjectName();
    if (!name) error("No active project. Use 'relay project use <name>' or specify a name.");
    const proj = getProject(name);
    if (!proj) error(`Project '${name}' not found.`);
    proj.active = name === getActiveProjectName();
    output(proj, opts.pretty);
  });

project
  .command('delete <name>')
  .description('Delete a project.')
  .option('--yes', 'Skip confirmation')
  .action(async (name, opts) => {
    if (!opts.yes) await confirm(`Delete project '${name}'?`);
    if (deleteProject(name)) output({ ok: true, deleted: name });
    else error(`Project '${name}' not found.`);
  });

// ── fetch ──────────────────────────────────────────────────────────────

const fetch = program.command('fetch').description('Fetch content from Google Workspace and parse into tickets.');

fetch
  .command('doc <docId>')
  .description('Fetch a Google Doc and parse into tickets.')
  .option('--push', 'Create issues immediately')
  .option('--target <target>', 'Target platform', 'linear')
  .option('--pretty', 'Pretty-print JSON output')
  .option('--human', 'Human-readable output')
  .action(async (docId, opts) => {
    const { fetchDoc } = await import('./google.js');
    console.error(`Fetching Google Doc...`);
    const doc = fetchDoc(docId);
    console.error(`Got: "${doc.title}" (${doc.text.length} chars)`);
    await parseAndOutput(doc.text, `gdoc:${docId}`, opts);
  });

fetch
  .command('sheet <spreadsheetId> [range]')
  .description('Fetch a Google Sheet and parse into tickets.')
  .option('--push', 'Create issues immediately')
  .option('--target <target>', 'Target platform', 'linear')
  .option('--pretty', 'Pretty-print JSON output')
  .option('--human', 'Human-readable output')
  .action(async (spreadsheetId, range, opts) => {
    const { fetchSheet } = await import('./google.js');
    console.error(`Fetching Google Sheet...`);
    const sheet = fetchSheet(spreadsheetId, range || 'Sheet1');
    console.error(`Got: ${sheet.text.split('\n').length} rows`);
    await parseAndOutput(sheet.text, `gsheet:${spreadsheetId}`, opts);
  });

fetch
  .command('meet [conferenceId]')
  .description('Fetch a Google Meet transcript and parse into tickets.')
  .option('--push', 'Create issues immediately')
  .option('--target <target>', 'Target platform', 'linear')
  .option('--pretty', 'Pretty-print JSON output')
  .option('--human', 'Human-readable output')
  .option('--list', 'List recent meetings instead of fetching')
  .action(async (conferenceId, opts) => {
    const { fetchMeetTranscripts, fetchMeetTranscript } = await import('./google.js');

    if (opts.list || !conferenceId) {
      console.error('Listing recent meetings...');
      const meetings = fetchMeetTranscripts();
      output({ meetings, count: meetings.length }, opts.pretty);
      return;
    }

    console.error(`Fetching Meet transcript...`);
    const conferenceName = conferenceId.startsWith('conferenceRecords/')
      ? conferenceId : `conferenceRecords/${conferenceId}`;
    const transcript = fetchMeetTranscript(conferenceName);
    if (!transcript) error('No transcript found for this meeting.');
    console.error(`Got transcript (${transcript.text.length} chars)`);
    await parseAndOutput(transcript.text, `meet:${conferenceId}`, opts);
  });

async function parseAndOutput(text, source, opts) {
  console.error('Analyzing...');
  const tickets = parseTranscript(text);
  addEntry(tickets, source);

  const proj = getActiveProject();
  if (proj) console.error(`Using project: ${proj.name}`);

  if (opts.human) {
    printTicketsHuman(tickets);
    if (opts.push) {
      await confirm(`Create these issues in ${opts.target}?`);
      await pushTicketsHuman(tickets, opts.target, proj);
    }
    return;
  }

  const result = { tickets, count: tickets.length, source, target: opts.target };
  if (proj) result.project = proj.name;

  if (opts.push) {
    const created = [];
    for (const t of tickets) {
      const issue = await createIssue(t, opts.target, proj);
      t.issueId = issue.id;
      t.issueUrl = issue.url;
      created.push(issue);
      console.error(`Created ${issue.id}`);
    }
    result.created = created;
  }

  output(result, opts.pretty);
}

// ── dashboard ──────────────────────────────────────────────────────────

program
  .command('dashboard')
  .description('Launch the web dashboard.')
  .option('--port <port>', 'Port to serve on', '8000')
  .option('--host <host>', 'Host to bind to', '127.0.0.1')
  .action(async (opts) => {
    const { startServer } = await import('./server.js');
    startServer(opts.host, parseInt(opts.port));
  });

// ── helpers ────────────────────────────────────────────────────────────

function printTicketsHuman(tickets) {
  console.error(`\nFound ${tickets.length} ticket(s):\n`);
  tickets.forEach((t, i) => {
    const p = t.priority || 3;
    const color = PRIORITY_COLORS[p] || 'white';
    const labels = (t.labels || []).join(', ');
    console.error(chalk[color].bold(`  [${i + 1}] P${p} ${PRIORITY_LABELS[p] || ''}`));
    console.error(`      ${t.title}`);
    console.error(chalk.dim(`      ${t.description || ''}`));
    if (labels) console.error(chalk.dim(`      labels: ${labels}`));
    console.error();
  });
}

async function pushTicketsHuman(tickets, target, project) {
  for (const t of tickets) {
    const result = await createIssue(t, target, project);
    console.error(chalk.green(`  Created ${result.id}`) + ` — ${result.title}`);
    console.error(chalk.dim(`  ${result.url}`));
  }
}

program.parse();
