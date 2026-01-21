# Wedderburn Law Portal — Local-first + Offline AI (v0.2)

This package runs a local, encrypted client-intake portal with an offline AI assistant.
- Front-end: HTML/JS
- Backend: Python/FastAPI
- AI: Ollama (local) via HTTP API
- Storage: encrypted-at-rest intake submissions written to ./data

## Run (macOS / Linux)
```bash
cd wedderburn-portal-offlineai
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env, set APP_PASSPHRASE to a long random passphrase
chmod +x run.sh
./run.sh
```

Open: http://127.0.0.1:8000

## Ollama
You must have Ollama running locally with a model pulled. The portal calls:
- POST /api/chat (Ollama) https://docs.ollama.com/api/chat
- POST /api/generate (Ollama) https://docs.ollama.com/api/generate

Set OLLAMA_MODEL in .env to a model you have pulled.

## Security notes
- Do NOT expose this server to the public internet.
- Change APP_PASSPHRASE.
- Do not store private keys or seed phrases in intake fields.
- For production: add authentication, encrypted uploads, audit logs, and per-client keys.
