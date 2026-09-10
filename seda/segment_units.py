#!/usr/bin/env python3
"""
STEP 3 — Pre-segment each generated script into communicative acts (sentence level).

This produces the FIXED unit of analysis shared by both coders. Coders MUST NOT
re-segment. Reads seda/corpus/scripts.jsonl, writes seda/corpus/units.csv.

act_id is stable: "<script_id>a<NN>" (e.g. S001a01).

Usage:
    python seda/segment_units.py
"""
import os
import re
import csv
import sys
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

CORPUS = "seda/corpus/scripts.jsonl"
UNITS = "seda/corpus/units.csv"

# Split on sentence-final punctuation followed by whitespace + a capital/quote/digit.
# Good enough for LLM-generated teacher scripts (occasional BM sentences included).
_SPLIT = re.compile(r'(?<=[.!?])\s+(?=["\'“‘]?[A-Z0-9])')


def sentences(text):
    text = (text or "").strip()
    if not text:
        return []
    parts = [p.strip() for p in _SPLIT.split(text) if p.strip()]
    # merge stray fragments shorter than 3 chars into the previous act
    out = []
    for p in parts:
        if out and len(p) < 3:
            out[-1] = out[-1] + " " + p
        else:
            out.append(p)
    return out


def main():
    with open(CORPUS, encoding="utf-8") as fh:
        records = [json.loads(l) for l in fh if l.strip()]

    rows = []
    for rec in records:
        if rec.get("source") == "fallback":
            continue  # templated, non-dialogic — excluded from the coding corpus
        acts = sentences(rec["script_text"])
        for i, act in enumerate(acts, start=1):
            rows.append({
                "script_id": rec["script_id"],
                "topic": rec["topic"],
                "error_category": rec["error_category"],
                "act_no": i,
                "act_id": f"{rec['script_id']}a{i:02d}",
                "act_text": act,
            })

    with open(UNITS, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=["script_id", "topic", "error_category",
                                           "act_no", "act_id", "act_text"])
        w.writeheader()
        w.writerows(rows)

    n_scripts = len({r["script_id"] for r in rows})
    print(f"Wrote {UNITS}: {len(rows)} acts across {n_scripts} scripts "
          f"(avg {len(rows)/max(n_scripts,1):.1f} acts/script)")


if __name__ == "__main__":
    main()
