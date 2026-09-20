"""
Generate a markdown error digest from logs/errors.jsonl.

Usage:
    python3 error_report.py              # last 7 days
    python3 error_report.py --days 1     # last 24 hours
    python3 error_report.py --days 30    # last 30 days
    python3 error_report.py --out report.md  # save to file instead of printing
"""

import argparse
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone, timedelta
from pathlib import Path

LOG_PATH = Path("logs/errors.jsonl")


def load_entries(since: datetime) -> list[dict]:
    if not LOG_PATH.exists():
        return []
    entries = []
    for line in LOG_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
            ts = datetime.fromisoformat(entry["ts"])
            if ts >= since:
                entries.append(entry)
        except Exception:
            continue
    return entries


def render(entries: list[dict], days: int) -> str:
    now = datetime.now(timezone.utc)
    lines = []

    lines.append(f"# KuasaPrestij Error Digest")
    lines.append(f"_Generated {now.strftime('%Y-%m-%d %H:%M')} UTC · last {days} day(s)_\n")

    if not entries:
        lines.append("No errors recorded in this period. All good.")
        return "\n".join(lines)

    lines.append(f"**Total errors:** {len(entries)}\n")

    # --- By context ---
    by_context = Counter(e.get("context", "unknown") for e in entries)
    lines.append("## Errors by location")
    for ctx, count in by_context.most_common():
        lines.append(f"- `{ctx}` — {count}")
    lines.append("")

    # --- By error type ---
    by_type = Counter(e.get("error", "Unknown") for e in entries)
    lines.append("## Errors by type")
    for err_type, count in by_type.most_common():
        lines.append(f"- `{err_type}` — {count}")
    lines.append("")

    # --- By day ---
    by_day: dict = defaultdict(int)
    for e in entries:
        day = e["ts"][:10]
        by_day[day] += 1
    lines.append("## Errors by day")
    for day in sorted(by_day):
        lines.append(f"- {day}: {by_day[day]}")
    lines.append("")

    # --- Recent 10 ---
    lines.append("## Most recent errors (up to 10)")
    for e in reversed(entries[-10:]):
        ts = e.get("ts", "")[:19].replace("T", " ")
        lines.append(f"\n### `{e.get('error', '?')}` — {ts}")
        lines.append(f"**Context:** `{e.get('context', 'unknown')}`")
        lines.append(f"**Message:** {e.get('message', '')}")
        tb = e.get("traceback", "").strip()
        if tb:
            lines.append("```")
            lines.append(tb[-800:])
            lines.append("```")

    return "\n".join(lines)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=7)
    parser.add_argument("--out", type=str, default=None)
    args = parser.parse_args()

    since = datetime.now(timezone.utc) - timedelta(days=args.days)
    entries = load_entries(since)
    report = render(entries, args.days)

    if args.out:
        Path(args.out).write_text(report, encoding="utf-8")
        print(f"Saved to {args.out}")
    else:
        print(report)
