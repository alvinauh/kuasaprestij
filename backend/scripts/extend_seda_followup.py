#!/usr/bin/env python3
"""
SEDA Triage Corpus — Follow-up Question Extension
==================================================
Post-processes the existing seda_triage_corpus.json files (VPS + GCP) and adds
a third dialogue turn: the student's follow-up question after receiving the
teacher's IRE intervention.

New fields added to each record:
  followup_question  — student's utterance in their demographic register
  followup_cluster   — "converging" | C1 | C2 | C3 | C4 | C5
  followup_shows     — "partial_understanding" | "emerging_mastery" | "persistent_gap"

Output:
  data/vps_f4f5/seda_triage_corpus_extended.json
  data/gcp_f4f5/seda_triage_corpus_extended.json

Usage:
    cd /root/kuasaprestij
    python scripts/extend_seda_followup.py [--target vps|gcp|both] [--batch-size 15]
"""

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

# ---------------------------------------------------------------------------
# LLM call via claude CLI — no API keys required
# ---------------------------------------------------------------------------

def call_llm_json(prompt: str, _providers=None) -> dict | None:
    t0 = time.monotonic()
    try:
        result = subprocess.run(
            ["claude", "-p", prompt],
            capture_output=True,
            text=True,
            timeout=120,
        )
        elapsed = time.monotonic() - t0
        content = (result.stdout or "").strip()
        if not content:
            stderr = (result.stderr or "").strip()
            print(f"  [claude-cli] empty response ({elapsed:.1f}s): {stderr[:120]}")
            return None
        # Strip markdown code fences if present
        if content.startswith("```"):
            lines = content.splitlines()
            content = "\n".join(l for l in lines if not l.strip().startswith("```"))
        parsed = json.loads(content)
        print(f"  [claude-cli] OK ({elapsed:.1f}s)")
        return parsed
    except subprocess.TimeoutExpired:
        print("  [claude-cli] timeout after 120s")
        return None
    except json.JSONDecodeError as e:
        elapsed = time.monotonic() - t0
        print(f"  [claude-cli] JSON parse error ({elapsed:.1f}s): {e}")
        return None
    except Exception as e:
        elapsed = time.monotonic() - t0
        print(f"  [claude-cli] error ({elapsed:.1f}s): {e}")
        return None

# ---------------------------------------------------------------------------
# Register descriptions per profile
# ---------------------------------------------------------------------------

_REGISTER = {
    "URBAN_DLP": (
        "Fluent English with minor Manglish particles (lah, ah, ke, lor). "
        "Natural, confident tone. Can ask multi-part questions."
    ),
    "URBAN_NON_DLP": (
        "Fluent Bahasa Melayu, urban formal register. Uses standard BM vocabulary. "
        "Polite, direct. May occasionally mix one English term."
    ),
    "RURAL_DLP": (
        "Simplified English syntax, very short sentences, code-switches to BM when unsure. "
        "Asks one thing at a time. Example style: 'Teacher, so the [term] mean [BM gloss]?'"
    ),
    "RURAL_NON_DLP": (
        "Casual/dialectal Bahasa Melayu, extremely short phrases (5-10 words). "
        "May use 'x' for 'tak'. Non-formal. Example: 'Jadi kena tulis semua sekali ke?'"
    ),
}

# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------

