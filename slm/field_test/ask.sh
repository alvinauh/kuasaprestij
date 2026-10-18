#!/usr/bin/env bash
# Usage (from Windows): wsl.exe -d Ubuntu-24.04 -- bash /mnt/d/kuasaprestij/skor_slm/skor_slm/field_test/ask.sh <request-name>
# Reads field_test/requests/<name>.json, writes field_test/requests/<name>.result.json
set -e
R=/mnt/d/kuasaprestij/skor_slm/skor_slm/field_test/requests
cd ~/skor_slm && . .venv/bin/activate
python scripts/ask_skor.py "$R/$1.json" > "$R/$1.result.json"
cat "$R/$1.result.json"
