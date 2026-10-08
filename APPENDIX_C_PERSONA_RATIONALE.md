# Appendix C — Rationale and Evidence Basis for Synthetic Persona Parameters

### C.1 Purpose of This Appendix

This appendix documents, with full transparency, the evidence basis and reasoning behind each parameter value assigned to the four synthetic demographic profiles. It distinguishes between parameters that are *directionally grounded* in published literature, parameters that are *structurally derived* from known policy facts, and parameters that are *researcher-estimated* to produce plausible and internally consistent simulation behaviour. This distinction is essential: the simulation does not claim to reproduce any specific cohort of real Malaysian students. It claims to produce an ordering of outcomes — an equity gradient — that is consistent with the direction and approximate magnitude of gaps documented in the Malaysian education literature.

This transparency is also why synthetic telemetry is the *closest available approximation* to real pre-deployment equity data, rather than a substitute for it. The practical and ethical barriers to collecting real student interaction data from rural, low-SES Malaysian adolescents before a system is deployed are documented in Section 1 of the main paper. In that context, researcher-calibrated synthetic personas grounded in aggregate published statistics represent the methodologically responsible alternative.

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
| RURAL_DLP | 0.14 | Dialectal BM interference in formal written BM is a documented phenomenon in rural schooling contexts (Ab Manan & David, 2014). Elevated relative to Urban-DLP. |
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

These values are applied conditionally (≥2 consecutive failures), not per item. The failure-conditional model produces aggregate session dropout rates of 25–91%, which span the range documented by Kotsiantis et al. (2003) for self-paced digital learning environments (30–60% baseline; up to 90%+ for lowest-achieving groups).

---

### C.6 Response Latency Parameters

Mean latency values (in seconds) reflect three compounding factors:

1. **Processing speed** — lower-achieving students take longer on difficult items (cognitive load literature; Sweller, 1988)
2. **Language processing overhead** — reading items in a non-primary language increases cognitive load and decision time
3. **Connectivity** — rural students using mobile data connections experience higher effective latency, partially absorbed into the distribution's standard deviation

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

These samples are not drawn from a corpus of real student utterances. They were constructed by the research team to be *consistent with* documented Malaysian sociolinguistic patterns, then validated through the Critic Agent's register-authenticity rule. Any sample that triggered a register mismatch violation was revised before being locked into the simulation.

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

### References

Ab Manan, S. K., & David, M. K. (2014). The politics and economics of English in Malaysia. *Asian Englishes*, 16(3), 191–209.

Bridgeman, B., & Cline, F. (2004). Effect of typing speed on scores on timed writing tests. *Journal of Educational Measurement*, 41(3), 213–230.

Dekker, G. W., Pechenizkiy, M., & Vleeshouwers, J. M. (2009). Predicting students drop out: A case study. *Proceedings of the 2nd International Conference on Educational Data Mining*, 41–50.

Kotsiantis, S., Pierrakeas, C., & Pintelas, P. (2003). Preventing student dropout in distance learning using machine learning techniques. *Proceedings of the 7th International Conference on Knowledge-Based Intelligent Information & Engineering Systems*, 267–274.

Malaysian Communications and Multimedia Commission (MCMC). (2022). *Internet Users Survey 2022*. Cyberjaya: MCMC.

Ministry of Education Malaysia. (2023). *Malaysia Education Blueprint 2013–2025: Annual Report 2022*. Putrajaya: MOE.

Platt, J., & Weber, H. (1980). *English in Singapore and Malaysia: Status, features, functions*. Oxford University Press.

Surif, J., Ibrahim, N. H., & Mokhtar, M. (2012). Conceptual and procedural knowledge in problem solving. *Procedia Social and Behavioral Sciences*, 56, 416–425.

Sweller, J. (1988). Cognitive load during problem solving: Effects on learning. *Cognitive Science*, 12(2), 257–285.

UNICEF Malaysia. (2021). *Learning Poverty in Malaysia: How COVID-19 Widened the Education Gap*. Kuala Lumpur: UNICEF.
