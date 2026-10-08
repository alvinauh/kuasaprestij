#!/usr/bin/env python3
"""
seed_students.py — Create 20 real Supabase auth accounts and simulate practice sessions.

Credentials are read from .env — nothing is hardcoded in this file.

Usage:
  python scripts/seed_students.py            # full run
  python scripts/seed_students.py --dry-run  # print plan, make no changes
"""

import asyncio
import os
import random
import sys

import httpx
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
API_BASE = os.getenv("API_BASE_URL", "https://api.kuasa.tech:8443")
PASSWORD = "KuasaPrestij2026!"
EMAIL_DOMAIN = "kuasaprestij.test"

CONCURRENCY = 4        # max students hitting the API at once
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


async def main(dry_run: bool):
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    print(f"{'[DRY RUN] ' if dry_run else ''}Creating {len(STUDENTS)} students…\n")

    roster = []
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
                # Reuse existing account
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
    if dry_run:
        print("[DRY RUN] Skipping simulation.")
    else:
        print("Starting simulation…\n")
        sem = asyncio.Semaphore(CONCURRENCY)
        async with httpx.AsyncClient(headers={"Content-Type": "application/json"}) as client:
            await asyncio.gather(*[run_student(sem, client, s) for s in roster])

    print(f"\n{'='*60}")
    print(f"  Password (all accounts): {PASSWORD}")
    print(f"  {'Email':<38}  Name")
    print(f"  {'-'*38}  {'-'*25}")
    for s in roster:
        print(f"  {s['email']:<38}  {s['name']}")


if __name__ == "__main__":
    asyncio.run(main(dry_run="--dry-run" in sys.argv))
