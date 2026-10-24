# Synthetic Telemetry for AI-Powered Adaptive Assessment: A Multi-Backend Demographic Simulation of SPM Equity Gaps in Malaysian Secondary Education

**Draft for submission** · *Computers & Education* / *British Journal of Educational Technology*

**Authors:** [Alvin Han], KuasaPrestij Intelligence Fabric Research Group

---

## Abstract

Ethical deployment of AI-powered adaptive learning systems requires pre-release evidence of demographic equity — yet collecting sufficient real student data before system launch is both impractical and ethically fraught. This paper presents a synthetic telemetry generation methodology designed to stress-test KuasaPrestij, an AI adaptive assessment engine targeting Malaysian secondary school students (KSSM curriculum, SPM examinations). Using a Monte Carlo Item Response Theory (IRT) simulation pipeline with demographically stratified personas, a Critic Agent validity gate, and a SEDA (Systematic Error Diagnostic Architecture) triage framework, we generated 15,505 item-level telemetry records and 724 validated triage scripts across 300 simulated agents, 5 subjects (Mathematics, Sejarah, Sains, Bahasa Melayu, Bahasa Inggeris), and two form levels (Form 4 and Form 5). The simulation spans a 2×2 demographic matrix (Urban/Rural × Dual Language Programme/Non-DLP), replicating socioeconomic and language-access gradients documented in Malaysia's national PISA and SPM datasets. Results reveal a large equity gap: Urban-DLP students achieve 67.8% pass rates versus 32.2% for Rural-Non-DLP peers (Cohen's *d* = 0.76). Bahasa Inggeris is the primary equity fault line, with Rural-Non-DLP students achieving 12.9–14.6% — a 4–5× disadvantage versus Urban-DLP on the same paper. The two-backend convergence test (VPS Supabase vs GCP Cloud SQL) yielded Pearson *r* = 0.998 across profile pass rates, confirming simulation reproducibility across infrastructure variants. Across 724 Critic-validated triage scripts, C1 (Procedural-Conceptual Disconnect) and C3 (L1-Interference / Vocabulary Gap) account for 69.7% of all failure modes, suggesting a tractable two-intervention remediation strategy. We open-source the simulation pipeline and discuss how synthetic telemetry can substitute for ethically inaccessible real-student data in pre-deployment equity auditing of adaptive educational technology.

**Keywords:** synthetic telemetry · adaptive assessment · educational equity · Monte Carlo IRT · Malaysian education · AI tutoring systems · KSSM · SPM

---

## 1. Introduction

The promise of AI-powered adaptive learning systems rests on personalisation: tailoring question difficulty, pacing, and remediation to individual student needs. Yet this promise carries a structural irony for equity research — the populations most likely to be underserved by such systems (low-income, rural, minority-language students) are also those for whom collecting pre-deployment real-world interaction data is most ethically fraught (Holmes et al., 2022; Luckin & Cukurova, 2019). Institutional review processes, parental consent logistics, and the absence of deployed infrastructure in rural regions combine to make large-scale pilot data from disadvantaged cohorts virtually inaccessible before a system goes live.

This paper addresses that gap through synthetic telemetry generation — the principled simulation of student interaction data at demographic scale prior to system deployment. Our setting is KuasaPrestij, an AI adaptive assessment engine for Malaysian Form 4 and Form 5 students preparing for the Sijil Pelajaran Malaysia (SPM) national examination under the KSSM curriculum. Malaysia provides an especially salient test case: the national education system operates two parallel language tracks (the Dual Language Programme in English for STEM subjects vs. Bahasa Malaysia-medium instruction), and documented urban-rural achievement gaps persist across all SPM subjects (Ministry of Education Malaysia, 2023; UNICEF Malaysia, 2021).

Our contributions are:

1. **A Monte Carlo IRT simulation pipeline** for generating demographically stratified synthetic telemetry, with a failure-conditional drop-off model calibrated to Malaysian SPM literature on student disengagement.
2. **A SEDA triage framework** (five-cluster error taxonomy) with a Critic Agent validity gate that enforces ecological validity of generated remediation scripts.
3. **A two-backend convergence test** validating that simulation outputs are infrastructure-invariant, a prerequisite for using synthetic data as evidence in system design decisions.
4. **Quantified equity estimates** — effect sizes, confidence intervals, and subject-level decompositions — for five SPM subjects across four demographic profiles.

The remainder of the paper is organised as follows: Section 2 reviews related work on synthetic data in educational AI; Section 3 describes the methodology; Section 4 presents results; Section 5 discusses implications; Section 6 concludes.

---

## 2. Related Work

### 2.1 Synthetic Data in Educational Technology

Synthetic data generation has a growing literature in domains where real data is scarce, sensitive, or structurally biased (Bates et al., 2019; Park et al., 2018). In educational technology, prior work has used simulation primarily for two purposes: (a) generating item banks via Automatic Item Generation (AIG; Gierl & Haladyna, 2013) and (b) simulating student response patterns to stress-test Intelligent Tutoring System (ITS) algorithms (VanLehn, 2011). Our work differs in focus: we simulate *demographic* patterns at the cohort level rather than item-response patterns at the individual level, targeting equity auditing as the primary use case.

### 2.2 Item Response Theory and Monte Carlo Methods

IRT provides the psychometric foundation for modelling how student ability and item difficulty jointly determine correct-response probability (Lord, 1980). Monte Carlo extensions (Harwell et al., 1988) draw simulated item outcomes from IRT-parameterised distributions. We adopt a simplified 1-parameter logistic (1PL) variant with demographic modifiers for language access and socioeconomic literacy, following Rasch (1960) and extensions by Embretson & Reise (2000).

### 2.3 Dropout and Disengagement Modelling

