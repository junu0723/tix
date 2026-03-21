import json
from pathlib import Path

PROJECTS_DIR = Path.home() / ".relay-cli" / "projects"
ACTIVE_FILE = Path.home() / ".relay-cli" / "active_project"


def _ensure_dir():
    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)


def _project_path(name: str) -> Path:
    return PROJECTS_DIR / f"{name}.json"


def create_project(name: str, config: dict) -> dict:
    _ensure_dir()
    path = _project_path(name)
    path.write_text(json.dumps(config, indent=2), encoding="utf-8")
    return {"name": name, "path": str(path), **config}


def get_project(name: str) -> dict | None:
    path = _project_path(name)
    if not path.exists():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    data["name"] = name
    return data


def list_projects() -> list[dict]:
    _ensure_dir()
    projects = []
    active = get_active_project_name()
    for f in sorted(PROJECTS_DIR.glob("*.json")):
        data = json.loads(f.read_text(encoding="utf-8"))
        data["name"] = f.stem
        data["active"] = f.stem == active
        projects.append(data)
    return projects


def delete_project(name: str) -> bool:
    path = _project_path(name)
    if path.exists():
        path.unlink()
        if get_active_project_name() == name:
            ACTIVE_FILE.unlink(missing_ok=True)
        return True
    return False


def set_active_project(name: str):
    if not _project_path(name).exists():
        raise RuntimeError(f"Project '{name}' does not exist.")
    ACTIVE_FILE.parent.mkdir(parents=True, exist_ok=True)
    ACTIVE_FILE.write_text(name, encoding="utf-8")


def get_active_project_name() -> str | None:
    if ACTIVE_FILE.exists():
        name = ACTIVE_FILE.read_text(encoding="utf-8").strip()
        if _project_path(name).exists():
            return name
    return None


def get_active_project() -> dict | None:
    name = get_active_project_name()
    if name:
        return get_project(name)
    return None
