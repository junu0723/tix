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

function getSheetNames(spreadsheetId) {
  try {
    const data = gws([
      'sheets', 'spreadsheets', 'get',
      '--params', JSON.stringify({ spreadsheetId, fields: 'sheets.properties.title' }),
    ]);
    return (data.sheets || []).map(s => s.properties.title);
  } catch {
    return [];
  }
}

export function fetchDoc(docId) {
  const data = gws(['docs', 'documents', 'get', '--params', JSON.stringify({ documentId: docId })]);

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

export function fetchSheet(spreadsheetId, range = null) {
  // If no range specified, use first sheet name
  if (!range) {
    const names = getSheetNames(spreadsheetId);
    range = names.length > 0 ? names[0] : 'Sheet1';
  }

  const data = gws([
    'sheets', 'spreadsheets', 'values', 'get',
    '--params', JSON.stringify({ spreadsheetId, range }),
  ]);

  const rows = data.values || [];
  if (rows.length === 0) return { title: range, text: '' };

  const text = rows.map(row => row.join('\t')).join('\n');
  return { title: range, text };
}

export function fetchMeetTranscripts() {
  const data = gws([
    'meet', 'conferenceRecords', 'list',
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
  const data = gws([
    'meet', 'conferenceRecords', 'transcripts', 'list',
    '--params', JSON.stringify({ parent: conferenceName }),
  ]);

  const transcripts = data.transcripts || [];
  if (transcripts.length === 0) return null;

  const transcript = transcripts[0];
  const entries = gws([
    'meet', 'conferenceRecords', 'transcripts', 'entries', 'list',
    '--params', JSON.stringify({ parent: transcript.name }),
    '--page-all',
  ]);

  const entryList = entries.transcriptEntries || [];
  const text = entryList
    .map(e => `${e.participant?.displayName || 'Unknown'}: ${e.text || ''}`)
    .join('\n');

  return { name: transcript.name, text };
}
