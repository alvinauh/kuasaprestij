#!/usr/bin/env python3
"""
Backfill h5p_content for all topic_anchors rows that have audio_url + video_broll
but are missing h5p_content.

No API calls — _build_h5p_content is pure Python.
Safe to re-run: skips rows that already have h5p_content.

Usage:
    python3 backfill_h5p.py            # backfill all gaps
    python3 backfill_h5p.py --dry-run  # print what would change
"""

import argparse
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dotenv import load_dotenv
load_dotenv(override=True)

from supabase import create_client, Client
from agents.orchestrator import _build_h5p_content

supabase: Client = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))


def fetch_rows():
    res = supabase.table("topic_anchors").select(
        "id, topic, language, anchor_question, audio_url, video_broll, h5p_content"
    ).execute()
    return res.data or []


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=0,
                        help="Stop after processing this many rows (0 = no limit).")
    args = parser.parse_args()

    print("Fetching topic_anchors rows...")
    rows = fetch_rows()
    print(f"  {len(rows)} total rows.\n")

    needs_backfill = [
        r for r in rows
        if r.get("audio_url")
        and r.get("video_broll")
        and r.get("anchor_question")
        and not r.get("h5p_content")
    ]

    already_done = sum(1 for r in rows if r.get("h5p_content"))
    missing_media = len(rows) - already_done - len(needs_backfill)

    print(f"  {already_done} already have h5p_content — skipping.")
    print(f"  {missing_media} missing audio/video — cannot backfill (run seed_anchors_claude.py).")
    print(f"  {len(needs_backfill)} need h5p_content backfill.\n")

    if not needs_backfill:
        print("Nothing to do.")
        return

    batch = needs_backfill[:args.limit] if args.limit else needs_backfill
    if args.limit:
        print(f"Running first {len(batch)} of {len(needs_backfill)} (--limit {args.limit}).\n")

    ok = fail = 0
    for i, row in enumerate(batch, 1):
        topic = row["topic"]
        lang  = row.get("language", "English")
        aq    = row["anchor_question"] or {}
        print(f"[{i}/{len(needs_backfill)}] {topic} ({lang})", end=" ... ")

        try:
            h5p = _build_h5p_content(
                video_url=row["video_broll"],
                audio_url=row["audio_url"],
                question_text=aq.get("question", ""),
                options=aq.get("options", []),
            )
            if args.dry_run:
                print("[DRY] would write h5p_content")
                ok += 1
                continue
            supabase.table("topic_anchors").update({"h5p_content": h5p}).eq("id", row["id"]).execute()
            print("done")
            ok += 1
        except Exception as e:
            print(f"FAILED: {e}")
            fail += 1

    remaining = len(needs_backfill) - len(batch)
    print(f"\nFinished. {ok} backfilled, {fail} failed.", end="")
    if remaining:
        print(f" ({remaining} rows still pending — re-run without --limit to finish.)")
    else:
        print()


if __name__ == "__main__":
    main()
