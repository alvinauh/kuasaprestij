#!/usr/bin/env bash
# Auto-pull frontend from origin/main; restart the dev server if code changed.
# Mirrors deploy/auto_pull.sh (backend) — same pattern.
# Run by: kuasaprestij-frontend-pull.timer every 5 minutes.

set -euo pipefail

FRONTEND_DIR="/root/frontend/learn-play-shine-96"
SERVICE_NAME="kuasaprestij-frontend"
LOG_FILE="/var/log/kuasaprestij_frontend_deploy.log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

cd "$FRONTEND_DIR"

log "Fetching origin..."
git fetch origin main --quiet

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
    log "Already up to date ($LOCAL). No restart needed."
    exit 0
fi

log "New commits: $LOCAL → $REMOTE"
git pull origin main --ff-only

log "Installing any new dependencies..."
npm install --legacy-peer-deps --quiet

log "Restarting $SERVICE_NAME..."
systemctl restart "$SERVICE_NAME"
log "Frontend deploy complete. Running: $(git rev-parse --short HEAD)"
