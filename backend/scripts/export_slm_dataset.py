#!/usr/bin/env python3
"""
Build the de-identified training set for the offline (on-device) model.

Sources, all read from the live Supabase project:
  * topic_anchors  -> the quality-gated question bank (grounded in the DSKP syllabus)
  * event_logs     -> ONLY aggregated per-question wrong-answer counts. student_id,
                      session_id and free text are never read into the output.

Tasks written (chat format, prompts identical to the PWA: llm.worker.ts / offlineLlm.ts):
  mcq    topic -> one MCQ as JSON
  hint   question + student's wrong option -> short tutor hint

Hard-case upweighting: questions whose wrong-answer rate is high across >= MIN_STUDENTS
distinct students are repeated (max 3x), so the model follows how students really struggle.
A question's wrong option only produces a hint example when >= MIN_STUDENTS distinct
students chose it (k-anonymity), otherwise the question's own why_correct is used.

Output: data/slm/<UTC date>/{train,eval}.jsonl + meta.json, and data/slm/latest -> that dir.
Run weekly (deploy/kuasaprestij-slm-dataset.timer) or by hand.
"""
import hashlib
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from dotenv import load_dotenv
load_dotenv(override=True)
from supabase import create_client

MIN_STUDENTS = 5      # k-anonymity floor for anything derived from student behaviour
MAX_REPEAT = 3
MAX_QUESTION_CHARS = 700   # a 0.5B model can't use long passages; skip them
EVAL_MOD = 10         # 1 in 10 questions (by hash of its text) is held out

LANG_INSTRUCTION = {
    "English": "Write the question and all options in English.",
    "Bahasa Melayu": "Tulis soalan dan semua pilihan jawapan dalam Bahasa Melayu.",
    "Mandarin": "用中文写题目和所有选项。",
}
KBAT_DESC = {
    "Memahami": "C2 Understanding — explain, summarise, classify",
    "Mengaplikasi": "C3 Applying — use concept in a new situation, solve",
    "Menganalisis": "C4 Analysing — break down, distinguish cause and effect",
    "Menilai": "C5 Evaluating — judge, justify, critique",
}
LETTERS = "ABCD"


# Keep both builders byte-identical to the PWA prompts (llm.worker.ts buildPrompt,
# offlineLlm.ts offlineTutorReply) — a model trained on other wording will drift.
def mcq_messages(subject, topic, language, kbat):
    lang = LANG_INSTRUCTION.get(language, LANG_INSTRUCTION["English"])
    desc = KBAT_DESC.get(kbat, KBAT_DESC["Memahami"])
    system = (
        "You are a Malaysian high school exam question generator for the KSSM syllabus.\n"
        "Generate exactly ONE multiple-choice question. Output ONLY valid JSON, no explanation.\n"
        f"{lang}\nKBAT cognitive level: {desc}\n"
    )
    user = (
        f"Generate a KSSM {subject} MCQ about: {topic}\n\n"
        "Output this JSON structure (no markdown, no extra text):\n"
        '{"question":"<question text>","options":["A. <option>","B. <option>","C. <option>","D. <option>"],'
        f'"correct_answer":"A","kbat_level":"{kbat}"}}\n'
    )
    return system, user


STUDENT_MSGS = {
    False: ["Can you give me a hint?", "I don't understand this.", "Why is my answer wrong?", "Help me think about it."],
    True: ["Boleh beri saya petunjuk?", "Saya tidak faham soalan ini.", "Kenapa jawapan saya salah?", "Bantu saya berfikir."],
}


def hint_messages(q, opts, wrong_text, is_bm):
    system = (
        "You are a friendly tutor for a Malaysian secondary school student (KSSM). "
        f"Reply in {'Bahasa Melayu' if is_bm else 'English'}, in at most 3 short sentences. "
        "Give a hint that helps the student think; do not just state the answer unless they already answered."
    )
    # The app appends the student's own chat message, and passes the answer as a letter or as text;
    # vary both (deterministically) so the model is not trained on one fixed shape.
    h = int(hashlib.sha1((q["question"] + wrong_text).encode()).hexdigest(), 16)
    answered = LETTERS[opts.index(wrong_text)] if h % 2 else wrong_text
    msg = STUDENT_MSGS[is_bm][(h >> 1) % 4]
    block = "\n".join([
        f"Question: {full_question(q)}",
        "Options: " + "  ".join(f"{LETTERS[i]}. {o}" for i, o in enumerate(opts)),
        f"Student answered: {answered}",
        f"Correct answer: {q['correct_answer']}",
    ])
    return system, f"{block}\n\n{msg}"


def chat(system, user, assistant):
    return {"messages": [
        {"role": "system", "content": system.strip()},
        {"role": "user", "content": user.strip()},
        {"role": "assistant", "content": assistant.strip()},
    ]}


def usable(q):
    if not isinstance(q, dict):
        return False
    opts = q.get("options")
    return (
        isinstance(q.get("question"), str) and isinstance(opts, list) and len(opts) == 4
        and all(isinstance(o, str) and o.strip() for o in opts)
        and isinstance(q.get("correct_answer"), str) and q["correct_answer"] in opts
        and len(set(opts)) == 4
        and len(full_question(q)) <= MAX_QUESTION_CHARS
    )