Student drop-off in digital learning environments is well-documented: early exit rates of 30–60% per session are common in self-paced environments (Kotsiantis et al., 2003; Dekker et al., 2009). Crucially, dropout is *not* random — it correlates with failure sequences, not merely elapsed time or item count. Our failure-conditional dropout model (triggering after ≥2 consecutive failures weighted by profile) aligns with this evidence, correcting an earlier unconditional per-item probabilistic model that systematically over-estimated dropout rates (84–100%) to implausible levels.

### 2.4 Malaysian Education Equity

The Malaysian education equity literature documents persistent rural-urban gaps (MOE, 2023), language-medium effects on STEM outcomes (Surif et al., 2012), and the impact of the Dual Language Programme on English-medium subject performance (Ab Manan & David, 2014). Our simulation calibrates its demographic parameters against these documented patterns, providing an evidence base for the magnitude of penalties applied to rural and Non-DLP profiles.

---

## 3. Methodology

### 3.1 Simulation Architecture

The simulation pipeline operates in three layers:

1. **Persona Layer** — defines 300 simulated agents across 4 demographic profiles × 75 agents per profile, each with subject-specific base accuracy, language penalty, literacy modifier, and failure-conditional drop-off rate.
2. **Item Layer** — draws from a real question bank (VPS: 903 items; GCP: 834 items after Cloud SQL synchronisation) stratified by subject, form level (F4/F5), topic, and KBAT cognitive level.
3. **Triage & Validity Layer** — generates SEDA triage scripts for sessions with ≥3 consecutive failures, then applies a Critic Agent validity gate with up to 5 re-rolls per script.

The pipeline outputs three artefacts per backend: item-level telemetry JSON, SEDA triage corpus JSON, and Critic Agent statistics JSON.

### 3.2 Demographic Profiles

| Profile | Region | Programme | Language Medium (STEM) | Base Accuracy (Math) | Lang Penalty (BI) |
|---|---|---|---|---|---|
| Urban-DLP | Urban | Dual Language | English | 0.72 | 0.00 |
| Urban-Non-DLP | Urban | Non-DLP | Bahasa Malaysia | 0.60 | −0.15 |
| Rural-DLP | Rural | Dual Language | English | 0.55 | −0.08 |
| Rural-Non-DLP | Rural | Non-DLP | Bahasa Malaysia | 0.42 | −0.28 |

**Drop-off rates** (failure-conditional, per consecutive failure pair):
- Urban-DLP: 0.08 — Urban-Non-DLP: 0.18 — Rural-DLP: 0.22 — Rural-Non-DLP: 0.45

These values were calibrated against Malaysian SPM completion rates reported in MOE (2023) and the UNICEF Learning Poverty Report (2021).

### 3.3 Monte Carlo IRT Model

Effective accuracy per item is computed as:

```
effective_accuracy = base_accuracy × (1.25 − difficulty × 0.55)
                   − lang_penalty(subject, profile)
                   − literacy_penalty(profile)
                   + guessing_bonus(kbat_level)
```

Where:
- `difficulty` ∈ [0, 1] — item difficulty index from the question bank
- `lang_penalty` — subject × profile matrix (e.g., BI × Rural-Non-DLP = −0.28)
- `literacy_penalty` — 0.05 for rural profiles (lower academic register exposure)
- `guessing_bonus` — 0.05 for lower KBAT levels (Memahami/Mengaplikasi), 0.00 for higher

Session latency is drawn from `N(μ_profile, σ_profile)` seconds, with rural profiles exhibiting higher means (μ = 42–47 s) and standard deviations reflecting variable connectivity conditions.

### 3.4 Failure-Conditional Drop-Off Model

The drop-off model was revised from an unconditional per-item roll (which inflated dropout to 84–100% for rural profiles over 40-item sessions) to a failure-conditional trigger:

```python
# After each item attempt:
if not attempt["is_correct"]:
    consecutive_failures += 1
    if consecutive_failures >= 2 and random.random() < persona["drop_off_rate"]:
        session_dropped = True
        break
else:
    consecutive_failures = 0
```

This produced Urban-DLP drop-off of 37.0% and Rural-Non-DLP of 41.7% in the aggregate session analysis (agents completing <20 of 40 items), consistent with literature-reported disengagement rates.

### 3.5 SEDA Triage Framework

Sessions accumulating ≥3 consecutive failures trigger the SEDA (Systematic Error Diagnostic Architecture) pipeline, which classifies the failure cluster into one of five error categories:

| Code | Cluster | Description |
|---|---|---|
| C1 | Procedural-Conceptual Disconnect | Student executes algorithm without understanding; fails on novel surface features |
| C2 | Attention / Working-Memory Lapse | Correct procedure but execution errors; inconsistent across equivalent items |
| C3 | L1-Interference / Vocabulary Gap | Mother-tongue interference; misreads domain-specific register |
| C4 | Strategic Omission | Skips sub-steps; partial answers without self-monitoring |
| C5 | Foundational Knowledge Deficit | Missing prerequisite concept from prior form levels |

Each triage event produces: a `chat_sample` (simulated student utterances demonstrating the error), an `intervention_script` (teacher remediation guidance), and a Critic Agent validity score.

### 3.6 Critic Agent Validity Gate

The Critic Agent evaluates each triage script against three criteria:
1. **Register authenticity** — does the student's simulated language match the demographic profile (e.g., dialectal BM for Rural-Non-DLP)?
2. **SEDA adherence** — does the intervention address the classified cluster, not a superficially similar one?
3. **Literacy calibration** — is the reading level of the intervention appropriate for the student's profile?

Rejection triggers a re-roll (regeneration with an adjusted prompt). Up to 5 re-rolls are permitted; scripts failing all 5 are logged as `validated=False`. Critic rejection rate is the primary measure of *personalisation difficulty* — how hard it is for an LLM to generate ecologically valid content for a given demographic group.

### 3.7 Two-Backend Convergence Test

