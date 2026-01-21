from __future__ import annotations

import os
import json
from typing import Any, Dict, List, Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .security import Encryptor
from .storage import IntakeStore
from .prompts import system_prompt_for_mode, profile_prompt

load_dotenv()

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1:8b")
APP_PASSPHRASE = os.getenv("APP_PASSPHRASE", "CHANGE_ME_IN_.ENV")
DATA_DIR = os.getenv("DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "data"))

encryptor = Encryptor.from_passphrase(APP_PASSPHRASE)
store = IntakeStore(DATA_DIR, encryptor)

app = FastAPI(title="Wedderburn Law Portal (Local-first)", version="0.2.0")

STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "static")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
def root():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


@app.get("/api/health")
async def health():
    ollama_ok = False
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.post(f"{OLLAMA_URL}/api/generate", json={
                "model": OLLAMA_MODEL,
                "prompt": "ping",
                "stream": False
            })
            if r.status_code == 200:
                ollama_ok = True
    except Exception:
        ollama_ok = False

    return {"ok": True, "ollama_ok": ollama_ok, "model": OLLAMA_MODEL, "ollama_url": OLLAMA_URL}


class ChatMessage(BaseModel):
    role: str = Field(..., pattern="^(user|assistant|system)$")
    content: str


class ChatRequest(BaseModel):
    mode: str = Field("client", pattern="^(client|attorney)$")
    messages: List[ChatMessage]
    intake_context: Optional[Dict[str, Any]] = None


class ChatResponse(BaseModel):
    reply: str


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    sys = system_prompt_for_mode(req.mode)
    msgs: List[Dict[str, str]] = [{"role": "system", "content": sys}]

    if req.intake_context:
        ctx = json.dumps(req.intake_context, ensure_ascii=False)[:12000]
        msgs.append({
            "role": "system",
            "content": (
                "Context (client intake JSON). Use to answer questions and request missing info. "
                "Do NOT ask for passwords, seed phrases, or private keys.\n\n"
                f"{ctx}"
            )
        })

    for m in req.messages[-20:]:
        msgs.append({"role": m.role, "content": m.content})

    payload = {"model": OLLAMA_MODEL, "messages": msgs, "stream": False}

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            r = await client.post(f"{OLLAMA_URL}/api/chat", json=payload)
            if r.status_code != 200:
                raise HTTPException(status_code=502, detail=f"Ollama error: {r.status_code} {r.text[:300]}")
            data = r.json()
            content = (data.get("message") or {}).get("content") or ""
            return ChatResponse(reply=content.strip() or "(no reply)")
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Ollama not reachable. Start Ollama and ensure it is listening on OLLAMA_URL.")
    except httpx.ReadTimeout:
        raise HTTPException(status_code=504, detail="Ollama timed out. Try a smaller model or increase resources.")


class IntakeSubmitRequest(BaseModel):
    intake: Dict[str, Any]


class IntakeSubmitResponse(BaseModel):
    id: str


@app.post("/api/intake/submit", response_model=IntakeSubmitResponse)
def intake_submit(req: IntakeSubmitRequest):
    intake_id = store.save(req.intake)
    return IntakeSubmitResponse(id=intake_id)


@app.get("/api/intake/list")
def intake_list():
    return {"items": list(store.list_items())}


@app.get("/api/intake/get/{intake_id}")
def intake_get(intake_id: str):
    try:
        intake = store.load(intake_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Not found")
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to decrypt or parse intake record")
    return {"id": intake_id, "intake": intake}


class ProfileRequest(BaseModel):
    intake: Dict[str, Any]


class ProfileResponse(BaseModel):
    profile: str


@app.post("/api/profile", response_model=ProfileResponse)
async def profile(req: ProfileRequest):
    sys = system_prompt_for_mode("attorney")
    prompt = profile_prompt(req.intake)
    payload = {
        "model": OLLAMA_MODEL,
        "messages": [{"role": "system", "content": sys}, {"role": "user", "content": prompt}],
        "stream": False
    }
    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            r = await client.post(f"{OLLAMA_URL}/api/chat", json=payload)
            if r.status_code != 200:
                raise HTTPException(status_code=502, detail=f"Ollama error: {r.status_code} {r.text[:300]}")
            data = r.json()
            content = (data.get("message") or {}).get("content") or ""
            return ProfileResponse(profile=content.strip() or "(no profile)")
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Ollama not reachable. Start Ollama and ensure it is listening on OLLAMA_URL.")
