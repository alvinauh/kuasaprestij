"""Export Supabase rows into data/skor_slm_dataset.jsonl (chat "messages" format).

Env: SUPABASE_URL, SUPABASE_SERVICE_KEY (read-only use; never commit it).

  python scripts/export_supabase_training_data.py --inspect   # print real column names
  python scripts/export_supabase_training_data.py             # write the dataset

The FIELD MAP below is a guess from CLAUDE.md. Run --inspect first and fix it.
"""
import argparse
import json
import os
import re
import sys
from collections import Counter
from pathlib import Path

import requests

# ---- FIELD MAP (verify with --inspect) ----------------------------------
# topic_anchors: one row per topic; MCQs live in the JSON lists `anchor_question` (one MCQ)
# and `question_bank` (~5 MCQs). Keys below are inside each MCQ object.
ANCHOR = {
    "topic": "topic", "subject": "subject", "form": "form_level", "lang": "language",
    "mcq_columns": ("anchor_question", "question_bank"),
}
MCQ = {
    "question": "question", "options": "options", "correct_answer": "correct_answer",
    # No distractor rationale is stored; illustrative_notes explains why the key is right
    # and the distractors wrong, so it stands in as a single-item rationale.
    "distractor_rationale": "illustrative_notes",
    "stimulus": "stimulus", "object_lesson": "object_lesson", "kbat_level": "kbat_level",
}
# event_logs has no language column; lang is detected from the text.
EVENT = {
    "question": "question_text", "options": "options_json", "correct_answer": "correct_answer",
    "student_answer": "student_answer", "subject": "subject",
    "student_feedback": "feedback_text", "error_category": "error_category",
    "root_cause_analysis": "root_cause", "actionable_intervention": "intervention",
}
# Columns that may identify a student; dropped before anything is written.
PII_COLUMNS = {"user_id", "student_id", "student_name", "name", "email", "school", "school_id", "ip",
               "session_id"}
# -------------------------------------------------------------------------

SYSTEM = {
    "evaluator": "You are Skor's offline evaluator for Malaysian KSSM/SPM students. "
                 "Reply with JSON only: {student_feedback, teacher_insight{error_category, "
                 "root_cause_analysis, actionable_intervention}}. Reply in the student's language.",
    "generator": "You are Skor's offline KBAT question generator. Reply with JSON only: "
                 "{question, options[4], answer_index, distractor_rationale[], stimulus, object_lesson}.",
}

EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
PHONE = re.compile(r"(?:\+?6?01)[0-9\- ]{7,10}")
MYKAD = re.compile(r"\b\d{6}-?\d{2}-?\d{4}\b")


def scrub(text):
    if not isinstance(text, str):
        return text
    return MYKAD.sub("[IC]", PHONE.sub("[PHONE]", EMAIL.sub("[EMAIL]", text)))


def fetch(table, limit=None):
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        sys.exit("Set SUPABASE_URL and SUPABASE_SERVICE_KEY")
    rows, page = [], min(limit or 1000, 1000)
    while True:
        headers = {"apikey": key, "Range": f"{len(rows)}-{len(rows) + page - 1}"}
        if key.startswith("eyJ"):  # legacy JWT service_role key; new sb_secret_ keys go in apikey only
            headers["Authorization"] = f"Bearer {key}"
        r = requests.get(f"{url}/rest/v1/{table}", headers=headers, params={"select": "*"}, timeout=60)
        r.raise_for_status()
        batch = r.json()
        rows += batch
        if len(batch) < page or (limit and len(rows) >= limit):
            return rows[:limit] if limit else rows


def norm_lang(v):
    v = (v or "").strip().lower()
    return {"ms": "bm", "malay": "bm", "bm": "bm", "bahasa melayu": "bm",
            "en": "en", "english": "en",
            "zh": "zh", "mandarin": "zh", "chinese": "zh", "bahasa cina": "zh"}.get(v, v or "unknown")


CJK = re.compile(r"[一-鿿]")
BM_WORDS = {"yang", "dan", "ialah", "adalah", "ini", "itu", "dengan", "untuk", "dalam", "tidak",
            "boleh", "kepada", "manakah", "berikut", "pelajar", "daripada", "apakah", "mengapa"}


def detect_lang(*texts):
    text = " ".join(t for t in texts if isinstance(t, str))
    if CJK.search(text):
        return "zh"
    words = re.findall(r"[a-z]+", text.lower())
    bm = sum(w in BM_WORDS for w in words)
    return "bm" if words and bm / len(words) > 0.04 else "en"


