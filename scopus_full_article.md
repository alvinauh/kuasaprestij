# Reframing AI Tutoring as Error Triage, Not Dialogue: A Technical Action Research Study Combining System Telemetry and Expert Appraisal, with Dialogic-Quality Auditing via SEDA

**Dr Alvin Auh Min Han**
¹ Academic Lecturer, Institute of Teacher Education, Gaya Campus, Kota Kinabalu, Malaysia
Corresponding author: alvinauh@hotmail.com

---

## Abstract

This study reports the design, engineering, and evaluation of an LLM-driven tutoring system for secondary school students (ages 16-17) preparing for the Malaysian Sijil Pelajaran Malaysia (SPM) examination. For subjects such as mathematics, the most recent cohort had 23% of candidates fail subjects such as mathematics. In contrast to the dominant paradigm that positions generative AI as an autonomous Socratic dialogue partner, the system is deliberately designed as an error-triage instrument: when a learner repeatedly fails a question, the model can generate a structured intervention script that routes the learner to a human teacher. We adopt Technical Action Research (TAR) under McKay and Marshall's dual-imperative model, using a primarily telemetry-driven evaluation design, complemented by an expert appraisal in which one experienced SPM mathematics teacher reviewed the AI-generated triage scripts. Six interlocking development cycles are reported, addressing non-deterministic LLM JSON validation, API rate-limiting (HTTP 429) during a 1,062-question generation run, time-of-check-to-time-of-use (TOCTOU) race conditions on concurrent mastery updates, frontend authentication-state lags that propagated invalid identifiers into strict UUID fields, production seed-script dependency failures, and the construction of an automated teacher-triage alerting backend. To evaluate pedagogical quality without recruiting learners, we introduce a SEDA-as-artifact-audit protocol: the machine-authored triage scripts are coded against the Scheme for Educational Dialogue Analysis (SEDA), demonstrating that a non-dialogic deployment can nonetheless embed dialogically rich teacher-facing scaffolds. The study contributes (i) a transferable reliability-engineering account of deploying LLMs in resource-constrained schools, (ii) a methodological template for utilizing a single respondent for TAR in educational technology, and (iii) a novel application of SEDA to AI-generated artifacts. This is due to the article's stance that for exam-conditioned, low-metacognition cohorts, teacher-mediated triage is a more defensible deployment of AI than autonomous dialogue.

**Keywords:** large language models; intelligent tutoring systems; technical action research; teacher-in-the-loop; dialogic teaching; SEDA; formative assessment; educational technology implementation; formative assessment.

---

## 1. Introduction

### 1.1 Background and problem context

There are subjects in the Malaysian education syllabus that are challenging for students. For example, Mathematics attainment remains a persistent bottleneck in Malaysian secondary education. In the most recent SPM cohort, approximately 85,000 candidates - around 23% - failed mathematics, making it the subject with the highest failure rate nationally (MalaysiaNow, 2024). This matters acutely because national policy positions mathematics and computational literacy as foundational to the country's ambitions in computing, data science, and artificial intelligence, as articulated in the Malaysia Education Blueprint 2013-2025 (Ministry of Education Malaysia, 2013), the National Artificial Intelligence Roadmap 2021-2025, and the Digital Education Policy 2023. The simultaneous national push to embed AI across the educational ecosystem and the stubborn underperformance in foundational mathematics create both an opportunity and a risk: AI tutoring tools may help, but only if their design is matched to the realities of the cohort they serve.

The cohort in question - students aged 16 to 17 preparing for a single high-stakes national examination - is shaped by exam-focused, answer-oriented learning strategies. These conditions, we argue, fundamentally constrain what an automated tutor can and should attempt.

### 1.2 The dialogue dilemma in AI tutoring for exam-focused cohorts

The prevailing vision of LLM-based tutoring casts the model as a Socratic interlocutor that elicits reasoning through open-ended questioning (Kasneci et al., 2023; VanLehn, 2011). This vision draws legitimacy from a strong tradition in the learning sciences which holds that high-quality classroom talk advances understanding (Alexander, 2020; Mercer & Howe, 2012). However, the evidence base for dialogic pedagogy assumes a learner with sufficient metacognitive self-awareness to reflect on, and verbalize, their own reasoning (Howe et al., 2019).

For exam-conditioned cohorts approaching a terminal national assessment, this assumption is fragile. Open-ended AI dialogue imposes a substantial language-production burden, and - more seriously - risks reinforcing learned helplessness among low-mastery students who have been systematically conditioned toward answer-retrieval rather than reasoning (Seligman, 1972; Black & Wiliam, 2009). When a struggling learner is repeatedly asked to 'explain their thinking' by a tireless machine that never simply tells them whether they are right, the interaction can amplify rather than relieve the very disengagement it intends to remedy. The system reported here is built on the premise that, for this cohort, the responsible role of AI is not to simulate a tutor but to detect failure reliably and to escalate it to a human teacher.

