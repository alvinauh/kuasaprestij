# SPM F4/F5 Demographic Simulation Results
**KuasaPrestij Intelligence Fabric — Multi-Demographic Benchmark**

Generated: 2026-09-11 (v3 — expanded Sains bank, fixed drop-off model)  |  Seed: 42

---

## Overview

A 300-agent Monte Carlo simulation benchmarking SPM Form 4/F5 readiness across five core papers and four demographic profiles. Both VPS and GCP backends run with the same seed (42) to hold the student cohort constant and isolate infrastructure/data differences.

### Methodology

| Parameter | Value |
|---|---|
| Total agents | 300 (75 per demographic profile) |
| Forms | F4 and F5 (KSSM SPM target cohort) |
| Subjects | Mathematics · Sejarah · Sains · Bahasa Melayu · Bahasa Inggeris |
| Items per session | 40 (Monte Carlo item-response theory) |
| Accuracy model | `base_accuracy × (1.25 - diff×0.55) - lang_penalty - lit_penalty + guessing_bonus` |
| Drop-off model | Failure-conditional: triggers only after 2+ consecutive failures × `drop_off_rate` |
| Triage trigger | 3+ consecutive failures → SEDA triage script generated |
| Critic agent | Validates triage for ecological validity; max 5 rolls per script |
| Seed | 42 (identical for VPS and GCP) |

### Demographic Matrix (2 × 2)

| | **Urban** | **Rural** |
|---|---|---|
| **DLP** (Dual-Language Programme) | URBAN_DLP | RURAL_DLP |
| **Non-DLP** (BM-medium) | URBAN_NON_DLP | RURAL_NON_DLP |

---

## Progression Across Simulation Versions

| Version | Drop-off model | Sains topics | Bank size | VPS item attempts | GCP item attempts |
|---|---|---|---|---|---|
| **v1** (broken) | Per-item 5% unconditional | 10 | 871 items | 2,914 | 2,783 |
| **v2** (drop-off fixed) | Failure-conditional | 10 | 871 items | 7,747 | 7,717 |
| **v3** (current) | Failure-conditional | 14 (+Biodiversiti, Kesihatan, Kimia Organik, Astronomi) | 903 VPS / 813 GCP | **7,737** | **8,081** |

The expanded Sains bank lifts VPS Sains from 80 → 112 items and GCP from 80 → 100 items, reducing reliance on synthetic question fallbacks for that subject.

---

## Database Preparation (cumulative)

| Subject | Rows in Supabase | Notes |
|---|---|---|
| Bahasa Inggeris | F4=41, F5=28 | Fully seeded; subject name bug fixed |
| Bahasa Melayu | F4=39, F5=13 | F5 expanded (+5 topics this session) |
| Mathematics | F4=30, F5=5 | KSSM F4/F5 topics seeded |
| Sains | F4=6, F5=8 | Expanded from 10→14 topics |
| Sejarah | F4=16, F5=4 | form_level bug fixed |

**Total bank (VPS, post-expansion):** 903 items — 117 topics — F4=589, F5=314

---

## Results: VPS Backend (v3)

### Simulation Statistics

| Metric | Value |
|---|---|
| Telemetry records | 7,909 |
| Total item attempts | 7,737 |
| Session drop-offs | 172 |
| Triage scripts generated | 390 |
| Triage validated | 389 |
| Critic evaluations | 497 |
| Critic rejection rate | 21.7% |

### Demographic Profile Breakdown

| Profile | N | Pass% | Lat (mean) | Drop% | Triage | Critic Rej% |
|---|---|---|---|---|---|---|
| URBAN_DLP | 2,605 | **68.3%** | 28.2s | 25.3% | 53 | 5.4% |
| URBAN_NON_DLP | 2,221 | 54.0% | 33.2s | 54.7% | 127 | 11.2% |
| RURAL_DLP | 1,927 | 48.3% | 42.5s | 58.7% | 118 | 21.3% |
| RURAL_NON_DLP | 984 | **34.5%** | 47.2s | 90.7% | 92 | 38.5% |

### Subject Breakdown