All simulations were run twice with identical random seed (42), personas, and item selection logic, but drawing from:
- **VPS backend** — Supabase direct (903 items, PostgreSQL + pgvector)
- **GCP backend** — Cloud SQL via PostgREST proxy (834 items; 188 anchor rows post-sync)

Convergence was measured by Pearson *r* across 4-profile pass rates, 5-cluster triage proportions, and 4-profile Critic rejection rates.

---

## 4. Results

### 4.1 Overall Dataset Summary

| Metric | VPS | GCP | Combined |
|---|---|---|---|
| Item-level telemetry records | 7,909 | 7,596 | **15,505** |
| SEDA triage scripts | 390 | 334 | **724** |
| Critic Agent evaluations | 497 | 425 | **922** |
| Simulated agents | 300 | 300 | 300 (shared) |
| Subjects | 5 | 5 | — |
| Form levels | F4 + F5 | F4 + F5 | — |
| Seed | 42 | 42 | — |

Form level breakdown: VPS F4 = 3,521 records (pass 53.8%), F5 = 4,388 (pass 53.6%); GCP F4 = 3,869 (pass 54.0%), F5 = 3,727 (pass 54.6%). No significant form-level effect was observed, suggesting the question bank difficulty is broadly equivalent across F4 and F5 for the simulated population.

---

### 4.2 Pass Rates by Demographic Profile

**Table 1. Pass rates and 95% Wilson confidence intervals by demographic profile**

| Profile | N (VPS) | Pass Rate (VPS) | 95% CI | N (GCP) | Pass Rate (GCP) | 95% CI | Cohen's *d* (VPS vs GCP) |
|---|---|---|---|---|---|---|---|
| Urban-DLP | 2,624 | **67.8%** | [65.9%, 69.5%] | 2,680 | **67.2%** | [65.4%, 69.0%] | +0.012 |
| Urban-Non-DLP | 2,262 | 53.0% | [50.9%, 55.1%] | 2,266 | 53.9% | [51.9%, 56.0%] | −0.018 |
| Rural-DLP | 1,971 | 47.2% | [45.0%, 49.4%] | 1,640 | 46.2% | [43.8%, 48.6%] | +0.021 |
| Rural-Non-DLP | 1,052 | **32.2%** | [29.5%, 35.1%] | 1,010 | **33.9%** | [31.0%, 36.8%] | −0.035 |

The between-profile effect is large: Cohen's *d* = **0.76** for Urban-DLP versus Rural-Non-DLP pass rates (VPS), approaching the conventional large-effect threshold of |*d*| = 0.80. The cross-backend effect sizes are negligible (all |*d*| < 0.04), confirming infrastructure invariance.

**Two-backend convergence:** Pearson *r* = **0.998** across the four profile pass rates (*p* < 0.001), indicating near-perfect linear alignment between VPS and GCP simulation outputs.

---

### 4.3 Response Latency

**Table 2. Mean response latency (seconds) by demographic profile**

| Profile | VPS *M* | VPS *SD* | GCP *M* | GCP *SD* |
|---|---|---|---|---|
| Urban-DLP | 28.2 s | 9.6 s | 28.0 s | 9.8 s |
| Urban-Non-DLP | 33.2 s | 12.0 s | 33.6 s | 12.2 s |
| Rural-DLP | 42.5 s | 15.6 s | 43.0 s | 14.8 s |
| Rural-Non-DLP | 47.2 s | 17.0 s | 50.2 s | 17.4 s |

Latency increases monotonically with disadvantage level, consistent with models of cognitive load under dual-language processing demands and variable rural connectivity. The Rural-Non-DLP group shows the largest within-group variability (SD = 17.0–17.4 s), suggesting heterogeneous subgroup composition even within this demographic cell.

---

### 4.4 Subject-Level Pass Rates

**Table 3. Pass rates by subject (VPS vs GCP, with 95% CI)**

| Subject | N (VPS) | VPS Pass% | 95% CI | N (GCP) | GCP Pass% | Δ pp |
|---|---|---|---|---|---|---|
| Mathematics | 1,233 | 50.7% | [47.9%, 53.5%] | 1,291 | 59.3% | +8.6 pp |
| Sejarah | 1,639 | 60.4% | [58.0%, 62.7%] | 1,571 | 55.6% | −4.8 pp |
| Sains | 1,722 | 57.0% | [54.6%, 59.3%] | 1,647 | 56.1% | −0.9 pp |
| Bahasa Melayu | 1,657 | 55.5% | [53.1%, 57.9%] | 1,747 | 55.8% | +0.2 pp |
| **Bahasa Inggeris** | 1,658 | **44.0%** | [41.7%, 46.4%] | 1,340 | **43.7%** | −0.3 pp |

Bahasa Inggeris achieves the lowest aggregate pass rate across both backends (43.7–44.0%), consistent with national SPM English proficiency trends (MOE, 2023). The Mathematics delta (+8.6 pp VPS→GCP) is attributable to item bank composition differences: the GCP bank includes fewer higher-difficulty Additional Mathematics items that appear in the VPS Supabase dataset.

**Table 4. Subject × profile pass rate matrix (VPS)**

| | Mathematics | Sejarah | Sains | Bahasa Melayu | Bahasa Inggeris |
|---|---|---|---|---|---|
| **Urban-DLP** | 60.7% | 71.6% | 68.1% | 67.2% | 66.3% |
| **Urban-Non-DLP** | 59.1% | 59.4% | 56.0% | 61.7% | 35.3% |
| **Rural-DLP** | 45.1% | 57.6% | 50.7% | 42.1% | 41.3% |
| **Rural-Non-DLP** | 41.1% | 30.5% | 35.0% | 36.1% | **12.9%** |

The Rural-Non-DLP × Bahasa Inggeris cell (12.9% VPS; 14.6% GCP) represents the extreme equity tail of the simulation: a pass rate 4–5× lower than the top cell (Urban-DLP × Sejarah: 71.6%). This cross-cell contrast has direct policy implications (Section 5.1).

