"""
bench_questions.py — measure question-load latency for diagnostic and free-practice flows.

Usage:
    python3 bench_questions.py                      # hits localhost:8000
    python3 bench_questions.py https://my.host.com  # hits remote
    python3 bench_questions.py --rounds 3           # repeat each test 3 times

Output shows per-call timing and whether the prefetch/prewarm is working
(Q2 should be noticeably faster than Q1 once the background task has run).
"""

import sys
import time
import json
import argparse
import urllib.request
import urllib.error

TEST_STUDENT_ID = "00000000-0000-0000-0000-000000000001"
TEST_FORM_LEVEL = 4


def _post(base: str, path: str, body: dict) -> tuple[dict, float]:
    url = base.rstrip("/") + path
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            elapsed = time.perf_counter() - t0
            return json.loads(resp.read()), elapsed
    except urllib.error.HTTPError as e:
        elapsed = time.perf_counter() - t0
        return {"error": e.read().decode()}, elapsed


def _get(base: str, path: str) -> tuple[dict, float]:
    url = base.rstrip("/") + path
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            elapsed = time.perf_counter() - t0
            return json.loads(resp.read()), elapsed
    except urllib.error.HTTPError as e:
        elapsed = time.perf_counter() - t0
        return {"error": e.read().decode()}, elapsed


def _tag(elapsed: float) -> str:
    if elapsed < 0.5:
        return "⚡ cache hit"
    if elapsed < 3.0:
        return "✓ fast"
    if elapsed < 10.0:
        return "⚠ slow"
    return "✗ very slow"


def _ok(result: dict) -> bool:
    return "error" not in result and result.get("question_data") is not None


def bench_diagnostic(base: str, rounds: int):
    print("\n── Diagnostic flow (/start_diagnostic_session) ──")

    times = []
    for r in range(rounds):
        result, elapsed = _post(base, "/start_diagnostic_session", {
            "student_id": TEST_STUDENT_ID,
            "language": "English",
            "form_level": TEST_FORM_LEVEL,
        })
        ok = _ok(result)
        topic = result.get("topic", "?")
        session_id = result.get("session_id")
        times.append(elapsed)
        print(f"  Q1 round {r+1}: {elapsed:.2f}s  {_tag(elapsed)}  topic={topic!r}  ok={ok}")

        if ok and session_id:
            # Submit a dummy answer so the server logs the event and the student
            # advances to Q2 — this also fires the existing submit_answer prefetch.
            draft = result.get("question_data") or {}
            options = draft.get("options") or []
            dummy_answer = options[0] if options else "A"
            sub_result, sub_elapsed = _post(base, "/submit_answer", {
                "student_id": TEST_STUDENT_ID,
                "topic": result["topic"],
                "subject": result["subject"],
                "student_answer": dummy_answer,
                "draft": draft,
                "language": "English",
                "question_type": "mcq",
                "is_adaptive": False,
                "session_id": session_id,
            })
            print(f"  submit_answer: {sub_elapsed:.2f}s  is_correct={sub_result.get('is_correct')}")

            # Brief pause to let the prewarm background task run.
            print("  [waiting 5s for prewarm background tasks…]")
            time.sleep(5)

            # Q2 — should hit a pre-warmed anchor
            q2_result, q2_elapsed = _post(base, "/start_diagnostic_session", {
                "student_id": TEST_STUDENT_ID,
                "language": "English",
                "form_level": TEST_FORM_LEVEL,
            })
            q2_ok = _ok(q2_result)
            q2_topic = q2_result.get("topic", "?")
            print(f"  Q2 round {r+1}: {q2_elapsed:.2f}s  {_tag(q2_elapsed)}  topic={q2_topic!r}  ok={q2_ok}")

    avg = sum(times) / len(times)
    print(f"  avg Q1 latency over {rounds} round(s): {avg:.2f}s")