def as_json(v):
    if isinstance(v, str) and v.strip()[:1] in "[{":
        try:
            return json.loads(v)
        except json.JSONDecodeError:
            return None
    return v


def row(task, lang, system, user, assistant):
    return {"task": task, "lang": lang, "messages": [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
        {"role": "assistant", "content": json.dumps(assistant, ensure_ascii=False)},
    ]}


def from_mcq(a, q, lang):
    q = as_json(q)
    if not isinstance(q, dict) or not q.get(MCQ["question"]):
        return None
    options = as_json(q.get(MCQ["options"]))
    answer = q.get(MCQ["correct_answer"])
    if not isinstance(options, list) or len(options) != 4 or answer not in options:
        return None
    note = q.get(MCQ["distractor_rationale"])
    mcq = {
        "question": q[MCQ["question"]],
        "options": options,
        "answer_index": options.index(answer),
        "distractor_rationale": [note] if note else [],
        "stimulus": q.get(MCQ["stimulus"]),
        "object_lesson": q.get(MCQ["object_lesson"]),
    }
    if not lang or lang == "unknown":
        lang = detect_lang(mcq["question"], *options)
    user = (f"Subject: {a.get(ANCHOR['subject'])}\nForm: {a.get(ANCHOR['form'])}\n"
            f"Topic: {a.get(ANCHOR['topic'])}\nKBAT level: {q.get(MCQ['kbat_level']) or 'Apply'}\n"
            f"Language: {lang}\nGenerate one KBAT MCQ.")
    return row("generator", lang, SYSTEM["generator"], user, mcq)


def from_anchor(a):
    """One topic_anchors row -> list of generator examples (anchor + question bank)."""
    lang = norm_lang(a.get(ANCHOR["lang"]))
    mcqs = []
    for col in ANCHOR["mcq_columns"]:
        v = as_json(a.get(col))
        mcqs += v if isinstance(v, list) else [v] if v else []
    return [ex for ex in (from_mcq(a, q, lang) for q in mcqs) if ex]


def from_event(e):
    e = {k: scrub(v) for k, v in e.items() if k not in PII_COLUMNS}
    if not e.get(EVENT["error_category"]) or not e.get(EVENT["student_answer"]):
        return None
    options = as_json(e.get(EVENT["options"]))
    lang = detect_lang(e.get(EVENT["question"]), e.get(EVENT["student_answer"]),
                       e.get(EVENT["student_feedback"]))
    user = f"Subject: {e.get(EVENT['subject']) or '-'}\nQuestion: {e.get(EVENT['question'])}\n"
    if isinstance(options, list) and options:
        user += "Options: " + " | ".join(map(str, options)) + "\n"
    if e.get(EVENT["correct_answer"]):
        user += f"Correct answer: {e[EVENT['correct_answer']]}\n"
    user += f"Student answer: {e.get(EVENT['student_answer'])}"
    out = {
        "student_feedback": e.get(EVENT["student_feedback"]) or "",
        "teacher_insight": {
            "error_category": e[EVENT["error_category"]],
            "root_cause_analysis": e.get(EVENT["root_cause_analysis"]) or "",
            "actionable_intervention": e.get(EVENT["actionable_intervention"]) or "",
        },
    }
    if not out["student_feedback"] or not out["teacher_insight"]["root_cause_analysis"]:
        return None  # incomplete targets teach the model to emit empty fields
    return row("evaluator", lang, SYSTEM["evaluator"], user, out)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--inspect", action="store_true")
    p.add_argument("--out", default="data/skor_slm_dataset.jsonl")
    args = p.parse_args()

    if args.inspect:
        for t in ("topic_anchors", "event_logs", "syllabus_embeddings"):
            sample = fetch(t, limit=1)
            print(f"{t}: {sorted(sample[0]) if sample else '(empty)'}")
        return

    examples, skipped = [], Counter()
    for t, conv in (("topic_anchors", from_anchor), ("event_logs", from_event)):
        for r in fetch(t):
            ex = conv(r)
            ex = ex if isinstance(ex, list) else [ex] if ex else []
            if ex:
                examples += ex
            else:
                skipped[t] += 1

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        for ex in examples:
            f.write(json.dumps(ex, ensure_ascii=False) + "\n")

    print(f"wrote {len(examples)} examples to {args.out}; skipped {dict(skipped)}")
    for (task, lang), n in sorted(Counter((e["task"], e["lang"]) for e in examples).items()):
        print(f"  {task:10s} {lang:8s} {n}")


if __name__ == "__main__":
    main()
