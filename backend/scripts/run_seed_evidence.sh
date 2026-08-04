#!/usr/bin/env bash
#
# run_seed_evidence.sh — execute the question-bank generation run and capture a
# clean, citable evidence artifact for the paper (§4.2).
#
# What it does:
#   1. Preflight: shows which LLM providers are live and refuses to run if the
#      Gemini test-override (LLM_TEST_GEMINI) is on (would invalidate the run).
#   2. Snapshots the DB bank count BEFORE (for delta reconciliation).
#   3. Runs seed_question_bank.py UNBUFFERED, prefixes every stdout line with a
#      UTC timestamp, and tees to evidence/runlog_<UTC>.txt. stdout carries all
#      429 / cooldown / failover events printed by llm_client — no code edits.
#   4. Snapshots the DB bank count AFTER.
#   5. Skip-on-exist makes this SAFELY RE-RUNNABLE: re-running only fills gaps.
#
# Usage:
#   scripts/run_seed_evidence.sh                 # full multi-subject, count=5, delay=3
#   COUNT=3 DELAY=5 scripts/run_seed_evidence.sh # override
#   SUBJECT="Bahasa Inggeris" scripts/run_seed_evidence.sh   # one subject
#   SEED_LANG=English scripts/run_seed_evidence.sh # one language (NOT LANG — locale clash)
#   FREE_ONLY=1 scripts/run_seed_evidence.sh       # free chain (Cerebras->Groq->OpenRouter)
#
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
mkdir -p evidence logs

UTC="$(date -u +%Y%m%dT%H%M%SZ)"
RUNLOG="evidence/runlog_${UTC}.txt"
DB_BEFORE="evidence/db_before_${UTC}.json"
DB_AFTER="evidence/db_after_${UTC}.json"

COUNT="${COUNT:-5}"
DELAY="${DELAY:-3}"

# Free-chain mode: skip paid Gemini/DeepSeek, use Cerebras->Groq->OpenRouter.
if [[ "${FREE_ONLY:-}" == "1" ]]; then
  export SEED_FREE_ONLY=1
fi

EXTRA_ARGS=()
[[ -n "${SUBJECT:-}" ]] && EXTRA_ARGS+=(--subject "${SUBJECT}")
# NB: use SEED_LANG, NOT LANG — LANG is the shell's locale var (e.g. C.UTF-8)
# and would be inherited unintentionally, poisoning --lang.
[[ -n "${SEED_LANG:-}" ]] && EXTRA_ARGS+=(--lang "${SEED_LANG}")

echo "=================================================================="
echo " KuasaPrestij — Seed Evidence Run"
echo " UTC start : ${UTC}"
echo " count=${COUNT}  delay=${DELAY}  extra=${EXTRA_ARGS[*]:-<none>}"
echo " runlog    : ${RUNLOG}"
echo "=================================================================="

# --- Guard: Gemini test override must be off ---
if [[ "$(python3 -c "from dotenv import load_dotenv; load_dotenv('${ROOT}/.env', override=True); import os; print(os.getenv('LLM_TEST_GEMINI','').lower() in ('1','true','yes'))")" == "True" ]]; then
  echo "ABORT: LLM_TEST_GEMINI is ON — every call would route to the isolated test Gemini."
  echo "Unset it in .env and retry."
  exit 1
fi

# --- Preflight: which providers are live ---
echo "--- Provider preflight ---"
python3 - <<PY
import os
from dotenv import load_dotenv
load_dotenv("${ROOT}/.env", override=True)
free_only = os.getenv("SEED_FREE_ONLY","").lower() in ("1","true","yes")
if free_only:
    chain = [("Cerebras","CEREBRAS_API_KEY"),("GroqCloud","GROQ_API_KEY"),
             ("OpenRouter","OPENROUTER_API_KEY")]
    print("FREE-CHAIN mode (SEED_FREE_ONLY=1): paid Gemini/DeepSeek skipped.")
else:
    chain = [("Gemini(PAID)","GEMINI_API_KEY"),("Cerebras","CEREBRAS_API_KEY"),
             ("GroqCloud","GROQ_API_KEY"),("OpenRouter","OPENROUTER_API_KEY"),
             ("DeepSeek(PAID)","DEEPSEEK_API_KEY")]
print("Chain order: " + " -> ".join(l for l,_ in chain))
for label, key in chain:
    print(f"  {label:16} {'LIVE' if os.getenv(key) else 'missing (skipped)'}")
PY

# --- DB snapshot BEFORE ---
echo "--- DB snapshot (before) -> ${DB_BEFORE} ---"
python3 scripts/db_bank_snapshot.py | tee "${DB_BEFORE}"

# --- The run: unbuffered, UTC-timestamped per line, teed to the runlog ---
echo "--- Generation run start ---"
START_EPOCH=$(date -u +%s)

set +e
python3 -u seed_question_bank.py --count "${COUNT}" --delay "${DELAY}" "${EXTRA_ARGS[@]}" 2>&1 \
  | python3 -u -c '
import sys, datetime
for line in sys.stdin:
    ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    sys.stdout.write(f"{ts} {line}")
    sys.stdout.flush()
' | tee "${RUNLOG}"
RUN_RC=${PIPESTATUS[0]}
set -e

END_EPOCH=$(date -u +%s)
echo "--- Generation run end (rc=${RUN_RC}, wall-clock $((END_EPOCH-START_EPOCH))s) ---"

# --- DB snapshot AFTER ---
echo "--- DB snapshot (after) -> ${DB_AFTER} ---"
python3 scripts/db_bank_snapshot.py | tee "${DB_AFTER}"

# --- Summary parse ---
echo "--- Building summary ---"
python3 scripts/parse_runlog.py \
  --runlog "${RUNLOG}" \
  --db-before "${DB_BEFORE}" \
  --db-after "${DB_AFTER}" \
  --utc "${UTC}" \
  --wall-seconds "$((END_EPOCH-START_EPOCH))"

echo "=================================================================="
echo " DONE. Artifacts:"
echo "   ${RUNLOG}"
echo "   evidence/run_summary.md"
echo "   evidence/run_summary.csv"
echo "   logs/question_bank_seed_progress.md  (10% checkpoints)"
echo "=================================================================="
