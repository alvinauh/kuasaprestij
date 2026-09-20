#!/usr/bin/env python3
"""
Seed short-answer anchor questions for high-traffic KSSM subjects.
Uses agents/llm_client.py (Cerebras → OpenRouter → Groq) — free tier only.
Claude CLI is NOT used; this does not consume Claude subscription credits.

Run in background:
    nohup python3 seed_short_answer.py > logs/seed_short_answer.log 2>&1 &

Progress is logged to logs/seed_short_answer.log and can be tailed live.
Already-seeded topic+language combos are skipped automatically on resume.
"""

import os, sys, json, time
from pathlib import Path

os.chdir("/root/kuasaprestij")
from dotenv import load_dotenv
load_dotenv("/root/kuasaprestij/.env", override=True)
from supabase import create_client
from agents.llm_client import call_llm

sb = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))

HIGH_TRAFFIC = [
    "Physics",
    "Biology",
    "Chemistry",
    "Mathematics",
    "Bahasa Melayu",
    "Bahasa Inggeris",
]

LOG_PATH = Path("logs/seed_short_answer.log")
LOG_PATH.parent.mkdir(exist_ok=True)

def log(msg: str):
    ts = time.strftime("%Y-%m-%dT%H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    with open(LOG_PATH, "a") as f:
        f.write(line + "\n")


def fetch_rows() -> list:
    """Return topic_anchor rows for high-traffic subjects that need short_answer seeding."""
    res = sb.table("topic_anchors") \
        .select("id, topic, subject, language, form_level, question_bank") \
        .in_("subject", HIGH_TRAFFIC) \
        .execute()
    rows = res.data or []

    to_seed = []
    for row in rows:
        bank = row.get("question_bank") or []
        already = any(q.get("question_type") == "short_answer" for q in bank)
        if not already:
            to_seed.append(row)
    return to_seed


def build_prompt(topic: str, subject: str, language: str, form_level: int) -> str:
    lang_note = "in Bahasa Malaysia (BM)" if language == "Bahasa Melayu" else "in English"
    return f"""You are an experienced SPM examiner. Generate ONE structured short-answer question {lang_note} for:

Subject : {subject}
Topic   : {topic}
Form    : {form_level}

Return ONLY a single valid JSON object — no markdown fences, no explanation, nothing else.
Use this exact schema:

{{
  "question_type": "short_answer",
  "question": "<overall question stem or scenario — 1-2 sentences of context>",
  "sub_parts": [
    {{"label": "(a)", "question": "<sub-question text>", "marks": 2, "sample_answer": "<concise SPM-style answer>"}},
    {{"label": "(b)", "question": "<sub-question text>", "marks": 2, "sample_answer": "<concise SPM-style answer>"}},
    {{"label": "(c)", "question": "<sub-question text>", "marks": 2, "sample_answer": "<concise SPM-style answer>"}}
  ],
  "total_marks": 6,
  "kbat_level": "C3",
  "topic": "{topic}",
  "subject": "{subject}"
}}

Rules:
- Three sub-parts (a)(b)(c), 2 marks each = 6 marks total (standard SPM Kertas 2 Section A)
- Increase difficulty: (a) recall/state, (b) explain/calculate, (c) analyse/evaluate
- Sample answers must be examinable — precise, point-form where appropriate
- Write everything {lang_note}"""


def call_llm_json(prompt: str) -> dict | None:
    """Call the provider chain (Cerebras→OpenRouter→Groq) and parse JSON response."""
    try:
        response = call_llm(prompt, want_json=True, cerebras_only=True, max_tokens=1500)
        text = response.text.strip()

        if "```" in text:
            text = "\n".join(l for l in text.split("\n") if not l.strip().startswith("```"))

        start = text.find("{")
        end = text.rfind("}") + 1
        if start == -1 or end <= 0:
            log(f"  No JSON found in output: {text[:120]}")
            return None

        data = json.loads(text[start:end])
        if not data.get("sub_parts") or len(data["sub_parts"]) == 0:
            log(f"  JSON missing sub_parts")
            return None
        data["question_type"] = "short_answer"
        return data

    except json.JSONDecodeError as e:
        log(f"  JSON parse error: {e}")
        return None
    except RuntimeError as e:
        log(f"  All providers failed: {e}")
        return None
    except Exception as e:
        log(f"  Unexpected error: {e}")
        return None


def save(row: dict, question: dict):
    bank = list(row.get("question_bank") or [])
    bank.append(question)
    sb.table("topic_anchors") \
        .update({"question_bank": bank}) \
        .eq("id", row["id"]) \
        .execute()


def main():
    log("=" * 60)
    log("Short-answer seeding job started")
    log(f"Subjects: {', '.join(HIGH_TRAFFIC)}")

    rows = fetch_rows()
    total = len(rows)
    log(f"Rows needing short_answer seeding: {total}")

    if total == 0:
        log("Nothing to do — all rows already have short_answer questions.")
        return

    done = failed = 0

    for i, row in enumerate(rows, 1):
        topic    = row["topic"]
        subject  = row["subject"]
        language = row["language"]
        form     = row["form_level"]

        log(f"[{i}/{total}] {subject} / {topic} ({language} F{form})")

        prompt   = build_prompt(topic, subject, language, form)
        question = call_llm_json(prompt)

        if question is None:
            log("  FAILED — skipping")
            failed += 1
            time.sleep(3)
            continue

        try:
            save(row, question)
            sub_count = len(question.get("sub_parts", []))
            marks     = question.get("total_marks", "?")
            log(f"  OK — {sub_count} sub-parts, {marks} marks total")
            done += 1
        except Exception as e:
            log(f"  DB save error: {e}")
            failed += 1

        # Polite pause — Claude CLI has no hard rate limit here but let's be gentle
        time.sleep(2)

    log("=" * 60)
    log(f"COMPLETE: {done} seeded, {failed} failed out of {total}")


if __name__ == "__main__":
    main()
