#!/usr/bin/env python3
"""Attach a stored `why_correct` explanation to cached questions that lack one.

A wrong MCQ answer is then explained instantly from stored data instead of waiting ~2.5 s for an LLM
call (evaluator_node, MCQ branch). The reviewer in agents/question_validator.py solves each question
blind; its student-facing explanation is stored only when it agrees with the stored answer key.
Questions it disagrees with are listed (they would also fail the quality gate) and left untouched.

  python scripts/backfill_explanations.py            # dry run: counts only
  python scripts/backfill_explanations.py --apply
"""
import argparse, os, sys, time
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from dotenv import load_dotenv
load_dotenv(os.path.join(ROOT, ".env"))
from agents import question_validator as qv
from agents.db_client import make_supabase_client

ap = argparse.ArgumentParser()
ap.add_argument("--apply", action="store_true")
ap.add_argument("--threads", type=int, default=8)
args = ap.parse_args()

sb = make_supabase_client()
rows, off = [], 0
while True:
    r = sb.table("topic_anchors").select("id,subject,topic,language,form_level,anchor_question,question_bank,diagram_svg").range(off, off + 499).execute().data or []
    rows += r
    if len(r) < 500:
        break
    off += 500

work = []
for row in rows:
    aq = row.get("anchor_question")
    if isinstance(aq, dict) and aq.get("question") and not aq.get("why_correct"):
        work.append((row, "anchor", None, aq))
    for i, q in enumerate(row.get("question_bank") or []):
        if isinstance(q, dict) and q.get("question") and not q.get("why_correct"):
            work.append((row, "bank", i, q))
print(f"{len(work)} questions without why_correct (of {sum(1 + len(r.get('question_bank') or []) for r in rows)})")


def run(w):
    row, slot, idx, q = w
    if (q.get("question_type") or "mcq") not in ("mcq", "listening"):
        return w, None, "not mcq"
    try:
        res = qv.validate(q, row.get("subject") or "", row.get("topic") or "", row.get("form_level") or 4,
                          row.get("language") or "English", use_llm=True, has_visual=bool(row.get("diagram_svg")))
    except Exception as e:
        return w, None, f"error {type(e).__name__}"
    if res.explanation:
        return w, res.explanation, "ok"
    return w, None, "no agreement" if res.llm_ran else "review skipped"


t0 = time.time()
with ThreadPoolExecutor(args.threads) as ex:
    out = list(ex.map(run, work))
from collections import Counter
print("done in %.0fs:" % (time.time() - t0), dict(Counter(o[2] for o in out)))

if not args.apply:
    print("dry run: nothing written (use --apply)")
    sys.exit(0)

by_row = {}
for (row, slot, idx, q), expl, why in out:
    if expl:
        by_row.setdefault(row["id"], {"row": row, "anchor": None, "bank": {}})
        if slot == "anchor":
            by_row[row["id"]]["anchor"] = expl
        else:
            by_row[row["id"]]["bank"][idx] = expl
for rid, d in by_row.items():
    row, upd = d["row"], {}
    if d["anchor"]:
        upd["anchor_question"] = {**row["anchor_question"], "why_correct": d["anchor"]}
    if d["bank"]:
        upd["question_bank"] = [({**q, "why_correct": d["bank"][i]} if i in d["bank"] else q)
                                for i, q in enumerate(row.get("question_bank") or [])]
    sb.table("topic_anchors").update(upd).eq("id", rid).execute()
print(f"updated {len(by_row)} rows. Restart the API so its anchor cache reloads: systemctl restart kuasaprestij")
