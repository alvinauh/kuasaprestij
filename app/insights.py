"""
Platform insights aggregator.

Reads from event_logs, dskp_mastery, topic_anchors, agent_traces.
All grouping is done in Python — PostgREST doesn't support GROUP BY.

Entry points:
    run_insights(supabase, days=7) -> dict
    format_digest(insights)        -> str  (Telegram-ready Markdown)
"""

from collections import defaultdict
from datetime import datetime, timedelta, timezone


def run_insights(supabase, days: int = 7) -> dict:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    # ------------------------------------------------------------------ #
    # 1. Wrong answers from event_logs
    # ------------------------------------------------------------------ #
    log_res = supabase.table("event_logs") \
        .select("student_id, subject, topic, error_category, root_cause, created_at") \
        .eq("is_correct", False) \
        .gte("created_at", cutoff) \
        .limit(3000) \
        .execute()
    logs = log_res.data or []

    # Topic × error_category counts
    topic_errors: dict = defaultdict(lambda: defaultdict(int))
    for row in logs:
        topic = row.get("topic") or "Unknown"
        cat = row.get("error_category") or "Unknown"
        topic_errors[topic][cat] += 1

    # Top 10 worst topics by total errors
    topic_totals = {t: sum(cats.values()) for t, cats in topic_errors.items()}
    worst_topics = sorted(topic_totals.items(), key=lambda x: x[1], reverse=True)[:10]
    error_breakdown = [
        {
            "topic": topic,
            "total_errors": total,
            "categories": dict(topic_errors[topic]),
        }
        for topic, total in worst_topics
    ]

    # Topics where Language Barrier is ≥30% of errors (min 3 data points)
    lb_topics = []
    for topic, cats in topic_errors.items():
        total = sum(cats.values())
        lb = cats.get("Language Barrier", 0)
        if total >= 3 and lb / total >= 0.30:
            lb_topics.append({
                "topic": topic,
                "language_barrier_pct": round(lb / total * 100),
                "total_errors": total,
            })
    lb_topics.sort(key=lambda x: x["language_barrier_pct"], reverse=True)

    # Root cause frequency — surface the top repeated root causes
    root_cause_counts: dict = defaultdict(int)
    for row in logs:
        rc = (row.get("root_cause") or "").strip()
        if rc and rc.lower() not in ("", "none", "n/a"):
            root_cause_counts[rc[:120]] += 1
    top_root_causes = sorted(root_cause_counts.items(), key=lambda x: x[1], reverse=True)[:5]

    # ------------------------------------------------------------------ #
    # 2. Stuck students — mastery plateau (5 %–40 %, started but stalled)
    # ------------------------------------------------------------------ #
    mastery_res = supabase.table("dskp_mastery") \
        .select("student_id, topic, curriculum_tag, mastery_level") \
        .gte("mastery_level", 0.05) \
        .lte("mastery_level", 0.40) \
        .execute()
    mastery_rows = mastery_res.data or []

    stuck_by_student: dict = defaultdict(list)
    for row in mastery_rows:
        stuck_by_student[row["student_id"]].append({
            "topic": row["topic"],
            "mastery_pct": round(row["mastery_level"] * 100),
            "subject": row.get("curriculum_tag", ""),
        })

    stuck_students = sorted(
        [
            {
                "student_id": sid,
                "student_short": sid[:8].upper(),
                "stuck_topic_count": len(topics),
                "topics": topics[:3],
            }
            for sid, topics in stuck_by_student.items()
        ],
        key=lambda x: x["stuck_topic_count"],
        reverse=True,
    )

    # ------------------------------------------------------------------ #
    # 3. Seed gaps — anchors with no question and empty bank
    # ------------------------------------------------------------------ #
    anchor_res = supabase.table("topic_anchors") \
        .select("topic, language, form_level, anchor_question, question_bank") \
        .execute()
    anchors = anchor_res.data or []

    seed_gaps = [
        {
            "topic": row["topic"],
            "language": row.get("language", ""),
            "form_level": row.get("form_level"),
        }
        for row in anchors
        if not row.get("anchor_question") and not (row.get("question_bank") or [])
    ]

    # ------------------------------------------------------------------ #
    # 4. LLM provider health from agent_traces (last 24 h)
    # ------------------------------------------------------------------ #
    cutoff_24h = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    try:
        traces_res = supabase.table("agent_traces") \
            .select("node, status, provider, duration_ms") \
            .gte("created_at", cutoff_24h) \
            .limit(2000) \
            .execute()
        traces = traces_res.data or []
    except Exception:
        traces = []

    error_traces = [t for t in traces if t.get("status") == "error"]
    node_error_counts: dict = defaultdict(int)
    for t in error_traces:
        node_error_counts[t["node"]] += 1

    provider_counts: dict = defaultdict(int)
    for t in traces:
        p = t.get("provider")
        if p:
            provider_counts[p] += 1

    # ------------------------------------------------------------------ #
    # 5. Activity — total answers today
    # ------------------------------------------------------------------ #
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0).isoformat()
    today_res = supabase.table("event_logs") \
        .select("id", count="exact") \
        .gte("created_at", today_start) \
        .execute()
    answers_today = today_res.count or 0

    correct_today_res = supabase.table("event_logs") \
        .select("id", count="exact") \
        .gte("created_at", today_start) \
        .eq("is_correct", True) \
        .execute()
    correct_today = correct_today_res.count or 0

    # ------------------------------------------------------------------ #
    # Assemble
    # ------------------------------------------------------------------ #
    return {
        "period_days": days,
        "summary": {
            "answers_today": answers_today,
            "correct_today": correct_today,
            "accuracy_today_pct": round(correct_today / max(answers_today, 1) * 100),
            "total_wrong_in_period": len(logs),
            "unique_students_with_errors": len({r["student_id"] for r in logs}),
            "stuck_student_count": len(stuck_students),
            "seed_gap_count": len(seed_gaps),
        },
        "worst_topics": error_breakdown,
        "language_barrier_topics": lb_topics[:5],
        "top_root_causes": [{"cause": c, "count": n} for c, n in top_root_causes],
        "stuck_students": stuck_students[:10],
        "seed_gaps": seed_gaps[:15],
        "provider_health": {
            "provider_call_counts": dict(provider_counts),
            "node_errors_24h": dict(node_error_counts),
            "total_traces_24h": len(traces),
        },
    }