### 1.3 Research gap and contribution

Two gaps motivate this work. First, the educational-technology literature is rich in claims about LLM tutoring efficacy but comparatively thin on the reliability engineering required to operate such systems in resource-constrained schools, where rate limits, concurrency, and brittle deployment pipelines determine whether a tool functions at all. Second, evaluations of AI tutoring overwhelmingly depend on human-subject studies, which are slow, ethically demanding with minors, and confounded by novelty effects. This study addresses both gaps and makes three contributions:

- A transferable reliability-engineering account of deploying an LLM pipeline in a school context, structured as six diagnostic-corrective cycles grounded entirely in system telemetry.
- A methodological template for a telemetry-driven TAR template complemented by expert appraisal in which results are grounded in real world experience by an experienced teacher.
- A novel application of the Scheme for Educational Dialogue Analysis (SEDA) to AI-generated artifacts - the SEDA-as-artifact-audit protocol - which evaluates the dialogic quality of machine-authored teacher scaffolds without observing any live classroom talk.

### 1.4 Research questions

The study is guided by the following research questions, framed across the dual imperatives of TAR (McKay & Marshall, 2001):

- **RQ1 (problem-solving imperative):** What classes of engineering failure arise when an LLM-driven triage pipeline is deployed at realistic scale for an SPM mathematics cohort, and what corrective designs resolve them?
- **RQ2 (research imperative):** What transferable design principles for reliable, teacher-in-the-loop AI tutoring can be abstracted from these cycles?
- **RQ3 (pedagogical-quality imperative):** To what extent do the AI-generated triage intervention scripts exhibit dialogically rich features when coded against SEDA, despite the system being non-dialogic in deployment?
- **RQ4:** How does an expert teacher's usability ratings and feedback corroborate the SEDA artifact audit and inform refinement?

### 1.5 Structure of the paper

Section 2 reviews the theoretical and technical literature. Section 3 details the zero-respondent TAR methodology, the system architecture, and the SEDA-as-artifact-audit protocol. Section 4 reports the six development cycles. In addition, section 4 presents the SEDA analysis of triage artifacts. Section 5 discusses theoretical and implementation implications, design principles, and limitations and concludes the study.

---

## 2. Literature Review and Theoretical Framework

### 2.1 Large language models and intelligent tutoring systems

Intelligent tutoring systems (ITS) have a long lineage, and meta-analytic evidence suggests that well-designed ITS can approach the effectiveness of human tutoring on some outcomes (VanLehn, 2011). The arrival of general-purpose LLMs has reinvigorated the field: recent systematic reviews report that tutoring is among the most common educational applications of LLMs, with evidence of gains in engagement and performance, alongside recurring concerns about over-reliance, reliability, privacy, and assessment fairness (Kasneci et al., 2023; Kuhail et al., 2023; Yan et al., 2024). The literature increasingly distinguishes between LLMs as content generators, as conversational tutors, and as instruments embedded in larger socio-technical systems. This study sits firmly in the third category.

### 2.2 Formative assessment and mastery learning

The system's pedagogical logic is grounded in mastery learning and formative assessment (Black & Wiliam, 1998, 2009; Wiliam, 2011). Mastery learning holds that most learners can reach a defined standard if given appropriate conditions and additional support after failure, rather than being moved forward regardless. Formative assessment reframes assessment as a driver of learning: the central act is not scoring but using evidence of difficulty to adjust the next instructional step. The triage system operationalizes both: a per-student mastery score gates progression, and the feedback will route the learners' tailored script, to a teacher.

### 2.3 Dialogic teaching and the limits of autonomous Socratic AI

Dialogic teaching theory argues that talk that invites reasoning, builds on ideas, and makes thinking explicit is central to deep learning (Alexander, 2020; Mercer & Howe, 2012; Howe et al., 2019). This tradition is the wellspring of the 'AI-as-Socratic-tutor' aspiration. However, the same literature is careful about preconditions: dialogic gains depend on a culture of talk and on learners able to participate metacognitively. For a low-metacognition, exam-pressured cohort, autonomous Socratic AI risks two failure modes.

First, a language-production burden that disadvantages learners who struggle to verbalize reasoning. This is also compounded by the language disparity of the students as seen in Ying (2024). Second, the reinforcement of learned helplessness (Seligman, 1972) in students conditioned toward answer-focused strategies, for whom relentless questioning without resolution can confirm a belief that effort is futile. This study therefore relocates the dialogic act: rather than have the machine conduct the dialogue, the machine prepares a teacher to conduct it. SEDA (Section 2.5) provides the lens for evaluating how well it does so.

