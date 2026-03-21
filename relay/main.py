from pathlib import Path
from fastapi import FastAPI
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel
from relay.parser import parse_transcript
from relay.linear import create_issue as linear_create, get_team_name
from relay.github import create_issue as github_create
from relay.history import add_entry, get_entries, update_entry
from relay.projects import list_projects, get_project, set_active_project, get_active_project_name

app = FastAPI(title="relay-cli")

STATIC_DIR = Path(__file__).resolve().parent / "static"

TARGETS = {"linear": linear_create, "github": github_create}


class ParseRequest(BaseModel):
    transcript: str


class CreateRequest(BaseModel):
    ticket: dict
    target: str = "linear"
    project: str | None = None


@app.get("/", response_class=HTMLResponse)
async def index():
    return (STATIC_DIR / "index.html").read_text(encoding="utf-8")


@app.post("/api/parse")
async def api_parse(req: ParseRequest):
    try:
        tickets = parse_transcript(req.transcript)
        add_entry(tickets, source="dashboard")
        return {"tickets": tickets}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/api/history")
async def api_history():
    return {"entries": get_entries()}


class UpdateHistoryRequest(BaseModel):
    index: int
    tickets: list[dict]


@app.post("/api/history/update")
async def api_history_update(req: UpdateHistoryRequest):
    try:
        update_entry(req.index, req.tickets)
        return {"ok": True}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/api/create")
async def api_create(req: CreateRequest):
    try:
        fn = TARGETS.get(req.target)
        if not fn:
            return JSONResponse(status_code=400, content={"error": f"Unknown target: {req.target}"})

        kwargs = {}
        if req.project:
            proj = get_project(req.project)
            if proj:
                if req.target == "github":
                    kwargs["repo"] = proj.get("github_repo")
                elif req.target == "linear":
                    kwargs["team_id"] = proj.get("linear_team_id")

        result = fn(req.ticket, **kwargs)
        return result
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/api/projects")
async def api_projects():
    projects = list_projects()
    for p in projects:
        if p.get("linear_team_id"):
            name = get_team_name(p["linear_team_id"])
            if name:
                p["linear_team_name"] = name
    return {
        "projects": projects,
        "active": get_active_project_name(),
    }


@app.post("/api/projects/use")
async def api_projects_use(req: dict):
    try:
        name = req.get("name")
        set_active_project(name)
        return {"ok": True, "active": name}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