def _build_prompt(rec: dict) -> str:
    profile_id = rec["profile_id"]
    region     = rec["region"]
    programme  = rec["programme"]
    medium     = rec["medium"]
    subject    = rec["subject"]
    form_level = rec.get("form_level", "F4/F5")
    topic      = rec["topic"]
    root_cause = rec["root_cause"]
    seda_clust = rec["seda_cluster"]
    chat_sample= rec["chat_sample"]
    register   = _REGISTER.get(profile_id, "Standard Bahasa Melayu")

    intervention_summary = (
        f"The teacher used an IRE-structured intervention to address: {root_cause}. "
        f"They asked the student to identify exactly where they got stuck in {topic}, "
        f"waited for a response, then gave targeted corrective feedback and assigned "
        f"a parallel practice item at reduced difficulty."
    )

    return f"""You are simulating a Malaysian SPM secondary school student (Form {form_level}) asking a follow-up question after receiving teacher intervention during an adaptive learning session.

STUDENT PROFILE
- ID: {profile_id}  |  Region: {region}  |  Programme: {programme}  |  Medium: {medium}
- Linguistic register: {register}

LEARNING CONTEXT
- Subject: {subject} (Form {form_level})
- Topic: {topic}
- Student's root error: {root_cause}
- SEDA cluster: {seda_clust}

DIALOGUE SO FAR
Student (confused): "{chat_sample}"
Teacher: {intervention_summary}

YOUR TASK
Generate ONE realistic follow-up utterance the student asks IMMEDIATELY after this intervention. Requirements:
1. Show PARTIAL understanding — they absorbed some of the intervention but still have a gap or need confirmation on one point.
2. Match the linguistic register EXACTLY as described above. Do not make the student sound more fluent or more formal than their profile allows.
3. Keep it 1–2 sentences maximum (10–25 words).
4. Reflect genuine engagement — they are still trying, not giving up.
5. The question must be about {topic} and relate to {root_cause}.

Also classify the follow-up:
- "converging": student shows movement toward understanding; mostly correct, just needs confirmation
- "C1": still confused about the procedure/concept link (knows steps but not why)
- "C2": attention or memory slip after the intervention ("I understood but now I'm not sure again")
- "C3": vocabulary or language gap surfaced by the intervention
- "C4": strategic omission — asking about a sub-step they realise they habitually skip
- "C5": foundational gap exposed — their question reveals missing prerequisite knowledge

Respond with ONLY valid JSON (no markdown, no extra text):
{{
  "followup_question": "<student utterance in their exact register>",
  "followup_cluster": "<converging|C1|C2|C3|C4|C5>",
  "followup_shows": "<partial_understanding|emerging_mastery|persistent_gap>"
}}"""

# ---------------------------------------------------------------------------
# Validation of LLM output
# ---------------------------------------------------------------------------

_VALID_CLUSTERS = {"converging", "C1", "C2", "C3", "C4", "C5"}
_VALID_SHOWS    = {"partial_understanding", "emerging_mastery", "persistent_gap"}


def _validate(obj: dict | None) -> bool:
    if not isinstance(obj, dict):
        return False
    fq = obj.get("followup_question", "")
    fc = obj.get("followup_cluster", "")
    fs = obj.get("followup_shows", "")
    return (
        isinstance(fq, str) and 5 < len(fq) < 400
        and fc in _VALID_CLUSTERS
        and fs in _VALID_SHOWS
    )

# ---------------------------------------------------------------------------
# Main extension loop
# ---------------------------------------------------------------------------

