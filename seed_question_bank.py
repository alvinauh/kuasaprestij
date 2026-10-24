#!/usr/bin/env python3
"""
Question-bank pre-seeder: generate N extra MCQ questions per (topic, language)
and store them in topic_anchors.question_bank for instant cache serving.

These questions are served as Q2/Q3 in free-practice sessions — zero Gemini cost
for students once the bank is populated.

Prerequisites:
  Run schema/question_bank.sql in Supabase SQL editor first:
  ALTER TABLE topic_anchors ADD COLUMN IF NOT EXISTS question_bank jsonb DEFAULT '[]'::jsonb;

Usage:
    python seed_question_bank.py                   # seed all topics (5 questions each)
    python seed_question_bank.py --count 3         # 3 questions per topic
    python seed_question_bank.py --subject Physics # one subject only
    python seed_question_bank.py --lang English    # one language only
    python seed_question_bank.py --delay 4         # slower pacing (free-tier quota)
    python seed_question_bank.py --dry-run         # preview without generating
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
    generator_node,
    supabase,
)

LANGUAGES = ["English", "Bahasa Melayu"]
PROGRESS_MD = Path(__file__).parent / "logs" / "question_bank_seed_progress.md"


def _check_column_exists() -> bool:
    try:
        supabase.table("topic_anchors").select("question_bank").limit(1).execute()
        return True
    except Exception as e:
        if "does not exist" in str(e) or "42703" in str(e):
            return False
        raise


def _fetch_existing_counts() -> dict:
    """Return {(topic, language): bank_size} for all rows that already have questions."""
    try:
        res = supabase.table("topic_anchors").select("topic, language, question_bank").execute()
        out = {}
        for row in (res.data or []):
            bank = row.get("question_bank") or []
            out[(row["topic"], row.get("language", "English"))] = len(bank)
        return out
    except Exception:
        return {}


def _build_state(subject: str, topic: str, lang: str) -> AgentState:
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
        h5p_content=None,
        topic_complete=False,
        next_topic=topic,
        error_category=None,
        root_cause=None,
        intervention_plan=None,
    )


def _append_to_bank(topic: str, language: str, question: dict, max_bank: int) -> int:
    """Append question to topic_anchors.question_bank. Returns new bank size."""
    res = supabase.table("topic_anchors") \
        .select("question_bank") \
        .eq("topic", topic) \
        .eq("language", language) \
        .execute()
    existing = (res.data[0].get("question_bank") or []) if res.data else []
    updated = (existing + [question])[-max_bank:]
    supabase.table("topic_anchors") \
        .update({"question_bank": updated}) \
        .eq("topic", topic) \
        .eq("language", language) \
        .execute()
    return len(updated)


def write_checkpoint(i: int, total: int, ok: int, skip: int, fail: int, subj: str, topic: str, lang: str):
    pct = round(i / total * 100)
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    block = (
        f"\n## {pct}% — {ts}\n"
        f"- Progress: {i}/{total}\n"
        f"- Generated: {ok} | Skipped (already full): {skip} | Failed: {fail}\n"
        f"- Last: `{subj} — {topic} ({lang})`\n"
    )
    PROGRESS_MD.parent.mkdir(exist_ok=True)
    with open(PROGRESS_MD, "a", encoding="utf-8") as f:
        f.write(block)
    print(f"[Checkpoint] {pct}% written to logs/question_bank_seed_progress.md")


def main():
    parser = argparse.ArgumentParser(description="Pre-seed question_bank for all KSSM topics.")
    parser.add_argument("--count", type=int, default=5,
                        help="Target number of bank questions per (topic, language) (default 5).")
    parser.add_argument("--delay", type=float, default=3.0,
                        help="Seconds between Gemini calls (default 3; use 5-10 on free tier).")
    parser.add_argument("--subject", default=None)
    parser.add_argument("--lang", default=None)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    # --- Preflight: check schema migration ---
    print("Checking Supabase schema...")
    if not _check_column_exists():
        print("\n" + "="*60)
        print("ERROR: question_bank column does not exist.")
        print("Run this SQL in your Supabase SQL editor first:")
        print()
        print("  ALTER TABLE topic_anchors")
        print("  ADD COLUMN IF NOT EXISTS question_bank jsonb DEFAULT '[]'::jsonb;")
        print()
        print(f"  URL: https://supabase.com/dashboard/project/opavfcpsxnntjylipbwl/editor")
        print("="*60 + "\n")
        sys.exit(1)
    print("  ✓ question_bank column exists.\n")

    langs = [args.lang] if args.lang else LANGUAGES
    subjects = KSSM_TOPICS if not args.subject else {args.subject: KSSM_TOPICS[args.subject]}

    if args.subject and args.subject not in KSSM_TOPICS:
        print(f"Unknown subject '{args.subject}'. Available: {', '.join(KSSM_TOPICS)}")
        sys.exit(1)

    print("Fetching existing question bank counts...")
    existing = _fetch_existing_counts()

    # Build work list: skip entries that already have enough questions
    work = []
    already_full = 0
    for subj, topics in subjects.items():
        for topic in topics:
            for lang in langs:
                current = existing.get((topic, lang), 0)
                needed = args.count - current
                if needed > 0:
                    work.append((subj, topic, lang, current, needed))
                else:
                    already_full += 1

    total_calls = sum(w[4] for w in work)
    print(f"Plan: {len(work)} topic/lang pairs need questions ({total_calls} Gemini calls), "
          f"{already_full} already have {args.count}+ questions.\n"
          f"Estimated time: ~{total_calls * (args.delay + 5) / 60:.0f} min at {args.delay}s delay.\n")

    if not work:
        print(f"Nothing to do — all topics have {args.count}+ bank questions.")
        return

    if args.dry_run:
        for subj, topic, lang, current, needed in work:
            print(f"  [DRY RUN] {subj} / {topic} ({lang}): {current} → {args.count}")
        return

    # Write run header
    PROGRESS_MD.parent.mkdir(exist_ok=True)
    with open(PROGRESS_MD, "a", encoding="utf-8") as f:
        f.write(f"\n# Question Bank Seed Run — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"- Target: {args.count} questions per topic/language\n")
        f.write(f"- Pairs to fill: {len(work)} ({total_calls} Gemini calls)\n")
        f.write(f"- Already full: {already_full}\n\n")

    ok = fail = skip = 0
    call_i = 0
    last_checkpoint_pct = 0

    for entry_i, (subj, topic, lang, current_count, needed) in enumerate(work, 1):
        print(f"[{entry_i}/{len(work)}] {subj} — {topic} ({lang}): generating {needed} question(s)...")
        for q_i in range(needed):
            call_i += 1
            try:
                state = _build_state(subj, topic, lang)
                state.update(retriever_node(state))
                state["student_history"] = ""  # non-adaptive
                state.update(generator_node(state))

                draft = state.get("draft")
                if draft:
                    new_size = _append_to_bank(topic, lang, draft, args.count)
                    print(f"  ✓ Q{q_i+1}/{needed} saved (bank now {new_size})")
                    ok += 1
                else:
                    print(f"  ✗ Q{q_i+1}/{needed} empty draft (rate limit?)")
                    fail += 1
            except Exception as e:
                print(f"  ✗ Q{q_i+1}/{needed} error: {e}")
                fail += 1

            if call_i < total_calls:
                time.sleep(args.delay)

        # Checkpoint at every 10%
        current_pct = call_i / total_calls * 100
        if current_pct >= last_checkpoint_pct + 10:
            last_checkpoint_pct = (int(current_pct) // 10) * 10
            write_checkpoint(call_i, total_calls, ok, skip, fail, subj, topic, lang)

    # Final entry
    with open(PROGRESS_MD, "a", encoding="utf-8") as f:
        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        f.write(f"\n## 100% — {ts}\n")
        f.write(f"- **Finished.** {ok} generated, {fail} failed (re-run to retry).\n")
    print(f"\nFinished. {ok} generated, {fail} failed.")


if __name__ == "__main__":
    main()
