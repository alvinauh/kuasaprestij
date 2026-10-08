"""Regenerate object_lesson for every cached MCQ in topic_anchors (anchor + question_bank).

Each question gets its own object-based hook (agents/object_lesson.py) and is stamped
object_lesson_v=2 so reruns resume where they stopped and /start_session's lazy
backfill skips questions that were reviewed but deliberately left without a hook.

    venv/bin/python scripts/regen_object_lessons.py [--workers 6] [--limit-rows N] [--topic T] [--retry-empty] [--llm claude] [--subjects "Biology,Physics" | all]
"""
import argparse
import concurrent.futures as cf
import os
import sys
import threading
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from supabase import create_client  # noqa: E402

from agents.object_lesson import AUTO_OBJECT_LESSON_SUBJECTS, LLMUnavailable, generate_object_lesson  # noqa: E402

VERSION = 2
PREDICTION_KEYS = ("prediction_question", "prediction_options", "prediction_correct_index", "prediction_reveal")

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])
_lock = threading.Lock()
stats = {"rows": 0, "done": 0, "empty": 0, "skipped": 0}


def _is_mcq(q) -> bool:
    # Bank entries holding a saved "API Rate Limit Hit" error are not real questions — leave them alone.
    return (isinstance(q, dict) and bool(q.get("question")) and q.get("question_type", "mcq") == "mcq"
            and "API Rate Limit Hit" not in q["question"])


def _key(q: dict) -> str:
    return (q.get("question") or "").strip()[:200]


RETRY_EMPTY = False


def _needs(q) -> bool:
    if not _is_mcq(q):
        return False
    return q.get("object_lesson_v") != VERSION or (RETRY_EMPTY and not q.get("object_lesson"))


def _apply(q: dict, lesson: str) -> dict:
    out = {k: v for k, v in q.items() if k not in PREDICTION_KEYS}  # predictions described the old scene
    out["object_lesson"] = lesson
    out["object_lesson_v"] = VERSION
    return out


STOP = threading.Event()


def process_row(row: dict) -> None:
    if STOP.is_set():
        return
    aq = row.get("anchor_question")
    bank = row.get("question_bank") or []
    todo = {}
    for q in [aq, *bank]:
        if _needs(q):
            todo.setdefault(_key(q), q)
    if not todo:
        with _lock:
            stats["skipped"] += 1
        return

    lessons = {}
    for k, q in todo.items():
        lessons[k] = generate_object_lesson(
            row["topic"], row.get("subject") or "", row.get("language") or "English",
            q.get("question") or "", q.get("stimulus") or "", q.get("options"),
            str(q.get("correct_answer") or ""), row.get("form_level"),
        )

    # Re-read right before writing and merge by question text, so concurrent
    # writes from the live API (new bank entries, media) are never clobbered.
    fresh = sb.table("topic_anchors").select("anchor_question,question_bank").eq("id", row["id"]).execute().data
    if not fresh:
        return
    f_aq, f_bank = fresh[0].get("anchor_question"), fresh[0].get("question_bank") or []
    update = {}
    if _is_mcq(f_aq) and _key(f_aq) in lessons:
        update["anchor_question"] = _apply(f_aq, lessons[_key(f_aq)])
    new_bank = [_apply(e, lessons[_key(e)]) if _is_mcq(e) and _key(e) in lessons else e for e in f_bank]
    if new_bank != f_bank:
        update["question_bank"] = new_bank
    if update:
        sb.table("topic_anchors").update(update).eq("id", row["id"]).execute()

    with _lock:
        stats["rows"] += 1
        stats["done"] += sum(1 for v in lessons.values() if v)
        stats["empty"] += sum(1 for v in lessons.values() if not v)
        print(f"[{stats['rows']}] {row['topic']} ({row.get('language')}): "
              f"{sum(1 for v in lessons.values() if v)}/{len(lessons)} lessons | totals {stats}", flush=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--limit-rows", type=int, default=0)
    ap.add_argument("--topic", default="")
    ap.add_argument("--subjects", default=",".join(sorted(AUTO_OBJECT_LESSON_SUBJECTS)),
                    help='comma-separated subjects (default: the auto list); "all" = every subject')
    ap.add_argument("--llm", choices=["chain", "claude"], default="chain",
                    help="claude = use the Claude Code CLI (claude -p) on your claude.ai login")
    ap.add_argument("--retry-empty", action="store_true", help="also retry questions left without a hook")
    args = ap.parse_args()
    global RETRY_EMPTY
    RETRY_EMPTY = args.retry_empty
    if args.llm == "claude":
        os.environ["OBJECT_LESSON_LLM"] = "claude"

    rows, off = [], 0
    while True:
        q = sb.table("topic_anchors").select("id,topic,subject,language,form_level,anchor_question,question_bank")
        if args.topic:
            q = q.eq("topic", args.topic)
        page = q.range(off, off + 199).execute().data
        rows += page
        off += 200
        if len(page) < 200:
            break
    if args.subjects.lower() != "all":
        wanted = {x.strip() for x in args.subjects.split(",") if x.strip()}
        rows = [r for r in rows if (r.get("subject") or "").strip() in wanted]
    if args.limit_rows:
        rows = rows[: args.limit_rows]
    total_q = sum(1 for r in rows for q in [r.get("anchor_question"), *(r.get("question_bank") or [])] if _needs(q))
    print(f"{len(rows)} rows, {total_q} MCQs need a v{VERSION} object lesson", flush=True)

    t0 = time.time()
    with cf.ThreadPoolExecutor(max_workers=args.workers) as pool:
        for fut in cf.as_completed([pool.submit(process_row, r) for r in rows]):
            try:
                fut.result()
            except LLMUnavailable as e:
                # Usage limit / auth / outage: stop cleanly. Unwritten rows stay
                # un-stamped, so rerunning the same command resumes from here.
                print(f"[STOPPED] {e} — rerun the same command to resume.", flush=True)
                STOP.set()
                pool.shutdown(wait=True, cancel_futures=True)
                break
            except Exception as e:
                print(f"[row error] {e}", flush=True)
    print(f"DONE in {time.time() - t0:.0f}s: {stats}", flush=True)


if __name__ == "__main__":
    main()