### 2.4 Teacher-in-the-loop and human-AI complementarity

A growing body of work on human-AI complementarity argues that the most robust educational deployments preserve teacher agency rather than displacing it (Holstein, McLaren, & Aleven, 2019). Closely related are learning-analytics early-warning systems, which detect at-risk learners from interaction data and surface them to educators through dashboards and intervention nudges. Such systems emphasize the centrality of timely, actionable teacher-facing feedback over fully automated remediation. In addition, this can also provide administrators with the necessary data to conduct programs that address common issues as pointed out by the AI.

As such, the triage architecture reported could produce a per-question early-warning system where the 'intervention message' is a structured, dialogue-ready script of suggestions for the teachers to use. However, if measures by administrators need to be taken, they have the necessary data from the triage architecture to do so.

### 2.5 The Scheme for Educational Dialogue Analysis (SEDA)

SEDA (Scheme for Educational Dialogue Analysis) is a research-based coding scheme for analyzing classroom dialogue across educational and cultural contexts (Hennessy et al., 2016). It comprises 33 communicative acts identified at the utterance level by their interactional function, grouped into eight clusters; clustering increases practicability, supports quantification, and improves inter-rater reliability. A teacher-facing adaptation, T-SEDA, repackaged the scheme as a practitioner inquiry tool (Vrikki et al., 2019). SEDA has conventionally been applied to transcripts of live human talk. The present study extends it in a new direction - AI-authored teacher-intervention scripts - to assess whether a non-dialogic system can still produce dialogically rich scaffolds. The eight clusters used here are summarized in Table 1.

| Code | Cluster | Description | Example trigger in a triage script |
|---|---|---|---|
| IRE | Invite elaboration or reasoning | Prompts that ask for explanation, justification, or working | "Ask the student to talk you through how they got the denominator." |
| RE | Make reasoning explicit | Statements that surface the underlying logic of a step | "Show that dividing by a fraction is multiplying by its reciprocal." |
| BI | Build on ideas | Acts that extend or connect to the learner's prior attempt | "Start from their factorisation and continue from line 3." |
| CO | Connect | Links to prior content, contexts, or real examples | "Relate this to the area problem solved in Topic 4." |
| RD | Reflect on dialogue/activity | Metacognitive review of the learning process | "Ask which step felt least certain and why." |
| EI | Express or invite ideas | Invites or offers ideas, hypotheses, or positions | "Invite the student to predict the sign before computing." |
| PC | Positioning and coordination | Acknowledging, agreeing, challenging, or coordinating views | "Acknowledge the correct setup before addressing the error." |
| GD | Guide direction | Steering the focus of the activity or dialogue | "Refocus on the second term, not the constant." |

*Table 1. The eight SEDA clusters (after Hennessy et al., 2016) as adapted for auditing AI-generated triage scripts.*

The clusters would help in the engineering of the LLM pipelines which could give the teachers the right form of feedback to provide for the students.

### 2.6 Reliability engineering for LLM pipelines

Operating LLMs in production introduces engineering problems that are largely absent from efficacy studies. Three will be discussed this paper. First, structured-output reliability: free-form generation of JSON is non-deterministic and historically failed at rates of 15-30%, motivating JSON mode, function calling, and token-level constrained decoding, which can raise schema compliance toward 99.9% (OpenAI, 2024; Geng et al., 2025). Crucially, strict format constraints can degrade reasoning accuracy, because forcing early structured emission can truncate chain-of-thought (Tam et al., 2024); reliability work must therefore protect value accuracy, not merely schema validity. Second, concurrency control: when multiple learners update shared mastery state, naive read-modify-write logic is vulnerable to time-of-check-to-time-of-use (TOCTOU) race conditions (Bishop & Dilger, 1996; Bernstein & Goodman, 1981). Third, deployment fragility: environment and dependency drift between development and production routinely breaks seed and migration scripts. These three concerns structure Cycles 1-2, 3, and 5 respectively.

---

## 3. Methodology

### 3.1 Technical Action Research design

The study employs Technical Action Research (TAR) under the dual-imperative model of McKay and Marshall (2001), which explicitly couples a problem-solving cycle (improving a real-world situation) with a research cycle (generating transferable knowledge). TAR is appropriate here because the researcher is simultaneously the builder of the platform and the analyst of its behavior, and because the unit of learning is the iterative resolution of authentic engineering problems. Each of the six cycles in Section 4 is reported against both imperatives: what was fixed (problem-solving) and what was learned (research).

TAR is distinguished from Design-Based Research (DBR; The Design-Based Research Collective, 2003; Wang & Hannafin, 2005; Anderson & Shattuck, 2012). DBR iteratively refines an intervention through cycles of classroom enactment with learners, foregrounding student learning processes. TAR, by contrast, foregrounds the technical artifact and its behavior in its place. We adopt TAR deliberately because the research questions concern system reliability and the quality of machine-generated artifacts, not (in this phase) measured student outcomes.

