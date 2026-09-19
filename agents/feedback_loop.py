"""
feedback_loop.py — Background agent that processes pending user_feedback rows.

Decision matrix per feedback row:
  score < 0.6                          → regenerate_lesson + new quiz
  score 0.6-0.8 OR has suggestions     → regenerate_quiz (potentially different difficulty)
  score >= 0.8 and no suggestions      → no_action (mark processed, no regen)
"""

import os
import json
import argparse
from typing import Optional
from supabase import create_client, Client
from dotenv import load_dotenv
from agents.llm_client import call_llm


load_dotenv(override=True)

supabase: Client = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))


def _resolve_lesson_meta(quiz_id: Optional[str], lesson_id: Optional[str]) -> dict:
    """Return {topic, subject, form_level, language, lesson_id} from quiz or lesson row."""
    meta = {}

    if lesson_id:
        res = supabase.table("generated_lessons").select("*").eq("id", lesson_id).execute()
        if res.data:
            row = res.data[0]
            meta = {
                "lesson_id": row["id"],
                "topic": row["topic"],
                "subject": row["subject"],
                "form_level": row["form_level"],
                "language": row.get("language", "English"),
            }
    elif quiz_id:
        qres = supabase.table("quizzes").select("*").eq("id", quiz_id).execute()
        if qres.data:
            q = qres.data[0]
            if not q.get("lesson_id"):
                print(f"   [meta] Quiz {quiz_id} is orphaned (lesson_id=null) — marking no_action.")
                return {"_orphaned": True}
            meta["lesson_id"] = q.get("lesson_id")
            meta["topic"] = q.get("topic")
            meta["language"] = q.get("language", "English")
            if meta["lesson_id"]:
                lres = supabase.table("generated_lessons").select("*").eq("id", meta["lesson_id"]).execute()
                if lres.data:
                    l = lres.data[0]
                    meta["subject"] = l["subject"]
                    meta["form_level"] = l["form_level"]

    return meta


def analyse_feedback(row: dict) -> dict:
    """Ask Gemini to diagnose feedback and recommend an action. Returns diagnosis dict."""
    score = row.get("test_score")
    suggestions = row.get("suggested_improvements", "") or ""
    raw = row.get("raw_payload") or {}

    prompt = f"""You are an educational quality analyst for a Malaysian secondary school (KSSM) AI tutoring platform.

A student or teacher submitted feedback on a lesson/quiz:
- Test score (0.0–1.0): {score}
- Suggested improvements: <user_input>{suggestions[:500]}</user_input>
- Additional payload (truncated): <user_input>{json.dumps(raw, ensure_ascii=False)[:400]}</user_input>

Diagnose the feedback and recommend a corrective action.

Return ONLY a JSON object:
{{
  "diagnosis": "1-2 sentence summary of the issue",
  "feedback_type": "conceptual_gap | difficulty_mismatch | language_issue | positive | other",
  "recommended_action": "regenerate_lesson | regenerate_quiz | adjust_difficulty | no_action",
  "target_difficulty": "easy | medium | hard",
  "focus_areas": ["specific concept or skill to emphasise in regenerated content"]
}}

Rules:
- "regenerate_lesson" only when the notes themselves are flawed or score < 0.6.
- "adjust_difficulty" when score gap vs difficulty is obvious (e.g. score < 0.5 on easy quiz).
- "no_action" when score >= 0.8 and suggestions are empty or purely positive.
- target_difficulty must always be one of easy | medium | hard."""

    for attempt in range(3):
        try:
            res = call_llm(prompt, role="light", want_json=True, temperature=0.2)
            data = json.loads(res.text)
            if isinstance(data, list):
                data = data[0] if data else {}
            return data
        except Exception as e:
            is_rate_limit = "429" in str(e) or "rate" in str(e).lower()
            if is_rate_limit and attempt < 2:
                wait = 8 * (attempt + 1)
                print(f"   [analyse] Rate limited — retrying in {wait}s (attempt {attempt + 1}/3)")
                import time; time.sleep(wait)
                continue
            print(f"   [analyse] LLM error: {e}")
            return {"recommended_action": "no_action", "diagnosis": f"Analysis failed: {e}"}
    return {"recommended_action": "no_action", "diagnosis": "Analysis failed after 3 retries"}


