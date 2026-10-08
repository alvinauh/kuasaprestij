"""
seed_spm_anchors.py — backfill all topic_anchors with SPM-format MCQs.

Uses agents/llm_client.py (Cerebras → OpenRouter → Groq) — free tier only.
Claude CLI is NOT used; this does not consume Claude subscription credits.

Run:
    python3 seed_spm_anchors.py >> logs/seed_spm_anchors.log 2>&1 &

Already-seeded rows are skipped automatically on resume.
"""

import os, json, time
from dotenv import load_dotenv

load_dotenv(override=True)

from supabase import create_client
from agents.llm_client import call_llm

sb = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))

SLEEP_BETWEEN = 1   # seconds between calls; llm_client handles rate-limit backoff internally


def log(msg: str) -> None:
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def _spm_mcq_prompt(topic: str, subject: str, language: str, form_level: int) -> str:
    lang_instruction = {
        "Bahasa Melayu": "Write the entire question, stimulus, options, and all text in BAHASA MELAYU only.",
        "English":       "Write the entire question, stimulus, options, and all text in ENGLISH only.",
        "Bahasa Cina":   "Write the entire question, stimulus, options, and all text in MANDARIN CHINESE (Simplified) only.",
    }.get(language, "Write in English.")

    return f"""You are an expert Malaysian SPM examiner for Form {form_level} {subject}.

Create ONE high-quality SPM Paper 1 multiple-choice question about the topic: "{topic}".

SPM FORMAT RULES:
- The stimulus (if used) is a 1-2 sentence scenario, described diagram, or data observation BEFORE the question stem.
- The question stem asks the student what to determine or identify — do NOT repeat the stimulus in the question.
- Exactly 4 options: one correct answer, three plausible distractors based on real student misconceptions.
- Options are parallel in structure, similar in length. Correct answer is NOT obviously different.
- For science/maths: use correct SI units and realistic values.

LANGUAGE INSTRUCTION: {lang_instruction}

Return ONLY a valid JSON object — no markdown fences, no explanation, nothing else:
{{
    "question_type": "mcq",
    "kbat_level": "one of: Mengingat / Memahami / Mengaplikasi / Menganalisis / Menilai / Mencipta",
    "illustrative_notes": "2-3 sentences on prerequisite knowledge needed to answer — do NOT reveal the answer.",
    "stimulus": "1-2 sentence scenario or data observation. Empty string if not needed.",
    "question": "The question stem only — do not repeat the stimulus here.",
    "options": ["option A text", "option B text", "option C text", "option D text"],
    "correct_answer": "the exact string of the correct option (must match one of the options exactly)",
    "distractor_rationale": {{
        "option text": "2-sentence explanation of the misconception behind this wrong answer."
    }},
    "source_excerpt": ""
}}"""


def call_llm_json(prompt: str) -> dict | None:
    """Call the provider chain (Cerebras→OpenRouter→Groq) and parse JSON response."""
    try:
        response = call_llm(prompt, want_json=True, cerebras_only=True, max_tokens=1500)
        text = response.text.strip()

        # Strip any accidental markdown fences
        if "```" in text:
            text = "\n".join(
                l for l in text.split("\n")
                if not l.strip().startswith("```")
            )

        start = text.find("{")
        end = text.rfind("}") + 1
        if start == -1 or end <= 0:
            log(f"  No JSON found in output: {text[:120]}")
            return None

        data = json.loads(text[start:end])
        if isinstance(data, list):
            data = data[0]

        if not data.get("question") or not data.get("options"):
            log(f"  JSON missing required fields (question/options)")
            return None

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


def seed_all():
    rows = sb.table("topic_anchors") \
        .select("id, topic, subject, language, form_level, anchor_question") \
        .order("topic") \
        .execute().data or []

    pending = [
        r for r in rows
        if not r.get("anchor_question") or not r["anchor_question"].get("question")
    ]
    log(f"=== SPM anchor seed: {len(pending)} / {len(rows)} rows need generation ===")

    done = 0
    failed = 0

    for i, row in enumerate(pending):
        topic    = row["topic"]
        subject  = row["subject"]
        language = row["language"]
        form_lvl = row.get("form_level") or 4
        row_id   = row["id"]

        log(f"[{i+1}/{len(pending)}] {subject} | {topic} | {language} (F{form_lvl})")

        prompt = _spm_mcq_prompt(topic, subject, language, form_lvl)
        result = call_llm_json(prompt)

        if not result:
            log("  FAILED — retrying once after 10s…")
            time.sleep(10)
            result = call_llm_json(prompt)

        if not result:
            log("  FAILED after retry — skipping.")
            failed += 1
            continue

        result.setdefault("question_type", "mcq")
        result.setdefault("kbat_level", "Memahami")
        result.setdefault("illustrative_notes", "")
        result.setdefault("stimulus", "")
        result.setdefault("distractor_rationale", {})
        result.setdefault("source_excerpt", "")

        # Validate correct_answer is one of the options
        options = result.get("options") or []
        if result.get("correct_answer") not in options and options:
            log(f"  Fixing correct_answer not in options — defaulting to first option")
            result["correct_answer"] = options[0]

        try:
            sb.table("topic_anchors").update({"anchor_question": result}).eq("id", row_id).execute()
            done += 1
            log(f"  OK — kbat: {result.get('kbat_level')} | stimulus: {'yes' if result.get('stimulus') else 'none'}")
        except Exception as e:
            log(f"  DB write failed: {e}")
            failed += 1

        time.sleep(SLEEP_BETWEEN)

    log(f"=== Done: {done} seeded, {failed} failed out of {len(pending)} ===")


if __name__ == "__main__":
    seed_all()