### 3.2 Evaluation design

This study enlists the help of an experienced SPM exam teacher [TO BE COMPLETED: teacher profile — years of experience, SPM teaching history, role in reviewing scripts]. All evidence derives from system telemetry, structured execution logs, and database transaction states. This choice is methodological and ethical. Methodologically, it isolates the artifact's behavior from novelty effects and from the confounds inherent in small classroom samples, and it permits evaluation at a scale (a 1,062-question generation run) that human studies could not feasibly cover. Ethically, it avoids exposing minors to an unproven system during a high-stakes examination year, deferring human-subjects evaluation to a later, IRB-approved phase once reliability is established. The SEDA analysis (Section 3.5) is consistent with this stance because it codes machine-generated artifacts, not human talk; the coders are members of the research team, not respondents.

### 3.3 System architecture

The system comprises four components: (i) a question bank and generation pipeline that produces and validates SPM-aligned items as structured JSON; (ii) a learner-facing frontend that authenticates students and serves items; (iii) a mastery-tracking service that maintains a per-student, per-topic mastery score in a relational database; and (iv) a triage engine that monitors repeated failure and, on threshold breach, generates a teacher-facing intervention script and raises an alert. The architecture's defining decision is the triage threshold: rather than escalating the dialogue, repeated failure escalates the human. The components and their associated failure cycles are mapped in Table 2.

| Layer | Function | Primary technology concern | Associated cycle |
|---|---|---|---|
| Generation | Produce and validate SPM-aligned items | Non-deterministic JSON; rate limiting | Cycles 1, 2 |
| Frontend | Authenticate and serve items | Auth-state lag; invalid identifiers | Cycle 4 |
| Mastery | Maintain per-student mastery scores | Concurrency / TOCTOU race conditions | Cycle 3 |
| Deployment | Seed and migrate production data | Environment / dependency drift | Cycle 5 |
| Triage | Detect failure; alert teacher | Reliable event capture and alerting | Cycle 6 |

*Table 2. System layers mapped to engineering concerns and development cycles.*

### 3.4 Data sources

Three telemetry streams constitute the evidence base. (1) Execution logs: structured application and API logs capturing request/response status, latency, retry behavior, and error stack traces. (2) Database transaction states: snapshots and transaction logs evidencing committed mastery updates, isolation behavior, and constraint violations. (3) Pipeline run records: per-item outcomes from the 1,062-question generation run, including validation pass/fail and HTTP status codes. Each cycle's claims are traced to one or more of these streams, and instruments (log schemas, queries) are reported so that the analysis is reproducible from artifacts alone.

### 3.5 The SEDA-as-artifact-audit protocol

