#!/usr/bin/env bash
# Start the API server and capture all stdout/stderr to a rolling log file.
# Logs rotate daily; last 7 days kept. Download logs/server_YYYY-MM-DD.log to analyze.

set -euo pipefail

LOG_DIR="$(dirname "$0")/logs"
mkdir -p "$LOG_DIR"

LOG_FILE="$LOG_DIR/server_$(date +%Y-%m-%d).log"

echo "[start.sh] Logging to $LOG_FILE"

# Tee to both terminal and file so you can watch live + replay later.
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload 2>&1 | tee -a "$LOG_FILE"