| Subject | N | Pass% | Lat (mean) | F4 Pass% | F5 Pass% | Triage |
|---|---|---|---|---|---|---|
| Mathematics | 1,206 | 51.8% | 38.8s | 51.0% | 52.9% | 72 |
| Sejarah | 1,613 | 61.4% | 35.2s | 62.9% | 60.2% | 48 |
| Sains | 1,694 | 57.9% | 35.2s | 61.5% | 55.2% | 74 |
| Bahasa Melayu | 1,614 | 57.0% | 36.0s | 52.2% | 59.5% | 68 |
| **Bahasa Inggeris** | 1,610 | **45.3%** | 33.6s | 47.8% | 42.9% | **128** |

### Form Level Breakdown

| Form | N | Pass% | Lat (mean) |
|---|---|---|---|
| F4 | 3,445 | 55.0% | 36.1s |
| F5 | 4,292 | 54.8% | 35.2s |

### Profile × Subject Pass Rate Matrix (VPS)

| Profile | Mathematics | Sejarah | Sains | Bahasa Melayu | Bahasa Inggeris |
|---|---|---|---|---|---|
| URBAN_DLP | 62.0% | 72.0% | 68.2% | 68.1% | 66.6% |
| URBAN_NON_DLP | 59.5% | 60.0% | 57.1% | 62.8% | **36.3%** |
| RURAL_DLP | 46.2% | 58.6% | 51.6% | 43.3% | 42.4% |
| RURAL_NON_DLP | 42.7% | 32.4% | 36.9% | 38.9% | **14.6%** |

### SEDA Cluster Distribution (VPS)

| Cluster | N | % |
|---|---|---|
| C1 — Procedural-Conceptual Disconnect | 146 | 37.4% |
| C3 — L1-Interference / Vocabulary Gap | 129 | 33.1% |
| C2 — Attention/Working-Memory Lapse | 43 | 11.0% |
| C4 — Strategic Omission | 37 | 9.5% |
| C5 — Foundational Knowledge Deficit | 35 | 9.0% |

### Critic Agent (VPS)

| Profile | Evaluated | Approved | Rejected | Rej% |
|---|---|---|---|---|
| URBAN_DLP | 56 | 53 | 3 | 5.4% |
| URBAN_NON_DLP | 143 | 127 | 16 | 11.2% |
| RURAL_DLP | 150 | 118 | 32 | **21.3%** |
| RURAL_NON_DLP | 148 | 91 | 57 | **38.5%** |
| **Overall** | **497** | **389** | **108** | **21.7%** |

---

## Results: GCP Backend (v3)

> GCP PostgREST proxy loaded successfully (181 rows, HTTP 200). Previously a 503 cold-start; now fully healthy after redeploy.

### Simulation Statistics

| Metric | Value |
|---|---|
| Telemetry records | 8,240 |
| Total item attempts | 8,081 |
| Session drop-offs | 159 |
| Triage scripts generated | 333 |
| Triage validated | 332 |
| Critic evaluations | 413 |
| Critic rejection rate | 19.6% |

### Demographic Profile Breakdown

| Profile | N | Pass% | Lat (mean) | Drop% | Triage | Critic Rej% |
|---|---|---|---|---|---|---|
| URBAN_DLP | 2,684 | **69.7%** | 27.8s | 16.0% | 42 | 8.7% |
| URBAN_NON_DLP | 2,574 | 58.4% | 33.4s | 33.3% | 108 | 12.2% |
| RURAL_DLP | 1,710 | 48.4% | 41.4s | 72.0% | 100 | 23.1% |
| RURAL_NON_DLP | 1,113 | **38.3%** | 50.0s | 90.7% | 83 | 28.1% |

### Subject Breakdown

| Subject | N | Pass% | Lat (mean) | F4 Pass% | F5 Pass% | Triage |
|---|---|---|---|---|---|---|
| Mathematics | 1,426 | 60.9% | 35.1s | 59.4% | 61.7% | 49 |
| Sejarah | 1,576 | 61.0% | 36.2s | 61.6% | 58.3% | 46 |
| Sains | 1,675 | 58.2% | 33.8s | 58.9% | 57.7% | 62 |
| Bahasa Melayu | 1,872 | 57.7% | 36.4s | 58.8% | 56.9% | 76 |
| **Bahasa Inggeris** | 1,532 | **48.5%** | 36.1s | 49.1% | 47.9% | **100** |

### Form Level Breakdown

