"""
seed_worked_examples.py — Generate worked examples for cached topic_anchors via LLM.

Calls call_llm() sequentially for each missing row and upserts the result
back into topic_anchors.worked_example.

Usage:
    python seed_worked_examples.py              # only missing rows
    python seed_worked_examples.py --force      # regenerate all (overwrite existing)
    python seed_worked_examples.py --subject Physics
    python seed_worked_examples.py --dry-run
"""

import os, sys
from datetime import datetime
from supabase import create_client
from agents.llm_client import call_llm

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]

# Subject-specific format instructions so examples match SPM paper style
FORMAT_HINTS = {
    "Physics":                "Show a numbered step-by-step calculation with formula, substitution, and answer in SI units.",
    "Chemistry":              "Show a balanced equation first, then a worked calculation or mechanism step-by-step.",
    "Biology":                "Explain a process step-by-step (e.g. mitosis stages, or how a system functions). Use numbered steps.",
    "Additional Mathematics": "Show a full working with formula, substitution, simplification, and final answer. Include all intermediate steps.",
    "Mathematics":            "Show a full working with formula, substitution, simplification, and final answer. Include all intermediate steps.",
    "Science":                "Give a step-by-step explanation of the concept or procedure with a simple example.",
    "Sejarah":                "Give 3-4 key points a student must mention in an SPM essay answer on this topic.",
    "Geografi":               "Describe a step-by-step explanation of the process or feature, referencing a real Malaysian example where possible.",
    "Bahasa Melayu":          "Show a model paragraph (80-100 words) demonstrating correct structure and language features for this topic.",
    "Bahasa Inggeris":        "Show a model paragraph (80-100 words) demonstrating correct structure, vocabulary and language features for this topic.",
    "Pendidikan Moral":       "Give a concrete real-life example that illustrates the moral value, then explain why it demonstrates that value (3-4 sentences).",
    "Prinsip Perakaunan":     "Show a step-by-step journal entry or ledger posting with labels and amounts.",
}

DEFAULT_FORMAT = "Give a step-by-step worked example a Form 4 or 5 student can follow to answer a question on this topic."

PROMPT_TEMPLATE = """\
You are an SPM tutor. Write a concise worked example for Malaysian secondary school students.

Subject: {subject} (Form {form_level})
Topic: {topic}

Format instruction: {format_hint}

Rules:
- Maximum 150 words
- Write in {language} only
- Be concrete — use actual numbers, names, or sample sentences, not placeholders
- Do NOT write an introduction or conclusion. Go straight into the example.
- Output ONLY the worked example text, nothing else."""


def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def generate(subject, topic, form_level, language):
    lang_label = "Bahasa Melayu" if language == "ms" else "English"
    prompt = PROMPT_TEMPLATE.format(
        subject=subject,
        form_level=form_level,
        topic=topic,
        format_hint=FORMAT_HINTS.get(subject, DEFAULT_FORMAT),
        language=lang_label,
    )
    try:
        response = call_llm(prompt, max_tokens=512)
        text = response.text
        if not text:
            log("  Provider returned empty response")
            return None
        return text.strip()
    except RuntimeError as e:
        log(f"  All providers failed: {e}")
        return None
    except Exception as e:
        log(f"  Unexpected error: {e}")
        return None


def main():
    force          = "--force"   in sys.argv
    dry_run        = "--dry-run" in sys.argv
    subject_filter = None
    if "--subject" in sys.argv:
        idx = sys.argv.index("--subject")
        if idx + 1 < len(sys.argv):
            subject_filter = sys.argv[idx + 1]

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    query = supabase.table("topic_anchors").select("id,subject,topic,language,form_level")
    if subject_filter:
        query = query.eq("subject", subject_filter)
    if not force:
        query = query.is_("worked_example", "null")
    rows = query.execute().data or []

    if not rows:
        log("Nothing to do — all worked examples seeded. Use --force to regenerate.")
        return

    total = len(rows)
    log(f"Seeding {total} worked example(s)" + (f" [{subject_filter}]" if subject_filter else "") + (" [DRY RUN]" if dry_run else ""))

    ok = fail = 0
    for i, row in enumerate(rows, 1):
        subject  = row.get("subject", "")
        topic    = row.get("topic", "")
        form     = row.get("form_level", 4)
        language = row.get("language", "English")
        log(f"[{i}/{total}] {subject} / {topic} / F{form} / {language}")

        if dry_run:
            print(PROMPT_TEMPLATE.format(
                subject=subject, form_level=form, topic=topic,
                format_hint=FORMAT_HINTS.get(subject, DEFAULT_FORMAT),
                language="Bahasa Melayu" if language == "ms" else "English",
            ))
            continue

        text = generate(subject, topic, form, language)
        if not text:
            log("  SKIP — LLM returned nothing")
            fail += 1
            continue

        try:
            supabase.table("topic_anchors").update({"worked_example": text}).eq("id", row["id"]).execute()
            log(f"  OK — {len(text)} chars")
            ok += 1
        except Exception as e:
            log(f"  DB error: {e}")
            fail += 1

    log(f"Done. {ok} OK, {fail} failed out of {total}.")


if __name__ == "__main__":
    main()
