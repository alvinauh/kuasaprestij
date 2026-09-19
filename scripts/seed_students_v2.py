#!/usr/bin/env python3
"""
seed_students_v2.py — Student simulation + SPM Teacher Agent review.

Same 20-student simulation as seed_students.py, but every question served
by /start_session is captured and reviewed post-run by an expert SPM teacher
agent powered by the project's own LLM chain (Gemini→Cerebras→Groq→OpenRouter).

Usage:
  python scripts/seed_students_v2.py            # full run
  python scripts/seed_students_v2.py --dry-run  # plan only, no API calls
  python scripts/seed_students_v2.py --review-only  # skip simulation, re-review saved questions
"""

import asyncio
import json
import os
import random
import sys
from datetime import date
from pathlib import Path

import httpx
from dotenv import load_dotenv
from supabase import create_client

# Allow importing from project root (agents/, schemas/)
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")

from agents.llm_client import call_llm

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
API_BASE = os.getenv("API_BASE_URL", "https://api.kuasa.tech:8443")
PASSWORD = "KuasaPrestij2026!"
EMAIL_DOMAIN = "kuasaprestij.test"

CONCURRENCY = 4
QUESTIONS_PER_TOPIC = 3

STUDENTS = [
    {"name": "Ahmad Haziq bin Razali",   "school": "SMK Taman Pelangi", "grade": "Form 4"},
    {"name": "Nur Aisyah binti Malik",   "school": "SMK Bukit Bintang", "grade": "Form 4"},
    {"name": "Muhammad Irfan Hakim",     "school": "SMK Taman Desa",    "grade": "Form 5"},
    {"name": "Siti Nurhaliza Othman",    "school": "SMK Bangsar",       "grade": "Form 4"},
    {"name": "Aiman Haziq Zulkifli",     "school": "SMK Kepong",        "grade": "Form 5"},
    {"name": "Nurul Ain binti Yusof",    "school": "SMK Taman Pelangi", "grade": "Form 4"},
    {"name": "Hafiz Azmi bin Karim",     "school": "SMK Bukit Bintang", "grade": "Form 5"},
    {"name": "Farah Liyana Hamdan",      "school": "SMK Taman Desa",    "grade": "Form 4"},
    {"name": "Luqmanul Hakim Isa",       "school": "SMK Bangsar",       "grade": "Form 5"},
    {"name": "Ain Syafiqah Johari",      "school": "SMK Kepong",        "grade": "Form 4"},
    {"name": "Wan Zulaikha Wan Ahmad",   "school": "SMK Taman Pelangi", "grade": "Form 4"},
    {"name": "Afiq Danial Roslan",       "school": "SMK Bukit Bintang", "grade": "Form 5"},
    {"name": "Putri Nadirah Mazlan",     "school": "SMK Taman Desa",    "grade": "Form 4"},
    {"name": "Harith Faris Halim",       "school": "SMK Bangsar",       "grade": "Form 5"},
    {"name": "Nabilah Husna Zain",       "school": "SMK Kepong",        "grade": "Form 4"},
    {"name": "Danish Arif bin Azhar",    "school": "SMK Taman Pelangi", "grade": "Form 5"},
    {"name": "Izzah Sofea Mohamad",      "school": "SMK Bukit Bintang", "grade": "Form 4"},
    {"name": "Zarif Haiqal Nordin",      "school": "SMK Taman Desa",    "grade": "Form 5"},
    {"name": "Yasmin Azra Hassan",       "school": "SMK Bangsar",       "grade": "Form 4"},
    {"name": "Rayyan Mirza Ishak",       "school": "SMK Kepong",        "grade": "Form 5"},
]

CURRICULUM = {
    "Physics":     ["Kinematics", "Force and Motion", "Gravitation", "Heat", "Wave Motion"],
    "Biology":     ["Cell as a Unit of Life", "Nutrition", "Respiration", "Dynamic Ecosystem"],
    "Chemistry":   ["Matter", "Acids and Bases", "Electrochemistry", "Thermochemistry"],
    "Mathematics": ["Functions", "Quadratic Functions", "Systems of Equations", "Statistics"],
    "History":     ["Kesultanan Melayu Melaka", "Nationalism", "Independence"],
    "English":     ["Literature", "Grammar", "Writing Skills"],
}

