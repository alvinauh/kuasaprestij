#!/usr/bin/env bash
# sync_and_deploy.sh — One-command deploy pipeline for KuasaPrestij.
#
# What it does:
#   1. Rsync /root/kuasaprestij  → monorepo/backend/
#   2. Rsync /root/frontend/...  → monorepo/frontend/   (skip with --skip-frontend)
#   3. Commit + push monorepo to origin/main             (GitHub history)
#   4. Refresh cloudrun-deploy orphan branch             (triggers backend Cloud Build CI/CD)
#   5. Refresh cloudrun-frontend-deploy orphan branch    (triggers frontend Cloud Build CI/CD)
#      Skip steps 4+5 with --skip-gcp
#
# No local gcloud auth required — all GCP deploys are triggered by git push to
# the orphan branches; Cloud Build handles the actual deploy using its own SA.
#
# Usage:
#   ./deploy/sync_and_deploy.sh
#   ./deploy/sync_and_deploy.sh --skip-frontend
#   ./deploy/sync_and_deploy.sh --skip-gcp
#   ./deploy/sync_and_deploy.sh --message "feat: my change"
#
set -euo pipefail

BACKEND_SRC="/root/kuasaprestij"
FRONTEND_SRC="/root/frontend/learn-play-shine-96"
MONOREPO="/root/kuasaprestij-monorepo"
SCRATCH="/tmp/cloudrun-deploy-scratch"
FRONTEND_SCRATCH="/tmp/cloudrun-frontend-deploy-scratch"

SKIP_FRONTEND=false
SKIP_GCP=false
MSG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-frontend) SKIP_FRONTEND=true ;;
    --skip-gcp)      SKIP_GCP=true ;;
    --message)       MSG="$2"; shift ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
  shift
done

if [[ -z "$MSG" ]]; then
  MSG="deploy: sync $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
fi

# Common rsync excludes for the backend tree
BACKEND_EXCLUDES=(
  --exclude='.git/'
  --exclude='data/'
  --exclude='__pycache__/'
  --exclude='*.pyc'
  --exclude='venv/'
  --exclude='.venv/'
  --exclude='*.pdf'
  --exclude='*.png'
  --exclude='*.jpg'
  --exclude='*.jpeg'
  --exclude='*.deb'
  --exclude='models/'
  --exclude='google-credentials.json'
  --exclude='.env'
  --exclude='.env.*'
  --exclude='graphify-out/'
  --exclude='GIT_HISTORY_ARCHIVE.txt'
  --exclude='.claude/settings.local.json'
  --exclude='node_modules/'
  --exclude='answer-flappy*.png'
  --exclude='catch*.png'
  --exclude='*.log'
  --exclude='logs/'
)

FRONTEND_EXCLUDES=(
  --exclude='.git/'
  --exclude='node_modules/'
  --exclude='dist/'
  --exclude='dist-ssr/'
  --exclude='.output/'
  --exclude='.nitro/'
  --exclude='.tanstack/'
  --exclude='.env'
  --exclude='.env.*'
  --exclude='*.log'
)

# ── Step 1: Sync backend → monorepo/backend/ ──────────────────────────────────
echo "==> [1/4] Syncing backend to monorepo..."
rsync -av --delete "${BACKEND_EXCLUDES[@]}" \
  "$BACKEND_SRC/" "$MONOREPO/backend/"

# ── Step 2: Sync frontend → monorepo/frontend/ ────────────────────────────────
if [[ "$SKIP_FRONTEND" == false ]]; then
  echo "==> [2/4] Syncing frontend to monorepo..."
  rsync -av --delete "${FRONTEND_EXCLUDES[@]}" \
    "$FRONTEND_SRC/" "$MONOREPO/frontend/"
else
  echo "==> [2/4] Skipping frontend sync."
fi

# ── Step 3: Commit + push monorepo to origin/main ─────────────────────────────
echo "==> [3/4] Committing monorepo and pushing to origin/main..."
cd "$MONOREPO"
git add -A
if git diff --cached --quiet; then
  echo "    No changes in monorepo — nothing to commit."
else
  git commit -m "$MSG"
  git push origin main
  echo "    Pushed to origin/main."
fi

# ── Step 4: Refresh cloudrun-deploy orphan branch ─────────────────────────────
if [[ "$SKIP_GCP" == true ]]; then
  echo "==> [4/5] Skipping GCP cloud run deploys."
  echo "Done. Monorepo pushed; Cloud Run NOT updated."
  exit 0
fi

# ── Step 4: Refresh cloudrun-deploy (backend) ─────────────────────────────────
echo "==> [4/5] Refreshing cloudrun-deploy branch (backend CI/CD)..."

rm -rf "$SCRATCH"
mkdir -p "$SCRATCH"

rsync -a "${BACKEND_EXCLUDES[@]}" \
  "$MONOREPO/backend/" "$SCRATCH/"

cd "$SCRATCH"
git init -q
git remote add origin "$(cd "$MONOREPO" && git remote get-url origin)"
git add -A
git commit -q -m "$MSG"
git push --force origin HEAD:cloudrun-deploy

cd /
rm -rf "$SCRATCH"
echo "    Backend push done → Cloud Build will deploy kuasaprestij-api."

# ── Step 5: Refresh cloudrun-frontend-deploy (frontend) ───────────────────────
if [[ "$SKIP_FRONTEND" == true ]]; then
  echo "==> [5/5] Skipping frontend GCP push (--skip-frontend)."
else
  echo "==> [5/5] Refreshing cloudrun-frontend-deploy branch (frontend CI/CD)..."

  rm -rf "$FRONTEND_SCRATCH"
  mkdir -p "$FRONTEND_SCRATCH"

  rsync -a "${FRONTEND_EXCLUDES[@]}" \
    "$MONOREPO/frontend/" "$FRONTEND_SCRATCH/"

  # Include the frontend cloudbuild config at the repo root
  cp "$MONOREPO/cloudbuild-frontend.yaml" "$FRONTEND_SCRATCH/cloudbuild-frontend.yaml"

  cd "$FRONTEND_SCRATCH"
  git init -q
  git remote add origin "$(cd "$MONOREPO" && git remote get-url origin)"
  git add -A
  git commit -q -m "$MSG"
  git push --force origin HEAD:cloudrun-frontend-deploy

  cd /
  rm -rf "$FRONTEND_SCRATCH"
  echo "    Frontend push done → Cloud Build will deploy kuasaprestij-frontend."
fi

echo ""
echo "Done!"
echo "  GitHub main     : https://github.com/alvinauh/kuasaprestij"
echo "  Cloud Build     : https://console.cloud.google.com/cloud-build/builds?project=prestij-alvin-spmexamsupport"
echo "  Cloud Run API   : https://kuasaprestij-api-746801891568.asia-southeast1.run.app"
echo "  Cloud Run Front : https://kuasaprestij-frontend-746801891568.asia-southeast1.run.app"
