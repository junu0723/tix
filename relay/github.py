import json
import shutil
import subprocess
import requests
from relay.config import GITHUB_TOKEN, GITHUB_REPO

PRIORITY_LABELS = {1: "P1: urgent", 2: "P2: high", 3: "P3: medium", 4: "P4: low"}


def _has_gh_cli():
    return shutil.which("gh") is not None


def _detect_repo():
    """Detect repo from git remote if GITHUB_REPO is not set."""
    if GITHUB_REPO:
        return GITHUB_REPO
    try:
        result = subprocess.run(
            ["gh", "repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except Exception:
        pass
    return None


def _build_labels(ticket):
    labels = list(ticket.get("labels", []))
    priority_label = PRIORITY_LABELS.get(ticket.get("priority", 3))
    if priority_label:
        labels.append(priority_label)
    return labels


def create_issue_cli(ticket: dict, repo: str = None) -> dict:
    """Create a GitHub issue using the `gh` CLI."""
    repo = repo or _detect_repo()
    if not repo:
        raise RuntimeError("No GitHub repo found. Set GITHUB_REPO, pass --github-repo, or run inside a git repo with a GitHub remote.")

    cmd = [
        "gh", "issue", "create",
        "--repo", repo,
        "--title", ticket["title"],
        "--body", ticket.get("description", ""),
    ]
    for label in _build_labels(ticket):
        cmd.extend(["--label", label])

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

    if result.returncode != 0:
        raise RuntimeError(f"gh CLI error: {result.stderr.strip()}")

    url = result.stdout.strip()
    number = url.rstrip("/").split("/")[-1]

    return {
        "id": f"#{number}",
        "title": ticket["title"],
        "url": url,
    }


def create_issue_api(ticket: dict, repo: str = None) -> dict:
    """Create a GitHub issue using the REST API."""
    repo = repo or GITHUB_REPO
    if not GITHUB_TOKEN:
        raise RuntimeError("GITHUB_TOKEN is not set. Check your .env file.")
    if not repo:
        raise RuntimeError("GITHUB_REPO is not set. Check your .env file. (format: owner/repo)")

    resp = requests.post(
        f"https://api.github.com/repos/{repo}/issues",
        json={
            "title": ticket["title"],
            "body": ticket.get("description", ""),
            "labels": _build_labels(ticket),
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


def create_issue(ticket: dict, repo: str = None) -> dict:
    """Create a GitHub issue. Uses gh CLI if available, falls back to API."""
    if _has_gh_cli():
        return create_issue_cli(ticket, repo)
    return create_issue_api(ticket, repo)
