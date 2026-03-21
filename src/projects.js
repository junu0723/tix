import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const PROJECTS_DIR = join(homedir(), '.relay-cli', 'projects');
const ACTIVE_FILE = join(homedir(), '.relay-cli', 'active_project');

function ensureDir() {
  mkdirSync(PROJECTS_DIR, { recursive: true });
}

function projectPath(name) {
  return join(PROJECTS_DIR, `${name}.json`);
}

export function createProject(name, config) {
  ensureDir();
  const p = projectPath(name);
  writeFileSync(p, JSON.stringify(config, null, 2), 'utf8');
  return { name, path: p, ...config };
}

export function getProject(name) {
  const p = projectPath(name);
  if (!existsSync(p)) return null;
  const data = JSON.parse(readFileSync(p, 'utf8'));
  data.name = name;
  return data;
}

export function listProjects() {
  ensureDir();
  const active = getActiveProjectName();
  return readdirSync(PROJECTS_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .map(f => {
      const name = f.replace('.json', '');
      const data = JSON.parse(readFileSync(join(PROJECTS_DIR, f), 'utf8'));
      data.name = name;
      data.active = name === active;
      return data;
    });
}

export function deleteProject(name) {
  const p = projectPath(name);
  if (!existsSync(p)) return false;
  unlinkSync(p);
  if (getActiveProjectName() === name && existsSync(ACTIVE_FILE)) {
    unlinkSync(ACTIVE_FILE);
  }
  return true;
}

export function setActiveProject(name) {
  if (!existsSync(projectPath(name))) {
    throw new Error(`Project '${name}' does not exist.`);
  }
  mkdirSync(join(homedir(), '.relay-cli'), { recursive: true });
  writeFileSync(ACTIVE_FILE, name, 'utf8');
}

export function getActiveProjectName() {
  if (!existsSync(ACTIVE_FILE)) return null;
  const name = readFileSync(ACTIVE_FILE, 'utf8').trim();
  if (existsSync(projectPath(name))) return name;
  return null;
}

export function getActiveProject() {
  const name = getActiveProjectName();
  return name ? getProject(name) : null;
}
