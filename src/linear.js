import { execFileSync } from 'child_process';
import { LINEAR_API_KEY, LINEAR_TEAM_ID } from './config.js';

const GRAPHQL_ENDPOINT = 'https://api.linear.app/graphql';

const CREATE_ISSUE_MUTATION = `
mutation CreateIssue($input: IssueCreateInput!) {
  issueCreate(input: $input) {
    success
    issue {
      id
      identifier
      title
      url
    }
  }
}
`;

function hasLinCli() {
  try {
    execFileSync('which', ['lin'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

async function gql(query, variables = {}) {
  const resp = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': LINEAR_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!resp.ok) throw new Error(`Linear API HTTP ${resp.status}`);
  const data = await resp.json();
  if (data.errors) throw new Error(`Linear API error: ${JSON.stringify(data.errors)}`);
  return data;
}

export async function getTeams() {
  if (!LINEAR_API_KEY) return [];
  try {
    const data = await gql('{ teams { nodes { id name key } } }');
    return data.data.teams.nodes;
  } catch {
    return [];
  }
}

export async function getTeamName(teamId) {
  const teams = await getTeams();
  const team = teams.find(t => t.id === teamId);
  return team ? `${team.name} (${team.key})` : null;
}

function createIssueCli(ticket, teamKey) {
  const args = ['new', '--title', ticket.title];
  if (ticket.description) args.push('--description', ticket.description);
  if (teamKey) args.push('--team', teamKey);

  const result = execFileSync('lin', args, {
    encoding: 'utf8',
    timeout: 30_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // lin new outputs the issue URL
  const url = result.trim();
  // Extract identifier like JWK-42 from URL
  const match = url.match(/\/issue\/([A-Z]+-\d+)\//);
  const id = match ? match[1] : url.split('/').pop();

  return { id, title: ticket.title, url };
}

async function createIssueApi(ticket, teamId = null) {
  if (!LINEAR_API_KEY) throw new Error('LINEAR_API_KEY is not set. Check your .env file.');
  const team = teamId || LINEAR_TEAM_ID;
  if (!team) throw new Error('LINEAR_TEAM_ID is not set. Check your .env file.');

  const data = await gql(CREATE_ISSUE_MUTATION, {
    input: {
      teamId: team,
      title: ticket.title,
      description: ticket.description || '',
      priority: ticket.priority || 3,
    },
  });

  const issue = data.data.issueCreate.issue;
  return { id: issue.identifier, title: issue.title, url: issue.url };
}

export async function createIssue(ticket, teamId = null) {
  if (hasLinCli()) {
    // lin CLI uses team key (e.g. "JWK"), not UUID
    // If we have a UUID, try to resolve the key
    let teamKey = null;
    if (teamId) {
      const teams = await getTeams();
      const team = teams.find(t => t.id === teamId);
      if (team) teamKey = team.key;
    }
    return createIssueCli(ticket, teamKey);
  }
  return createIssueApi(ticket, teamId);
}
