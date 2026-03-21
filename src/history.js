import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

export const HISTORY_FILE = join(homedir(), '.tix', 'history.json');

function load() {
  if (!existsSync(HISTORY_FILE)) return [];
  return JSON.parse(readFileSync(HISTORY_FILE, 'utf8'));
}

function save(entries) {
  mkdirSync(dirname(HISTORY_FILE), { recursive: true });
  writeFileSync(HISTORY_FILE, JSON.stringify(entries, null, 2), 'utf8');
}

export function addEntry(tickets, source = '') {
  const entries = load();
  entries.unshift({
    timestamp: new Date().toISOString(),
    source,
    tickets,
  });
  save(entries);
}

export function updateEntry(index, tickets) {
  const entries = load();
  if (index >= 0 && index < entries.length) {
    entries[index].tickets = tickets;
    save(entries);
  }
}

export function getEntries() {
  return load();
}

export function deleteEntry(index) {
  const entries = load();
  if (index >= 0 && index < entries.length) {
    entries.splice(index, 1);
    save(entries);
    return true;
  }
  return false;
}

export function clearHistory() {
  if (existsSync(HISTORY_FILE)) unlinkSync(HISTORY_FILE);
}