def extend_corpus(
    corpus: list,
    batch_size: int = 15,
    checkpoint_path: Path | None = None,
) -> list:
    """
    Adds followup_question / followup_cluster / followup_shows to each record.
    Skips records that already have these fields (resumable).
    Saves a checkpoint JSON after each batch.
    """
    extended = list(corpus)

    already_done = 0
    if checkpoint_path and checkpoint_path.exists():
        with open(checkpoint_path, encoding="utf-8") as f:
            saved = json.load(f)
        saved_map = {r["triage_id"]: r for r in saved}
        for rec in extended:
            tid = rec.get("triage_id", "")
            if tid in saved_map and "followup_question" in saved_map[tid]:
                rec.update({
                    "followup_question": saved_map[tid]["followup_question"],
                    "followup_cluster":  saved_map[tid]["followup_cluster"],
                    "followup_shows":    saved_map[tid]["followup_shows"],
                })
                already_done += 1
        print(f"  Resumed from checkpoint: {already_done}/{len(extended)} already done")

    pending = [
        (i, rec) for i, rec in enumerate(extended)
        if "followup_question" not in rec and rec.get("validated", False)
    ]
    skipped_invalid = sum(
        1 for rec in extended
        if not rec.get("validated", False) and "followup_question" not in rec
    )
    print(f"  Records to process: {len(pending)}"
          f"  |  Skipping unvalidated: {skipped_invalid}"
          f"  |  Already done: {already_done}")

    for batch_start in range(0, len(pending), batch_size):
        batch = pending[batch_start: batch_start + batch_size]
        print(f"\n  Batch {batch_start // batch_size + 1}"
              f" ({batch_start + 1}–{batch_start + len(batch)} of {len(pending)})")

        for idx_in_batch, (rec_idx, rec) in enumerate(batch):
            tid     = rec.get("triage_id", f"#{rec_idx}")
            profile = rec.get("profile_id", "?")
            subject = rec.get("subject", "?")
            topic   = rec.get("topic", "?")
            print(f"    [{idx_in_batch + 1}/{len(batch)}] {tid}  {profile} | {subject} / {topic[:30]}")

            prompt = _build_prompt(rec)
            result = None
            for attempt in range(3):
                raw = call_llm_json(prompt)
                if _validate(raw):
                    result = raw
                    break
                print(f"      Attempt {attempt + 1} invalid output: {raw}")

            if result:
                extended[rec_idx]["followup_question"] = result["followup_question"]
                extended[rec_idx]["followup_cluster"]  = result["followup_cluster"]
                extended[rec_idx]["followup_shows"]    = result["followup_shows"]
            else:
                extended[rec_idx]["followup_question"] = "Cikgu, boleh tunjuk sekali lagi?"
                extended[rec_idx]["followup_cluster"]  = "C1"
                extended[rec_idx]["followup_shows"]    = "persistent_gap"
                extended[rec_idx]["followup_llm_failed"] = True
                print(f"      LLM failed — using fallback placeholder for {tid}")

        # Checkpoint after each batch
        if checkpoint_path:
            with open(checkpoint_path, "w", encoding="utf-8") as f:
                json.dump(extended, f, indent=2, ensure_ascii=False)
            done_count = sum(1 for r in extended if "followup_question" in r)
            print(f"  Checkpoint saved ({done_count}/{len(extended)} done)")

    return extended


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description="Extend SEDA triage corpus with student follow-up questions")
    ap.add_argument("--target", choices=["vps", "gcp", "both"], default="both")
    ap.add_argument("--batch-size", type=int, default=15, help="Records per batch between checkpoints")
    args = ap.parse_args()

    print("Provider: claude CLI (no API keys required)")

    targets = ["vps", "gcp"] if args.target == "both" else [args.target]

    for target in targets:
        src_path  = Path(f"data/{target}_f4f5/seda_triage_corpus.json")
        out_path  = Path(f"data/{target}_f4f5/seda_triage_corpus_extended.json")
        ckpt_path = Path(f"data/{target}_f4f5/seda_triage_corpus_extended.ckpt.json")

        if not src_path.exists():
            print(f"\nSkipping {target}: {src_path} not found")
            continue

        print(f"\n{'='*60}")
        print(f"  Target: {target.upper()}  |  Source: {src_path}")
        print(f"  Output: {out_path}")
        print(f"  Batch size: {args.batch_size}")
        print(f"{'='*60}")

        with open(src_path, encoding="utf-8") as f:
            corpus = json.load(f)
        print(f"  Loaded {len(corpus)} triage records")
        validated = sum(1 for r in corpus if r.get("validated", False))
        print(f"  Validated (eligible): {validated}")

        extended = extend_corpus(
            corpus,
            batch_size=args.batch_size,
            checkpoint_path=ckpt_path,
        )

        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(extended, f, indent=2, ensure_ascii=False)
        print(f"\n  Saved extended corpus → {out_path}  ({len(extended)} records)")

        with_followup = [r for r in extended if "followup_question" in r]
        llm_failed    = [r for r in extended if r.get("followup_llm_failed")]
        clusters = {}
        shows    = {}
        for r in with_followup:
            clusters[r.get("followup_cluster", "?")] = clusters.get(r.get("followup_cluster", "?"), 0) + 1
            shows[r.get("followup_shows", "?")]       = shows.get(r.get("followup_shows", "?"), 0) + 1

        print(f"\n  Follow-up generation summary ({target.upper()}):")
        print(f"    Total records       : {len(extended)}")
        print(f"    With follow-up      : {len(with_followup)}")
        print(f"    LLM failures        : {len(llm_failed)}")
        print(f"\n    Follow-up cluster distribution:")
        for k, v in sorted(clusters.items(), key=lambda x: -x[1]):
            pct = v / max(1, len(with_followup)) * 100
            print(f"      {k:<14} {v:>4}  ({pct:>5.1f}%)")
        print(f"\n    Understanding level:")
        for k, v in sorted(shows.items(), key=lambda x: -x[1]):
            pct = v / max(1, len(with_followup)) * 100
            print(f"      {k:<25} {v:>4}  ({pct:>5.1f}%)")

        if ckpt_path.exists() and not llm_failed:
            ckpt_path.unlink()
            print(f"\n  Checkpoint removed (all records complete)")

    print("\nDone.")


if __name__ == "__main__":
    main()
