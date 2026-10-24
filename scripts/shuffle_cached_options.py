#!/usr/bin/env python3
"""Shuffle the option order of every cached MCQ in topic_anchors (anchor + question_bank).

The generators put the correct answer first (57% of cached keys were A, 3% D), so always tapping A scored
57%. agents.question_validator.shuffle_options reorders once per question (deterministic, flagged
`options_shuffled`), makes the key text-based, re-keys letter-keyed rationales and strips baked-in labels.

  python scripts/shuffle_cached_options.py            # dry run: before/after key-position stats
  python scripts/shuffle_cached_options.py --apply
"""
import argparse, collections, copy, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from dotenv import load_dotenv
load_dotenv(os.path.join(ROOT, ".env"))
from agents.db_client import make_supabase_client
from agents.question_validator import normalize, shuffle_options

ap = argparse.ArgumentParser()
ap.add_argument("--apply", action="store_true")
args = ap.parse_args()
sb = make_supabase_client()

rows, off = [], 0
while True:
    r = sb.table("topic_anchors").select("id,anchor_question,question_bank").range(off, off + 499).execute().data or []
    rows += r
    if len(r) < 500:
        break
    off += 500


def pos(q):
    n = normalize(q)
    return "ABCD"[n["key_idx"]] if n["key_idx"] is not None and len(n["options"]) == 4 else None


before, after, changed_q, kept = collections.Counter(), collections.Counter(), 0, 0
updates = {}
for row in rows:
    upd = {}
    aq = row.get("anchor_question")
    if isinstance(aq, dict) and aq.get("question"):
        p0 = pos(aq)
        new = copy.deepcopy(aq)
        ch = shuffle_options(new)
        if p0:
            before[p0] += 1
            after[pos(new) or p0] += 1
        if new != aq:
            upd["anchor_question"] = new
            changed_q += ch
    bank = row.get("question_bank") or []
    nb, bank_changed = [], False
    for q in bank:
        if isinstance(q, dict) and q.get("question"):
            p0 = pos(q)
            new = copy.deepcopy(q)
            ch = shuffle_options(new)
            if p0:
                before[p0] += 1
                after[pos(new) or p0] += 1
            if new != q:
                bank_changed = True
                changed_q += ch
            nb.append(new)
        else:
            nb.append(q)
    if bank_changed:
        upd["question_bank"] = nb
    if upd:
        updates[row["id"]] = upd

def pct(c):
    t = sum(c.values()) or 1
    return {k: f"{100 * v / t:.0f}%" for k, v in sorted(c.items())}

print("key position before:", pct(before), "| after:", pct(after))
print(f"{changed_q} questions reordered across {len(updates)} rows")
if not args.apply:
    print("dry run: nothing written (use --apply)")
    sys.exit(0)
for rid, upd in updates.items():
    sb.table("topic_anchors").update(upd).eq("id", rid).execute()
print("applied. Restart the API so its anchor cache reloads: systemctl restart kuasaprestij")
