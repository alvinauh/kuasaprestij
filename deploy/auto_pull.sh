#!/usr/bin/env bash
# Auto-pull latest code from origin/main, then restart the API if files changed.
# Designed to be run by: systemd timer, cron, or directly.
#
# Prerequisites:
#   - git remote 'origin' is set and SSH key / deploy key has read access
#   - systemd service 'kuasaprestij' manages uvicorn (see kuasaprestij.service)
#   - Run as the user who owns /root/kuasaprestij/

set -euo pipefail

REPO_DIR="/root/kuasaprestij"
SERVICE_NAME="kuasaprestij"
LOG_FILE="/var/log/kuasaprestij_deploy.log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

cd "$REPO_DIR"

log "Fetching origin..."
git fetch origin main --quiet

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
    log "Already up to date ($LOCAL). No restart needed."
    exit 0
fi

log "New commits found: $LOCAL → $REMOTE"
git pull origin main --ff-only

# Activate venv and install any new deps
if [ -f venv/bin/activate ]; then
    source venv/bin/activate
    pip install -q -r requirements.txt
fi

log "Restarting $SERVICE_NAME service..."
systemctl restart "$SERVICE_NAME"
log "Deploy complete. Running: $(git rev-parse --short HEAD)"
