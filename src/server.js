import express from 'express';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseTranscript } from './parser.js';
import { createIssue as linearCreate, getTeamName } from './linear.js';
import { createIssue as githubCreate } from './github.js';
import { addEntry, getEntries, updateEntry, deleteEntry } from './history.js';
import { listProjects, getProject, setActiveProject, getActiveProjectName, createProject as saveProject } from './projects.js';
import { fetchDoc, fetchSheet, hasGwsCli } from './google.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = join(__dirname, '..', 'static');

const TARGETS = { linear: linearCreate, github: githubCreate };

export function startServer(host = '127.0.0.1', port = 8000) {
  const app = express();
  app.use(express.json());

  app.get('/', (req, res) => {
    res.type('html').send(readFileSync(join(STATIC_DIR, 'index.html'), 'utf8'));
  });

  app.post('/api/parse', async (req, res) => {
    try {
      const { transcript, project: projectName } = req.body;
      let proj = null;
      if (projectName) proj = getProject(projectName);
      else {
        const activeName = getActiveProjectName();
        if (activeName) proj = getProject(activeName);
      }
      const tickets = parseTranscript(transcript, proj);
      addEntry(tickets, 'dashboard');
      res.json({ tickets });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/history', (req, res) => {
    res.json({ entries: getEntries() });
  });

  app.post('/api/history/update', (req, res) => {
    try {
      updateEntry(req.body.index, req.body.tickets);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/history/delete', (req, res) => {
    try {
      deleteEntry(req.body.index);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/create', async (req, res) => {
    try {
      const { ticket, target = 'linear', project: projectName } = req.body;
      const fn = TARGETS[target];
      if (!fn) return res.status(400).json({ error: `Unknown target: ${target}` });

      const kwargs = {};
      if (projectName) {
        const proj = getProject(projectName);
        if (proj) {
          if (target === 'github') kwargs.repo = proj.github_repo;
          else if (target === 'linear') kwargs.teamId = proj.linear_team_id;
        }
      }

      const result = await fn(ticket, kwargs.repo || kwargs.teamId || undefined);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/fetch', (req, res) => {
    try {
      if (!hasGwsCli()) return res.status(400).json({ error: 'gws CLI not installed.' });

      const { type, id, range } = req.body;
      let text = '';
      let source = '';

      if (type === 'doc') {
        const doc = fetchDoc(id);
        text = doc.text;
        source = `gdoc:${id}`;
      } else if (type === 'sheet') {
        const sheet = fetchSheet(id, range || 'Sheet1');
        text = sheet.text;
        source = `gsheet:${id}`;
      } else {
        return res.status(400).json({ error: `Unknown type: ${type}` });
      }

      res.json({ text, source });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/projects', async (req, res) => {
    const projects = listProjects();
    for (const p of projects) {
      if (p.linear_team_id) {
        const name = await getTeamName(p.linear_team_id);
        if (name) p.linear_team_name = name;
      }
    }
    res.json({ projects, active: getActiveProjectName() });
  });

  app.post('/api/projects/update', (req, res) => {
    try {
      const { name, ...config } = req.body;
      if (!name) return res.status(400).json({ error: 'name is required' });
      const result = saveProject(name, config);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/projects/use', (req, res) => {
    try {
      setActiveProject(req.body.name);
      res.json({ ok: true, active: req.body.name });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.listen(port, host, () => {
    console.error(`Starting dashboard at http://${host}:${port}`);
  });
}