# Thread-safe accumulator for captured questions
captured_questions: list[dict] = []
capture_lock = asyncio.Lock()


# ---------------------------------------------------------------------------
# Simulation
# ---------------------------------------------------------------------------

async def do_question(
    client: httpx.AsyncClient,
    student_id: str,
    name: str,
    subject: str,
    topic: str,
    q_index: int,
    correct_rate: float,
) -> bool:
    try:
        r = await client.post(
            f"{API_BASE}/start_session",
            json={
                "student_id": student_id,
                "topic": topic,
                "subject": subject,
                "curriculum": "KSSM",
                "language": "English",
                "is_adaptive": q_index >= 2,
                "question_type": "mcq",
                "form_level": 4,
            },
            timeout=90.0,
        )
    except (httpx.TimeoutException, httpx.ConnectError) as e:
        print(f"  [{name}] start_session error ({topic}): {e}")
        return False

    if r.status_code != 200:
        print(f"  [{name}] start_session {r.status_code} for {subject}/{topic}")
        return False

    data = r.json()
    session_id = data.get("session_id")
    question_data = data.get("question_data") or {}
    options = question_data.get("options", [])

    if not session_id or not options:
        print(f"  [{name}] no session_id/options for {topic}")
        return False

    # Capture the question for teacher review
    async with capture_lock:
        captured_questions.append({
            "subject": subject,
            "topic": topic,
            "q_index": q_index,
            "is_adaptive": q_index >= 2,
            "student": name,
            "question_type": question_data.get("question_type", "mcq"),
            "kbat_level": question_data.get("kbat_level", ""),
            "stimulus": question_data.get("stimulus", ""),
            "question": question_data.get("question", ""),
            "options": options,
            "illustrative_notes": question_data.get("illustrative_notes", ""),
        })

    if random.random() < correct_rate:
        try:
            ca = await client.get(f"{API_BASE}/session_challenge/{session_id}", timeout=10.0)
            student_answer = (
                ca.json().get("correct_answer") if ca.status_code == 200 else random.choice(options)
            )
        except Exception:
            student_answer = random.choice(options)
    else:
        student_answer = random.choice(options)

    await asyncio.sleep(random.uniform(1.5, 4.0))

    try:
        await client.post(
            f"{API_BASE}/submit_answer",
            json={
                "student_id": student_id,
                "topic": topic,
                "subject": subject,
                "curriculum": "KSSM",
                "student_answer": student_answer,
                "draft": question_data,
                "language": "English",
                "question_type": "mcq",
                "session_id": session_id,
            },
            timeout=60.0,
        )
    except (httpx.TimeoutException, httpx.ConnectError) as e:
        print(f"  [{name}] submit_answer error ({topic}): {e}")
        return False

    return True


async def run_student(sem: asyncio.Semaphore, client: httpx.AsyncClient, student: dict):
    name = student["name"]
    uid = student["id"]
    subjects = random.sample(list(CURRICULUM.keys()), 2)
    plan = [(s, random.choice(CURRICULUM[s])) for s in subjects]
    correct_rate = random.uniform(0.45, 0.80)
    ok = 0

    async with sem:
        print(f"▶ {name}  subjects: {', '.join(subjects)}  accuracy: {correct_rate:.0%}")
        for subject, topic in plan:
            for q_idx in range(QUESTIONS_PER_TOPIC):
                if await do_question(client, uid, name, subject, topic, q_idx, correct_rate):
                    ok += 1
                await asyncio.sleep(random.uniform(0.5, 1.5))

    print(f"  ✓ {name} — {ok}/{len(plan) * QUESTIONS_PER_TOPIC} questions OK")


# ---------------------------------------------------------------------------
# SPM Teacher Agent
# ---------------------------------------------------------------------------