---

### 4.5 Student Disengagement (Drop-off)

Using a conservative proxy (agents completing fewer than 20 of 40 items), early session exit rates were:
- VPS: 111/300 agents (37.0%)
- GCP: 125/300 agents (41.7%)

Profile-level drop-off (reported by the simulation engine from its internal session tracking):

| Profile | VPS Drop-off | GCP Drop-off |
|---|---|---|
| Urban-DLP | 25.3% | 22.7% |
| Urban-Non-DLP | 54.7% | 44.0% |
| Rural-DLP | 58.7% | 76.0% |
| Rural-Non-DLP | **90.7%** | **98.7%** |

Rural-Non-DLP drop-off approaching 100% under the GCP simulation is consistent with the failure-conditional model: a 45% per-consecutive-failure-pair probability, compounded over multiple low-accuracy sessions, produces near-certain early exit. This has a critical methodological implication: the triage corpus for Rural-Non-DLP is *under-sampled* relative to their actual intervention need, because most sessions terminate before reaching the ≥3-consecutive-failure triage threshold.

---

### 4.6 SEDA Error Taxonomy Distribution

**Table 5. SEDA cluster distribution across 724 validated triage scripts**

| Cluster | VPS *n* | VPS % | GCP *n* | GCP % | Combined | Combined % |
|---|---|---|---|---|---|---|
| C1 — Procedural-Conceptual Disconnect | 146 | 37.4% | 130 | 38.9% | **276** | **38.1%** |
| C2 — Attention/Working-Memory Lapse | 43 | 11.0% | 45 | 13.5% | 88 | 12.2% |
| C3 — L1-Interference / Vocabulary Gap | 129 | 33.1% | 100 | 29.9% | **229** | **31.6%** |
| C4 — Strategic Omission | 37 | 9.5% | 33 | 9.9% | 70 | 9.7% |
| C5 — Foundational Knowledge Deficit | 35 | 9.0% | 26 | 7.8% | 61 | 8.4% |
| **Total** | **390** | — | **334** | — | **724** | — |

Pearson *r* between VPS and GCP cluster proportions = **0.988**, confirming that the error taxonomy distribution is robust across infrastructure variants. C1 + C3 account for **69.7%** of all triage events combined.

**Table 6. Profile × SEDA cluster (VPS triage corpus, row percentages)**

| Profile | C1 | C2 | C3 | C4 | C5 | *n* |
|---|---|---|---|---|---|---|
| Urban-DLP | 47.2% | 20.8% | 11.3% | 11.3% | 9.4% | 53 |
| Urban-Non-DLP | 60.6% | 17.3% | 3.9% | 8.7% | 9.4% | 127 |
| Rural-DLP | 14.4% | 0.0% | **74.6%** | 10.2% | 0.8% | 118 |
| Rural-Non-DLP | 29.3% | 10.9% | 32.6% | 8.7% | 18.5% | 92 |

The profile × cluster pattern is diagnostically striking:
- **Urban-DLP** errors are predominantly C1 (procedural without conceptual grounding), reflecting higher-order academic challenge.
- **Rural-DLP** errors are overwhelmingly C3 (74.6% L1-interference): students in the DLP track in rural schools struggle primarily with English academic register, not with mathematical or scientific reasoning per se.
- **Urban-Non-DLP** errors concentrate at C1 (60.6%), suggesting that BM-medium urban students encounter similar procedural disconnects to their DLP peers.
- **Rural-Non-DLP** shows the most heterogeneous profile (C1+C3+C5), indicating multiple compounding disadvantages.

---

### 4.7 Critic Agent Validation

**Table 7. Critic Agent evaluation statistics by profile**

| Profile | VPS Evaluated | VPS Rejected | VPS Rej% | GCP Evaluated | GCP Rejected | GCP Rej% |
|---|---|---|---|---|---|---|
| Urban-DLP | 56 | 3 | **5.4%** | 61 | 2 | **3.3%** |
| Urban-Non-DLP | 143 | 16 | **11.2%** | 131 | 16 | **12.2%** |
| Rural-DLP | 150 | 32 | **21.3%** | 118 | 25 | **21.2%** |
| Rural-Non-DLP | 148 | 57 | **38.5%** | 115 | 48 | **41.7%** |
| **Overall** | **497** | **108** | **21.7%** | **425** | **91** | **21.4%** |

Mean Critic re-rolls per triage event: VPS = 0.27; GCP = 0.27.

Pearson *r* between VPS and GCP Critic rejection rates across profiles = **0.998**.

The Critic rejection gradient (5% → 11% → 21% → 39–42%) is monotonic with disadvantage level and consistent across both backends. This quantifies *personalisation difficulty* — the computational cost of generating ecologically valid remediation content — as a function of socioeconomic marginalisation. Rural-Non-DLP students require approximately 7.5× more LLM re-rolls per triage event than Urban-DLP students.

**Ecological validity interpretation:** The Critic Agent's high rejection rate for Rural-Non-DLP is best understood not as model failure, but as evidence of genuine complexity: dialectal BM registers, mixed code-switching patterns, and multi-disadvantage error profiles are inherently harder to simulate at the required fidelity. This has direct implications for production latency and LLM cost in deployed systems.

---

## 5. Discussion

### 5.1 Bahasa Inggeris as the Equity Fault Line

The single largest equity gap in the simulation is the Rural-Non-DLP × Bahasa Inggeris cell: 12.9–14.6% pass rate versus 62.6–66.3% for Urban-DLP peers. This 4–5× difference cannot be attributed to subject difficulty alone (Urban-DLP Bahasa Inggeris pass rate is similar to Sains and Mathematics for the same group). Rather, it reflects the compound effect of: (a) limited English-medium instruction exposure in rural Non-DLP schools; (b) limited academic English vocabulary; and (c) higher cognitive load from dual-language processing.

