# KuasaPrestij vs BKT-IRT Hybrid — Comparative Analysis

_2026-09-22_

---

## Knowledge State Model

| Dimension | KuasaPrestij | BKT-IRT Hybrid |
|---|---|---|
| State representation | Scalar mastery score (0–1) | Latent binary P(Ln) + continuous ability θ |
| Update rule | Fixed ±0.1/±0.05 per answer | Bayes' rule (BKT) + maximum likelihood (IRT) |
| Slip/guess modelling | None | Explicit P(S) and P(G) parameters |
| Per-item discrimination | None | IRT 2PL/3PL a-parameter |

KuasaPrestij's mastery score is a deterministic counter — it treats a correct answer identically regardless of item difficulty. A BKT-IRT agent knows that getting a hard item right is stronger evidence of mastery than getting an easy one right, and that a slip (knows but answers wrong) is noise, not regression.

---

## Item Selection

BKT-IRT selects next items by **maximising Fisher information** at the student's current ability estimate — it picks the item where uncertainty about θ is reduced most. KuasaPrestij selects by **LLM prompt conditioning on error history**, which is semantically richer but not information-optimal. The current system does content-aware selection; BKT-IRT does psychometric-optimal selection.

**KuasaPrestij's advantage:** Novel items can be generated targeting a specific misconception (e.g., "student keeps confusing mitosis/meiosis phase 2"). BKT-IRT can only select from a pre-calibrated item bank — cold-start problem on new topics or custom KSSM content.

---

## Personalization Depth

The `event_logs` table captures `error_category`, `root_cause`, and `intervention`, which is qualitatively deeper than BKT's four scalar parameters. A BKT-IRT agent knows *how likely* a student knows a skill; KuasaPrestij knows *why* they got it wrong and *what to do about it*. This is a genuine edge in pedagogical intervention quality.

---

## Weaknesses of Current Approach

1. **No item difficulty calibration.** Mastery delta is flat (±0.1) — a student who barely passes a hard question and easily passes an easy question get the same update. IRT fixes this.
2. **No forgetting model.** Extended BKT variants incorporate temporal decay. The current score doesn't decay with time.
3. **No psychometric validity.** The mastery score isn't anchored to any external scale. BKT-IRT θ is comparable across students and can be validated against standardised test outcomes (e.g., PT3/SPM).
4. **Unlock threshold is arbitrary.** Score ≥0.9 OR 10 questions/day has no statistical basis. IRT mastery thresholds can be set at a calibrated ability level with known confidence intervals.

---

## The Core Trade-off

| | KuasaPrestij | BKT-IRT |
|---|---|---|
| Curriculum alignment | KSSM-native, KBAT-sequenced | Curriculum-blind |
| Item generation | Generative (LLM, infinite) | Fixed calibrated bank |
| Intervention quality | Root-cause + natural language | None / rule-based |
| Multilingual | BM/EN/ZH | Typically monolingual |
| Statistical rigour | Informal | Rigorous (psychometrically validated) |
| Cold-start | Handles new topics immediately | Requires item pre-calibration |
| Ability comparability | Not comparable across students | Comparable (θ scale) |

BKT-IRT is **statistically rigorous but curriculum-blind** — it optimises measurement precision. KuasaPrestij is **curriculum-aligned and intervention-rich but psychometrically informal** — it knows KSSM topics, KBAT levels, multilingual content, and generates targeted remediation.

---

## The 80% Fix: Elo-Weighted Mastery

A production adaptive system at scale (Duolingo, Khan Academy) eventually needs both. The practical path forward:

1. Add a **running difficulty estimate per generated question** based on historical answer rates (Elo-style or simple empirical p-value).
2. Weight mastery delta by item difficulty — correct on hard item → +0.15; correct on easy item → +0.05.
3. This captures 80% of IRT's benefit without full calibration infrastructure.

Full BKT-IRT integration is the next step after that baseline is in place.