def format_digest(insights: dict) -> str:
    s = insights["summary"]
    lines = [
        "📊 *KuasaPrestij Daily Digest*",
        f"_Last {insights['period_days']} days_\n",
        "*Today's Activity*",
        f"• Answers: {s['answers_today']}  |  Accuracy: {s['accuracy_today_pct']}%",
        f"• Students with recurring errors: {s['unique_students_with_errors']}",
        f"• Students stuck (mastery 5–40%): {s['stuck_student_count']}",
        f"• Seed gaps (no questions cached): {s['seed_gap_count']}\n",
    ]

    if insights["worst_topics"]:
        lines.append("*Top 5 Problem Topics*")
        for t in insights["worst_topics"][:5]:
            cats = "  ".join(f"{k[0]}: {v}" for k, v in t["categories"].items())
            lines.append(f"• {t['topic']}  ({t['total_errors']} errors — {cats})")
        lines.append("")

    if insights["language_barrier_topics"]:
        lines.append("*Language Barrier Alert* ⚠️")
        for t in insights["language_barrier_topics"][:3]:
            lines.append(
                f"• {t['topic']}  {t['language_barrier_pct']}% LB  ({t['total_errors']} wrong)"
            )
        lines.append("→ Consider auto-routing these students to BM medium.")
        lines.append("")

    if insights["top_root_causes"]:
        lines.append("*Recurring Root Causes*")
        for rc in insights["top_root_causes"][:3]:
            lines.append(f"• ×{rc['count']}  {rc['cause']}")
        lines.append("")

    if insights["stuck_students"]:
        lines.append(f"*Stuck Students ({s['stuck_student_count']} total)*")
        for st in insights["stuck_students"][:5]:
            topic_list = ", ".join(t["topic"] for t in st["topics"])
            lines.append(
                f"• {st['student_short']}  {st['stuck_topic_count']} topics  [{topic_list}]"
            )
        lines.append("→ Send /plan <id> to generate an intervention.")
        lines.append("")

    ph = insights.get("provider_health", {})
    node_errors = ph.get("node_errors_24h", {})
    if node_errors:
        lines.append("*Pipeline Errors (24 h)*")
        for node, count in sorted(node_errors.items(), key=lambda x: x[1], reverse=True):
            lines.append(f"• {node}: {count} errors")
        lines.append("")

    if insights["seed_gaps"]:
        lines.append(f"*Seed Gaps ({s['seed_gap_count']} total — first 5)*")
        for g in insights["seed_gaps"][:5]:
            lines.append(f"• {g['topic']}  [{g['language']}  F{g['form_level']}]")

    return "\n".join(lines)