def full_question(q):
    """The PWA prompt has no separate passage field, so a stimulus is folded into the
    question text (the model learns to write self-contained questions)."""
    stim = (q.get("stimulus") or "").strip() if isinstance(q.get("stimulus"), str) else ""
    return f"{stim}\n\n{q['question'].strip()}" if stim else q["question"].strip()


def fetch_all(sb, table, cols, page=1000):
    out, start = [], 0
    while True:
        r = sb.table(table).select(cols).range(start, start + page - 1).execute().data or []
        out += r
        if len(r) < page:
            return out
        start += page


def main():
    sb = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))

    # ── aggregate wrong-answer behaviour; identifiers are dropped immediately ──
    seen = defaultdict(lambda: {"students": set(), "wrong": 0, "wrong_by_opt": defaultdict(set)})
    for e in fetch_all(sb, "event_logs", "student_id,question_text,student_answer,is_correct"):
        qt = (e.get("question_text") or "").strip()
        if not qt:
            continue
        a = seen[qt]
        a["students"].add(e.get("student_id"))
        if e.get("is_correct") is False:
            a["wrong"] += 1
            if e.get("student_answer"):
                a["wrong_by_opt"][e["student_answer"].strip()].add(e.get("student_id"))
    agg = {}
    for qt, a in seen.items():
        n = len(a["students"])
        if n >= MIN_STUDENTS:
            agg[qt] = {
                "attempts_students": n,
                "wrong_rate": a["wrong"] / max(1, sum(1 for _ in a["students"])),
                "common_wrong": {o for o, s in a["wrong_by_opt"].items() if len(s) >= MIN_STUDENTS},
            }
    del seen

    anchors = fetch_all(sb, "topic_anchors", "subject,topic,language,question_bank,anchor_question")
    train, evalset = [], []
    counts = defaultdict(int)
    for row in anchors:
        qs = list(row.get("question_bank") or [])
        if isinstance(row.get("anchor_question"), dict):
            qs.append(row["anchor_question"])
        is_bm = (row.get("language") or "") == "Bahasa Melayu"
        for q in qs:
            if not usable(q):
                continue
            h = int(hashlib.sha1(q["question"].encode()).hexdigest(), 16)  # hash on the stored text so a stimulus edit does not reshuffle splits
            bucket = evalset if h % EVAL_MOD == 0 else train
            split = "eval" if bucket is evalset else "train"
            kbat = q.get("kbat_level") if q.get("kbat_level") in KBAT_DESC else "Memahami"
            lang = row.get("language") or "English"

            stats = agg.get(q["question"].strip())
            reps = 1
            if stats and stats["wrong_rate"] >= 0.5:
                reps = MAX_REPEAT
            elif stats and stats["wrong_rate"] >= 0.3:
                reps = 2

            opts = q["options"]
            key = LETTERS[opts.index(q["correct_answer"])]
            target = {
                "question": full_question(q),
                "options": [f"{LETTERS[i]}. {o.strip()}" for i, o in enumerate(opts)],
                "correct_answer": key,
                "kbat_level": kbat,
            }
            s, u = mcq_messages(row["subject"], row["topic"], lang, kbat)
            ex = chat(s, u, json.dumps(target, ensure_ascii=False))
            ex["task"], ex["subject"] = "mcq", row["subject"]
            for _ in range(reps if split == "train" else 1):
                bucket.append(ex)
            counts[f"{split}_mcq"] += 1

            why = (q.get("why_correct") or "").strip()
            rationale = q.get("distractor_rationale") if isinstance(q.get("distractor_rationale"), dict) else {}
            if not why and not rationale:
                continue
            wrongs = [o for o in opts if o != q["correct_answer"]]
            common = (stats or {}).get("common_wrong", set())
            for w in wrongs:
                # Only options students really pick (k-anonymous) get their own example;
                # otherwise one generic example per question keeps the set balanced.
                if common and w not in common:
                    continue
                if not common and w != wrongs[0]:
                    continue
                text = (rationale.get(w) or why).replace("\n", " ").strip()
                if not text:
                    continue
                s, u = hint_messages(q, opts, w, is_bm)
                ex = chat(s, u, text)
                ex["task"], ex["subject"] = "hint", row["subject"]
                for _ in range(reps if split == "train" else 1):
                    bucket.append(ex)
                counts[f"{split}_hint"] += 1

    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    out = os.path.join(ROOT, "data", "slm", day)
    os.makedirs(out, exist_ok=True)
    for name, rows in (("train", train), ("eval", evalset)):
        with open(os.path.join(out, f"{name}.jsonl"), "w", encoding="utf-8") as f:
            for r in rows:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
    digest = hashlib.sha256(open(os.path.join(out, "train.jsonl"), "rb").read()).hexdigest()
    meta = {
        "created_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "dataset_id": day, "train_sha256": digest,
        "train_examples": len(train), "eval_examples": len(evalset),
        "questions_by_split_task": dict(counts),
        "questions_with_usage_stats": len(agg),
        "min_students_k_anonymity": MIN_STUDENTS,
        "contains_student_identifiers": False,
    }
    json.dump(meta, open(os.path.join(out, "meta.json"), "w"), indent=2)
    latest = os.path.join(ROOT, "data", "slm", "latest")
    if os.path.islink(latest) or os.path.exists(latest):
        os.remove(latest)
    os.symlink(day, latest)
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