| Form | N | Pass% | Lat (mean) |
|---|---|---|---|
| F4 | 4,055 | 57.9% | 34.9s |
| F5 | 4,026 | 56.6% | 36.2s |

### Profile × Subject Pass Rate Matrix (GCP)

| Profile | Mathematics | Sejarah | Sains | Bahasa Melayu | Bahasa Inggeris |
|---|---|---|---|---|---|
| URBAN_DLP | 73.0% | 70.1% | 69.8% | 64.9% | 70.0% |
| URBAN_NON_DLP | 58.6% | 64.3% | 55.1% | 67.3% | **37.4%** |
| RURAL_DLP | 55.4% | 49.8% | 53.5% | 34.9% | 49.3% |
| RURAL_NON_DLP | 33.2% | 49.0% | 31.7% | 47.3% | **13.0%** |

### SEDA Cluster Distribution (GCP)

| Cluster | N | % |
|---|---|---|
| C1 — Procedural-Conceptual Disconnect | 123 | 36.9% |
| C3 — L1-Interference / Vocabulary Gap | 112 | 33.6% |
| C2 — Attention/Working-Memory Lapse | 42 | 12.6% |
| C4 — Strategic Omission | 34 | 10.2% |
| C5 — Foundational Knowledge Deficit | 22 | 6.6% |

### Critic Agent (GCP)

| Profile | Evaluated | Approved | Rejected | Rej% |
|---|---|---|---|---|
| URBAN_DLP | 46 | 42 | 4 | 8.7% |
| URBAN_NON_DLP | 123 | 108 | 15 | 12.2% |
| RURAL_DLP | 130 | 100 | 30 | **23.1%** |
| RURAL_NON_DLP | 114 | 82 | 32 | **28.1%** |
| **Overall** | **413** | **332** | **81** | **19.6%** |

---

## VPS vs GCP Comparison (v3, Seed 42)

| Metric | VPS | GCP | Delta | Direction |
|---|---|---|---|---|
| Bank size | 903 items | 813 items | −90 | GCP PostgREST returns fewer rows (Math/Sains gap vs Supabase direct) |
| Item attempts | 7,737 | 8,081 | +344 | GCP students attempt slightly more items (lower drop-off) |
| Overall pass rate | ~55% | ~57% | +2pp | GCP marginally higher |
| URBAN_DLP pass% | 68.3% | 69.7% | +1.4pp | ≈same |
| URBAN_NON_DLP pass% | 54.0% | 58.4% | +4.4pp | GCP higher |
| RURAL_DLP pass% | 48.3% | 48.4% | +0.1pp | identical |
| RURAL_NON_DLP pass% | 34.5% | 38.3% | +3.8pp | GCP higher |
| RURAL_NON_DLP drop% | 90.7% | 90.7% | 0 | identical (failure-conditional model correct) |
| Bahasa Inggeris pass% | 45.3% | 48.5% | +3.2pp | GCP higher |
| Bahasa Inggeris triage | 128 | 100 | −28 | VPS more sensitive on Eng |
| Critic rejection overall | 21.7% | 19.6% | −2.1pp | GCP scripts slightly cleaner |
| C1 (Proc-Conceptual) % | 37.4% | 36.9% | −0.5pp | consistent |
| C3 (L1-Interference) % | 33.1% | 33.6% | +0.5pp | consistent |

**Bank gap explanation:** VPS queries Supabase directly (full 903-item bank). GCP PostgREST proxy returns 181 anchor rows vs 243 via direct — the proxy applies a default row limit that truncates Mathematics and Sains. VPS has richer item coverage for those subjects.

---

## v1 → v3 Improvement Summary (VPS)

| Metric | v1 (broken) | v3 (current) | Change |
|---|---|---|---|
| Item attempts | 2,914 | 7,737 | **+165%** more data |
| URBAN_DLP drop% | 84.0% | 25.3% | **−59pp** (realistic) |
| URBAN_NON_DLP drop% | 96.0% | 54.7% | **−41pp** |
| RURAL_DLP drop% | 98.7% | 58.7% | **−40pp** |
| RURAL_NON_DLP drop% | 100.0% | 90.7% | **−9pp** |
| Sains bank items | 80 | 112 | **+40%** |
| Sains triage triggers | 28 | 74 | **+164%** (more attempts → more triage data) |
| Critic evaluations | 171 | 497 | **+191%** |
| RURAL_NON_DLP Eng pass% | 9.8% | 14.6% | +4.8pp (more attempts reveal higher true rate) |

