import json
from datetime import datetime, timezone
from pathlib import Path

HISTORY_FILE = Path.home() / ".relay-cli" / "history.json"


def _load() -> list[dict]:
    if not HISTORY_FILE.exists():
        return []
    return json.loads(HISTORY_FILE.read_text(encoding="utf-8"))


def _save(entries: list[dict]):
    HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    HISTORY_FILE.write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8")


def add_entry(tickets: list[dict], source: str = ""):
    entries = _load()
    entries.insert(0, {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": source,
        "tickets": tickets,
    })
    _save(entries)


def get_entries() -> list[dict]:
    return _load()
