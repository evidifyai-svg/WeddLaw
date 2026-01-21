#!/usr/bin/env bash
set -euo pipefail
export PYTHONPATH="$(pwd)"
uvicorn backend.app:app --host 127.0.0.1 --port 8000 --reload
