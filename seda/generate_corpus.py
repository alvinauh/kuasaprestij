#!/usr/bin/env python3
"""
STEP 2 — Generate the SEDA audit corpus.

Invokes the REAL production triage generator (`app.main._generate_intervention_scripts`)
on 50 synthetic, stratified flagged-student cases. Writes one JSON line per generated
script to seda/corpus/scripts.jsonl and a plain-text run log.

- No student data (synthetic SYNTH-### ids), no frontend, no DB writes.
- The generator's default provider chain is used (Gemini -> Cerebras -> Groq ->
  OpenRouter -> DeepSeek). We wrap the client's `_try_provider` at runtime ONLY to
  record which provider served each batch — no serving code is modified on disk.
- Cases are sent in small batches so the batched JSON fits the generator's 4096-token
  budget without truncation.

Usage:
    python seda/generate_corpus.py [--batch-size 8]
"""
import os
import sys
import json
import argparse
import datetime as _dt

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv
load_dotenv(override=True)

from seda.cases import build_cases
import agents.llm_client as _llm
from app.main import _generate_intervention_scripts, _fallback_intervention

CORPUS = "seda/corpus/scripts.jsonl"
RUNLOG = "seda/corpus/runlog.txt"

# --- runtime-only provider capture (does NOT modify llm_client.py on disk) -----
_served = []
_orig_try = _llm._try_provider


def _capturing_try(client, model, kwargs, label):
    r = _orig_try(client, model, kwargs, label)
    if r is not None:
        _served.append(label)
    return r


_llm._try_provider = _capturing_try


def _now():
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--batch-size", type=int, default=8)
    args = ap.parse_args()

    cases = build_cases()
    log_lines = [f"[{_now()}] SEDA corpus generation start — {len(cases)} cases, "
                 f"batch_size={args.batch_size}, default provider chain"]
    print(log_lines[-1])

    records = []
    for start in range(0, len(cases), args.batch_size):
        batch = cases[start:start + args.batch_size]
        _served.clear()
        enriched = _generate_intervention_scripts(batch)
        provider = _served[-1] if _served else "unknown"
        for f in enriched:
            fb = _fallback_intervention(f)
            is_fb = (f.get("intervention_script", "").strip() == fb["intervention_script"].strip())
            script_text = (f.get("intervention_script") or "").strip()
            activity = (f.get("suggested_activity") or "").strip()
            rec = {
                "script_id": f["script_id"],
                "topic": f["topic"],
                "error_category": f["error_category"],
                "inputs": {
                    "student_id": f["student_id"],
                    "subject": f["subject"],
                    "topic": f["topic"],
                    "error_category": f["error_category"],
                    "wrong_count": f["wrong_count"],
                    "root_cause": f["root_cause"],
                },
                "provider": provider,
                "source": "fallback" if is_fb else "llm",
                "intervention_script": script_text,
                "suggested_activity": activity,
                "script_text": (script_text + " " + activity).strip(),
            }
            records.append(rec)
        line = (f"[{_now()}] batch {start//args.batch_size + 1}: "
                f"{len(batch)} cases -> provider={provider}, "
                f"fallbacks={sum(1 for r in records[-len(batch):] if r['source']=='fallback')}")
        log_lines.append(line)
        print(line)

    with open(CORPUS, "w", encoding="utf-8") as fh:
        for r in records:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")

    n_fb = sum(1 for r in records if r["source"] == "fallback")
    summary = (f"[{_now()}] DONE — wrote {len(records)} scripts to {CORPUS} "
               f"({len(records)-n_fb} llm, {n_fb} fallback)")
    log_lines.append(summary)
    print(summary)
    if n_fb:
        warn = (f"[{_now()}] WARNING: {n_fb} fallback (templated, non-LLM) scripts present — "
                f"exclude these from SEDA coding or regenerate those cases.")
        log_lines.append(warn)
        print(warn)

    with open(RUNLOG, "w", encoding="utf-8") as fh:
        fh.write("\n".join(log_lines) + "\n")


if __name__ == "__main__":
    main()
