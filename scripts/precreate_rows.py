#!/usr/bin/env python3
"""
Pre-create missing topic_anchors rows so the question-bank seeder's UPDATE
(_append_to_bank, keyed on topic+language) actually persists.

Why: seed_question_bank.py appends to an EXISTING row via
    .update({...}).eq("topic", t).eq("language", l)
If no row exists for a (topic, language) pair, the UPDATE matches zero rows and
the question is silently lost — yet the seeder still counts it as "ok". This
script closes that gap by inserting minimal container rows (question_bank=[])
for every (topic, language) pair the seeder will target but that is absent.

Safe/idempotent: only inserts pairs that are missing; never modifies existing
rows. Read this as evidence-integrity prep, not data mutation of real content.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(override=True)

from agents.orchestrator import KSSM_TOPICS, KSSM_TOPICS_BY_FORM, supabase

LANGUAGES = ["English", "Bahasa Melayu"]


def _topic_form_map() -> dict:
    """(subject, topic) -> form_level, from KSSM_TOPICS_BY_FORM."""
    m = {}
    for form, subjects in KSSM_TOPICS_BY_FORM.items():
        for subj, topics in subjects.items():
            for t in topics:
                m[(subj, t)] = form
    return m


def main():
    dry = "--dry-run" in sys.argv
    form_map = _topic_form_map()

    res = supabase.table("topic_anchors").select("topic, language").execute()
    existing = {(r["topic"], r.get("language", "English")) for r in (res.data or [])}

    to_create = []
    for subj, topics in KSSM_TOPICS.items():
        for topic in topics:
            for lang in LANGUAGES:
                if (topic, lang) not in existing:
                    to_create.append({
                        "topic": topic,
                        "subject": subj,
                        "language": lang,
                        "form_level": form_map.get((subj, topic), 4),
                        "question_bank": [],
                    })

    print(f"Missing (topic, language) rows to create: {len(to_create)}")
    for row in to_create:
        print(f"  + {row['subject']:22} | {row['topic'][:34]:34} | {row['language']}")

    if dry:
        print("\n[DRY RUN] Nothing inserted.")
        return
    if not to_create:
        print("Nothing to create — all target pairs already have a row.")
        return

    created = 0
    for row in to_create:
        try:
            supabase.table("topic_anchors").insert(row).execute()
            created += 1
        except Exception as e:
            print(f"  ! failed to insert {row['subject']}/{row['topic']} ({row['language']}): {e}")
    print(f"\nCreated {created}/{len(to_create)} rows.")


if __name__ == "__main__":
    main()