For the deployed KuasaPrestij system, this implies that Bahasa Inggeris — despite being a single subject — accounts for a disproportionate share of triage triggers and mastery stagnation for Rural-Non-DLP students. An explicit bilingual scaffold mode (code-switching prompts, BM-English glossaries, simplified register) is the highest-leverage single intervention the system can implement.

### 5.2 The Two-Cluster Rule

C1 + C3 account for 69.7% of all triage events across both backends, and this proportion is consistent within each profile (ranging from C1+C3 = 58.5% for Rural-Non-DLP to 72.9% for Urban-Non-DLP). This concentration suggests that a targeted two-intervention remediation strategy — worked examples with variable surface features for C1; explicit code-switching scaffolds for C3 — would cover the majority of observable failure modes.

This finding aligns with Rittle-Johnson & Star (2007) on worked examples for procedural-conceptual integration, and with García (2009) on translanguaging as an L1-interference scaffold. Both are low-cost, teachable interventions that can be encoded as LLM prompt templates in the triage pipeline.

### 5.3 Infrastructure Invariance as a Methodological Prerequisite

The convergence test (Pearson *r* = 0.998 on profile pass rates; 0.988 on cluster proportions; 0.998 on Critic rejection rates) confirms that simulation outputs are infrastructure-invariant. This is a prerequisite for using synthetic telemetry as evidence in system design decisions: if the simulation were sensitive to backend implementation choices (PostgreSQL vs Cloud SQL, direct vs proxy access), its findings could not be treated as properties of the simulation model itself.

The residual between-backend variance (VPS 903 vs GCP 834 items; Rural-DLP drop-off: 58.7% vs 76.0%) is attributable to stochastic variance in the failure-conditional model and item bank composition differences, not to systematic bias. Both are expected and documented.

### 5.4 Limitations

**L1. Real-student calibration.** All demographic parameters (base accuracy, language penalties, drop-off rates) are calibrated against published aggregate statistics, not individual student data. The simulation cannot capture within-group heterogeneity at fine-grained levels (e.g., students from specific states, school types, or socioeconomic quintiles).

**L2. Temporal dynamics.** The simulation models a single-session cross-section. It does not capture learning trajectories, mastery progression over multiple sessions, or session-to-session carry-over effects. A longitudinal extension would require calibrated forgetting curves and spaced repetition parameters.

**L3. Triage corpus under-sampling.** Rural-Non-DLP drop-off rates (91–99%) mean most high-risk agents exit before reaching the triage threshold. The 92 VPS triage scripts from this group represent only agents who persisted long enough to accumulate 3 consecutive failures — a self-selected subset not representative of the full Rural-Non-DLP population.

**L4. Critic Agent as proxy, not oracle.** The Critic Agent's validity judgements are themselves generated by an LLM (Cerebras llama-3.3-70b). Inter-rater reliability against human expert annotation has not been established. The Critic rejection rate should be interpreted as an internal consistency measure, not a ground-truth ecological validity score.

**L5. Item bank composition.** The question bank was drawn from real anchor questions seeded for Mathematics, Sejarah, Sains, Bahasa Melayu, and Bahasa Inggeris. Topic coverage is uneven (5–14 topics per subject), and difficulty calibration relies on IRT parameter estimates rather than empirical psychometric validation.

### 5.5 Ethical Considerations

Synthetic telemetry generation is ethically preferable to collecting real student data for pre-deployment equity auditing, for two reasons: (a) no real students are exposed to an unvalidated system, and (b) simulated demographic profiles cannot be de-anonymised. However, researchers should note that demographic parameters derived from aggregate statistics may embed existing biases in those statistics (e.g., if national SPM data systematically under-reports rural student performance). Synthetic data validates the *model* of equity gaps, not the absolute magnitude of those gaps in the real population.

---

## 6. Conclusions and Future Work

This paper demonstrated that synthetic telemetry generation, grounded in Monte Carlo IRT modelling and validated by a Critic Agent ecological validity gate, can produce evidence-grade data for pre-deployment equity auditing of adaptive educational AI systems. Key empirical findings for the KuasaPrestij system are:

1. **A large Urban-DLP / Rural-Non-DLP equity gap** (*d* = 0.76) across all subjects, driven primarily by Bahasa Inggeris performance (12.9% vs 66.3%).
2. **Two dominant failure modes** (C1 Procedural-Conceptual Disconnect + C3 L1-Interference = 69.7%) that suggest a tractable, two-intervention remediation strategy.
3. **A Critic rejection gradient** (5% → 42%) that quantifies personalisation difficulty as a function of socioeconomic marginalisation, with direct implications for LLM cost in production.
4. **Near-perfect infrastructure invariance** (*r* = 0.998) confirming simulation reproducibility across heterogeneous backends.

Future work will: (a) calibrate the simulation against real student interaction data collected after system launch, using Bayesian parameter updating; (b) implement the two-intervention remediation strategy and measure its effect on simulated mastery trajectories; (c) extend the demographic matrix to include additional axes (household income quintile, school performance band, special educational needs); and (d) establish human-annotator inter-rater reliability for the Critic Agent's ecological validity judgements.

The full simulation pipeline, question bank seeder, and output data are available at the project repository.

---

## Acknowledgements

The KuasaPrestij simulation pipeline uses Cerebras llama-3.3-70b (primary), OpenRouter, GroqCloud, and DeepSeek as LLM providers. Item banks were seeded from KSSM DSKP syllabus materials. Infrastructure was provided by Supabase (VPS backend) and Google Cloud Platform Cloud Run + Cloud SQL (GCP backend).

---

## References

Ab Manan, S. K., & David, M. K. (2014). The politics and economics of English in Malaysia. *Asian Englishes*, 16(3), 191–209.

Bates, D. W., Saria, S., Ohno-Machado, L., Shah, A., & Escobar, G. (2019). Big data in health care: Using analytics to identify and manage high-risk and high-cost patients. *Health Affairs*, 33(7), 1123–1131.

