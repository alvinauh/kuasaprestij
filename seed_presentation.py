#!/usr/bin/env python3
"""
Presentation pre-seeder: warm up topic_anchors for a live demo.

Run this 30+ minutes before your presentation to cache all anchor questions.
Once seeded, Anchor Mode serves directly from Supabase — zero LLM calls during
the demo.

Usage:
    python seed_presentation.py              # seed all DEMO_TOPICS below
    python seed_presentation.py --check      # show what's cached vs missing
    python seed_presentation.py --all        # seed ALL KSSM topics (slow)
    python seed_presentation.py --form 4     # restrict to Form 4
    python seed_presentation.py --lang "Bahasa Melayu"  # one language only
"""

import argparse
import sys
import os
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from agents.orchestrator import (
    AgentState,
    KSSM_TOPICS_BY_FORM,
    KSSM_TOPICS,
    retriever_node,
    studio_node,
    supabase,
)

# ---------------------------------------------------------------------------
# Curated demo subset — covers enough breadth for a typical presentation.
# Edit this list to match the topics you plan to demonstrate.
# ---------------------------------------------------------------------------
DEMO_TOPICS: dict[str, list[str]] = {
    "Physics": [
        "Daya dan Gerakan",
        "Kerja, Tenaga dan Kuasa",
        "Tekanan",
        "Haba",
    ],
    "Chemistry": [
        "Jirim",
        "Struktur Atom",
        "Jadual Berkala",
        "Tindak Balas Kimia",
    ],
    "Biology": [
        "Sel",
        "Nutrisi",
        "Respirasi",
        "Pembiakbakaan",
    ],
    "Mathematics": [
        "Fungsi",
        "Kuadratik",
        "Indeks dan Logaritma",
        "Geometri Koordinat",
    ],
    "Bahasa Melayu": [
        "Tatabahasa",
        "Pemahaman",
        "Penulisan Karangan",
    ],
    "Bahasa Inggeris": [
        "Grammar",
        "Reading Comprehension",
        "Writing",
    ],
}

DEMO_LANGUAGES = ["English", "Bahasa Melayu"]
DEMO_FORM = 4


def fetch_cached() -> set:
    """Return set of (topic, language, form_level) already in topic_anchors."""
    res = supabase.table("topic_anchors").select("topic, language, form_level").execute()
    return {
        (r["topic"], r.get("language", "English"), r.get("form_level", 4))
        for r in (res.data or [])
    }


def build_state(subject: str, topic: str, lang: str, form_level: int) -> AgentState:
    return AgentState(
        student_id="00000000-0000-0000-0000-000000000001",
        topic=topic,
        subject=subject,
        language=lang,
        form_level=form_level,
        is_adaptive=False,
        student_answer="",
        student_history=[],
        answered_count=0,
        target_kbat="",
        draft={},
        question={},
        is_correct=False,
        partial_credit=0.0,
        feedback="",
        teacher_action_plan="",
        mastery_score=0.5,
        session_id=None,
    )


def seed_one(subject: str, topic: str, lang: str, form_level: int) -> bool:
    try:
        state = build_state(subject, topic, lang, form_level)
        state = retriever_node(state)
        state = studio_node(state)
        if state.get("draft"):
            print(f"  ✓ {subject} / {topic} ({lang}, F{form_level})")
            return True
        print(f"  ✗ {subject} / {topic} ({lang}, F{form_level}) — studio_node returned no draft")
        return False
    except Exception as e:
        print(f"  ✗ {subject} / {topic} ({lang}, F{form_level}) — {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Pre-seed topic_anchors for a presentation.")
    parser.add_argument("--check", action="store_true", help="Show cache status without generating")
    parser.add_argument("--all", action="store_true", help="Seed all KSSM topics (slow)")
    parser.add_argument("--form", type=int, choices=[4, 5], default=None, help="Restrict to a form level")
    parser.add_argument("--lang", default=None, help="Restrict to one language")
    parser.add_argument("--delay", type=float, default=2.0, help="Seconds between calls (default 2)")
    args = parser.parse_args()

    # Build the work list
    if args.all:
        topic_map = {}
        target_form = args.form or DEMO_FORM
        if args.form:
            topic_map = KSSM_TOPICS_BY_FORM.get(args.form, {})
        else:
            topic_map = KSSM_TOPICS
    else:
        topic_map = DEMO_TOPICS

    langs = [args.lang] if args.lang else DEMO_LANGUAGES
    form_level = args.form or DEMO_FORM

    work_list = [
        (subj, topic, lang, form_level)
        for subj, topics in topic_map.items()
        for topic in topics
        for lang in langs
    ]

    print(f"\n{'─'*60}")
    print(f"  KuasaPrestij Presentation Pre-Seeder")
    print(f"  {len(work_list)} topic×language pairs to check")
    print(f"{'─'*60}\n")

    cached = fetch_cached()
    missing = [(s, t, l, f) for s, t, l, f in work_list if (t, l, f) not in cached]
    already = len(work_list) - len(missing)

    print(f"  Already cached: {already}/{len(work_list)}")
    print(f"  Need to generate: {len(missing)}\n")

    if args.check:
        if missing:
            print("Missing anchors:")
            for s, t, l, f in missing:
                print(f"  - {s} / {t} ({l}, F{f})")
        else:
            print("  All demo topics are cached. Ready for presentation!")
        return

    if not missing:
        print("  All demo topics are already cached.")
        print("  You're ready to present! Set PRESENTATION_MODE=1 as a safety net.\n")
        return

    print(f"  Generating {len(missing)} missing anchors...")
    print(f"  (delay={args.delay}s between calls to respect free-tier limits)\n")

    ok, fail = 0, 0
    for i, (subj, topic, lang, form) in enumerate(missing, 1):
        print(f"[{i}/{len(missing)}] {subj} / {topic} ({lang}, F{form})")
        if seed_one(subj, topic, lang, form):
            ok += 1
        else:
            fail += 1
        if i < len(missing):
            time.sleep(args.delay)

    print(f"\n{'─'*60}")
    print(f"  Done: {ok} seeded, {fail} failed, {already} already cached")
    if fail == 0:
        print("  All demo topics are now cached. You're ready to present!")
        print("  TIP: Set PRESENTATION_MODE=1 in .env as a safety net for any")
        print("       adaptive-mode or evaluation LLM calls during the demo.")
    else:
        print(f"  {fail} topics failed — run again or set PRESENTATION_MODE=1 in .env")
    print(f"{'─'*60}\n")


if __name__ == "__main__":
    main()
