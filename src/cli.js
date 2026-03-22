import { program } from 'commander';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { execFileSync } from 'child_process';
import { createInterface } from 'readline';
import chalk from 'chalk';

import { LINEAR_API_KEY, LINEAR_TEAM_ID, GITHUB_TOKEN, GITHUB_REPO } from './config.js';
import { parseTranscript } from './parser.js';
import { createIssue as linearCreate, getTeamIssues } from './linear.js';
import { createIssue as githubCreate, detectRepo, getOpenIssues } from './github.js';
import { checkDuplicates } from './dedup.js';
import { addEntry, getEntries, clearHistory } from './history.js';
import {
  createProject, getProject, listProjects, deleteProject,
  setActiveProject, getActiveProject, getActiveProjectName,
} from './projects.js';

const ENV_FILE = join(process.cwd(), '.env');
const GLOBAL_ENV = join(homedir(), '.tix', '.env');

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

async function fetchExistingIssues(target, project) {
  try {
    if (target === 'github') {
      return getOpenIssues(project?.github_repo);
    } else if (target === 'linear') {
      return await getTeamIssues(project?.linear_team_id);
    }
  } catch {
    return [];
  }
  return [];
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
  .name('tix')
  .description('tix — AI-powered CLI that turns any text into actionable tickets.\n\nDesigned for AI agents. All commands output JSON to stdout, status to stderr.\nSupports Linear and GitHub as output targets.\n\nQuick start:\n  tix setup --linear-api-key KEY --linear-team-id ID\n  tix project create my-project\n  tix parse meeting.txt --pretty\n  tix parse meeting.txt --push')
  .version('0.1.2');

program
  .command('setup')
  .description('Configure API credentials for Linear and/or GitHub.')
  .option('--linear-api-key <key>', 'Linear API key (lin_api_...)')
  .option('--linear-team-id <id>', 'Linear team UUID')
  .option('--github-token <token>', 'GitHub personal access token (ghp_...)')
  .option('--github-repo <repo>', 'GitHub repo in owner/repo format')
  .option('--global', 'Save to ~/.tix/.env instead of ./.env')
  .addHelpText('after', `
Examples:
  tix setup                                              # interactive prompts
  tix setup --linear-api-key lin_api_xxx --linear-team-id uuid  # non-interactive
  tix setup --github-token ghp_xxx --github-repo owner/repo
  tix setup --global --linear-api-key lin_api_xxx        # save globally

Output: { "ok": true, "file": "...", "linear_api_key": "lin_api_...", ... }`)
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
  .description('Show current configuration, detected CLIs, and readiness.')
  .addHelpText('after', `
Example:
  tix status

Output:
  {
    "linear_api_key": "lin_api_...",
    "linear_team_id": "uuid",
    "github_token": null,
    "github_repo": null,
    "claude_cli": "/path/to/claude",
    "lin_cli": "/path/to/lin",
    "gh_cli": "/path/to/gh",
    "active_project": "my-project",
    "ready": { "parse": true, "linear": true, "github": true, "google": true }
  }`)
  .action(() => {
    let claudePath = null;
    try { claudePath = execFileSync('which', ['claude'], { encoding: 'utf8', stdio: 'pipe' }).trim(); } catch {}

    let ghPath = null;
    try { ghPath = execFileSync('which', ['gh'], { encoding: 'utf8', stdio: 'pipe' }).trim(); } catch {}

    let linPath = null;
    try { linPath = execFileSync('which', ['lin'], { encoding: 'utf8', stdio: 'pipe' }).trim(); } catch {}

    output({
      linear_api_key: LINEAR_API_KEY ? LINEAR_API_KEY.slice(0, 12) + '...' : null,
      linear_team_id: LINEAR_TEAM_ID || null,
      github_token: GITHUB_TOKEN ? GITHUB_TOKEN.slice(0, 12) + '...' : null,
      github_repo: GITHUB_REPO || null,
      claude_cli: claudePath,
      lin_cli: linPath,
      gh_cli: ghPath,
      env_files: {
        local: existsSync(ENV_FILE) ? ENV_FILE : null,
        global: existsSync(GLOBAL_ENV) ? GLOBAL_ENV : null,
      },
      active_project: getActiveProjectName(),
      ready: {
        parse: !!claudePath,
        linear: !!(LINEAR_API_KEY && LINEAR_TEAM_ID) || !!linPath,
        github: !!(GITHUB_TOKEN || ghPath),
      },
    }, true);
  });

// ── parse ──────────────────────────────────────────────────────────────

program
  .command('parse [file]')
  .description('Parse any text into actionable tickets using Claude AI.')
  .option('--text <text>', 'Pass text directly as a string instead of file/stdin')
  .option('--push', 'Create issues in target platform immediately after parsing')
  .option('--target <target>', 'Target platform: linear or github (default: linear)', 'linear')
  .option('--skip-dedup', 'Skip duplicate issue checking when pushing')
  .option('--pretty', 'Pretty-print JSON output with indentation')
  .option('--human', 'Human-readable colored output instead of JSON')
  .addHelpText('after', `
Input: Text from file, stdin, or --text flag. Accepts any format:
  transcripts, notes, to-do lists, braindumps, docs, CSV data, etc.

Examples:
  tix parse meeting.txt                        # from file
  tix parse meeting.txt --pretty               # pretty JSON
  tix parse --text "Fix login bug by Friday"   # inline text
  cat notes.md | tixparse                     # from stdin
  tix parse meeting.txt --push                 # parse + create in Linear
  tix parse meeting.txt --push --target github # parse + create in GitHub
  tix parse meeting.txt --human                # colored human output

Output (JSON to stdout):
  {
    "tickets": [
      { "title": "...", "description": "...", "priority": 1, "labels": ["bug"] }
    ],
    "count": 3,
    "source": "meeting.txt",
    "target": "linear",
    "project": "my-project"
  }

With --push, adds "created" array:
  { ..., "created": [{ "id": "ENG-42", "title": "...", "url": "..." }] }

Notes:
  - If a project is active, its context (description, stack, philosophy)
    and existing GitHub issues are injected for smarter ticket generation.
  - Priority: 1=Urgent, 2=High, 3=Medium, 4=Low`)
  .action(async (file, opts) => {
    const transcript = opts.text ? opts.text.trim() : readInput(file).trim();
    if (!transcript) error('Empty transcript. Provide a file, stdin, or --text.');

    const proj = getActiveProject();
    if (proj) console.error(`Using project: ${proj.name}`);

    console.error('Analyzing...');
    const { tickets, stats } = parseTranscript(transcript, proj);
    const source = opts.text ? 'text' : (file || 'stdin');
    addEntry(tickets, source);
    console.error(`Done in ${(stats.duration_ms / 1000).toFixed(1)}s · ${stats.input_tokens + stats.output_tokens} tokens · $${stats.cost_usd.toFixed(4)}`);

    // Dedup check before push
    let ticketsToCreate = tickets;
    let dupResult = { unique: tickets, duplicates: [] };
    if (opts.push && !opts.skipDedup) {
      console.error('Checking for duplicates...');
      const existing = await fetchExistingIssues(opts.target, proj);
      if (existing.length > 0) {
        dupResult = checkDuplicates(tickets, existing);
        ticketsToCreate = dupResult.unique;
        if (dupResult.duplicates.length > 0) {
          console.error(chalk.yellow(`  ${dupResult.duplicates.length} duplicate(s) found — skipping:`));
          for (const d of dupResult.duplicates) {
            console.error(chalk.yellow(`    "${d.ticket.title}" ≈ ${d.matchedIssue.id || ''} "${d.matchedIssue.title}"`));
          }
        }
      }
    }

    if (opts.human) {
      printTicketsHuman(tickets);
      if (dupResult.duplicates.length > 0) {
        console.error(chalk.yellow(`\n${dupResult.duplicates.length} ticket(s) skipped as duplicates.`));
      }
      if (opts.push && ticketsToCreate.length > 0) {
        await confirm(`Create ${ticketsToCreate.length} issue(s) in ${opts.target}?`);
        await pushTicketsHuman(ticketsToCreate, opts.target, proj);
      } else if (!opts.push) {
        console.error('Use --push to create issues.');
      }
      return;
    }

    const result = { tickets, count: tickets.length, source, target: opts.target, stats };
    if (proj) result.project = proj.name;
    if (dupResult.duplicates.length > 0) {
      result.duplicates = dupResult.duplicates.map(d => ({
        ticket: d.ticket.title,
        matchedIssue: d.matchedIssue,
      }));
    }

    if (opts.push) {
      const created = [];
      for (const t of ticketsToCreate) {
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
  .description('Create issues in Linear or GitHub from JSON input or flags.')
  .option('--title <title>', 'Ticket title (for single-ticket creation without JSON)')
  .option('--description <desc>', 'Ticket description')
  .option('--priority <n>', 'Priority 1-4 (1=Urgent, 2=High, 3=Medium, 4=Low)', parseInt)
  .option('--labels <labels>', 'Comma-separated labels (e.g. "bug,frontend")')
  .option('--target <target>', 'Target platform: linear or github (default: linear)', 'linear')
  .option('--skip-dedup', 'Skip duplicate issue checking')
  .option('--pretty', 'Pretty-print JSON output')
  .addHelpText('after', `
Input: JSON via stdin, file, or --title flag. Accepts:
  - JSON array of tickets: [{"title":"...","priority":1}, ...]
  - JSON object with tickets key: {"tickets":[...]}
  - Single ticket object: {"title":"...","priority":1}
  - Flags: --title "..." --priority 2 --labels "bug"

Examples:
  tix parse notes.txt | jq '.tickets' | tixcreate        # pipe from parse
  tix create tickets.json                                    # from JSON file
  tix create --title "Fix bug" --priority 2 --labels "bug"   # from flags
  tix create --target github                                 # target GitHub
  echo '[{"title":"A"},{"title":"B"}]' | tixcreate          # batch create

Output (JSON to stdout):
  {
    "created": [
      { "id": "ENG-42", "title": "Fix bug", "url": "https://..." }
    ],
    "count": 1
  }`)
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

    let toCreate = ticketList;
    const result = { created: [], count: 0 };

    if (!opts.skipDedup) {
      console.error('Checking for duplicates...');
      const existing = await fetchExistingIssues(opts.target, proj);
      if (existing.length > 0) {
        const { unique, duplicates } = checkDuplicates(ticketList, existing);
        toCreate = unique;
        if (duplicates.length > 0) {
          console.error(chalk.yellow(`  ${duplicates.length} duplicate(s) found — skipping:`));
          for (const d of duplicates) {
            console.error(chalk.yellow(`    "${d.ticket.title}" ≈ ${d.matchedIssue.id || ''} "${d.matchedIssue.title}"`));
          }
          result.duplicates = duplicates.map(d => ({
            ticket: d.ticket.title,
            matchedIssue: d.matchedIssue,
          }));
        }
      }
    }

    for (const t of toCreate) {
      const issue = await createIssue(t, opts.target, proj);
      result.created.push(issue);
      console.error(`Created ${issue.id}: ${issue.title}`);
    }
    result.count = result.created.length;

    output(result, opts.pretty);
  });

// ── history ────────────────────────────────────────────────────────────

const history = program.command('history').description('View and manage parsing history.\n\nHistory is stored at ~/.tix/history.json.\nEach entry records timestamp, source, and parsed tickets.');

history
  .command('list')
  .description('List recent parsing history entries.')
  .option('--limit <n>', 'Max entries to return (default: 20)', parseInt, 20)
  .option('--pretty', 'Pretty-print JSON output')
  .addHelpText('after', `
Examples:
  tix history list                # list recent entries
  tix history list --limit 5     # last 5 entries
  tix history list --pretty      # pretty JSON

Output:
  {
    "entries": [
      { "index": 0, "timestamp": "...", "source": "meeting.txt",
        "ticket_count": 5, "created_count": 3 }
    ],
    "total": 10
  }`)
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
  .description('Get full details of a history entry by index.')
  .option('--pretty', 'Pretty-print JSON output')
  .addHelpText('after', `
Examples:
  tix history get 0              # most recent entry
  tix history get 2 --pretty     # entry at index 2

Output: Full entry with timestamp, source, and all ticket data.`)
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

const project = program.command('project').description('Manage projects with per-project output targets and context.\n\nEach project stores: output targets (github_repo, linear_team_id) and\ncontext (description, stack, status, philosophy) used during parsing.\nWhen active, context is injected into Claude prompt for smarter tickets.\nStored at ~/.tix/projects/.');

project
  .command('create <name>')
  .description('Create a new project with output targets and context.')
  .option('--github-repo <repo>', 'GitHub repo in owner/repo format')
  .option('--linear-team-id <id>', 'Linear team UUID')
  .option('--description <desc>', 'What this project does')
  .option('--stack <stack>', 'Tech stack (e.g. "Node.js, React, PostgreSQL")')
  .option('--status <status>', 'Current project status (e.g. "MVP done, working on v2")')
  .option('--philosophy <text>', 'Project principles (e.g. "Keep it simple, no over-engineering")')
  .option('--pretty', 'Pretty-print JSON output')
  .addHelpText('after', `
Examples:
  tix project create my-app                                     # auto-detect repo/team
  tix project create my-app --github-repo owner/repo
  tix project create my-app --description "E-commerce platform" \\
    --stack "Next.js, Prisma, PostgreSQL" \\
    --status "Beta launch next month" \\
    --philosophy "Ship fast, fix later"

Output: { "name": "my-app", "github_repo": "...", "description": "...", ... }

Notes:
  - GitHub repo auto-detected from git remote if not specified
  - Linear team auto-detected from LINEAR_TEAM_ID env var`)
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
    if (opts.description) config.description = opts.description;
    if (opts.stack) config.stack = opts.stack;
    if (opts.status) config.status = opts.status;
    if (opts.philosophy) config.philosophy = opts.philosophy;
    output(createProject(name, config), opts.pretty);
  });

project
  .command('update <name>')
  .description('Update an existing project\'s targets or context.')
  .option('--github-repo <repo>', 'GitHub repo in owner/repo format')
  .option('--linear-team-id <id>', 'Linear team UUID')
  .option('--description <desc>', 'What this project does')
  .option('--stack <stack>', 'Tech stack')
  .option('--status <status>', 'Current project status')
  .option('--philosophy <text>', 'Project principles')
  .option('--pretty', 'Pretty-print JSON output')
  .addHelpText('after', `
Examples:
  tix project update my-app --status "Launched, collecting feedback"
  tix project update my-app --philosophy "User experience over features"
  tix project update my-app --github-repo new-owner/new-repo`)
  .action((name, opts) => {
    const existing = getProject(name);
    if (!existing) error(`Project '${name}' not found.`);
    const { name: _, active: __, ...config } = existing;
    if (opts.githubRepo) config.github_repo = opts.githubRepo;
    if (opts.linearTeamId) config.linear_team_id = opts.linearTeamId;
    if (opts.description) config.description = opts.description;
    if (opts.stack) config.stack = opts.stack;
    if (opts.status) config.status = opts.status;
    if (opts.philosophy) config.philosophy = opts.philosophy;
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
    if (!name) error("No active project. Use 'tix project use <name>' or specify a name.");
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
