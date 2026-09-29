#!/usr/bin/env python3
"""Standalone backfill: add object_lesson to topic_anchors rows that are missing it.
Run from the repo root:  python scripts/backfill_object_lessons.py
Repeat until the script prints 'All done'."""

import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv
load_dotenv()

from supabase import create_client
from agents.llm_client import call_llm

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

BATCH = int(os.environ.get("BACKFILL_BATCH", "20"))
CONCURRENCY = int(os.environ.get("BACKFILL_CONCURRENCY", "4"))


def generate_object_lesson(topic: str, subject: str, language: str, question: str, stimulus: str) -> str:
    lang_directive = (
        "Write in Bahasa Melayu." if any(k in language.lower() for k in ("malay", "melayu", "bm"))
        else "Write in Mandarin Chinese." if any(k in language.lower() for k in ("cina", "mandarin", "chinese", "中文"))
        else "Write in English."
    )
    stimulus_block = f"\nStimulus already in question: {stimulus}" if stimulus else ""
    prompt = f"""You are creating an experiential learning hook for Malaysian secondary school students.

Topic: {topic}
Subject: {subject}
Question: {question}{stimulus_block}

Task: Write 2-4 sentences set in a Malaysian student's everyday life that SHOWS the concept tested by this question in action, without naming or labelling the concept directly. Use concrete sensory details (what the student sees, hears, notices). Do NOT explain or define anything. The student should observe the phenomenon and naturally wonder about it.

{lang_directive}

Return ONLY a JSON object: {{"object_lesson": "..."}}"""
    try:
        res = call_llm(prompt, want_json=True, temperature=0.7, max_tokens=350, free_only=True)
        if not res or not res.text:
            return ""
        raw = res.text
        data = json.loads(raw) if isinstance(raw, str) else raw
        if isinstance(data, list) and data:
            data = data[0]
        ol = data.get("object_lesson") or ""
        if isinstance(ol, dict):
            ol = ol.get("text") or ol.get("content") or ol.get("scene") or ""
        return str(ol).strip()
    except Exception as e:
        # Regex salvage for truncated JSON
        raw = getattr(res, "text", "") if "res" in dir() else ""
        if isinstance(raw, str):
            import re as _re
            m = _re.search(r'"object_lesson"\s*:\s*"(.*?)(?:"|$)', raw, _re.DOTALL)
            if m and len(m.group(1)) > 20:
                return m.group(1).replace('\\"', '"').strip()
        print(f"  [LLM error] {topic}: {e}")
        return ""


def patch_row(row: dict) -> bool:
    aq = row.get("anchor_question") or {}
    ol = generate_object_lesson(
        topic=row["topic"],
        subject=row.get("subject") or "",
        language=row.get("language") or "English",
        question=aq.get("question") or "",
        stimulus=aq.get("stimulus") or "",
    )
    if not ol:
        print(f"  [skip] {row['topic']} — no object_lesson generated")
        return False
    updated_aq = {**aq, "object_lesson": ol}
    try:
        supabase.table("topic_anchors") \
            .update({"anchor_question": updated_aq}) \
            .eq("topic", row["topic"]) \
            .eq("language", row.get("language") or "English") \
            .eq("form_level", row.get("form_level") or 4) \
            .execute()
        print(f"  [ok] {row['topic']} ({row.get('language')}, form {row.get('form_level')})")
        return True
    except Exception as e:
        print(f"  [DB error] {row['topic']}: {e}")
        return False


def main():
    total_patched = 0
    round_num = 0
    while True:
        round_num += 1
        res = supabase.table("topic_anchors") \
            .select("id,topic,subject,language,form_level,anchor_question") \
            .not_.is_("anchor_question", "null") \
            .limit(BATCH * 3) \
            .execute()
        rows = res.data or []
        to_patch = [
            r for r in rows
            if r.get("anchor_question", {}).get("question")
            and not (r.get("anchor_question", {}).get("object_lesson") or "").strip()
        ][:BATCH]

        if not to_patch:
            print(f"\nAll done — {total_patched} rows patched total.")
            break

        print(f"\nRound {round_num}: {len(to_patch)} rows to patch (found {len(rows)} total, {len(rows)-len(to_patch)} already have object_lesson)")
        with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
            results = list(pool.map(patch_row, to_patch))

        patched = sum(1 for r in results if r)
        failed = sum(1 for r in results if not r)
        total_patched += patched
        print(f"Round {round_num} done: {patched} patched, {failed} failed. Total so far: {total_patched}")

        if len(to_patch) < BATCH:
            print(f"\nAll done — {total_patched} rows patched total.")
            break

        time.sleep(2)  # brief pause between rounds to respect rate limits


if __name__ == "__main__":
    main()
