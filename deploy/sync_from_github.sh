#!/usr/bin/env bash
# Sync a deploy-target VPS to a GitHub branch, then restart the API if code changed.
#
# Unlike auto_pull.sh (which does `git pull --ff-only` on main), this uses
# `git reset --hard` so it also works for FLATTENED / ORPHAN snapshot branches
# (e.g. clean-snapshot) whose history has diverged from the local clone.
#
# WARNING: `reset --hard` DISCARDS any uncommitted local changes in the repo.
# Only run this on a pure deploy target, never on a machine where you edit code.
#
# Prerequisites:
#   - git remote 'origin' set with read access (deploy key / SSH key)
#   - systemd service 'kuasaprestij' manages uvicorn (see kuasaprestij.service)
#   - Run as the user who owns $REPO_DIR
#
# Usage:
#   ./sync_from_github.sh                 # tracks $BRANCH below
#   BRANCH=main ./sync_from_github.sh     # override branch at runtime

set -euo pipefail

REPO_DIR="${REPO_DIR:-/root/kuasaprestij}"
BRANCH="${BRANCH:-clean-snapshot}"
SERVICE_NAME="${SERVICE_NAME:-kuasaprestij}"
LOG_FILE="${LOG_FILE:-/var/log/kuasaprestij_deploy.log}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

cd "$REPO_DIR"

log "Fetching origin/$BRANCH ..."
git fetch origin "$BRANCH" --quiet

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH")

if [ "$LOCAL" = "$REMOTE" ]; then
    log "Already up to date ($LOCAL). No restart needed."
    exit 0
fi

log "Remote moved: $LOCAL -> $REMOTE. Hard-syncing to origin/$BRANCH ..."
git checkout -B "$BRANCH" "origin/$BRANCH" --quiet
git reset --hard "origin/$BRANCH" --quiet

# Activate venv and install any new deps
if [ -f venv/bin/activate ]; then
    # shellcheck disable=SC1091
    source venv/bin/activate
    pip install -q -r requirements.txt
fi

log "Restarting $SERVICE_NAME service..."
systemctl restart "$SERVICE_NAME" || log "WARN: could not restart $SERVICE_NAME (running without systemd?)"
log "Deploy complete. Now at: $(git rev-parse --short HEAD)"