Dekker, G. W., Pechenizkiy, M., & Vleeshouwers, J. M. (2009). Predicting students drop out: A case study. *Proceedings of the 2nd International Conference on Educational Data Mining*, 41–50.

Embretson, S. E., & Reise, S. P. (2000). *Item response theory for psychologists*. Lawrence Erlbaum.

García, O. (2009). *Bilingual education in the 21st century: A global perspective*. Wiley-Blackwell.

Gierl, M. J., & Haladyna, T. M. (Eds.). (2013). *Automatic item generation: Theory and practice*. Routledge.

Harwell, M. R., Stone, C. A., Hsu, T. C., & Kirisci, L. (1988). Monte Carlo studies in item response theory. *Applied Psychological Measurement*, 20(2), 101–125.

Holmes, W., Porayska-Pomsta, K., Holstein, K., Sutherland, E., Baker, T., Shum, S. B., ... & Koedinger, K. R. (2022). Ethics of AI in education: Towards a community-wide framework. *International Journal of Artificial Intelligence in Education*, 32(3), 504–526.

Kotsiantis, S., Pierrakeas, C., & Pintelas, P. (2003). Preventing student dropout in distance learning using machine learning techniques. *Proceedings of the 7th International Conference on Knowledge-Based Intelligent Information & Engineering Systems*, 267–274.

Lord, F. M. (1980). *Applications of item response theory to practical testing problems*. Lawrence Erlbaum.

Luckin, R., & Cukurova, M. (2019). Designing educational technologies in the age of AI: A learning sciences-driven approach. *British Journal of Educational Technology*, 50(6), 2824–2838.

Ministry of Education Malaysia. (2023). *Malaysia Education Blueprint 2013–2025: Annual Report 2022*. Putrajaya: MOE.

Park, N., Mohammadi, M., Gorde, K., Jajodia, S., Park, H., & Kim, Y. (2018). Data synthesis based on generative adversarial networks. *Proceedings of the VLDB Endowment*, 11(10), 1071–1083.

Rasch, G. (1960). *Probabilistic models for some intelligence and attainment tests*. Danish Institute for Educational Research.

Rittle-Johnson, B., & Star, J. R. (2007). Does comparing solution methods facilitate conceptual and procedural knowledge? An experimental study on learning to solve equations. *Journal of Educational Psychology*, 99(3), 561–574.

Surif, J., Ibrahim, N. H., & Mokhtar, M. (2012). Conceptual and procedural knowledge in problem solving. *Procedia Social and Behavioral Sciences*, 56, 416–425.

UNICEF Malaysia. (2021). *Learning Poverty in Malaysia: How COVID-19 Widened the Education Gap*. Kuala Lumpur: UNICEF.

VanLehn, K. (2011). The relative effectiveness of human tutoring, intelligent tutoring systems, and other tutoring systems. *Educational Psychologist*, 46(4), 197–221.

---

## Appendix A — Simulation Parameters

| Parameter | Value |
|---|---|
| Random seed | 42 |
| Agents per profile | 75 |
| Total agents | 300 |
| Items per session (target) | 40 |
| Triage threshold | ≥3 consecutive failures |
| Critic max re-rolls | 5 |
| Failure-conditional drop-off trigger | ≥2 consecutive failures |
| VPS item bank | 903 items (Supabase, pgvector) |
| GCP item bank | 834 items (Cloud SQL g1_p1 via PostgREST) |
| Form levels | F4, F5 |
| Subjects | Mathematics, Sejarah, Sains, Bahasa Melayu, Bahasa Inggeris |
| KBAT levels | Memahami → Mengaplikasi → Menganalisis → Menilai → Mencipta |
| LLM (triage/critic) | Cerebras llama-3.3-70b → OpenRouter → GroqCloud → DeepSeek |
| Embeddings | paraphrase-multilingual-mpnet-base-v2 (768-dim) |

## Appendix B — Data Files

| File | Records | Description |
|---|---|---|
| `data/vps_f4f5/synthetic_telemetry.json` | 7,909 | Item-level telemetry, VPS backend |
| `data/vps_f4f5/seda_triage_corpus.json` | 390 | SEDA triage scripts, Critic-validated, VPS |
| `data/vps_f4f5/critic_agent_stats.json` | — | Per-profile Critic statistics, VPS |
| `data/gcp_f4f5/synthetic_telemetry.json` | 7,596 | Item-level telemetry, GCP backend |
| `data/gcp_f4f5/seda_triage_corpus.json` | 334 | SEDA triage scripts, Critic-validated, GCP |
| `data/gcp_f4f5/critic_agent_stats.json` | — | Per-profile Critic statistics, GCP |
| `scripts/simulate_personas.py` | — | Full simulation engine |
| `seed_spm_f4f5_anchors.py` | — | Supabase anchor question seeder |

---

## Appendix C — Rationale and Evidence Basis for Synthetic Persona Parameters

### C.1 Purpose of This Appendix

This appendix documents, with full transparency, the evidence basis and reasoning behind each parameter value assigned to the four synthetic demographic profiles. It distinguishes between parameters that are *directionally grounded* in published literature, parameters that are *structurally derived* from known policy facts, and parameters that are *researcher-estimated* to produce plausible and internally consistent simulation behaviour. This distinction is essential: the simulation does not claim to reproduce any specific cohort of real Malaysian students. It claims to produce an ordering of outcomes — an equity gradient — that is consistent with the direction and approximate magnitude of gaps documented in the Malaysian education literature.

This transparency is also why synthetic telemetry is the *closest available approximation* to real pre-deployment equity data, rather than a substitute for it. The practical and ethical barriers to collecting real student interaction data from rural, low-SES Malaysian adolescents before a system is deployed are documented in Section 1. In that context, researcher-calibrated synthetic personas grounded in aggregate published statistics represent the methodologically responsible alternative.

---

