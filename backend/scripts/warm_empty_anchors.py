#!/usr/bin/env python3
"""Regenerate topics whose cached questions were all removed (e.g. by scripts/audit_questions.py --apply).

Calls the live /start_session for each empty topic_anchors row so the normal pipeline (including the
question quality gate) writes a fresh anchor. Uses the QA student id; sessions are throwaway.
  python scripts/warm_empty_anchors.py [--api https://api.skor.space] [--student <uuid>]
"""
import argparse, os, sys, time
import requests
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))
from agents.db_client import make_supabase_client

ap = argparse.ArgumentParser()
ap.add_argument("--api", default="https://api.skor.space")
ap.add_argument("--student", default="77f0bf1d-4667-48f1-9838-e755dbb1725a")
args = ap.parse_args()

sb = make_supabase_client()
rows = sb.table("topic_anchors").select("subject,topic,language,form_level,anchor_question,question_bank").range(0, 999).execute().data
empty = [r for r in rows
         if r["topic"] != "Core Material"
         and not (isinstance(r.get("anchor_question"), dict) and r["anchor_question"].get("question"))
         and not (r.get("question_bank") or [])]
print(f"{len(empty)} empty rows")
ok = 0
for i, r in enumerate(empty, 1):
    t = time.time()
    try:
        d = requests.post(f"{args.api}/start_session", timeout=150, json={
            "student_id": args.student, "topic": r["topic"], "curriculum": "KSSM", "language": r["language"],
            "subject": r["subject"], "is_adaptive": False, "question_type": "mcq", "form_level": r["form_level"] or 4})
        q = (d.json().get("question_data") or {}).get("question") if d.ok else None
    except Exception as e:
        q = None
    ok += bool(q)
    print(f"[{i}/{len(empty)}] {r['subject']} / {r['topic'][:40]} ({r['language']} F{r['form_level']}): {'ok' if q else 'FAILED'} {time.time() - t:.1f}s")
print(f"done: {ok}/{len(empty)} served a question")
