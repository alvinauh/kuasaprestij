"""
remediation_planner.py — AI agent that analyses a student's event_logs,
diagnoses weak topics, and writes a prioritised remediation_plans table.

Usage:
  python agents/remediation_planner.py --student_id <uuid>   # one student
  python agents/remediation_planner.py --all                  # all students with recent activity
  python agents/remediation_planner.py --days 14              # look-back window (default 30)
"""

import os
import json
import argparse
from datetime import datetime, timedelta
from collections import defaultdict
from typing import Optional
from supabase import create_client, Client
from dotenv import load_dotenv
from agents.llm_client import call_llm

load_dotenv(override=True)

supabase: Client = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))

_PLAN_PROMPT = """You are an educational diagnostic AI. A student's recent performance data is shown below.
Your job is to identify which topics need remediation and rank them by urgency.

For each topic that has meaningful errors (error_rate > 0.3 OR >= 2 wrong answers), output a JSON object.
Return ONLY a JSON array (no markdown, no prose):

[
  {{
    "topic": "<exact topic name>",
    "subject": "<subject name>",
    "priority_score": <0.0–1.0, higher = more urgent>,
    "reason": "<one sentence why this topic needs revisiting>",
    "suggested_intervention": "<concrete 2-3 sentence study tip or activity tailored to the errors seen>"
  }},
  ...
]

Rules:
- priority_score = weighted blend of error_rate (50%), error_variety (25%), and recency (25%)
  - error_rate: wrong / total attempts (high = worse)
  - error_variety: number of distinct error_categories seen
  - recency: 1.0 if last attempt was within 3 days, 0.6 if within 7 days, 0.3 if older
- Only include topics where total_attempts >= 1 AND (wrong_answers >= 1 OR mastery_score < 0.5)
- suggested_intervention must reference the specific error_categories and root_causes listed
- Sort output by priority_score descending

Student performance data:
{data}
"""


def _collect_student_data(student_id: str, lookback_days: int = 30) -> dict:
    """Pull event_logs + dskp_mastery for one student and aggregate per topic."""
    cutoff = (datetime.now() - timedelta(days=lookback_days)).isoformat()

    logs_res = supabase.table("event_logs")\
        .select("topic, is_correct, error_category, root_cause, created_at")\
        .eq("student_id", student_id)\
        .gte("created_at", cutoff)\
        .order("created_at", desc=True)\
        .execute()

    mastery_res = supabase.table("dskp_mastery")\
        .select("topic, curriculum_tag, mastery_level")\
        .eq("student_id", student_id)\
        .execute()

    mastery_by_topic = {
        row["topic"]: {"mastery_score": row["mastery_level"], "subject": row["curriculum_tag"]}
        for row in (mastery_res.data or [])
    }

    # Aggregate logs per topic
    per_topic: dict = defaultdict(lambda: {
        "total": 0, "wrong": 0,
        "error_categories": set(), "root_causes": set(),
        "last_attempt": None,
    })

    for log in (logs_res.data or []):
        t = log["topic"]
        per_topic[t]["total"] += 1
        if not log["is_correct"]:
            per_topic[t]["wrong"] += 1
        if log.get("error_category") and log["error_category"] not in ("None", "null", ""):
            per_topic[t]["error_categories"].add(log["error_category"])
        if log.get("root_cause") and log["root_cause"] not in ("None", "null", ""):
            per_topic[t]["root_causes"].add(log["root_cause"][:80])
        ts = log.get("created_at", "")
        if ts and (per_topic[t]["last_attempt"] is None or ts > per_topic[t]["last_attempt"]):
            per_topic[t]["last_attempt"] = ts

    # Build structured payload for LLM
    topic_summaries = []
    for topic, agg in per_topic.items():
        mastery_info = mastery_by_topic.get(topic, {})
        topic_summaries.append({
            "topic": topic,
            "subject": mastery_info.get("subject", "Unknown"),
            "mastery_score": mastery_info.get("mastery_score", 0.0),
            "total_attempts": agg["total"],
            "wrong_answers": agg["wrong"],
            "error_rate": round(agg["wrong"] / agg["total"], 2) if agg["total"] else 0,
            "error_categories": sorted(agg["error_categories"]),
            "root_causes": sorted(agg["root_causes"]),
            "last_attempt": agg["last_attempt"],
        })

    # Also include topics with low mastery but no recent logs (dormant weakness)
    for topic, info in mastery_by_topic.items():
        if topic not in per_topic and info["mastery_score"] < 0.5:
            topic_summaries.append({
                "topic": topic,
                "subject": info["subject"],
                "mastery_score": info["mastery_score"],
                "total_attempts": 0,
                "wrong_answers": 0,
                "error_rate": 0,
                "error_categories": [],
                "root_causes": [],
                "last_attempt": None,
            })

    return {"student_id": student_id, "topics": topic_summaries}