def bench_free_practice(base: str, rounds: int):
    print("\n── Free practice flow (/start_session) ──")

    topic = "Force and Motion I"
    subject = "Physics"

    times_q1, times_q2 = [], []

    for r in range(rounds):
        q1_result, q1_elapsed = _post(base, "/start_session", {
            "student_id": TEST_STUDENT_ID,
            "topic": topic,
            "subject": subject,
            "language": "English",
            "is_adaptive": False,
            "question_type": "mcq",
            "form_level": TEST_FORM_LEVEL,
        })
        ok = _ok(q1_result)
        session_id = q1_result.get("session_id")
        times_q1.append(q1_elapsed)
        print(f"  Q1 round {r+1}: {q1_elapsed:.2f}s  {_tag(q1_elapsed)}  ok={ok}")

        if ok and session_id:
            draft = q1_result.get("question_data") or {}
            options = draft.get("options") or []
            dummy_answer = options[0] if options else "A"

            sub_result, sub_elapsed = _post(base, "/submit_answer", {
                "student_id": TEST_STUDENT_ID,
                "topic": topic,
                "subject": subject,
                "student_answer": dummy_answer,
                "draft": draft,
                "language": "English",
                "question_type": "mcq",
                "is_adaptive": False,
                "session_id": session_id,
            })
            print(f"  submit_answer: {sub_elapsed:.2f}s  is_correct={sub_result.get('is_correct')}")

            # Brief pause to let background prefetch finish.
            print("  [waiting 8s for prefetch background task…]")
            time.sleep(8)

            # Q2 — should come from prefetched_draft
            q2_result, q2_elapsed = _post(base, "/start_session", {
                "student_id": TEST_STUDENT_ID,
                "topic": topic,
                "subject": subject,
                "language": "English",
                "is_adaptive": True,
                "question_type": "mcq",
                "form_level": TEST_FORM_LEVEL,
            })
            q2_ok = _ok(q2_result)
            prefetch_note = "(from prefetch)" if q2_elapsed < 1.0 else "(generated live)"
            times_q2.append(q2_elapsed)
            print(f"  Q2 round {r+1}: {q2_elapsed:.2f}s  {_tag(q2_elapsed)}  ok={q2_ok}  {prefetch_note}")

    avg1 = sum(times_q1) / len(times_q1)
    if times_q2:
        avg2 = sum(times_q2) / len(times_q2)
        speedup = avg1 / avg2 if avg2 > 0 else float("inf")
        print(f"  avg Q1={avg1:.2f}s  avg Q2={avg2:.2f}s  speedup={speedup:.1f}x")
    else:
        print(f"  avg Q1={avg1:.2f}s  (Q2 skipped due to Q1 failures)")


def check_health(base: str) -> bool:
    try:
        result, elapsed = _get(base, "/docs")
        print(f"  Server reachable ({elapsed:.2f}s)")
        return True
    except Exception as e:
        print(f"  Server unreachable: {e}")
        return False


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Benchmark question load times")
    parser.add_argument("base", nargs="?", default="http://localhost:8000", help="API base URL")
    parser.add_argument("--rounds", type=int, default=1, help="Repeat each test N times")
    parser.add_argument("--diagnostic-only", action="store_true")
    parser.add_argument("--practice-only", action="store_true")
    args = parser.parse_args()

    print(f"Target: {args.base}  rounds={args.rounds}")
    print("Checking server health…")
    if not check_health(args.base):
        sys.exit(1)

    if not args.practice_only:
        bench_diagnostic(args.base, args.rounds)

    if not args.diagnostic_only:
        bench_free_practice(args.base, args.rounds)

    print("\nDone.")
    print("Interpret results:")
    print("  ⚡ <0.5s  = anchor cache hit (expected for Q2+ after prewarm)")
    print("  ✓ <3s    = acceptable (fresh generation with fast Gemini response)")
    print("  ⚠ <10s   = slow (Gemini backoff or cold start)")
    print("  ✗ ≥10s   = very slow / likely rate-limited")
