import { execFileSync } from 'child_process';

function gws(args) {
  const result = execFileSync('gws', args, {
    encoding: 'utf8',
    timeout: 30_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return JSON.parse(result);
}

export function hasGwsCli() {
  try {
    execFileSync('which', ['gws'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function fetchDoc(docId) {
  const data = gws(['documents', 'get', '--params', JSON.stringify({ documentId: docId })]);

  // Extract text from doc body
  const content = data.body?.content || [];
  const text = content
    .flatMap(block => {
      if (block.paragraph) {
        return block.paragraph.elements
          .map(el => el.textRun?.content || '')
          .join('');
      }
      if (block.table) {
        return block.table.tableRows.map(row =>
          row.tableCells.map(cell =>
            cell.content?.map(c =>
              c.paragraph?.elements?.map(el => el.textRun?.content || '').join('') || ''
            ).join('') || ''
          ).join('\t')
        ).join('\n') + '\n';
      }
      return '';
    })
    .join('');

  return { title: data.title || '', text: text.trim() };
}

export function fetchSheet(spreadsheetId, range = 'Sheet1') {
  const data = gws([
    'spreadsheets', 'values', 'get',
    '--params', JSON.stringify({ spreadsheetId, range }),
  ]);

  const rows = data.values || [];
  if (rows.length === 0) return { title: '', text: '' };

  // Convert to readable table
  const text = rows.map(row => row.join('\t')).join('\n');
  return { title: range, text };
}

export function fetchMeetTranscripts() {
  // List recent conference records
  const data = gws([
    'conferenceRecords', 'list',
    '--params', JSON.stringify({ pageSize: 10 }),
  ]);

  return (data.conferenceRecords || []).map(conf => ({
    name: conf.name,
    startTime: conf.startTime,
    endTime: conf.endTime,
    space: conf.space,
  }));
}

export function fetchMeetTranscript(conferenceName) {
  // List transcripts for a conference
  const data = gws([
    'conferenceRecords', 'transcripts', 'list',
    '--params', JSON.stringify({ parent: conferenceName }),
  ]);

  const transcripts = data.transcripts || [];
  if (transcripts.length === 0) return null;

  // Get transcript entries
  const transcript = transcripts[0];
  const entries = gws([
    'conferenceRecords', 'transcripts', 'entries', 'list',
    '--params', JSON.stringify({ parent: transcript.name }),
    '--page-all',
  ]);

  const entryList = entries.transcriptEntries || [];
  const text = entryList
    .map(e => `${e.participant?.displayName || 'Unknown'}: ${e.text || ''}`)
    .join('\n');

  return { name: transcript.name, text };
}
