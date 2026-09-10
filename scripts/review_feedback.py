#!/usr/bin/env python3
"""
review_feedback.py — Assess agent feedback quality for the 2026-08-16 simulation run.

Pulls wrong-answer event_logs for the 20 seeded students, groups by subject/topic,
and runs each batch through a teacher-agent reviewer that checks:
  - Student-facing feedback (diagnostic_tag): supportive, actionable, age-appropriate?
  - Root cause analysis: specific and accurate to the misconception?
  - Intervention plan: realistic for a classroom teacher to act on?
  - Error category: correctly applied?

Also verifies all 20 seeded students are enrolled in the classroom.

Usage:
  python scripts/review_feedback.py
"""

import json
import os
import sys
from datetime import date
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")

from agents.llm_client import call_llm

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]

CLASSROOM_ID = "2279daf3-6215-4fed-a3b5-9af5110e7429"

# student01–20 UUIDs from the 2026-08-16 seed run
SEEDED_STUDENTS = {
    "80d059b8-5e52-4282-9a2e-0136cac00686": "Ahmad Haziq bin Razali",
    "9b76dfbc-2650-429b-b8db-d8b5f8d97ab7": "Nur Aisyah binti Malik",
    "7c5d007c-8d90-425e-9ff4-3e059f1c92c6": "Muhammad Irfan Hakim",
    "a9b7df31-bba2-48db-8b8c-fc0b64fb13d6": "Siti Nurhaliza Othman",
    "714fe6df-9b73-4e0e-ad5c-be772944902b": "Aiman Haziq Zulkifli",
    "0d55b7dd-2837-49ee-8593-d05c7a9cdfe7": "Nurul Ain binti Yusof",
    "b900e445-5d33-4e9b-9dad-aa4ed4628b28": "Hafiz Azmi bin Karim",
    "1784d1ea-b70c-4e69-908a-b44a1f743d66": "Farah Liyana Hamdan",
    "8f9e2afe-7a68-4f9d-b46e-6bbec16a402e": "Luqmanul Hakim Isa",
    "ff1dbba9-13ef-4ee2-895d-2945fc733c28": "Ain Syafiqah Johari",
    "8799efca-6ad1-4a80-a87f-8f2a8da4d03d": "Wan Zulaikha Wan Ahmad",
    "0e8de0e6-c73a-4b0d-ad01-d2bd671461ce": "Afiq Danial Roslan",
    "7d9506e9-fd0a-4aad-a22c-4a6cec6432cb": "Putri Nadirah Mazlan",
    "dcc84cc2-3ad7-4b15-8bb4-19f65118a05c": "Harith Faris Halim",
    "622806be-1c94-4255-8522-56ee84ab3f27": "Nabilah Husna Zain",
    "0be615bd-f5ac-46c2-9af5-a6dc7e29f409": "Danish Arif bin Azhar",
    "5454c39a-9263-4d05-a923-4573dadcefc1": "Izzah Sofea Mohamad",
    "ffcc3166-4432-4600-9274-0fcaf1edc869": "Zarif Haiqal Nordin",
    "4fa34670-b545-4b86-9a8d-ec960f7a04f6": "Yasmin Azra Hassan",
    "6c4b05d7-c8c8-426d-8412-f8fdb8ea50bf": "Rayyan Mirza Ishak",
}

FEEDBACK_REVIEWER_SYSTEM = """You are Puan Rohani binti Azman, a senior Malaysian secondary school teacher with 22 years of SPM experience. You are auditing AI-generated feedback that students and teachers receive after a wrong answer in an adaptive assessment platform used by Form 4 and Form 5 students.

Each entry shows:
- STUDENT_MSG: What the student sees after getting a question wrong.
- ROOT_CAUSE: The AI's diagnosis of WHY the student got it wrong.
- INTERVENTION: The specific instruction given to the teacher.
- ERROR_CATEGORY: One of "Conceptual Gap", "Careless Error", or "Language Barrier".

Your job is to evaluate the quality of this AI-generated feedback.

For EACH feedback entry, give:
  - VERDICT: Good | Acceptable | Needs Improvement
  - STUDENT_MSG_QUALITY: Is it supportive and non-condescending? Does it name the specific atomic action the student should take? Max 2 sentences? Avoids jargon?
  - ROOT_CAUSE_QUALITY: Is it specific to the distractor chosen, not vague? Does it correctly name the misconception?
  - INTERVENTION_QUALITY: Is it realistic — could a real teacher act on it in class? Is it specific (not "review this topic")?
  - CATEGORY_CHECK: Is the error category correctly applied? (Conceptual Gap = wrong mental model; Careless Error = computation/reading slip; Language Barrier = misread due to English difficulty)
  - ISSUES: Name one specific problem with the feedback, or "None".
  - SUGGESTION: One concrete fix, or "None needed".

Be concise and direct. This is a quality audit, not a lesson."""


def build_feedback_prompt(subject: str, topic: str, entries: list[dict]) -> str:
    lines = [
        f"Review {len(entries)} AI-generated feedback entries for wrong answers in: {subject} — {topic}.",
        "",
    ]
    for i, e in enumerate(entries, 1):
        lines.append(f"--- Entry {i} (Error Category: {e.get('error_category', 'Unknown')}) ---")
        student_msg = e.get("diagnostic_tag", "").split("-> Action:")[0].strip()
        if student_msg.startswith("["):
            # Strip the [Category] prefix added by teacher_action_plan
            student_msg = student_msg.split("] ", 1)[-1] if "] " in student_msg else student_msg
        lines.append(f"STUDENT_MSG: {student_msg}")
        lines.append(f"ROOT_CAUSE: {e.get('root_cause', '')}")
        lines.append(f"INTERVENTION: {e.get('intervention', '')}")
        lines.append(f"ERROR_CATEGORY: {e.get('error_category', '')}")
        lines.append("")
    lines.append("Respond in plain text, numbered by entry. No JSON needed.")
    return "\n".join(lines)


