from pathlib import Path
from fastapi import FastAPI
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel
from relay.parser import parse_transcript
from relay.linear import create_issue

app = FastAPI(title="relay-cli")

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


class ParseRequest(BaseModel):
    transcript: str


class CreateRequest(BaseModel):
    ticket: dict


@app.get("/", response_class=HTMLResponse)
async def index():
    return (STATIC_DIR / "index.html").read_text(encoding="utf-8")


@app.post("/api/parse")
async def api_parse(req: ParseRequest):
    try:
        tickets = parse_transcript(req.transcript)
        return {"tickets": tickets}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/api/create")
async def api_create(req: CreateRequest):
    try:
        result = create_issue(req.ticket)
        return result
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
