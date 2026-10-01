#!/usr/bin/env bash
# Redeploy the KuasaPrestij backend to Cloud Run from the current local source.
#
# Env vars / secrets are NOT set here on purpose: they were configured once via
# Secret Manager (see deploy/CLOUDRUN_NOTES.md) and Cloud Run PRESERVES the
# existing secret bindings across `--source` redeploys. This script only ships
# new code.
#
#   ./deploy/cloudrun_deploy.sh
#
set -euo pipefail

PROJECT="prestij-alvin-spmexamsupport"
SERVICE="kuasaprestij-api"
REGION="asia-southeast1"

# Use the gcloud installed under /root if not already on PATH.
command -v gcloud >/dev/null 2>&1 || export PATH="/root/google-cloud-sdk/bin:$PATH"

cd "$(dirname "$0")/.."   # repo root (where the Dockerfile + .gcloudignore live)

echo "Deploying $SERVICE to Cloud Run ($REGION, project $PROJECT) from $(pwd) ..."
gcloud run deploy "$SERVICE" \
  --source . \
  --project "$PROJECT" \
  --region "$REGION" \
  --allow-unauthenticated \
  --memory 4Gi --cpu 2 \
  --min-instances 0 \
  --timeout 300 \
  --port 8080 \
  --quiet

echo "Done. Service URL:"
gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" \
  --format="value(status.url)"