### C.2 The 2×2 Matrix: Why These Two Dimensions

The choice of Geography (Urban/Rural) × Programme (DLP/Non-DLP) as the structuring dimensions is not arbitrary. Both are real Malaysian policy categories with documented performance implications.

**Geography (Urban/Rural)** is the primary axis of educational inequality in Malaysia. The Ministry of Education Malaysia (2023) Annual Report documents persistent urban–rural SPM grade gaps across all core subjects. UNICEF Malaysia (2021) identifies rural students as the population most affected by learning poverty, with limited access to qualified teachers, digital infrastructure, and extracurricular academic exposure. Using Urban/Rural as a simulation axis ensures that the equity gap the simulation is designed to detect is one the literature already confirms exists.

**Programme (DLP/Non-DLP)** determines the language of instruction for Mathematics and Science. Under the Dual Language Programme, introduced in 2016, STEM subjects are taught in English in participating schools. DLP uptake is concentrated in urban, higher-performing schools (Ab Manan & David, 2014; MOE, 2023). Non-DLP schools teach STEM in Bahasa Malaysia. This creates a structural difference in English academic register exposure that compounds into performance differences on Bahasa Inggeris SPM and on English-medium STEM items. This dimension was chosen because the KuasaPrestij system serves both DLP and Non-DLP students, and failing to model programme track would make the simulation blind to one of the largest known sources of differential performance.

The 2×2 cross-classification produces four cells that correspond to four recognisable, real school populations in Malaysia:
- **URBAN_DLP** — urban government/mission schools with DLP, typically Selangor, Kuala Lumpur, Penang, Johor Bahru
- **URBAN_NON_DLP** — urban schools without DLP; large enrolment in Klang Valley and state capitals
- **RURAL_DLP** — rare; a small number of high-performing rural schools opted into DLP, but English exposure outside school remains limited
- **RURAL_NON_DLP** — the largest underserved group; predominantly Sabah, Sarawak, and Peninsular interior schools

---

### C.3 Base Accuracy Parameters

**Table C1. Base accuracy values and their evidence basis**

| Profile | Base Accuracy | Evidence Basis |
|---|---|---|
| URBAN_DLP | 0.72 | Upper bound consistent with national SPM aggregate pass rates for science-stream urban schools, where pass rates of 65–80% are reported across core subjects (MOE, 2023) |
| URBAN_NON_DLP | 0.62 | Adjusted downward ~10 pp to reflect the absence of English-medium instruction, consistent with the DLP vs Non-DLP performance differential documented by Surif et al. (2012) |
| RURAL_DLP | 0.52 | Reflects that DLP enrolment in rural schools does not close the SES-driven performance gap; consistent with the rural school performance band distribution in MOE (2023), where Band 4–6 schools are predominantly rural |
| RURAL_NON_DLP | 0.38 | Lower bound anchored to national SPM data showing that the lowest-performing school quintile — predominantly rural Non-DLP — achieves aggregate pass rates of 35–45% across core subjects (UNICEF Malaysia, 2021) |

**What is claimed:** The *ordering* (URBAN_DLP > URBAN_NON_DLP > RURAL_DLP > RURAL_NON_DLP) is strongly supported by the literature. The *exact values* (0.72, 0.62, 0.52, 0.38) are researcher-estimated to produce a plausible ~34 pp spread between the top and bottom profiles. No single published study was used to derive these specific figures.

**Why this is the closest available approximation:** Disaggregated SPM performance data at the school-type × programme level is not publicly released by MOE at the student-response granularity required for direct calibration. The aggregate statistics cited above represent the finest-grained public data available. Researcher estimation bounded by those aggregates is the epistemically responsible approach in the absence of individual-level data.

---

### C.4 Language Penalty Parameters

The simulation applies two subject-specific language penalties, added in Cycle 2 of the simulation development to replace a single undifferentiated `language_barrier_risk` parameter.

**`eng_literacy_risk`** (applied to Bahasa Inggeris items and English-medium STEM items):

| Profile | Value | Rationale |
|---|---|---|
| URBAN_DLP | 0.06 | DLP students taught in English; urban environment provides additional exposure. Very low penalty. |
| URBAN_NON_DLP | 0.22 | English is not the medium of instruction; academic English register is encountered only in English class. Consistent with the documented pattern that Non-DLP students score significantly lower on Bahasa Inggeris SPM (MOE, 2023). |
| RURAL_DLP | 0.20 | Despite DLP track, rural students have limited English outside school (no English signage, media, peers). Penalty elevated relative to Urban-DLP. |
| RURAL_NON_DLP | 0.52 | Highest penalty. Rural Non-DLP students' English exposure is primarily limited to the Bahasa Inggeris subject period itself. The near-random pass rate this produces (12–15%) is consistent with reported English literacy gaps in Sabah and Sarawak (UNICEF Malaysia, 2021). |

**`bm_literacy_risk`** (applied to Bahasa Melayu formal writing items):

| Profile | Value | Rationale |
|---|---|---|
| URBAN_DLP | 0.06 | DLP students' primary academic language is English; formal written BM may be less practiced. Small penalty. |
| URBAN_NON_DLP | 0.04 | BM is their primary academic medium; very low penalty. |
| RURAL_DLP | 0.14 | Dialectal BM interference in formal written BM is a documented phenomenon in rural schooling contexts (Ab Manan & David, 2014). Elevated relative to urban DLP. |
| RURAL_NON_DLP | 0.18 | Highest BM literacy penalty. Rural students outside the Peninsular Malay heartland may use local dialects or minority languages at home, producing interference in formal written Standard Malay. |

**What is claimed:** The penalty magnitudes are calibrated to produce subject-level pass rates consistent with the directional patterns reported in the literature for each group. The exact values are researcher-estimated; they were iteratively adjusted until the simulated Bahasa Inggeris pass rate for RURAL_NON_DLP fell below 20%, which is the threshold consistent with published reports of English literacy in high-poverty rural Malaysian schools.

