#!/usr/bin/env bash
# Run the Skor SLM as a local llama-server for the desktop app / lab PCs (frontend/src/lib/slm/runtime.ts).
#   slm/serve.sh [model.gguf] [port]
# The app probes http://127.0.0.1:${PORT}/health (override with VITE_SLM_URL at build time).
# Windows: same flags with llama-server.exe from a llama.cpp release.
set -euo pipefail
MODEL="${1:-$HOME/skor_slm/skor_offline_slm/skor_offline_slm.Q4_K_M.gguf}"
PORT="${2:-8088}"
LLAMA="${LLAMA_CPP:-$HOME/llama.cpp}/build/bin/llama-server"
# 4 threads keeps a lab PC responsive (the phone app uses 2-4 too); 2048 tokens fits card + essay.
exec "$LLAMA" -m "$MODEL" --host 127.0.0.1 --port "$PORT" -t 4 -c 2048 --jinja
