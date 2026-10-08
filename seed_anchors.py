#!/usr/bin/env python3
"""
Anchor pre-seeder: generate and cache studio_node anchor questions for all
KSSM_TOPICS × LANGUAGES that are not yet in topic_anchors.

Usage:
    python seed_anchors.py                    # seed everything missing
    python seed_anchors.py --dry-run          # print plan without calling Gemini
    python seed_anchors.py --delay 5          # slower pacing for free-tier quota
    python seed_anchors.py --subject Physics  # seed one subject only
    python seed_anchors.py --lang "Bahasa Melayu"  # seed one language only
"""

import argparse
import sys
import time
import os
from datetime import datetime
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from agents.orchestrator import (
    AgentState,
    KSSM_TOPICS,
    retriever_node,
    studio_node,
    supabase,
)

LANGUAGES = ["English", "Bahasa Melayu"]

PROGRESS_MD = Path(__file__).parent / "logs" / "seed_progress.md"


def write_checkpoint(i: int, total: int, ok: int, fail: int, subj: str, topic: str, lang: str):
    pct = round(i / total * 100)
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    block = (
        f"\n## {pct}% — {ts}\n"
        f"- Progress: {i}/{total}\n"
        f"- Succeeded: {ok} | Failed: {fail}\n"
        f"- Last: `{subj} — {topic} ({lang})`\n"
    )
    PROGRESS_MD.parent.mkdir(exist_ok=True)
    with open(PROGRESS_MD, "a", encoding="utf-8") as f:
        f.write(block)
    print(f"[Checkpoint] {pct}% written to logs/seed_progress.md")


def fetch_cached_pairs():
    """Return a set of (topic, language) already in topic_anchors."""
    res = supabase.table("topic_anchors").select("topic, language").execute()
    return {(row["topic"], row.get("language", "English")) for row in (res.data or [])}


def build_state(subject: str, topic: str, lang: str) -> AgentState:
    return AgentState(
        student_id="00000000-0000-0000-0000-000000000001",
        topic=topic,
        subject=subject,
        language=lang,
        is_adaptive=False,
        question_type="mcq",
        context="",
        student_history="",
        draft=None,
        student_answer=None,
        is_correct=False,
        partial_credit=None,
        mastery_score=0.0,
        feedback="",
        teacher_action_plan="",
        mnemonic_lyrics=None,
        media_url=None,
        video_broll=None,
        topic_complete=False,
        next_topic=topic,
        error_category=None,
        root_cause=None,
        intervention_plan=None,
    )


def main():
    parser = argparse.ArgumentParser(description="Pre-seed topic_anchors for all KSSM topics.")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print what would be generated without calling Gemini.")
    parser.add_argument("--delay", type=float, default=3.0,
                        help="Seconds between Gemini calls (default 3; use 5-10 on free tier).")
    parser.add_argument("--subject", default=None,
                        help="Seed only this subject (e.g. 'Physics').")
    parser.add_argument("--lang", default=None,
                        help="Seed only this language (e.g. 'Bahasa Melayu').")
    args = parser.parse_args()

    langs = [args.lang] if args.lang else LANGUAGES

    subjects = KSSM_TOPICS
    if args.subject:
        if args.subject not in KSSM_TOPICS:
            print(f"Unknown subject '{args.subject}'. Available: {', '.join(KSSM_TOPICS)}")
            sys.exit(1)
        subjects = {args.subject: KSSM_TOPICS[args.subject]}

    print("Fetching existing topic_anchors...")
    cached = fetch_cached_pairs()
    print(f"  {len(cached)} anchor(s) already cached.\n")

    work = [
        (subj, topic, lang)
        for subj, topics in subjects.items()
        for topic in topics
        for lang in langs
        if (topic, lang) not in cached
    ]

    total = len(work)
    already_done = sum(
        1
        for subj, topics in subjects.items()
        for topic in topics
        for lang in langs
        if (topic, lang) in cached
    )

    print(f"Plan: {total} to generate, {already_done} already cached, "
          f"~{total * (args.delay + 5) / 60:.0f} min estimated at {args.delay}s delay.\n")

    if not work:
        print("Nothing to do — all anchors already cached.")
        return

    if args.dry_run:
        for subj, topic, lang in work:
            print(f"  [DRY RUN] {subj} / {topic} / {lang}")
        return

    # Write run header to progress MD
    PROGRESS_MD.parent.mkdir(exist_ok=True)
    with open(PROGRESS_MD, "a", encoding="utf-8") as f:
        f.write(f"\n# Seed Run — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"- Total to generate: {total}\n")
        f.write(f"- Already cached: {already_done}\n\n")

    ok = fail = 0
    last_checkpoint = 0
    for i, (subj, topic, lang) in enumerate(work, 1):
        print(f"[{i}/{total}] {subj} — {topic} ({lang})")
        try:
            state = build_state(subj, topic, lang)
            state.update(retriever_node(state))
            result = studio_node(state)

            if result.get("draft"):
                print(f"  ✓ cached")
                ok += 1
            else:
                print(f"  ✗ empty draft (rate limit or generation error — will retry on next run)")
                fail += 1
        except Exception as e:
            print(f"  ✗ error: {e}")
            fail += 1

        # Write MD checkpoint at every 10% milestone
        current_pct = i / total * 100
        if current_pct >= last_checkpoint + 10:
            last_checkpoint = (int(current_pct) // 10) * 10
            write_checkpoint(i, total, ok, fail, subj, topic, lang)

        if i < total:
            time.sleep(args.delay)

    # Final entry
    with open(PROGRESS_MD, "a", encoding="utf-8") as f:
        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        f.write(f"\n## 100% — {ts}\n")
        f.write(f"- **Finished.** {ok} seeded, {fail} failed.\n")
    print(f"\nFinished. {ok} seeded, {fail} failed (re-run to retry failures).")


if __name__ == "__main__":
    main()