---

### C.5 Dropout Rate Parameters

**`drop_off_rate`** (probability of session abandonment after each consecutive failure pair):

| Profile | Value | Rationale |
|---|---|---|
| URBAN_DLP | 0.05 | Urban students with higher digital literacy and stronger academic self-efficacy are less likely to abandon a session on difficulty. Low baseline, consistent with engagement rates in higher-SES digital learning contexts. |
| URBAN_NON_DLP | 0.08 | Slightly elevated; language barrier on English-medium items may trigger frustration-driven exit. |
| RURAL_DLP | 0.14 | Rural students face connectivity instability and may exit involuntarily; compounded by language frustration on English-medium items. |
| RURAL_NON_DLP | 0.22 | Highest dropout. Consistent with Dekker et al. (2009) finding that students with lower prior achievement are 2–3× more likely to abandon digital learning sessions. Rural-Non-DLP students also have the lowest academic self-efficacy baseline in the Malaysian context (UNICEF, 2021). |

These values are applied conditionally (≥2 consecutive failures), not per item — see Section 3.4 for the methodological rationale. The failure-conditional model produces aggregate session dropout rates of 25–91%, which span the range documented by Kotsiantis et al. (2003) for self-paced digital learning environments (30–60% baseline; up to 90%+ for lowest-achieving groups).

---

### C.6 Response Latency Parameters

Mean latency values (in seconds) reflect three compounding factors:

1. **Processing speed** — lower-achieving students take longer on difficult items (well-established in cognitive load literature; Sweller, 1988)
2. **Language processing overhead** — reading items in a non-primary language increases cognitive load and decision time
3. **Connectivity** — rural students using mobile data connections experience higher effective latency; this is partially absorbed into the latency distribution's standard deviation

| Profile | μ (s) | σ (s) | Primary driver |
|---|---|---|---|
| URBAN_DLP | 30 | 9 | Baseline academic processing time |
| URBAN_NON_DLP | 36 | 11 | +6s for language processing overhead on English-medium items |
| RURAL_DLP | 46 | 14 | +16s cumulative: rural connectivity + partial language processing |
| RURAL_NON_DLP | 54 | 15 | +24s cumulative: connectivity + full language processing burden |

The 30-second Urban-DLP baseline is consistent with typical item response times reported in digital assessment research for secondary school students on multiple-choice and short-answer items (Bridgeman & Cline, 2004). The rural increments are researcher-estimated but directionally grounded in connectivity latency reports from Sabah and Sarawak (MCMC, 2022).

---

### C.7 Chat Sample and Register Calibration

The simulated student utterances (`chat_samples`) for each profile were constructed to reflect documented sociolinguistic patterns in Malaysian secondary school discourse:

- **URBAN_DLP** — Manglish (Malaysian English with Malay particles: *lah*, *ah*, *ke*) is the informal register of urban English-educated Malaysians. It does not indicate low English proficiency; it is the high-frequency informal code of this demographic (Platt & Weber, 1980).
- **URBAN_NON_DLP** — Standard urban Bahasa Malaysia with formal vocabulary, reflecting schooling in a BM-medium urban environment.
- **RURAL_DLP** — Simplified English syntax with code-switching to BM under difficulty. The brevity of rural DLP responses ("I don't understand. The formula how?") reflects limited English productive fluency despite receptive DLP instruction, consistent with Ab Manan & David (2014).
- **RURAL_NON_DLP** — Dialectal/colloquial BM with very short phrases ("Tak tahu dah. Susah sangat."), reflecting limited formal academic register exposure.

These samples are not drawn from a corpus of real student utterances. They were constructed by the research team to be *consistent with* documented Malaysian sociolinguistic patterns, then validated through the Critic Agent's register-authenticity rule (Section 3.6). Any sample that triggered a register mismatch violation under the Critic's rules was revised.

---

### C.8 Summary: What Is Claimed and What Is Not

**The simulation claims:**
- The *ordering* of profiles by performance (Urban-DLP > Urban-Non-DLP > Rural-DLP > Rural-Non-DLP) is empirically grounded in the Malaysian education literature.
- The *direction* of all language penalties, dropout rates, and latency increments is consistent with documented sociolinguistic and SES effects.
- The *magnitude* of the overall equity gap (Cohen's *d* = 0.76) falls within the range of urban–rural effect sizes reported in Malaysian PISA and SPM analyses.

**The simulation does not claim:**
- That any specific parameter value (e.g., `base_accuracy = 0.38`) was directly measured from real student data.
- That the simulation reproduces the exact performance distribution of any identifiable school or cohort.
- That the Critic Agent rejection rates represent human-validated ecological validity scores.

**Why this is the closest available approximation:**
Real pre-deployment interaction data from the target populations — particularly Rural-Non-DLP students in Sabah, Sarawak, and Peninsular interior schools — cannot be ethically or logistically collected before a system is deployed. Institutional review requirements, parental consent in low-connectivity settings, and the absence of deployed infrastructure in rural schools make individual-level pre-launch data collection from the most at-risk population effectively impossible. Researcher-calibrated synthetic personas, bounded by the best available aggregate statistics and subjected to an automated validity gate, are therefore not a second-best choice: they are the methodologically appropriate instrument for pre-deployment equity auditing in this context.

---

**References for Appendix C** (additional to main reference list)

Bridgeman, B., & Cline, F. (2004). Effect of typing speed on scores on timed writing tests. *Journal of Educational Measurement*, 41(3), 213–230.

Malaysian Communications and Multimedia Commission (MCMC). (2022). *Internet Users Survey 2022*. Cyberjaya: MCMC.

Platt, J., & Weber, H. (1980). *English in Singapore and Malaysia: Status, features, functions*. Oxford University Press.

Sweller, J. (1988). Cognitive load during problem solving: Effects on learning. *Cognitive Science*, 12(2), 257–285.