To assess pedagogical quality through just interviewing a teacher instead of students, we developed a four-step protocol. First, corpus construction: a sample of teacher-facing intervention scripts generated by the triage engine across topics and error types is extracted from the database. Second, unitisation: each script is segmented into communicative acts at the utterance level, following Hennessy et al. (2016). Third, coding: each act is assigned to one of the eight SEDA clusters in Table 1 by two independent coders. Fourth, reliability and analysis: inter-rater agreement is computed (e.g., Cohen's kappa), disagreements are resolved by discussion, and the cluster distribution is reported. The protocol re-purposes a scheme designed for live talk to audit the dialogic potential engineered into machine-authored scaffolds - an act of design evaluation rather than classroom observation.

The sufficiency of this protocol without student respondents rests on a substitution argument: the triage script is the intervention the teacher enacts. If the script encodes high-quality IRE, RE, and GD moves, the teacher possesses the raw material for dialogic interaction; the dialogic quality achievable in the classroom is bounded above by what the script provides. Auditing the script is therefore auditing the ceiling of possible dialogic quality that the system can support. What the artifact audit cannot establish is whether teachers used the scripts as intended, or whether students responded dialogically — those are separate empirical questions deferred to the human-subjects phase in §5.5.

*Note on data: Where this manuscript reports specific counts (e.g., kappa, cluster percentages, latency figures), values shown are illustrative placeholders pending substitution with the study's actual telemetry and coding outputs. They are formatted to indicate the intended reporting structure.*

### 3.6 Trustworthiness and rigor

Rigor follows McKay and Marshall's (2001) prescriptions: a clear separation of problem-solving and research claims, a documented process model, and explicit guarding against researcher bias. For the engineering cycles, claims are falsifiable against logs and are reproducible from the reported instruments. For the SEDA audit, dual independent coding and reported inter-rater reliability address subjectivity. Triangulation across the three telemetry streams strengthens internal validity, while the explicit articulation of design principles (Section 5.3) supports analytic generalization rather than statistical generalization.

---

## 4. Results and Findings

Each cycle is reported in four parts: the symptom observed in telemetry, the diagnosis, the corrective design (problem-solving imperative), and the transferable insight (research imperative).

### 4.1 Cycle 1: Resolving non-deterministic LLM JSON validation anomalies

**Symptom.** During item generation, a non-trivial fraction of model responses failed schema validation: malformed JSON, missing required fields, or type mismatches surfaced intermittently for identical prompts, consistent with the 15-30% failure rates reported for unconstrained generation (Geng et al., 2025).

**Diagnosis.** The root cause was reliance on free-form text generation parsed post hoc. Because decoding is stochastic, schema conformance was probabilistic rather than guaranteed, and validation logic conflated two distinct failures: invalid structure and valid-but-wrong content.

**Corrective design (problem-solving).** We migrated to provider JSON mode with an explicit JSON Schema and added a validation-and-repair layer: structurally invalid responses are regenerated with a bounded retry budget, while a separate semantic check guards value accuracy. Because strict formatting can truncate reasoning (Tam et al., 2024), chain-of-thought was elicited in a reasoning field prior to the constrained answer fields.

**Transferable insight (research).** Schema compliance and answer correctness are orthogonal reliability properties and must be measured and defended separately; constrained decoding solves the former but can endanger the latter unless reasoning is given explicit room before structured emission.

### 4.2 Cycle 2: Overcoming API rate-limiting thresholds during a 1,062-question run

**Symptom.** A batch run of 1,062 question generations triggered cascading HTTP 429 (Too Many Requests) responses, aborting the run partway and leaving the question bank in an incomplete state.

**Diagnosis.** Requests were issued without concurrency control or backoff; bursts exceeded the provider's per-minute token and request quotas, and naive immediate retries amplified the overload.

**Corrective design (problem-solving).** We introduced a rate-aware client with a token-bucket limiter, exponential backoff with jitter on 429/5xx, idempotent per-item checkpointing so completed items are not regenerated on resume, and a dead-letter queue for items exhausting their retry budget. The full run subsequently completed deterministically and in a resumable manner.

**Transferable insight (research).** At realistic scale, throughput is governed by quota orchestration, not model latency; checkpointed idempotency converts a fragile long run into a restartable pipeline, which is essential for resource-constrained deployments that cannot afford to repeat paid generation.

### 4.3 Cycle 3: Mitigating database race conditions (TOCTOU) on concurrent mastery updates

**Symptom.** Under concurrent use, a learner's mastery score occasionally reflected lost updates: two near-simultaneous answer submissions both read the same prior score and wrote back conflicting values, leaving the database in an inconsistent state.

**Diagnosis.** The update used a read-modify-write pattern with a window between the check (read current score) and the use (write new score) - a classic TOCTOU race condition (Bishop & Dilger, 1996). Default isolation did not serialize the interleaved transactions (Bernstein & Goodman, 1981).

**Corrective design (problem-solving).** The update was made atomic using a single database-side expression within a transaction, with row-level locking (SELECT ... FOR UPDATE) and an appropriate isolation level; an optimistic-concurrency version column provides a second guard, retrying on conflict. Transaction-log inspection confirmed the elimination of lost updates under concurrent load.

**Transferable insight (research).** Mastery state is shared mutable state and must be treated with database-grade concurrency control; correctness here is invisible in single-user testing and only appears under concurrent telemetry, underscoring the value of zero-respondent load evidence.

### 4.4 Cycle 4: Fixing frontend authentication-state lags propagating invalid identifiers

**Symptom.** The backend intermittently rejected requests because the string "undefined" was being inserted into columns typed as strict UUIDs, producing constraint violations and failed item loads.

**Diagnosis.** A render-timing lag meant the frontend issued data requests before the authentication context had resolved the user id; the unresolved JavaScript value was coerced to the literal string "undefined" and transmitted as an identifier.

**Corrective design (problem-solving).** We gated all authenticated requests on a resolved auth state, replaced unsafe coercion with explicit null handling, and added server-side input validation that rejects non-UUID identifiers before they reach the database. Error-log volume for UUID constraint violations fell to zero after deployment.

**Transferable insight (research).** Type safety must be enforced at the trust boundary, not assumed from the client; an unresolved client-side state is a security- and integrity-relevant input, and strict server-side validation is the durable fix rather than client patches alone.

### 4.5 Cycle 5: Fixing environment dependency crashes in production seed scripts

**Symptom.** Seed scripts that ran cleanly in development crashed on the production environment, blocking initial data provisioning.

**Diagnosis.** The failure stemmed from environment and dependency drift: differing runtime versions, missing or mismatched packages, and environment-variable assumptions that held only in development.

**Corrective design (problem-solving).** We pinned dependencies via lockfiles, containerized the seed routine to standardize the runtime, externalized configuration through validated environment variables with fail-fast checks, and added a pre-flight environment validation step to the deployment pipeline. Subsequent production seeds completed without manual intervention.

**Transferable insight (research).** Reproducibility of the deployment environment is a precondition for reproducibility of results; for school deployments without dedicated DevOps support, fail-fast configuration validation prevents silent, hard-to-diagnose production failures.

### 4.6 Cycle 6: Building the automated backend for teacher-triage alerting

**Symptom.** Before this cycle, repeated-failure events were detectable only by manual inspection, so the pedagogical core of the system - escalation to a human teacher - was not operational.

**Diagnosis.** There was no durable, idempotent mechanism to detect a threshold breach, generate an intervention script, and deliver an alert exactly once to the responsible teacher.

**Corrective design (problem-solving).** We implemented an event-driven triage service: answer events update mastery atomically (Cycle 3), a threshold evaluator detects repeated failure, the generation layer (Cycles 1-2) produces a structured teacher-facing script, and an alerting component delivers it with idempotency keys to prevent duplicate alerts. Delivery and generation outcomes are themselves logged as telemetry.

**Transferable insight (research).** The system's pedagogical value is realized not by the model's conversational ability but by the reliability of the escalation path; treating the triage alert as a first-class, exactly-once event is what makes teacher-in-the-loop tutoring dependable at scale.

### 4.7 SEDA Dialogic-Quality Analysis of Triage Artifacts

#### Corpus and coding

Applying the protocol in Section 3.5, a sample of teacher-facing intervention scripts was extracted across topics and error types, segmented into communicative acts, and double-coded against the eight SEDA clusters (Table 1). Inter-rater reliability is reported (illustrative Cohen's kappa = .81, 'substantial' agreement), with disagreements resolved by discussion.

#### Cluster distribution

Table 3 reports the distribution of coded communicative acts across SEDA clusters (illustrative figures). The audit indicates that the machine-authored scripts are concentrated in clusters associated with inviting and making reasoning explicit and with guiding the direction of the activity - precisely the dialogic moves that the human teacher is intended to enact with the student.

| Code | Cluster | Acts (%) | Interpretation |
|---|---|---|---|
| IRE | Invite elaboration or reasoning | 26% | Scripts frequently direct teachers to elicit student working. |
| RE | Make reasoning explicit | 21% | Strong emphasis on surfacing the targeted misconception. |
| GD | Guide direction | 18% | Scripts focus the teacher on the specific erroneous step. |
| BI | Build on ideas | 12% | Scaffolds start from the learner's prior attempt. |
| CO | Connect | 9% | Links to prior topics appear but are less frequent. |
| PC | Positioning and coordination | 7% | Acknowledgement of correct partial work before correction. |
| EI | Express or invite ideas | 4% | Predict-then-check prompts appear occasionally. |
| RD | Reflect on dialogue/activity | 3% | Metacognitive review is comparatively under-represented. |

*Table 3. Illustrative SEDA cluster distribution of AI-generated triage scripts (n acts to be reported).*

#### Interpretation

Two findings stand out. First, the dominance of IRE and RE indicates that the system does not merely tell teachers the right answer; it engineers dialogic scaffolds that prompt reasoning - dialogic quality is present in the artifact even though the system itself never converses with the student. Second, the under-representation of reflective (RD) acts is an actionable design signal: prompt templates can be revised to include metacognitive review moves. This demonstrates the diagnostic utility of SEDA as a design instrument: it converts a pedagogical aspiration into a measurable property of generated artifacts and points directly to the next iteration. This is also supported by the expert teachers' point of view who has viewed that the feedback given has been highly helpful in providing the teachers with the requisite feedback to assist the students.

---

## 5. Discussion and Conclusion

### 5.1 Theoretical implications

The study reframes the locus of dialogue in AI tutoring. Where the dominant paradigm asks whether an LLM can be a good Socratic partner, this work asks whether an LLM can reliably prepare a human to be one. For exam-conditioned, low-metacognition cohorts, this relocation is theoretically motivated: it respects the preconditions that dialogic-teaching research places on productive talk (Alexander, 2020; Howe et al., 2019) and avoids the learned-helplessness risk of relentless autonomous questioning (Seligman, 1972). The SEDA audit operationalizes this reframing by showing that dialogic quality can be designed into artifacts and measured without classroom observation.

### 5.2 Implementation implications

For practitioners and system implementers, the six cycles constitute a checklist of the failures that determine whether an AI tutoring tool works at all in a real school: structured-output reliability, quota orchestration, concurrency control, trust-boundary validation, environment reproducibility, and exactly-once alerting. These are rarely the subject of efficacy papers, yet they are decisive for deployment in resource-constrained settings of the kind targeted by Malaysia's Digital Education Policy 2023 and National AI Roadmap 2021-2025. The teacher-in-the-loop design also aligns with human-AI complementarity evidence (Holstein et al., 2019), preserving teacher agency at the moment of intervention.

### 5.3 Generalizable design principles

- **Escalate the human, not the dialogue:** for low-metacognition, high-stakes cohorts, design AI to detect failure and route to a teacher rather than to conduct autonomous Socratic dialogue.
- **Separate schema compliance from value accuracy:** guarantee structure with constrained decoding, but protect reasoning with explicit pre-answer chain-of-thought.
- **Make long generation runs idempotent and resumable:** checkpointing plus backoff converts fragile batch jobs into dependable pipelines.
- **Treat shared mastery state with database-grade concurrency control:** atomic updates and isolation, validated under concurrent telemetry.
- **Enforce type safety at the trust boundary:** never trust client-resolved identifiers; validate server-side.
- **Audit pedagogical quality at the artifact level:** use SEDA to measure and iterate on the dialogic richness of machine-generated scaffolds.

### 5.4 Limitations

The zero-respondent design is a deliberate strength for evaluating reliability and artifact quality, but it cannot speak to student learning outcomes; claims about efficacy await a later human-subjects phase. The SEDA audit evaluates dialogic potential of scripts, not enacted dialogue; whether teachers use the scripts as intended is an open empirical question. The engineering cycles are situated in one system and stack, so transfer rests on analytic generalization via the stated design principles rather than statistical generalization. Finally, illustrative figures in Sections 3 and 4 must be replaced with the study's measured values before submission. Another limitation is that there is only one expert teacher included in this study; hence, the findings cannot be generalized to a wider context.

### 5.5 Future work

Three extensions follow directly. First, an IRB-approved, teacher-in-the-loop classroom study measuring student outcomes and teacher uptake of scripts. Second, a comparative SEDA audit across prompt strategies to optimize the dialogic profile of generated scaffolds, targeting the observed under-representation of reflective acts. Third, longitudinal reliability monitoring to test whether the engineering gains persist under real seasonal load around the SPM examination period.

### 5.6 Conclusion

This paper argued and demonstrated that, for high-stakes, exam-conditioned secondary mathematics cohorts, the responsible role of generative AI is error triage rather than autonomous dialogue. Using zero-respondent Technical Action Research, we reported six engineering cycles that turned a fragile prototype into a dependable teacher-in-the-loop pipeline, and we introduced a SEDA-as-artifact-audit protocol showing that dialogic quality can be engineered into - and measured within - machine-authored teacher scaffolds. The work contributes a reliability-engineering account, a zero-respondent TAR template, and a novel artifact-level use of SEDA. Its central claim is deliberately contrarian: the most valuable thing an LLM can do for a struggling, exam-pressured learner may be to recognise its own limits and hand the learner to a human - well prepared.

---

## References

Alexander, R. (2020). *A dialogic teaching companion*. Routledge.

Anderson, T., & Shattuck, J. (2012). Design-based research: A decade of progress in education research. *Educational Researcher*, 41(1), 16-25.

Bernstein, P. A., & Goodman, N. (1981). Concurrency control in distributed database systems. *ACM Computing Surveys*, 13(2), 185-221.

Bishop, M., & Dilger, M. (1996). Checking for race conditions in file accesses. *Computing Systems*, 9(2), 131-152.

Black, P., & Wiliam, D. (1998). Assessment and classroom learning. *Assessment in Education: Principles, Policy & Practice*, 5(1), 7-74.

Black, P., & Wiliam, D. (2009). Developing the theory of formative assessment. *Educational Assessment, Evaluation and Accountability*, 21(1), 5-31.

Geng, S., Josifoski, M., Peyrard, M., & West, R. (2025). JSONSchemaBench: A rigorous benchmark of structured outputs for language models. arXiv:2501.10868.

Hennessy, S., Rojas-Drummond, S., Higham, R., Marquez, A. M., Maine, F., Rios, R. M., Garcia-Carrion, R., Torreblanca, O., & Barrera, M. J. (2016). Developing a coding scheme for analysing classroom dialogue across educational contexts. *Learning, Culture and Social Interaction*, 9, 16-44.

Holstein, K., McLaren, B. M., & Aleven, V. (2019). Co-designing a real-time classroom orchestration tool to support teacher-AI complementarity. *Journal of Learning Analytics*, 6(2), 27-52.

Howe, C., Hennessy, S., Mercer, N., Vrikki, M., & Wheatley, L. (2019). Teacher-student dialogue during classroom teaching: Does it really impact on student outcomes? *Journal of the Learning Sciences*, 28(4-5), 462-512.

Kasneci, E., Sessler, K., Kuchemann, S., Bannert, M., Dementieva, D., Fischer, F., ... & Kasneci, G. (2023). ChatGPT for good? On opportunities and challenges of large language models for education. *Learning and Individual Differences*, 103, 102274.

Kuhail, M. A., Alturki, N., Alramlawi, S., & Alhejori, K. (2023). Interacting with educational chatbots: A systematic review. *Education and Information Technologies*, 28(1), 973-1018.

MalaysiaNow. (2024, June 20). Malaysia's hopes of becoming high-tech nation still distant amid high failure rate in maths. https://www.malaysianow.com/news/2024/06/20/malaysias-hopes-of-becoming-high-tech-nation-still-distant-amid-high-failure-rate-in-maths

McKay, J., & Marshall, P. (2001). The dual imperatives of action research. *Information Technology & People*, 14(1), 46-59.

Mercer, N., & Howe, C. (2012). Explaining the dialogic processes of teaching and learning: The value and potential of sociocultural theory. *Learning, Culture and Social Interaction*, 1(1), 12-21.

Ministry of Education Malaysia. (2013). *Malaysia Education Blueprint 2013-2025 (Preschool to Post-Secondary Education)*. Putrajaya: Ministry of Education Malaysia.

OpenAI. (2024). Introducing structured outputs in the API. https://openai.com/index/introducing-structured-outputs-in-the-api/

Seligman, M. E. P. (1972). Learned helplessness. *Annual Review of Medicine*, 23, 407-412.

Tam, Z. R., Wu, C.-K., Tsai, Y.-L., Lin, C.-Y., Lee, H.-Y., & Chen, Y.-N. (2024). Let me speak freely? A study on the impact of format restrictions on performance of large language models. In *Proceedings of the 2024 Conference on Empirical Methods in Natural Language Processing: Industry Track* (pp. 1218-1236).

The Design-Based Research Collective. (2003). Design-based research: An emerging paradigm for educational inquiry. *Educational Researcher*, 32(1), 5-8.

VanLehn, K. (2011). The relative effectiveness of human tutoring, intelligent tutoring systems, and other tutoring systems. *Educational Psychologist*, 46(4), 197-221.

Vrikki, M., Kershner, R., Calcagni, E., Hennessy, S., Lee, L., Hernandez, F., Estrada, N., & Ahmed, F. (2019). The teacher scheme for educational dialogue analysis (T-SEDA): Developing a research-based observation tool for supporting teacher inquiry into pupils' participation in classroom dialogue. *International Journal of Research & Method in Education*, 42(2), 185-203.

Vygotsky, L. S. (1978). *Mind in society: The development of higher psychological processes*. Harvard University Press.

Wang, F., & Hannafin, M. J. (2005). Design-based research and technology-enhanced learning environments. *Educational Technology Research and Development*, 53(4), 5-23.

Wiliam, D. (2011). *Embedded formative assessment*. Solution Tree Press.

Wood, D., Bruner, J. S., & Ross, G. (1976). The role of tutoring in problem solving. *Journal of Child Psychology and Psychiatry*, 17(2), 89-100.

Yan, L., Sha, L., Zhao, L., Li, Y., Martinez-Maldonado, R., Chen, G., Li, X., Jin, Y., & Gasevic, D. (2024). Practical and ethical challenges of large language models in education: A systematic scoping review. *British Journal of Educational Technology*, 55(1), 90-112.

Ying, L. (2024). *The impact of images in developing the ESL vocabulary knowledge of Malaysian Standard 4 pupils* [Master's Thesis, Universiti Sains Malaysia]. Universiti Sains Malaysia Institution Repository. https://eprints.usm.my/

---

## Appendix A. SEDA Coding Protocol Summary

The following summarises the operational steps used to code AI-generated triage scripts against SEDA (see Section 3.5).

1. Extract a stratified sample of teacher-facing intervention scripts across topics and error types from the triage database.
2. Segment each script into communicative acts at the utterance level (Hennessy et al., 2016).
3. Two coders independently assign each act to one of the eight SEDA clusters (Table 1).
4. Compute inter-rater reliability (Cohen's kappa); resolve disagreements by discussion.
5. Report the cluster distribution and interpret under-represented clusters as design signals for the next prompt iteration.

---

## Editorial Notes (not for submission)

- §3.2: Complete expert teacher profile (years of experience, SPM teaching history).
- §4.7: Replace all illustrative figures with actual telemetry and coding outputs before submission.
- §5.4: Confirm Ying (2024) citation is appropriate — primary-school vocabulary study; verify secondary-level source exists for language burden claim.
- Vygotsky (1978) is in the reference list but not cited in the body — add ZPD citation in §2.3 or §2.4, or remove the reference.
- RQ4 answer in §4.9 needs structured summary of teacher ratings/feedback mapped to SEDA clusters.
