import requests
from relay.config import GITHUB_TOKEN, GITHUB_REPO

PRIORITY_LABELS = {1: "P1: urgent", 2: "P2: high", 3: "P3: medium", 4: "P4: low"}


def create_issue(ticket: dict) -> dict:
    if not GITHUB_TOKEN:
        raise RuntimeError("GITHUB_TOKEN is not set. Check your .env file.")
    if not GITHUB_REPO:
        raise RuntimeError("GITHUB_REPO is not set. Check your .env file. (format: owner/repo)")

    labels = list(ticket.get("labels", []))
    priority = ticket.get("priority", 3)
    priority_label = PRIORITY_LABELS.get(priority)
    if priority_label:
        labels.append(priority_label)

    resp = requests.post(
        f"https://api.github.com/repos/{GITHUB_REPO}/issues",
        json={
            "title": ticket["title"],
            "body": ticket.get("description", ""),
            "labels": labels,
        },
        headers={
            "Authorization": f"Bearer {GITHUB_TOKEN}",
            "Accept": "application/vnd.github+json",
        },
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()

    return {
        "id": f"#{data['number']}",
        "title": data["title"],
        "url": data["html_url"],
    }