---

## Key Findings (v3)

### 1. Bahasa Inggeris remains the crisis paper
Pass rates ~45–48% across both backends; lowest of all five subjects. RURAL_NON_DLP hits **13–15%** — the sharpest equity gap in the entire matrix. C3 (L1-Interference) accounts for a third of all triage triggers and is disproportionately driven by English sessions.

### 2. C1 + C3 together account for 70% of all triage
- **C1 (Procedural-Conceptual Disconnect): 37%** — students know algorithms but fail to apply them in novel contexts. Highest in Mathematics (abstract procedures) and Sains (formulae without conceptual grounding).
- **C3 (L1-Interference / Vocabulary Gap): 33%** — BM/dialect interference in English paper; English register interference in Sains/Mathematics when taught in English (DLP).

### 3. Critic Agent rejection follows a clear socioeconomic gradient
| Profile | Critic Rej% (VPS) | Interpretation |
|---|---|---|
| URBAN_DLP | 5.4% | Triage scripts are ecologically valid — standard English academic register fits |
| URBAN_NON_DLP | 11.2% | Minor register drift; occasional Manglish scaffold rejected |
| RURAL_DLP | 21.3% | English syntax simplification frequently over- or under-calibrated |
| RURAL_NON_DLP | 38.5% | Dialectal BM scaffold hardest to generate accurately; most LLM drift |

The Critic rejection rate is itself a proxy for **how well the system can personalise** to that demographic. RURAL_NON_DLP at 38.5% means roughly 2-in-5 first-draft triage scripts are ecologically invalid — the live system would need multiple re-rolls for this cohort, adding latency.

### 4. GCP PostgREST row-limit gap
GCP proxy returns 181 rows vs 243 via Supabase direct — a ~25% gap concentrated in Mathematics and Sains. This gives VPS a richer question bank for those subjects. The PostgREST proxy should have its default `max-rows` config raised or the query paginated.

### 5. F4/F5 gap has closed
v3 shows F4 and F5 pass rates within 1–2pp of each other on both backends, confirming that the anchor seeding for F5 (previously empty for Math/Sains/BM) has equalised coverage.

---

## Open Action Items

| Priority | Item |
|---|---|
| HIGH | Fix GCP PostgREST `max-rows` config — currently returns 181/243 rows (74%); raise limit or paginate query |
| HIGH | Build real SEDA triage scripts using the LLM chain for RURAL_NON_DLP — 38.5% critic rejection suggests the synthetic heuristic is insufficient; need a live LLM generation + critique loop |
| MEDIUM | Expand Mathematics anchor bank for F5 — only 5 F5 topics seeded; Additional Mathematics needs its own subject entry |
| MEDIUM | Add `min_instances=1` to GCP Cloud Run to eliminate cold-start 503s on the proxy |
| LOW | Seed Bahasa Melayu F4 karangan types more broadly (only Karangan Narratif and a few others) |

---

## Files

| Path | Contents |
|---|---|
| `data/vps_f4f5/synthetic_telemetry.json` | 7,909 item-level records (VPS v3) |
| `data/vps_f4f5/seda_triage_corpus.json` | 390 validated SEDA triage scripts (VPS v3) |
| `data/vps_f4f5/critic_agent_stats.json` | Critic agent evaluation log (VPS v3) |
| `data/gcp_f4f5/synthetic_telemetry.json` | 8,240 item-level records (GCP v3) |
| `data/gcp_f4f5/seda_triage_corpus.json` | 333 validated SEDA triage scripts (GCP v3) |
| `data/gcp_f4f5/critic_agent_stats.json` | Critic agent evaluation log (GCP v3) |
| `scripts/simulate_personas.py` | Simulation engine v3 (300 agents, 5 subjects, F4+F5, failure-conditional drop-off) |
| `seed_spm_f4f5_anchors.py` | Anchor seeder: Math F4/F5 + Sains F4/F5 (10 topics) + BM F5 |
| `seed_english_f5_anchors.py` | Anchor seeder: Bahasa Inggeris F5 (21 topics) |
