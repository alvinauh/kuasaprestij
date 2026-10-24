#!/usr/bin/env python3
"""
Audit every cached question in topic_anchors with agents/question_validator.py.

  python scripts/audit_questions.py --out audit.json            # dry run: report only
  python scripts/audit_questions.py --out audit.json --no-llm   # structural checks only (free, instant)
  python scripts/audit_questions.py --apply                     # remove failing questions from the cache

--apply removes a failing question from question_bank and, for a failing anchor_question, sets it to
null (studio_node then serves from the remaining bank, or regenerates through the quality gate).
Each row's removed questions are saved in --backup (default audit_removed.json) so nothing is lost.
Cost: one LLM review per question (~1,200 calls, roughly 1M tokens on the default chain).
"""
import argparse
import json
import os
import sys
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from agents import question_validator as qv  # noqa: E402
from agents.db_client import make_supabase_client  # noqa: E402


def load_rows(sb):
    rows, off = [], 0
    while True:
        r = sb.table("topic_anchors").select(
            "id,subject,topic,language,form_level,anchor_question,question_bank,diagram_svg"
        ).range(off, off + 499).execute().data or []
        rows += r
        if len(r) < 500:
            return rows
        off += 500


def items(rows):
    """Yield (row, slot, index, question) for the anchor and each bank question."""
    for row in rows:
        aq = row.get("anchor_question")
        if isinstance(aq, dict) and aq.get("question"):
            yield row, "anchor", None, aq
        for i, q in enumerate(row.get("question_bank") or []):
            if isinstance(q, dict) and q.get("question"):
                yield row, "bank", i, q


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="audit.json")
    ap.add_argument("--backup", default="audit_removed.json")
    ap.add_argument("--no-llm", action="store_true")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--threads", type=int, default=8)
    ap.add_argument("--subject", help="only this subject")
    args = ap.parse_args()

    sb = make_supabase_client()
    rows = load_rows(sb)
    if args.subject:
        rows = [r for r in rows if r.get("subject") == args.subject]
    work = list(items(rows))
    print(f"{len(rows)} anchor rows, {len(work)} questions to check (llm={'off' if args.no_llm else 'on'})")

    def check(w):
        row, slot, idx, q = w
        try:
            res = qv.validate(q, row.get("subject") or "", row.get("topic") or "", row.get("form_level") or 4,
                              row.get("language") or "English", use_llm=not args.no_llm,
                              has_visual=bool(row.get("diagram_svg")))
        except Exception as e:  # never let one bad row stop the run
            return w, qv.ValidationResult(ok=True, issues=[f"audit error: {type(e).__name__}: {e}"])
        return w, res

    t0 = time.time()
    with ThreadPoolExecutor(args.threads) as ex:
        results = list(ex.map(check, work))
    print(f"checked in {time.time() - t0:.0f}s")

    failed = [(w, r) for w, r in results if not r.ok]
    skipped = sum(1 for _, r in results if r.ok and any("review skipped" in i or "audit error" in i for i in r.issues))
    cat = Counter()
    for _, r in failed:
        for i in r.issues:
            cat[i.split(":")[0][:60]] += 1
    warned = [(w, r) for w, r in results if r.ok and r.warnings]
    print(f"\nWARNINGS only (kept): {len(warned)}")
    print(f"\nFAILED {len(failed)} / {len(work)} ({100 * len(failed) / max(1, len(work)):.1f}%)  | review skipped/errored: {skipped}")
    for k, v in cat.most_common(12):
        print(f"  {v:>4}  {k}")

    by_subj = Counter(w[0].get("subject") for w, _ in failed)
    tot_subj = Counter(w[0].get("subject") for w, _ in results)
    print("\nfailure rate by subject:")
    for s, n in sorted(tot_subj.items(), key=lambda kv: -by_subj[kv[0]] / kv[1]):
        print(f"  {by_subj[s]:>3}/{n:<3} {s}")

    report = [
        {"row_id": w[0]["id"], "subject": w[0].get("subject"), "topic": w[0].get("topic"), "language": w[0].get("language"),
         "form_level": w[0].get("form_level"), "slot": w[1], "index": w[2], "question": w[3].get("question"),
         "issues": r.issues, "warnings": r.warnings}
        for w, r in failed
    ] + [
        {"row_id": w[0]["id"], "subject": w[0].get("subject"), "topic": w[0].get("topic"), "slot": w[1], "index": w[2],
         "question": w[3].get("question"), "issues": [], "warnings": r.warnings, "kept": True}
        for w, r in warned
    ]
    json.dump(report, open(args.out, "w"), ensure_ascii=False, indent=1)
    print(f"\nreport -> {args.out}")

    if not args.apply:
        print("dry run: nothing changed (use --apply to remove the failures from the cache)")
        return

    removed, by_row = [], {}
    for w, r in failed:
        by_row.setdefault(w[0]["id"], {"row": w[0], "anchor": False, "bank_idx": set()})
        if w[1] == "anchor":
            by_row[w[0]["id"]]["anchor"] = True
        else:
            by_row[w[0]["id"]]["bank_idx"].add(w[2])
    for rid, d in by_row.items():
        row = d["row"]
        upd = {}
        if d["anchor"]:
            upd["anchor_question"] = None
            removed.append({"row_id": rid, "slot": "anchor", "question": row.get("anchor_question")})
        if d["bank_idx"]:
            bank = row.get("question_bank") or []
            upd["question_bank"] = [q for i, q in enumerate(bank) if i not in d["bank_idx"]]
            removed += [{"row_id": rid, "slot": "bank", "question": bank[i]} for i in sorted(d["bank_idx"])]
        sb.table("topic_anchors").update(upd).eq("id", rid).execute()
    json.dump(removed, open(args.backup, "w"), ensure_ascii=False, indent=1)
    print(f"applied: {len(removed)} questions removed from {len(by_row)} rows; backup -> {args.backup}")
    print("restart the API (or wait 5 min) so its in-memory anchor cache drops them: systemctl restart kuasaprestij")


if __name__ == "__main__":
    main()
