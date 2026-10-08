"""Standalone backfill script — patches topic_anchors rows that have no object_lesson.
Run from the repo root:
  python backfill_object_lessons.py [--limit 20] [--concurrency 4]
"""
import argparse
import concurrent.futures
import json
import os
import sys

from dotenv import load_dotenv

load_dotenv()

# Patch sys.path so we can reuse the existing LLM client and Supabase init.
sys.path.insert(0, os.path.dirname(__file__))

from supabase import create_client
from agents.llm_client import call_llm

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def _generate_object_lesson(topic, subject, language, question, stimulus):
    lang_directive = (
        "Write in Bahasa Melayu." if any(k in language.lower() for k in ("malay", "melayu", "bm"))
        else "Write in Mandarin Chinese." if any(k in language.lower() for k in ("cina", "mandarin", "chinese", "中文"))
        else "Write in English."
    )
    stimulus_block = f"\nStimulus already in question: {stimulus[:200]}" if stimulus else ""
    prompt = f"""You are creating an experiential learning hook for Malaysian secondary school students.

Topic: {topic}
Subject: {subject}
Question: {question[:300]}{stimulus_block}

Task: Write 2-4 sentences set in a Malaysian student's everyday life that SHOWS the concept tested by this question in action, without naming or labelling the concept directly. Use concrete sensory details (what the student sees, hears, notices). Do NOT explain or define anything. The student should observe the phenomenon and naturally wonder about it.

{lang_directive}

Return ONLY a JSON object: {{"object_lesson": "..."}}"""
    try:
        res = call_llm(prompt, want_json=True, temperature=0.7, max_tokens=500, free_only=True)
        if not res or not res.text:
            return ""
        data = json.loads(res.text) if isinstance(res.text, str) else res.text
        if isinstance(data, list) and data:
            data = data[0]
        val = data.get("object_lesson") or ""
        # LLMs occasionally return a nested dict — extract first string value
        if isinstance(val, dict):
            val = next((v for v in val.values() if isinstance(v, str)), "") or str(val)
        return str(val).strip()
    except Exception as e:
        print(f"  [FAIL] LLM error for '{topic}': {e}")
        return ""


def _generate_prediction(topic, subject, language, object_lesson, question):
    """Generate a prediction challenge (question + 3 options + reveal) for a cached anchor question.
    Returns {} on any failure so callers can skip gracefully."""
    lang_directive = (
        "Write in Bahasa Melayu." if any(k in language.lower() for k in ("malay", "melayu", "bm"))
        else "Write in Mandarin Chinese." if any(k in language.lower() for k in ("cina", "mandarin", "chinese", "中文"))
        else "Write in English."
    )
    prompt = f"""You are creating a prediction challenge for Malaysian secondary students (15-18).

Scenario the student just watched: {object_lesson}
The MCQ about to follow is on: {topic} ({subject})
MCQ question preview: {question[:150]}

Task: Make a prediction challenge based ONLY on the observable scene — do NOT name or label the syllabus concept.

Rules:
- prediction_question: one short question (max 12 words) about what happens in the scene
- prediction_options: exactly 3 short options (max 8 words each), option at prediction_correct_index is correct, the others are plausible misconceptions
- prediction_correct_index: 0, 1, or 2
- prediction_reveal: 1-2 sentences explaining what actually happens (no concept label yet)

{lang_directive}

Return ONLY valid JSON (no markdown):
{{"prediction_question":"...","prediction_options":["...","...","..."],"prediction_correct_index":0,"prediction_reveal":"..."}}"""
    try:
        res = call_llm(prompt, want_json=True, temperature=0.7, max_tokens=400, free_only=True)
        if not res or not res.text:
            return {}
        data = json.loads(res.text) if isinstance(res.text, str) else res.text
        if isinstance(data, list) and data:
            data = data[0]
        pq = data.get("prediction_question") or ""
        po = data.get("prediction_options") or []
        pci = data.get("prediction_correct_index")
        pr = data.get("prediction_reveal") or ""
        if isinstance(pq, dict):
            pq = next((v for v in pq.values() if isinstance(v, str)), "") or str(pq)
        if isinstance(pr, dict):
            pr = next((v for v in pr.values() if isinstance(v, str)), "") or str(pr)
        pq = str(pq).strip()
        pr = str(pr).strip()
        po = [str(o).strip() for o in po] if isinstance(po, list) else []
        pci = int(pci) if pci is not None else 0
        if not pq or len(po) != 3:
            return {}
        return {
            "prediction_question": pq,
            "prediction_options": po,
            "prediction_correct_index": pci,
            "prediction_reveal": pr,
        }
    except Exception as e:
        print(f"  [FAIL] LLM error (prediction) for '{topic}': {e}")
        return {}