def act_on_diagnosis(diagnosis: dict, meta: dict, quiz_id: Optional[str]) -> dict:
    """Execute the recommended action. Returns a summary dict."""
    from agents.lesson_agent import generate_lesson
    from agents.quiz_agent import generate_quiz

    action = diagnosis.get("recommended_action", "no_action")
    difficulty = diagnosis.get("target_difficulty", "medium")
    topic = meta.get("topic")
    subject = meta.get("subject")
    form_level = meta.get("form_level")
    language = meta.get("language", "English")
    lesson_id = meta.get("lesson_id")

    result = {"action_taken": action}

    if action == "no_action":
        print(f"   [act] No action needed.")
        return result

    # Lesson regeneration — always produces a fresh lesson + quiz
    if action == "regenerate_lesson":
        if not (topic and subject and form_level):
            print("   [act] Cannot regenerate lesson — missing topic/subject/form_level metadata.")
            result["action_taken"] = "no_action"
            return result

        print(f"   [act] Regenerating lesson for '{topic}' ({subject} F{form_level})…")
        lesson = generate_lesson(topic, subject, form_level, language)
        if not lesson:
            print("   [act] Lesson generation failed.")
            result["action_taken"] = "failed"
            return result

        new_lesson_id = lesson.get("id")
        notes = lesson.get("notes_content") or lesson.get("notes_markdown", "")
        if notes:
            quiz = generate_quiz(
                lesson_id=new_lesson_id,
                notes_content=notes,
                topic=topic,
                num_questions=5,
                difficulty=difficulty,
                language=language,
            )
            result["new_lesson_id"] = new_lesson_id
            result["new_quiz_id"] = quiz.get("id")
        return result

    # Quiz-only regeneration (regenerate_quiz | adjust_difficulty)
    if action in ("regenerate_quiz", "adjust_difficulty"):
        notes_content = None
        if lesson_id:
            lres = supabase.table("generated_lessons").select("notes_content").eq("id", lesson_id).execute()
            if lres.data:
                notes_content = lres.data[0].get("notes_content")

        if not notes_content:
            print("   [act] No notes found to regenerate quiz from.")
            result["action_taken"] = "failed"
            return result

        print(f"   [act] Regenerating quiz at difficulty '{difficulty}'…")
        quiz = generate_quiz(
            lesson_id=lesson_id,
            notes_content=notes_content,
            topic=topic,
            num_questions=5,
            difficulty=difficulty,
            language=language,
        )
        result["new_quiz_id"] = quiz.get("id")
        return result

    return result


def process_one(row: dict) -> bool:
    """Process a single feedback row. Returns True on success."""
    fid = row["id"]
    score = row.get("test_score")
    print(f"\n[FeedbackLoop] Processing {fid} | score={score}")

    meta = _resolve_lesson_meta(row.get("quiz_id"), row.get("lesson_id"))
    if not meta or meta.get("_orphaned"):
        reason = "orphaned_quiz" if (meta or {}).get("_orphaned") else "unresolvable_metadata"
        print(f"   [skip] {reason} — marking no_action.")
        _mark(fid, "processed", {"reason": reason, "_feedback_loop": {"diagnosis": {}, "outcome": {"action_taken": "no_action"}}})
        return False

    diagnosis = analyse_feedback(row)
    print(f"   [diagnosis] {diagnosis.get('recommended_action')} — {diagnosis.get('diagnosis', '')[:120]}")

    outcome = act_on_diagnosis(diagnosis, meta, row.get("quiz_id"))

    payload_update = {
        **(row.get("raw_payload") or {}),
        "_feedback_loop": {
            "diagnosis": diagnosis,
            "outcome": outcome,
        },
    }
    _mark(fid, "processed", payload_update)
    print(f"   [done] Marked processed. outcome={outcome}")
    return True


def _mark(feedback_id: str, status: str, raw_payload: dict):
    try:
        supabase.table("user_feedback").update(
            {"status": status, "raw_payload": raw_payload}
        ).eq("id", feedback_id).execute()
    except Exception as e:
        print(f"   [mark] Supabase update error: {e}")


def process_pending_batch(batch_size: int = 10) -> int:
    """Fetch up to batch_size pending rows and process each. Returns count processed."""
    try:
        res = supabase.table("user_feedback")\
            .select("*")\
            .eq("status", "pending")\
            .order("created_at")\
            .limit(batch_size)\
            .execute()
    except Exception as e:
        print(f"[FeedbackLoop] Supabase fetch error: {e}")
        return 0

    rows = res.data or []
    if not rows:
        print("[FeedbackLoop] No pending feedback.")
        return 0

    print(f"[FeedbackLoop] {len(rows)} pending row(s) found.")
    count = 0
    for row in rows:
        fid = row["id"]
        # Atomically claim the row: only succeeds if another process hasn't already grabbed it
        try:
            claim = supabase.table("user_feedback")\
                .update({"status": "in_progress"})\
                .eq("id", fid)\
                .eq("status", "pending")\
                .execute()
        except Exception as e:
            print(f"   [claim] Supabase error for {fid}: {e}")
            continue
        if not claim.data:
            print(f"   [skip] {fid} already claimed by another process.")
            continue
        if process_one(row):
            count += 1
    return count


def run_loop(poll_interval: int = 60, batch_size: int = 10):
    """Poll indefinitely, processing feedback in batches."""
    print(f"[FeedbackLoop] Starting — poll every {poll_interval}s, batch_size={batch_size}")
    while True:
        process_pending_batch(batch_size)
        print(f"[FeedbackLoop] Sleeping {poll_interval}s…")
        time.sleep(poll_interval)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="KuasaPrestij Feedback Loop Agent")
    parser.add_argument("--loop", action="store_true", help="Run continuously (poll mode)")
    parser.add_argument("--interval", type=int, default=60, help="Poll interval in seconds (default: 60)")
    parser.add_argument("--batch", type=int, default=10, help="Max rows per cycle (default: 10)")
    args = parser.parse_args()

    if args.loop:
        run_loop(poll_interval=args.interval, batch_size=args.batch)
    else:
        n = process_pending_batch(batch_size=args.batch)
        print(f"[FeedbackLoop] Done. {n} row(s) processed.")
