#!/usr/bin/env python3
"""Generate FRESH questions with the current generator hints and run them through the SPM critique, without touching the cache.
Use it to measure whether a prompt/hint change moved the SPM-fit scores (compare with the cached sample in spm_critique.py).

  python scripts/spm_fresh_probe.py --subjects Physics,Chemistry,Biology --types mcq,short_answer,essay --n 3
"""
import argparse, json, os, sys, random
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import spm_critique as c
from agents.db_client import make_supabase_client
from agents import orchestrator as orch

ap = argparse.ArgumentParser()
ap.add_argument("--subjects", required=True)
ap.add_argument("--types", default="mcq,short_answer")
ap.add_argument("--n", type=int, default=3, help="topics per subject")
ap.add_argument("--reference")
ap.add_argument("--threads", type=int, default=4)
ap.add_argument("--out", default="")
a = ap.parse_args()
if a.reference:
    c.REFERENCE = open(a.reference).read().strip()

sb = make_supabase_client()
jobs = []
for subj in a.subjects.split(","):
    rows = sb.table("topic_anchors").select("topic,language,form_level,subject").eq("subject", subj).execute().data
    random.Random(3).shuffle(rows)
    for r in rows[: a.n]:
        for t in a.types.split(","):
            jobs.append((r, t))

def run(j):
    r, t = j
    state = {"student_id": "00000000-0000-0000-0000-000000000001", "topic": r["topic"], "subject": r["subject"],
             "language": r["language"], "form_level": r["form_level"] or 4, "is_adaptive": True, "question_type": t,
             "context": f"KSSM Form {r['form_level']} {r['subject']}: {r['topic']}.", "dskp_criteria": "", "student_history": "No prior history.",
             "draft": None, "student_answer": None, "is_correct": False, "partial_credit": None, "mastery_score": 0.5, "feedback": "",
             "teacher_action_plan": "", "mnemonic_lyrics": None, "media_url": None, "video_broll": None, "h5p_content": None,
             "diagram_svg": None, "worked_example": None, "topic_complete": False, "next_topic": "", "error_category": None,
             "root_cause": None, "intervention_plan": None, "essay_detail": None, "answered_count": 0, "target_kbat": None,
             "seen_questions": [], "session_id": None, "simplified_language": False, "worked_example_first": False}
    try:
        d = (orch.generator_node(state) or {}).get("draft")
    except Exception as e:
        return None
    if not d or "API Rate Limit" in str(d.get("question")):
        return None
    d.setdefault("question_type", t)
    return c.critique_question(({"id": "fresh", "subject": r["subject"], "topic": r["topic"], "language": r["language"], "form_level": r["form_level"]}, d))

res = [x for x in ThreadPoolExecutor(a.threads).map(run, jobs) if x]
ok = [x for x in res if "_error" not in x["critique"]]
by = defaultdict(list)
for x in ok:
    by[x["type"]].append(x)
print(f"{len(ok)} fresh items judged")
for t, v in by.items():
    print(t, len(v), "avg", round(sum(c.item_score(x) for x in v) / len(v), 2), c.avg_scores(v))
print("would appear in SPM:", {k: sum(1 for x in ok if x["critique"].get("would_appear_in_spm") == k) for k in ("yes", "with edits", "no")})
if a.out:
    json.dump(res, open(a.out, "w"), ensure_ascii=False, indent=1)