def _patch_row(row):
    aq = row["anchor_question"]
    ol = _generate_object_lesson(
        topic=row["topic"],
        subject=row.get("subject") or "",
        language=row.get("language") or "English",
        question=aq.get("question") or "",
        stimulus=aq.get("stimulus") or "",
    )
    if not ol:
        print(f"  [SKIP] No object_lesson generated for '{row['topic']}'")
        return False
    updated_aq = {**aq, "object_lesson": ol}
    try:
        supabase.table("topic_anchors") \
            .update({"anchor_question": updated_aq}) \
            .eq("topic", row["topic"]) \
            .eq("language", row.get("language") or "English") \
            .eq("form_level", row.get("form_level") or 4) \
            .execute()
        print(f"  [OK]   '{row['topic']}' ({row.get('language')}) → {ol[:60]}...")
        return True
    except Exception as e:
        print(f"  [FAIL] DB write for '{row['topic']}': {e}")
        return False


def _patch_prediction_row(row):
    """Second-pass: generate and patch prediction fields for rows that have object_lesson but no prediction_question."""
    aq = row["anchor_question"]
    pred = _generate_prediction(
        topic=row["topic"],
        subject=row.get("subject") or "",
        language=row.get("language") or "English",
        object_lesson=aq.get("object_lesson") or "",
        question=aq.get("question") or "",
    )
    if not pred:
        print(f"  [SKIP] No prediction generated for '{row['topic']}'")
        return False
    updated_aq = {**aq, **pred}
    try:
        supabase.table("topic_anchors") \
            .update({"anchor_question": updated_aq}) \
            .eq("topic", row["topic"]) \
            .eq("language", row.get("language") or "English") \
            .eq("form_level", row.get("form_level") or 4) \
            .execute()
        print(f"  [OK]   '{row['topic']}' ({row.get('language')}) prediction → {pred['prediction_question'][:60]}...")
        return True
    except Exception as e:
        print(f"  [FAIL] DB write (prediction) for '{row['topic']}': {e}")
        return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=20)
    ap.add_argument("--concurrency", type=int, default=4)
    args = ap.parse_args()

    print(f"Scanning all topic_anchors for missing object_lesson (patch up to {args.limit})…")
    PAGE = 200
    rows = []
    offset = 0
    while True:
        res = supabase.table("topic_anchors") \
            .select("id,topic,subject,language,form_level,anchor_question") \
            .not_.is_("anchor_question", "null") \
            .range(offset, offset + PAGE - 1) \
            .execute()
        page = res.data or []
        rows.extend(page)
        if len(page) < PAGE:
            break
        offset += PAGE

    to_patch = [
        r for r in rows
        if r.get("anchor_question", {}).get("question")
        and not (r.get("anchor_question", {}).get("object_lesson") or "").strip()
    ][:args.limit]

    missing_count = sum(
        1 for r in rows
        if r.get("anchor_question", {}).get("question")
        and not (r.get("anchor_question", {}).get("object_lesson") or "").strip()
    )
    print(f"Scanned {len(rows)} rows; {missing_count} missing object_lesson; patching {len(to_patch)}.\n")

    if not to_patch:
        print("Nothing to patch in this batch (Pass 1).")
    else:
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.concurrency) as pool:
            results = list(pool.map(_patch_row, to_patch))

        patched = sum(1 for r in results if r)
        failed = len(results) - patched
        print(f"\nPass 1 done — patched={patched}  failed={failed}  batch_size={len(to_patch)}")
        if len(to_patch) == args.limit:
            print("Pass 1 batch was full — run again to continue.")

    # ── Pass 2: backfill prediction fields ──────────────────────────────────────
    # Re-fetch rows (Pass 1 may have just written object_lesson into some)
    print(f"\nScanning topic_anchors for missing prediction_question (patch up to {args.limit})…")
    rows2 = []
    offset = 0
    while True:
        res = supabase.table("topic_anchors") \
            .select("id,topic,subject,language,form_level,anchor_question") \
            .not_.is_("anchor_question", "null") \
            .range(offset, offset + PAGE - 1) \
            .execute()
        page = res.data or []
        rows2.extend(page)
        if len(page) < PAGE:
            break
        offset += PAGE

    to_patch2 = [
        r for r in rows2
        if (r.get("anchor_question", {}).get("object_lesson") or "").strip()
        and r.get("anchor_question", {}).get("question")
        and not (r.get("anchor_question", {}).get("prediction_question") or "").strip()
    ][:args.limit]

    missing2 = sum(
        1 for r in rows2
        if (r.get("anchor_question", {}).get("object_lesson") or "").strip()
        and r.get("anchor_question", {}).get("question")
        and not (r.get("anchor_question", {}).get("prediction_question") or "").strip()
    )
    print(f"Scanned {len(rows2)} rows; {missing2} missing prediction_question; patching {len(to_patch2)}.\n")

    if not to_patch2:
        print("Nothing to patch in this batch (Pass 2).")
    else:
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.concurrency) as pool:
            results2 = list(pool.map(_patch_prediction_row, to_patch2))

        patched2 = sum(1 for r in results2 if r)
        failed2 = len(results2) - patched2
        print(f"\nPass 2 done — patched={patched2}  failed={failed2}  batch_size={len(to_patch2)}")
        if len(to_patch2) == args.limit:
            print("Pass 2 batch was full — run again to continue.")


if __name__ == "__main__":
    main()
