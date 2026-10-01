# SEDA Triage Corpus — Follow-up Question Extension: Progress

## What this is
A third dialogue turn added to each SEDA triage record: the student's follow-up question
after receiving the teacher's IRE intervention. This simulates **learning in motion** rather
than a static error snapshot.

## Dialogue structure per record (target state)
```
chat_sample       → student's initial confused utterance
intervention_script → teacher's IRE-structured remediation
followup_question  → student's follow-up in their demographic register   ← NEW
followup_cluster   → "converging" | C1 | C2 | C3 | C4 | C5              ← NEW
followup_shows     → "partial_understanding" | "emerging_mastery" |      ← NEW
                     "persistent_gap"
```

## Progress as of 2026-09-19

| Target | Done | Total eligible | LLM failures | Status |
|---|---|---|---|---|
| VPS | **260** | 389 | 0 | Partial — checkpoint saved |
| GCP | 0 | 334 | 0 | Not started |

Checkpoint file: `data/vps_f4f5/seda_triage_corpus_extended.ckpt.json`

## VPS results so far (260 records)

### Follow-up cluster distribution
| Cluster | Count | % |
|---|---|---|
| converging | 106 | 40.8% |
| C3 — L1-Interference / Vocabulary Gap | 62 | 23.8% |
| C1 — Procedural-Conceptual Disconnect | 56 | 21.5% |
| C4 — Strategic Omission | 24 | 9.2% |
| C5 — Foundational Knowledge Deficit | 8 | 3.1% |
| C2 — Attention/Working-Memory Lapse | 4 | 1.5% |

### Understanding level
| Level | Count | % |
|---|---|---|
| partial_understanding | 249 | 95.8% |
| persistent_gap | 11 | 4.2% |

### Sample follow-up questions
- **RURAL_DLP | Mathematics/Integration**
  "So +C is like... 'tetapan' kan? Always put it even if answer zero?"
- **RURAL_DLP | Mathematics/Number Bases**
  "Teacher, so the 'base' mean the [BM: asas] we use to count? Like base 2 is just 0 and 1?"

## How to resume
```bash
cd /root/kuasaprestij

# Resume VPS from checkpoint, then run GCP
python3 scripts/extend_seda_followup.py --target both --batch-size 20
```

The script auto-resumes from the checkpoint — already-completed records are skipped.

## Known issues / TODO
1. **Rate limiting**: GroqCloud 30 RPM limit + Cerebras 402 (free quota exhausted) causes
   slow progress. Fix: run early in the day when Cerebras free quota resets, or use
   `--batch-size 10` with the 3s inter-record delay already in the script.
2. **stdout buffering**: Python buffers output in background mode — check the checkpoint
   file directly (`python3 -c "import json; d=json.load(open('data/vps_f4f5/seda_triage_corpus_extended.ckpt.json')); print(sum(1 for r in d if 'followup_question' in r))"`)
   rather than the task output file.
3. **Intra-profile register variation**: All agents of the same profile share one register
   template. A future pass should add `persona_variant` (0–4) sub-styles per profile to
   capture Sabahan vs Kelantan BM, heavy vs light Manglish, etc.

## Script location
`scripts/extend_seda_followup.py`