SPM_TEACHER_SYSTEM = """You are Puan Rohani binti Azman, a senior Malaysian secondary school teacher with 22 years of experience teaching and marking SPM examinations. You have deep expertise in the KSSM curriculum across Physics, Chemistry, Biology, Mathematics, History, and English.

You know the SPM examination format inside-out:
- Paper 1 MCQ: MUST open with a stimulus (scenario, described diagram, data table) BEFORE the question stem. Exactly 4 options (A/B/C/D). Distractors must encode real misconceptions (unit errors, sign errors, formula misapplication, direction confusion) — not random wrong values. Options must be parallel in structure and similar in length.
- KBAT levels: C1 (Mengingat), C2 (Memahami), C3 (Mengaplikasi), C4 (Menganalisis), C5 (Menilai), C6 (Mencipta). Most Paper 1 questions are C2–C4; C1-only questions are too easy for SPM.
- Science units must be correct SI: N, J, W, m/s², mol, mol/L, Pa, Ω, °C/K.
- History questions need a stimulus (source, dialogue, events list) then inference.
- English questions need to test inference/evaluation, NOT direct retrieval.

When reviewing a question, your job is to:
1. Check if the STIMULUS is present and meaningful (not just restating the question).
2. Assess whether the KBAT level label matches the actual cognitive demand.
3. Evaluate whether the DISTRACTORS reflect genuine student misconceptions.
4. Flag any factual errors, unrealistic values, or format violations.
5. Note if the question is too easy, too hard, or off-syllabus for SPM Form 4/5.

Be honest and direct. Use natural teacher language. Point out specific problems, not vague concerns."""


def build_review_prompt(subject: str, topic: str, questions: list[dict]) -> str:
    lines = [
        f"Review the following {len(questions)} MCQ question(s) for {subject} — Topic: {topic}.",
        "For EACH question, give:",
        "  - VERDICT: Aligned | Partially Aligned | Not Aligned",
        "  - SPM_FORMAT: pass/fail with a one-line reason",
        "  - KBAT_CHECK: is the labelled level correct?",
        "  - DISTRACTORS: quality of wrong options",
        "  - ISSUES: any factual errors, syllabus mismatches, or concerns",
        "  - SUGGESTION: one concrete improvement (keep it brief)",
        "",
        "Respond in plain text, numbered by question. No JSON needed.",
        "",
    ]
    for i, q in enumerate(questions, 1):
        lines.append(f"--- Question {i} (KBAT: {q.get('kbat_level', 'unknown')}, "
                     f"{'Adaptive' if q['is_adaptive'] else 'Anchor'}) ---")
        if q.get("stimulus"):
            lines.append(f"STIMULUS: {q['stimulus']}")
        lines.append(f"QUESTION: {q['question']}")
        opts = q.get("options", [])
        for j, opt in enumerate(opts):
            lines.append(f"  {'ABCD'[j]}. {opt}")
        if q.get("illustrative_notes"):
            lines.append(f"[Context note: {q['illustrative_notes'][:200]}]")
        lines.append("")
    return "\n".join(lines)


def run_teacher_review(questions: list[dict]) -> dict[str, str]:
    """
    Groups questions by subject+topic, calls the LLM teacher agent for each
    group, and returns a dict of {subject/topic: review_text}.
    """
    # Group by subject → topic
    groups: dict[str, dict[str, list]] = {}
    for q in questions:
        subj = q["subject"]
        topic = q["topic"]
        groups.setdefault(subj, {}).setdefault(topic, []).append(q)

    results: dict[str, str] = {}
    total_groups = sum(len(topics) for topics in groups.values())
    done = 0

    for subject, topics in sorted(groups.items()):
        for topic, qs in sorted(topics.items()):
            done += 1
            key = f"{subject} — {topic}"
            print(f"\n  [Teacher] Reviewing {key} ({len(qs)} questions) [{done}/{total_groups}]…")
            prompt = f"{SPM_TEACHER_SYSTEM}\n\n{build_review_prompt(subject, topic, qs)}"
            try:
                result = call_llm(prompt, role="main", temperature=0.3, max_tokens=1200, free_only=True)
                results[key] = result.text.strip()
                print(f"  [Teacher] ✓ {key}")
            except Exception as e:
                results[key] = f"[Teacher review failed: {e}]"
                print(f"  [Teacher] ✗ {key} — {e}")

    return results


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