def run_feedback_review(entries: list[dict]) -> dict[str, str]:
    groups: dict[str, dict[str, list]] = {}
    for e in entries:
        subj = e["subject"]
        topic = e["topic"]
        groups.setdefault(subj, {}).setdefault(topic, []).append(e)

    results: dict[str, str] = {}
    total = sum(len(topics) for topics in groups.values())
    done = 0

    for subject in sorted(groups):
        for topic in sorted(groups[subject]):
            done += 1
            batch = groups[subject][topic]
            key = f"{subject} — {topic}"
            print(f"  [Reviewer] {key} ({len(batch)} entries) [{done}/{total}]…")
            prompt = f"{FEEDBACK_REVIEWER_SYSTEM}\n\n{build_feedback_prompt(subject, topic, batch)}"
            try:
                result = call_llm(prompt, role="main", temperature=0.3, max_tokens=1400)
                results[key] = result.text.strip()
                print(f"  [Reviewer] ✓ {key}")
            except Exception as e:
                results[key] = f"[Review failed: {e}]"
                print(f"  [Reviewer] ✗ {key} — {e}")

    return results


def save_report(reviews: dict[str, str], n_entries: int, classroom_status: str) -> Path:
    today = date.today().isoformat()
    out_path = ROOT / f"FEEDBACK_REVIEW_{today}.md"

    verdicts = {"Good": 0, "Acceptable": 0, "Needs Improvement": 0}
    for text in reviews.values():
        verdicts["Good"] += text.count("VERDICT: Good")
        verdicts["Acceptable"] += text.count("VERDICT: Acceptable")
        verdicts["Needs Improvement"] += text.count("VERDICT: Needs Improvement")

    lines = [
        f"# Agent Feedback Quality Review — {today}",
        "",
        f"Source: event_logs for 20 seeded students (2026-08-16 simulation run).",
        f"Total wrong-answer entries reviewed: {n_entries} across {len(reviews)} subject/topic groups.",
        "",
        "## Classroom Enrollment",
        classroom_status,
        "",
        "## Summary",
        "| Verdict | Count |",
        "|---|---|",
        f"| ✅ Good | {verdicts['Good']} |",
        f"| ⚠️ Acceptable | {verdicts['Acceptable']} |",
        f"| ❌ Needs Improvement | {verdicts['Needs Improvement']} |",
        "",
        "---",
        "",
        "## Per-Topic Feedback Reviews",
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


def ensure_classroom_enrollment(supabase) -> str:
    """Verify all 20 seeded students are in the classroom; add any missing."""
    existing = supabase.table("classroom_members") \
        .select("student_id") \
        .eq("classroom_id", CLASSROOM_ID) \
        .execute()
    enrolled_ids = {r["student_id"] for r in (existing.data or [])}

    missing = [sid for sid in SEEDED_STUDENTS if sid not in enrolled_ids]
    if missing:
        rows = [{"classroom_id": CLASSROOM_ID, "student_id": sid} for sid in missing]
        supabase.table("classroom_members").insert(rows).execute()
        names = [SEEDED_STUDENTS[sid] for sid in missing]
        status = f"Added {len(missing)} missing student(s) to classroom: {', '.join(names)}."
        print(f"  [Classroom] Enrolled {len(missing)} missing students.")
    else:
        status = f"All 20 seeded students confirmed enrolled in classroom `{CLASSROOM_ID}`."
        print(f"  [Classroom] All 20 students already enrolled ✓")

    return status


def main():
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    print("=" * 60)
    print("  CLASSROOM ENROLLMENT CHECK")
    print("=" * 60)
    classroom_status = ensure_classroom_enrollment(supabase)

    print()
    print("=" * 60)
    print("  PULLING WRONG-ANSWER FEEDBACK FROM event_logs")
    print("=" * 60)

    student_ids = list(SEEDED_STUDENTS.keys())
    res = supabase.table("event_logs") \
        .select("subject, topic, is_correct, error_category, root_cause, intervention, diagnostic_tag") \
        .in_("student_id", student_ids) \
        .eq("is_correct", False) \
        .order("subject") \
        .execute()

    entries = res.data or []
    print(f"  Fetched {len(entries)} wrong-answer entries.\n")

    if not entries:
        print("No wrong-answer entries found. Run the seed simulation first.")
        sys.exit(1)

    # Filter out entries with no feedback content
    entries = [
        e for e in entries
        if e.get("root_cause") or e.get("intervention") or e.get("diagnostic_tag")
    ]
    print(f"  {len(entries)} entries have feedback content to review.\n")

    print("=" * 60)
    print("  TEACHER AGENT — reviewing agent feedback quality")
    print("=" * 60)
    reviews = run_feedback_review(entries)

    out = save_report(reviews, len(entries), classroom_status)
    print(f"\nDone.")
    print(f"  Wrong-answer entries reviewed: {len(entries)}")
    print(f"  Subject/topic groups:          {len(reviews)}")
    print(f"  Report:                        {out.name}")


if __name__ == "__main__":
    main()
