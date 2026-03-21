import requests
from relay.config import LINEAR_API_KEY, LINEAR_TEAM_ID

GRAPHQL_ENDPOINT = "https://api.linear.app/graphql"

CREATE_ISSUE_MUTATION = """
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
"""


def create_issue(ticket: dict, team_id: str = None) -> dict:
    if not LINEAR_API_KEY:
        raise RuntimeError("LINEAR_API_KEY is not set. Check your .env file.")
    team = team_id or LINEAR_TEAM_ID
    if not team:
        raise RuntimeError("LINEAR_TEAM_ID is not set. Check your .env file.")

    variables = {
        "input": {
            "teamId": team,
            "title": ticket["title"],
            "description": ticket.get("description", ""),
            "priority": ticket.get("priority", 3),
        }
    }

    resp = requests.post(
        GRAPHQL_ENDPOINT,
        json={"query": CREATE_ISSUE_MUTATION, "variables": variables},
        headers={
            "Authorization": LINEAR_API_KEY,
            "Content-Type": "application/json",
        },
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()

    if "errors" in data:
        raise RuntimeError(f"Linear API error: {data['errors']}")

    issue = data["data"]["issueCreate"]["issue"]
    return {
        "id": issue["identifier"],
        "title": issue["title"],
        "url": issue["url"],
    }
