#!/usr/bin/env bash
# Rebuild the live frontend and restart it. Run after every frontend edit:
#   bash /root/kuasaprestij/deploy/frontend_build.sh
# The build needs a bigger Node heap than the default (~2 GB) or it dies with "JavaScript heap out of memory".
# Only touches the kuasaprestij-frontend service (port 3000); nothing else on the box.
set -euo pipefail
cd /root/frontend/learn-play-shine-96
NODE_OPTIONS=--max-old-space-size=4096 npm run build
systemctl restart kuasaprestij-frontend
sleep 3
curl -fsS -o /dev/null -w "frontend /login -> HTTP %{http_code}\n" http://127.0.0.1:3000/login
