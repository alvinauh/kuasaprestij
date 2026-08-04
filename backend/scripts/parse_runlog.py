#!/usr/bin/env python3
"""
Parse a timestamped seed runlog + before/after DB snapshots into:
  - evidence/run_summary.md   (paper-ready tables for §4.2)
  - evidence/run_summary.csv  (per subject/topic/language generated vs failed)

Everything here is derived from the actual log and DB — no fabricated numbers.
Reconciles the log's ok-count against the real DB delta and flags any gap
(silent write loss / bank-cap trimming).
"""
import argparse
import csv
import json
import re
from collections import defaultdict
from pathlib import Path

TS = r"(?P<ts>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)"
RE_TS = re.compile(TS + r"\s?(?P<body>.*)")
RE_ENTRY = re.compile(r"\[\d+/\d+\]\s+(?P<subj>.+?)\s+—\s+(?P<topic>.+?)\s+\((?P<lang>[^)]+)\):")
RE_OK = re.compile(r"✓\s+Q\d+/\d+\s+saved")
RE_FAIL_EMPTY = re.compile(r"✗\s+Q\d+/\d+\s+empty draft")
RE_FAIL_ERR = re.compile(r"✗\s+Q\d+/\d+\s+error:\s*(?P<err>.*)")
RE_JSON_VALID_FAIL = re.compile(r"parse_llm_json.*Validation failed")
RE_JSON_DECODE_FAIL = re.compile(r"parse_llm_json.*JSON decode failed")
RE_COOL = re.compile(r"->\s+(?P<label>.+?):\s+cooling for\s+(?P<secs>[\d.]+)s")
RE_ALLCOOL = re.compile(r"->\s+All providers rate-limited\. Waiting\s+(?P<secs>[\d.]+)s")
RE_ERR_FAILOVER = re.compile(r"->\s+(?P<label>.+?)\s+error\s+\(.*?\),\s+trying next provider")