def save_report(reviews: dict[str, str], n_questions: int, n_students: int):
    today = date.today().isoformat()
    out_path = ROOT / f"TEACHER_REVIEW_{today}.md"

    verdicts = {"Aligned": 0, "Partially Aligned": 0, "Not Aligned": 0}
    for text in reviews.values():
        for v in verdicts:
            verdicts[v] += text.count(v)

    lines = [
        f"# SPM Teacher Agent Review — {today}",
        "",
        f"Simulation: {n_students} students, {n_questions} questions captured across "
        f"{len(reviews)} subject/topic groups.",
        "",
        "## Summary",
        f"| Verdict | Count |",
        f"|---|---|",
        f"| ✅ Aligned | {verdicts['Aligned']} |",
        f"| ⚠️ Partially Aligned | {verdicts['Partially Aligned']} |",
        f"| ❌ Not Aligned | {verdicts['Not Aligned']} |",
        "",
        "---",
        "",
        "## Per-Topic Reviews",
        "",
    ]

    for key in sorted(reviews):
        lines.append(f"### {key}")
        lines.append("")
        lines.append(reviews[key])
        lines.append("")
        lines.append("---")
        lines.append("")

    out_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"\n📄 Report saved → {out_path}")
    return out_path


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def main(dry_run: bool, review_only: bool):
    roster = []

    if not review_only:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        print(f"{'[DRY RUN] ' if dry_run else ''}Creating/reusing {len(STUDENTS)} students…\n")

        for i, s in enumerate(STUDENTS, 1):
            email = f"student{i:02d}@{EMAIL_DOMAIN}"
            if dry_run:
                print(f"  (dry) {email}  →  {s['name']}")
                roster.append({"id": f"dry-uuid-{i:02d}", "email": email, **s})
                continue

            try:
                res = supabase.auth.admin.create_user({
                    "email": email,
                    "password": PASSWORD,
                    "email_confirm": True,
                    "user_metadata": {
                        "full_name": s["name"],
                        "school": s["school"],
                        "grade": s["grade"],
                    },
                })
                uid = res.user.id
                roster.append({"id": uid, "email": email, **s})
                print(f"  ✓ {email}  {s['name']}  ({uid[:8]}…)")
            except Exception as e:
                msg = str(e)
                if "already" in msg.lower():
                    try:
                        users = supabase.auth.admin.list_users()
                        match = next((u for u in users if u.email == email), None)
                        if match:
                            roster.append({"id": match.id, "email": email, **s})
                            print(f"  ~ {email}  already exists, reusing")
                        else:
                            print(f"  ✗ {email}  exists but not found — skipping")
                    except Exception as e2:
                        print(f"  ✗ {email}  lookup error: {e2}")
                else:
                    print(f"  ✗ {email}  {e}")

        print(f"\n{len(roster)} accounts ready.\n")

        if not dry_run:
            print("Starting simulation…\n")
            sem = asyncio.Semaphore(CONCURRENCY)
            async with httpx.AsyncClient(headers={"Content-Type": "application/json"}) as client:
                await asyncio.gather(*[run_student(sem, client, s) for s in roster])

            print(f"\nSimulation complete. {len(captured_questions)} questions captured.\n")

            # Save captured questions for --review-only reruns
            q_cache = ROOT / "scripts" / ".captured_questions.json"
            q_cache.write_text(json.dumps(captured_questions, ensure_ascii=False, indent=2))
            print(f"Questions cached → {q_cache}")
        else:
            print("[DRY RUN] Skipping simulation and teacher review.")
            return

    else:
        # Load from previous run
        q_cache = ROOT / "scripts" / ".captured_questions.json"
        if not q_cache.exists():
            print("No cached questions found. Run without --review-only first.")
            sys.exit(1)
        cached = json.loads(q_cache.read_text())
        captured_questions.extend(cached)
        print(f"Loaded {len(captured_questions)} questions from cache.\n")

    if not captured_questions:
        print("No questions captured — nothing to review.")
        return

    # ── Teacher Agent Review ──────────────────────────────────────────────────
    print("=" * 60)
    print("  SPM TEACHER AGENT — reviewing generated questions")
    print("=" * 60)
    reviews = run_teacher_review(captured_questions)

    out = save_report(reviews, len(captured_questions), len(roster) or len(STUDENTS))

    print(f"\nDone. Teacher review saved to: {out.name}")
    print(f"  Total questions reviewed: {len(captured_questions)}")
    print(f"  Subject/topic groups:     {len(reviews)}")


if __name__ == "__main__":
    dry_run = "--dry-run" in sys.argv
    review_only = "--review-only" in sys.argv
    asyncio.run(main(dry_run=dry_run, review_only=review_only))