def _call_llm(data: dict) -> list:
    """Ask LLM to produce a prioritised remediation list. Returns list of dicts."""
    if not data["topics"]:
        return []

    prompt = _PLAN_PROMPT.format(data=json.dumps(data["topics"], indent=2, default=str))
    try:
        resp = call_llm(prompt, want_json=True, temperature=0.2, max_tokens=8192)
        raw = resp.text.strip()
        # Strip markdown code fences if present
        if raw.startswith("```"):
            parts = raw.split("```")
            raw = parts[1] if len(parts) > 1 else parts[0]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return parsed
        if isinstance(parsed, dict) and "topics" in parsed:
            return parsed["topics"]
        return []
    except Exception as e:
        print(f"  [remediation_planner] LLM call failed: {e}")
        return []


def _upsert_plan(student_id: str, items: list, raw_data: dict) -> int:
    """Write remediation_plans rows. Returns number of rows upserted."""
    if not items:
        return 0

    # Build a lookup for error_categories/root_causes from the raw aggregated data
    raw_by_topic = {t["topic"]: t for t in raw_data.get("topics", [])}

    rows = []
    for item in items:
        topic = item.get("topic", "")
        raw = raw_by_topic.get(topic, {})
        rows.append({
            "student_id": student_id,
            "subject": item.get("subject", raw.get("subject", "Unknown")),
            "topic": topic,
            "priority_score": min(max(float(item.get("priority_score", 0.5)), 0.0), 1.0),
            "reason": item.get("reason", ""),
            "error_categories": raw.get("error_categories", []),
            "root_causes": list(raw.get("root_causes", [])),
            "suggested_intervention": item.get("suggested_intervention", ""),
            "status": "active",
        })

    supabase.table("remediation_plans").upsert(
        rows, on_conflict="student_id,topic"
    ).execute()
    return len(rows)


def plan_for_student(student_id: str, lookback_days: int = 30) -> list:
    """Full pipeline for one student. Returns the list of remediation items written."""
    print(f"[remediation_planner] Analysing student {student_id} (last {lookback_days} days)...")
    data = _collect_student_data(student_id, lookback_days)

    if not data["topics"]:
        print("  -> No activity found. Skipping.")
        return []

    print(f"  -> {len(data['topics'])} topics to analyse...")
    items = _call_llm(data)

    if not items:
        print("  -> LLM returned no plan items.")
        return []

    count = _upsert_plan(student_id, items, data)
    print(f"  -> {count} remediation rows written.")
    return items


def plan_for_all_students(lookback_days: int = 30) -> dict:
    """Run the planner for every student who has recent event_logs activity."""
    cutoff = (datetime.now() - timedelta(days=lookback_days)).isoformat()
    res = supabase.table("event_logs")\
        .select("student_id")\
        .gte("created_at", cutoff)\
        .execute()

    student_ids = list({row["student_id"] for row in (res.data or [])})
    print(f"[remediation_planner] Found {len(student_ids)} active students.")

    results = {}
    for sid in student_ids:
        results[sid] = plan_for_student(sid, lookback_days)

    return results


def get_top_suggestion(student_id: str) -> Optional[dict]:
    """
    Return the highest-priority active remediation item for a student.
    Returns None if no active plan exists.
    """
    res = supabase.table("remediation_plans")\
        .select("subject, topic, priority_score, reason, suggested_intervention")\
        .eq("student_id", student_id)\
        .eq("status", "active")\
        .order("priority_score", desc=True)\
        .limit(1)\
        .execute()

    if res.data:
        return res.data[0]
    return None


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="KuasaPrestij Remediation Planner")
    parser.add_argument("--student_id", type=str, help="Run for a specific student UUID")
    parser.add_argument("--all", action="store_true", help="Run for all recently active students")
    parser.add_argument("--days", type=int, default=30, help="Look-back window in days (default: 30)")
    args = parser.parse_args()

    if args.student_id:
        plan_for_student(args.student_id, args.days)
    elif getattr(args, "all"):
        plan_for_all_students(args.days)
    else:
        parser.print_help()