def parse(runlog: Path):
    lines = runlog.read_text(encoding="utf-8", errors="replace").splitlines()

    first_ts = last_ts = None
    cur = None  # (subj, topic, lang)
    ok = fail = 0
    retried_items = 0
    pending_events = 0  # provider events since last item boundary

    per_entry = defaultdict(lambda: {"ok": 0, "fail": 0})   # (subj,topic,lang)
    per_subject_lang = defaultdict(lambda: {"ok": 0, "fail": 0})  # (subj,lang)
    cool_by_provider = defaultdict(int)      # cooling events (any duration)
    rate429_by_provider = defaultdict(int)   # cooling for ~65s == RateLimitError
    errfailover_by_provider = defaultdict(int)
    all_cooling_events = 0
    all_cooling_wait_s = 0.0
    json_valid_fail = 0
    json_decode_fail = 0
    json_fail_pending = False  # a JSON parse/validation error seen since last item boundary
    failures = []  # (subj, topic, lang, reason)

    for raw in lines:
        m = RE_TS.match(raw)
        ts, body = (m.group("ts"), m.group("body")) if m else (None, raw)
        if ts:
            first_ts = first_ts or ts
            last_ts = ts

        e = RE_ENTRY.search(body)
        if e:
            cur = (e.group("subj").strip(), e.group("topic").strip(), e.group("lang").strip())
            continue

        if RE_JSON_VALID_FAIL.search(body):
            json_valid_fail += 1
            json_fail_pending = True
            continue
        if RE_JSON_DECODE_FAIL.search(body):
            json_decode_fail += 1
            json_fail_pending = True
            continue

        c = RE_COOL.search(body)
        if c:
            label, secs = c.group("label").strip(), float(c.group("secs"))
            cool_by_provider[label] += 1
            if secs >= 60:  # 65s cooldown == RateLimitError (429); 10s == routing error
                rate429_by_provider[label] += 1
            pending_events += 1
            continue

        if RE_ALLCOOL.search(body):
            all_cooling_events += 1
            all_cooling_wait_s += float(RE_ALLCOOL.search(body).group("secs"))
            pending_events += 1
            continue

        ef = RE_ERR_FAILOVER.search(body)
        if ef:
            errfailover_by_provider[ef.group("label").strip()] += 1
            pending_events += 1
            continue

        if RE_OK.search(body):
            ok += 1
            if pending_events:
                retried_items += 1
            if cur:
                per_entry[cur]["ok"] += 1
                per_subject_lang[(cur[0], cur[2])]["ok"] += 1
            pending_events = 0
            json_fail_pending = False
            continue

        fe = RE_FAIL_EMPTY.search(body)
        fr = RE_FAIL_ERR.search(body)
        if fe or fr:
            fail += 1
            if fr:
                reason = f"error: {fr.group('err')[:80]}"
            elif json_fail_pending:
                reason = "malformed LLM JSON (parse/validation failure — Cycle 1)"
            else:
                reason = "empty draft (provider returned no content)"
            if pending_events:
                retried_items += 1
            if cur:
                per_entry[cur]["fail"] += 1
                per_subject_lang[(cur[0], cur[2])]["fail"] += 1
                failures.append((cur[0], cur[1], cur[2], reason))
            else:
                failures.append(("?", "?", "?", reason))
            pending_events = 0
            json_fail_pending = False
            continue

    return dict(
        first_ts=first_ts, last_ts=last_ts, ok=ok, fail=fail,
        retried_items=retried_items, per_entry=per_entry,
        per_subject_lang=per_subject_lang,
        cool_by_provider=dict(cool_by_provider),
        rate429_by_provider=dict(rate429_by_provider),
        errfailover_by_provider=dict(errfailover_by_provider),
        all_cooling_events=all_cooling_events,
        all_cooling_wait_s=round(all_cooling_wait_s, 1),
        json_valid_fail=json_valid_fail,
        json_decode_fail=json_decode_fail,
        failures=failures,
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--runlog", required=True)
    ap.add_argument("--db-before", required=True)
    ap.add_argument("--db-after", required=True)
    ap.add_argument("--utc", required=True)
    ap.add_argument("--wall-seconds", type=int, required=True)
    args = ap.parse_args()

    p = parse(Path(args.runlog))
    before = json.loads(Path(args.db_before).read_text())
    after = json.loads(Path(args.db_after).read_text())

    db_delta = after["total_bank_items"] - before["total_bank_items"]
    eng_delta = after["english_bank_items"] - before["english_bank_items"]
    total_429 = sum(p["rate429_by_provider"].values())
    total_failover = sum(p["errfailover_by_provider"].values()) + total_429
    recon_gap = p["ok"] - db_delta

    outdir = Path("evidence")

    # ---- CSV: per subject/topic/language ----
    csv_path = outdir / "run_summary.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["subject", "topic", "language", "generated_ok", "failed"])
        for (subj, topic, lang), v in sorted(p["per_entry"].items()):
            w.writerow([subj, topic, lang, v["ok"], v["fail"]])

    # English-language per-subject breakdown (the "subjects run in English" view)
    eng_by_subject = defaultdict(lambda: {"ok": 0, "fail": 0})
    for (subj, lang), v in p["per_subject_lang"].items():
        if lang == "English":
            eng_by_subject[subj]["ok"] += v["ok"]
            eng_by_subject[subj]["fail"] += v["fail"]

    # ---- Markdown summary ----
    md = []
    md.append(f"# Seed Generation Run — Evidence Summary\n")
    md.append(f"_Run ID (UTC start): **{args.utc}** · runlog: `{args.runlog}`_\n")
    md.append("## Headline figures\n")
    md.append("| Metric | Value |")
    md.append("|---|---|")
    md.append(f"| Items generated (log ✓) | **{p['ok']}** |")
    md.append(f"| Items failed (log ✗) | **{p['fail']}** |")
    md.append(f"| DB bank delta (after − before) | **{db_delta}** |")
    md.append(f"| Bank total before → after | {before['total_bank_items']} → {after['total_bank_items']} |")
    md.append(f"| Items needing >1 attempt (failover during item) | {p['retried_items']} |")
    md.append(f"| Total 429 (rate-limit) events | {total_429} |")
    md.append(f"| Total failover events (429 + error) | {total_failover} |")
    md.append(f"| All-providers-cooling sleeps | {p['all_cooling_events']} (≈{p['all_cooling_wait_s']}s waited) |")
    md.append(f"| Wall-clock duration | {args.wall_seconds}s (~{args.wall_seconds/60:.1f} min) |")
    md.append(f"| First → last log timestamp | {p['first_ts']} → {p['last_ts']} |")
    md.append("")

    md.append("## Reconciliation (honesty check)\n")
    if recon_gap == 0:
        md.append(f"✅ Log success count ({p['ok']}) **equals** DB delta ({db_delta}). No silent write loss.\n")
    else:
        md.append(f"⚠️ Log success count ({p['ok']}) ≠ DB delta ({db_delta}) — gap of **{recon_gap}**. "
                  f"Likely silent write loss (missing row) and/or bank-cap trimming. "
                  f"The DB delta is the trustworthy figure; the ok-counter over-reports.\n")

    json_fail_total = p["json_valid_fail"] + p["json_decode_fail"]
    attempts_total = p["ok"] + p["fail"]
    md.append("## JSON structured-output reliability (Cycle 1 evidence)\n")
    md.append("| Metric | Value |")
    md.append("|---|---|")
    md.append(f"| Schema validation failures | {p['json_valid_fail']} |")
    md.append(f"| JSON decode failures (malformed/truncated) | {p['json_decode_fail']} |")
    md.append(f"| Total malformed-JSON events | {json_fail_total} |")
    if attempts_total:
        md.append(f"| Malformed-JSON rate (of {attempts_total} attempts) | {100*json_fail_total/attempts_total:.1f}% |")
    md.append("")
    md.append("> These are live instances of the Cycle 1 phenomenon: non-deterministic JSON from the LLM. "
              "`generator_node` currently has no repair/retry for MCQ items, so each malformed response is a "
              "dropped item. This is direct evidence for §4.1 and for why the validation-and-repair layer matters.\n")

    md.append("## Failover / rate-limit breakdown per provider\n")
    md.append("| Provider | Cooldowns (all) | 429 (rate-limit) | Error-failovers |")
    md.append("|---|---|---|---|")
    provs = set(p["cool_by_provider"]) | set(p["rate429_by_provider"]) | set(p["errfailover_by_provider"])
    if not provs:
        md.append("| _(none observed)_ | 0 | 0 | 0 |")
    for pr in sorted(provs):
        md.append(f"| {pr} | {p['cool_by_provider'].get(pr,0)} | "
                  f"{p['rate429_by_provider'].get(pr,0)} | {p['errfailover_by_provider'].get(pr,0)} |")
    md.append("")
    if total_429 == 0 and total_failover == 0:
        md.append("> **Note for §4.2:** this run recorded **zero 429s and zero failovers**. "
                  "The default (Gemini-led) chain served every item without tripping rate limits. "
                  "The paper's 'cascading 429s' symptom did NOT reproduce here — reword §4.2 to describe "
                  "the failover machinery as *available and exercised during earlier free-tier runs*, "
                  "not as observed in this run, OR cite the free-chain run instead.\n")

    md.append("## English-language subset (focus of the paper)\n")
    md.append(f"English items generated this run: **{sum(v['ok'] for v in eng_by_subject.values())}** "
              f"(DB English delta: {eng_delta}).\n")
    md.append("| Subject (English-language items) | Generated | Failed |")
    md.append("|---|---|---|")
    for subj in sorted(eng_by_subject):
        v = eng_by_subject[subj]
        md.append(f"| {subj} | {v['ok']} | {v['fail']} |")
    md.append("")
    md.append("> The **Bahasa Inggeris** row above is the English-*subject* cohort; all other rows are "
              "other subjects generated in the English language. Present both, focus analysis on Bahasa Inggeris.\n")

    md.append("## Completion / 'without loss' verdict\n")
    if p["fail"] == 0 and recon_gap == 0:
        md.append(f"✅ Every attempted item produced a valid, persisted question ({p['ok']} generated, "
                  f"0 failed, DB delta matches). The claim 'the full run completed without loss' is supported.\n")
    else:
        md.append(f"⚠️ {p['fail']} item(s) failed and/or a reconciliation gap of {recon_gap} exists. "
                  f"'Completed without loss' is NOT fully supported as-is. Re-run the seeder "
                  f"(skip-on-exist fills only the gaps) or soften the wording. Failures listed below.\n")

    if p["failures"]:
        md.append("### Failed / lost items\n")
        md.append("| Subject | Topic | Language | Reason |")
        md.append("|---|---|---|---|")
        for subj, topic, lang, reason in p["failures"]:
            md.append(f"| {subj} | {topic} | {lang} | {reason} |")
        md.append("")

    (outdir / "run_summary.md").write_text("\n".join(md), encoding="utf-8")
    print(f"Wrote {outdir/'run_summary.md'} and {csv_path}")
    print(f"  generated={p['ok']} failed={p['fail']} db_delta={db_delta} "
          f"429={total_429} failovers={total_failover} recon_gap={recon_gap}")


if __name__ == "__main__":
    main()
