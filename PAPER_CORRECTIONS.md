# Paper Corrections — "Reframing AI Tutoring as Error Triage"

Audit of the manuscript against the actual KuasaPrestij codebase. Each item gives the
exact text to find and the text to replace it with. Ordered as they appear in the paper.

---

## 1. Abstract — fix the doubled "mathematics" sentence

**Find:**
> For subjects such as mathematics, the most recent cohort had 23% of candidates fail subjects such as mathematics.

**Replace with:**
> In the most recent cohort, approximately 23% of candidates failed mathematics — the highest subject failure rate nationally.

---

## 2. RQ1 (§1.4) — subject contradiction (says "English", rest of paper says "mathematics")

**Find:**
> deployed at realistic scale for an SPM English cohort

**Replace with (if keeping MATHEMATICS as the study subject):**
> deployed at realistic scale for an SPM mathematics cohort

> NOTE: If you instead commit to ENGLISH as the study subject (see "Focusing on one
> subject" below), RQ1 is ALREADY correct and you change the abstract + SEDA examples +
> expert teacher to English instead.

---

## 3. §3.3 System architecture — add ONE scoping sentence

The code serves ~10 Form 4–5 KSSM subjects (Physics, Bio, Chem, Math, Add Math, Bahasa
Melayu, Bahasa Inggeris, Sejarah, Geografi, Moral…), with `step_sort` for maths and full
essay-marking for languages. A math-only (or English-only) paper must acknowledge this or
a reviewer with repo access will flag it.

**Add at the end of §3.3's first paragraph (after "…escalates the human."):**
> While the deployed platform is subject-general — it generates and triages items across the Form 4–5 KSSM subject range — this study scopes both the expert appraisal and the SEDA audit to a single subject, chosen for its high national failure rate and the participating teacher's expertise.

---

## 4. §4.1 Cycle 1 — the "reasoning field" does not exist; JSON Schema is client-side

**Find (Corrective design):**
> We migrated to provider JSON mode with an explicit JSON Schema and added a validation-and-repair layer: structurally invalid responses are regenerated with a bounded retry budget, while a separate semantic check guards value accuracy. Because strict formatting can truncate reasoning (Tam et al., 2024), chain-of-thought was elicited in a reasoning field prior to the constrained answer fields.

**Replace with:**
> We enabled the provider's JSON mode (`response_format={"type": "json_object"}`) and added a client-side validation-and-repair layer: a layered recovery step strips code fences and prose and unwraps list-wrapped objects, a Pydantic schema then validates structure and types, and unparseable responses are regenerated within a bounded retry budget. Because strict formatting can truncate reasoning (Tam et al., 2024), the schema was kept shallow and the model was permitted to emit narrative fields (worked solutions, feedback) alongside the constrained answer fields rather than being forced into an answer-first structure.

**Find (transferable insight):**
> constrained decoding solves the former but can endanger the latter unless reasoning is given explicit room before structured emission.

**Replace with:**
> JSON mode plus client-side schema validation solves the former but can endanger the latter unless the model is given explicit room for narrative reasoning fields rather than being forced into answer-first emission.

---

## 5. §4.2 Cycle 2 — no token bucket, no backoff/jitter, no dead-letter queue

**Find (Corrective design):**
> We introduced a rate-aware client with a token-bucket limiter, exponential backoff with jitter on 429/5xx, idempotent per-item checkpointing so completed items are not regenerated on resume, and a dead-letter queue for items exhausting their retry budget. The full run subsequently completed deterministically and in a resumable manner.

**Replace with:**
> We introduced a provider-failover client: on a 429 the affected provider is marked cooling for 65 seconds and the request immediately fails over to the next provider in the chain (Cerebras → OpenRouter → Groq → DeepSeek); when all providers are cooling, the client sleeps until the earliest recovery so no call is silently dropped. The batch seeder issues calls with a fixed inter-call delay, skips topics already present in the question bank (idempotent re-runs), and writes a progress checkpoint at each 10% milestone so an interrupted run can be resumed. The full run subsequently completed without loss.

**Find (transferable insight):**
> throughput is governed by quota orchestration, not model latency; checkpointed idempotency converts a fragile long run into a restartable pipeline

**Replace with:**
> throughput is governed by provider failover and cooldown, not model latency; skip-on-exist plus milestone checkpointing converts a fragile long run into a restartable pipeline

---

## 6. §4.3 Cycle 3 — it's an atomic UPSERT, not FOR UPDATE / isolation / version column

**Find (Corrective design):**
> The update was made atomic using a single database-side expression within a transaction, with row-level locking (SELECT ... FOR UPDATE) and an appropriate isolation level; an optimistic-concurrency version column provides a second guard, retrying on conflict. Transaction-log inspection confirmed the elimination of lost updates under concurrent load.

**Replace with:**
> The read-modify-write was replaced by a single atomic operation. A PostgreSQL function (`increment_mastery`) applies the delta server-side in one statement via `INSERT ... ON CONFLICT (student_id, curriculum_tag, topic) DO UPDATE SET mastery_level = GREATEST(0.0, LEAST(1.0, dskp_mastery.mastery_level + p_delta))`, invoked from the application through a single RPC call. Because the read and the write occur within one atomic upsert, the check-and-use window is eliminated and concurrent submissions can no longer overwrite one another; the [0,1] clamp is applied in the same expression. By construction, the atomic upsert removes the lost-update window.

> NOTE: I removed "Transaction-log inspection confirmed…" because there is no evidence of a
> concurrent load test. If you actually ran one, keep that sentence; otherwise "by
> construction" is the honest claim.

---

## 7. §4.4 Cycle 4 — it's a remap, not a rejection

**Find (Corrective design):**
> We gated all authenticated requests on a resolved auth state, replaced unsafe coercion with explicit null handling, and added server-side input validation that rejects non-UUID identifiers before they reach the database. Error-log volume for UUID constraint violations fell to zero after deployment.

**Replace with:**
> On the client, authenticated requests were gated on a resolved authentication state so the user id is available before any data request is issued. On the server, a guard intercepts the sentinel string "undefined" and remaps it to a reserved test UUID (`00000000-0000-0000-0000-000000000001`) before any database call, so the literal never reaches a strict-UUID column. UUID constraint-violation errors fell to zero after deployment.

**DECISION POINT** — the transferable insight says *"strict server-side validation is the
durable fix rather than client patches alone."* A remap-to-test-UUID is not really
validation; it funnels unauthenticated traffic into one shared account. Either:
- **(a) Match the code:** soften the insight to *"a server-side guard at the trust boundary — remapping or rejecting unresolved identifiers — is the durable fix rather than client patches alone."*
- **(b) Make the code true (recommended):** add real `uuid.UUID()` validation that 422-rejects non-UUIDs; then the original wording stands. ~10 lines of code.

---

## 8. §4.5 Cycle 5 — "lockfiles" → "pinned requirements file" (otherwise fine)

**Find:**
> We pinned dependencies via lockfiles, containerized the seed routine to standardize the runtime, externalized configuration through validated environment variables with fail-fast checks, and added a pre-flight environment validation step to the deployment pipeline.

**Replace with:**
> We pinned dependencies via a versioned requirements file, containerized the runtime (Dockerfile + docker-compose), loaded configuration from environment variables (failing fast on required keys), and added a pre-flight schema-migration check to the seed routine.

> This cycle is well-supported by the code: `Dockerfile`, `docker-compose.yml`, and a
> preflight check at `seed_question_bank.py:138`. Only "lockfiles" was inaccurate.

---

## 9. §4.6 Cycle 6 — no idempotency keys, no exactly-once

**Find (Corrective design):**
> the generation layer (Cycles 1-2) produces a structured teacher-facing script, and an alerting component delivers it with idempotency keys to prevent duplicate alerts. Delivery and generation outcomes are themselves logged as telemetry.

**Replace with:**
> a threshold evaluator (`_get_flagged_students`, default of two failures on the same topic and error category) detects repeated failure, the generation layer (Cycles 1–2) produces a structured teacher-facing script (`_generate_intervention_scripts`), and an alerting component delivers it to the responsible teacher via the Telegram Bot API. Generation and alert dispatch are logged as telemetry.

**Find (transferable insight):**
> treating the triage alert as a first-class, exactly-once event is what makes teacher-in-the-loop tutoring dependable at scale.

**Replace with:**
> treating the triage alert as a first-class, durably-logged event is what makes teacher-in-the-loop tutoring dependable at scale.

---

## 10. §5.2 & §5.3 — remove the two remaining "exactly-once" claims

**§5.2 — Find:** `environment reproducibility, and exactly-once alerting.`
**Replace:** `environment reproducibility, and reliable, logged teacher alerting.`

**§5.3 — Find:** `Treat shared mastery state with database-grade concurrency control: atomic updates and isolation, validated under concurrent telemetry.`
**Replace:** `Treat shared mastery state with database-grade concurrency control: an atomic server-side upsert that eliminates the read-modify-write window.`

---

## 11. §3.6 — delete the stray editing note

**Find (dangling line):**
> What about contextual drift instead of schema drift

Either delete it, or fold it into Cycle 1 (§4.1) as a limitation:
> A remaining gap is that this layer defends *schema* validity, not *contextual* validity: a well-formed item can still be curriculum-inaccurate. Semantic drift of generated content is addressed only by the downstream expert appraisal, not automatically.

---

## 12. RQ4 / §4.9 — the expert-teacher claim has no data behind it

**Find (end of §4.9):**
> This is also supported by the expert teachers' point of view who has viewed that the feedback given has been highly helpful in providing the teachers with the requisite feedback to assist the students.

Either label it pending, or add the real appraisal data. Suggested pending wording:
> The expert appraisal instrument (usability ratings and structured feedback) is defined in §3.2; reported values await the completed appraisal.

---

## Still unverified on the author's side (not code — data you must produce)

- **All SEDA numbers** (κ = .81, Table 3 percentages) are illustrative placeholders. They
  must be replaced with real coding output before submission, or RQ3 is unanswered.
- **The expert teacher's ratings** (RQ4) — no instrument or values reported yet.

---

## Explainer: what "idempotency keys" are, and why it came up

An **idempotency key** is a unique label attached to an action so that if the same action
is triggered more than once, it only *takes effect* once.

- Analogy: pressing "Submit Payment" twice should charge you once, not twice. The system
  tags the request with a key; if it sees the same key again, it ignores the duplicate.
- In your paper: Cycle 6 claims each teacher alert carries an idempotency key so a student
  failing repeatedly does not spam the teacher with duplicate alerts for the same problem.
- Reality in your code: `alert_admin()` simply sends a Telegram message every time mastery
  drops below the threshold. There is no key and no de-duplication — so the claim is not
  yet true.

You have two choices:
1. **Reword** (already done in item 9 above) — honest, zero code, recommended given you
   have no users yet. Over-engineering de-duplication before any real traffic is premature.
2. **Implement it later** — store a hash of (student_id, topic, error_category, date) in a
   table before sending; skip the send if the hash already exists that day. Defer this to
   the "future work" section until you have real usage.

Recommendation: reword now; list exactly-once de-duplication as future work.

---

## How to proceed with NO data and NO users yet

Your paper is framed as "zero-respondent / telemetry-driven TAR". That framing is a
strength here, but three of the four research questions still need artifacts you can
produce WITHOUT any students:

1. **Engineering cycles (RQ1, RQ2):** These are already evidenced by the code and your dev
   history. The bugs were encountered and fixed during building — that IS the TAR data. Make
   sure the specific numbers you cite are real:
   - The **1,062-question run** must be an actual run of `seed_question_bank.py` — keep its
     log / checkpoint output as your evidence artifact.
   - "UUID errors fell to zero", "run completed without loss" — cite the actual logs, or
     soften to "by construction / after the fix, no further occurrences were observed".

2. **SEDA audit (RQ3):** This needs NO students. The whole point of "SEDA-as-artifact-audit"
   is that you code *machine-generated scripts*, not classroom talk. You can build the
   corpus TODAY:
   - Run the triage generator on a stratified set of failure cases (across topics / error
     types) to produce ~30–60 intervention scripts.
   - Segment each into communicative acts; have TWO coders (you + one colleague) code them
     against the 8 SEDA clusters.
   - Compute real Cohen's κ and the real cluster distribution. Replace every illustrative
     number in §4.7–4.9 and Table 3.

3. **Expert appraisal (RQ4):** This needs ONE teacher, not students — low ethics burden, no
   minors. Give the teacher the same script corpus + a short rating form (e.g. 1–5 on
   usefulness, clarity, actionability) and 2–3 open questions. Report the real ratings and a
   couple of quotes. This is the only genuinely new human-facing data you must collect, and
   it is small and IRB-light.

So: you do NOT need users or a classroom study to complete this paper. You need (a) one real
seed-run log, (b) a coded corpus of machine scripts, and (c) one teacher's appraisal.

---

## Focusing on ONE subject — is English OK?

Yes — and it may be the BETTER choice than mathematics. Reasons:

- Your code has strong **English (Bahasa Inggeris) support**: essay marking with a
  language-composition rubric, short-answer, and MCQ. Dialogic scaffolding (the SEDA angle)
  maps more naturally onto language feedback than onto maths step-ordering.
- RQ1 in your current draft ALREADY says "English", so committing to English makes RQ1
  correct as-is; you'd instead adjust the abstract and SEDA examples.

If you choose ENGLISH, change these:
- **Abstract / §1.1:** replace the 23%-maths-failure framing with an English SPM
  attainment statistic (find a citable SPM English pass/fail figure), or reframe the
  motivation around English attainment. Keep RQ1 as "English".
- **Table 1 (SEDA examples):** the current examples are all maths (denominators,
  reciprocals, factorisation). Rewrite them as English triage examples, e.g.
  IRE → "Ask the student to explain why they chose the past tense here."
  RE  → "Show how the topic sentence signals the paragraph's main idea."
  GD  → "Refocus on the thesis statement, not the supporting example."
- **Expert teacher:** must be an experienced SPM **English** teacher (your abstract
  currently says a mathematics teacher).
- **§3.3 scoping sentence (item 3):** keep it — it still applies (system is multi-subject,
  study scoped to English).

If you choose MATHEMATICS instead, keep the abstract as-is, fix RQ1 to "mathematics"
(item 2), and rewrite the Table 1 examples are already math (fine).

Either single-subject choice is defensible. Pick the subject whose expert teacher you can
actually recruit, and whose scripts you can generate cleanly. Given the codebase's essay
strengths, ENGLISH is the lower-friction, better-supported option.

---

# Evidence-Run Data (§4.1 / §4.2) — measured, not illustrative

An instrumented generation run was built to produce citable evidence for Cycles 1–2.
Tooling (all under `scripts/`, stdout-only — no edits to shared serving code):
- `run_seed_evidence.sh` — runs the seeder unbuffered, timestamps every stdout line,
  tees to `evidence/runlog_<UTC>.txt`, snapshots the DB bank count before/after.
- `parse_runlog.py` — parses the log + DB snapshots into `evidence/run_summary.md` + CSV;
  reconciles the seeder's success count against the real DB delta (honesty check).
- `precreate_rows.py` — created 15 missing `topic_anchors` rows so appends can't be
  silently lost (the seeder's `ok`-counter would otherwise over-report).
- `db_bank_snapshot.py` — DB bank-count snapshot helper.

## Pilot / smoke findings (2026-07-21, default Gemini-led chain)

Small pre-run pilots (Pendidikan Muzik + Bahasa Inggeris, English, count=1) — **6 fresh
generation attempts**:

| Metric | Value |
|---|---|
| Attempts | 6 |
| Saved OK | 3 |
| Failed — malformed LLM JSON | 3 (**50%**) |
| Failure type | JSON decode ("Unterminated string") + schema validation |
| 429 / rate-limit events | 0 |
| Failover events | 0 |
| DB delta vs log ok-count | matched (recon_gap = 0 — no silent write loss) |

### What this means for the paper

- **§4.1 (Cycle 1) — SUPPORTED, but see the correction below.** The first pilot showed a
  high malformed-JSON rate on the Gemini chain, but follow-up diagnostics reclassified that as
  **transient, not systematic** (see "Follow-up diagnostic — CORRECTION" below). The durable,
  true point: malformed JSON is *intermittent* and `generator_node` has **no repair/retry for
  MCQ** (only essay marking retries), so each malformed response is a *dropped item* served to
  the student as a placeholder. This is real evidence for the Cycle 1 symptom and the need for
  a validation-and-repair layer. **Do NOT cite a fixed ~50% Gemini failure rate — it did not
  reproduce.**

- **§4.2 (Cycle 2) — NOT reproduced on this chain.** The default Gemini-led chain served
  every call without tripping rate limits: **0 × 429, 0 failovers.** The "cascading 429s
  during a 1,062-question run" symptom did **not** occur here. Options: (a) reword §4.2 to
  present the failover machinery as *available and exercised during earlier free-tier runs*
  rather than observed in this run, or (b) run the **free chain** (Cerebras→Groq→OpenRouter),
  which is far likelier to hit real RPM/token limits and reproduce the symptom honestly.

- **"Completed without loss" — verify against the final run.** Whether it holds depends on the
  full free-chain run's actual failure count (Cerebras was clean in pilots). If any items fail,
  re-run the gaps (skip-on-exist makes this cheap) or soften the claim — the `run_summary.md`
  reconciliation reports the real figure.

_(Numbers above are from a small pilot on the **Gemini-led** chain. The full multi-subject
run has since been executed on the **free chain** — see "Final multi-subject run" below, which
**supersedes** these pilot figures for citation.)_

## Follow-up diagnostic — CORRECTION to the Gemini characterization

The initial read (Gemini's `json_object` mode systematically truncating at ~50%) was
**investigated and does NOT hold**. Controlled tests against the isolated Gemini test key
(`scripts/gemini_json_diag.py`, `gemini_json_diag2.py`):

- Simple JSON prompt, 4 configs: **4/4 clean** — `finish_reason=stop`, `reasoning_tokens=None`.
- **Full real generator prompt** (1,457-token retrieved context + full multi-field MCQ
  schema), 10 trials across `max_tokens` 2048/8192 and `reasoning_effort` none: **10/10 clean**,
  valid JSON every time, `reasoning_tokens=None` throughout.
- `max_tokens` and `reasoning_effort` made **no difference** — so the "thinking-tokens eat the
  budget" hypothesis is **disproven**, and raising `max_tokens` / changing the model is **not**
  the fix.

**Revised conclusion:** the ~50% failures seen in the first pilot (05:26–05:30) were a
**transient** Gemini condition, not a deterministic flaw. What remains true — and is the real
Cycle 1 point — is that LLMs *intermittently* emit malformed JSON, and the pipeline currently
has **no safety net** for it:

- On a parse failure, `generator_node` (`orchestrator.py:1963`) returns a fallback draft whose
  text is literally *"API Rate Limit Hit. Please try again in 1 minute."* (misleading — the
  cause is malformed JSON, not a rate limit).
- The provider chain fails over only on **rate-limit / empty** responses, **not** on
  unparseable content — so a malformed Gemini response is never retried against Cerebras.
- `main.py` refuses to *cache* a fallback draft (`_is_fallback_draft`, line 370) but still
  **serves it to the student**. Impact is mode-dependent: **anchor/free-practice = low** (served
  from the `topic_anchors` cache), **adaptive mode = higher** (every question generated fresh).

**Recommended fix (keeps Gemini first):** in `generator_node`, on `parse_llm_json` failure,
retry once and force failover to the next provider (Cerebras); optionally raise MCQ/listening
`max_tokens` 2048→3072 as cheap insurance. This is exactly the "validation-and-repair layer"
§4.1 already claims — implementing it makes the paper's claim true and removes the live risk.

**For the paper:** frame §4.1 as *intermittent, non-deterministic malformed JSON mitigated by a
repair-and-failover layer* — NOT as "Gemini is broken." Do not cite a 50% Gemini failure rate;
it was transient and not reproducible.

---

# Final multi-subject run (2026-07-21, free chain) — measured figures for §4.1 / §4.2

Run ID (UTC start): **20260721T054608Z** · artifacts: `evidence/runlog_20260721T054608Z.txt`,
`evidence/run_summary.md`, `evidence/run_summary.csv`, `evidence/db_after_20260721T054608Z.json`.
Provider chain exercised: **Cerebras → OpenRouter → GroqCloud** (free tier; no Gemini, no paid
DeepSeek). This is the full run the pilot promised; **cite these figures, not the pilot's.**

## Headline (from `evidence/run_summary.md`)

| Metric | Value |
|---|---|
| Items generated (log ✓) | **1491** |
| Items failed (log ✗) | **0** |
| DB bank delta (after − before) | **+1524** (353 → 1877) |
| Reconciliation gap (log ✓ − DB delta) | **−33** |
| Items needing >1 attempt (failover mid-item) | 1123 |
| Total 429 (rate-limit) events | **97** |
| Total failover events (429 + error) | **1214** |
| All-providers-cooling sleeps | **0** (≈0.0 s waited) |
| Wall-clock | 6859 s (~114 min) |
| English-language items generated | 714 (DB English delta 732) |

### JSON structured-output reliability (Cycle 1 evidence)

| Metric | Value |
|---|---|
| Schema validation failures | **0** |
| JSON decode failures (malformed/truncated) | **0** |
| Malformed-JSON rate (of 1491 attempts) | **0.0%** |

### Failover / rate-limit breakdown per provider (Cycle 2 evidence)

| Provider | Cooldowns | 429 (rate-limit) | Error-failovers |
|---|---|---|---|
| Cerebras | 51 | 51 | 0 |
| GroqCloud | 46 | 46 | 0 |
| OpenRouter | 0 | 0 | 1117 |

## What these figures do to the paper

- **§4.1 (Cycle 1) — malformed-JSON rate 0.0% on this run.** Zero schema and zero decode
  failures across 1,491 items. This does **not** contradict the Cycle 1 claim — it confirms the
  follow-up diagnostic's revised conclusion that malformed JSON is *intermittent, not systematic*:
  the pilot (Gemini) saw a transient 50% burst; this free-chain run saw none. **For the paper, the
  honest framing is:** the pipeline must *defend against* intermittent malformed JSON (some runs
  hit it, some don't); the durable point is the **absence of an MCQ repair/retry net today**, not a
  fixed failure rate. Cite "0.0% malformed on a 1,491-item free-chain run; 50% transient burst in a
  6-item Gemini pilot" to show the non-determinism directly.

- **§4.2 (Cycle 2) — the rate-limiting symptom REPRODUCED, and the failover fix held.** Unlike the
  Gemini pilot (0 × 429), the free chain hit **97 rate-limit (429) events** and **1,214 total
  failovers**, with **1,123 of 1,491 items needing more than one attempt**. Critically: **0 items
  failed** and **0 all-providers-cooling sleeps** were needed — the cooldown-and-failover client
  absorbed every 429 by rotating providers, so the run completed. This is exactly the honest §4.2
  evidence: at free-tier scale, throughput is governed by **provider failover and cooldown**, and
  the machinery converted cascading 429s into a completed run rather than an aborted one.

- **"Completed without loss" — NOT fully supported; soften it.** The seeder logged **0 failed
  items**, but there is a **−33 reconciliation gap**: the DB bank grew by 1,524 while the log
  counted 1,491 successes. The DB delta is the trustworthy figure; the two do not reconcile, so the
  literal claim "completed without loss" is not provable from these artifacts. **Recommended paper
  wording:** *"the full run completed with zero logged item failures; a small reconciliation
  discrepancy between the success counter and the committed row delta remained and is reported
  transparently"* — or chase the −33 first (see below) and state the reconciled figure.

## Open thread (optional, gates the strongest wording)

The **−33 gap** (DB delta 1,524 > logged successes 1,491) is unexplained — candidates: the
ok-counter under-counting appends into pre-created rows, `question_bank` array-append writing more
rows than the counter tracks, or bank-cap trimming. Resolving it lets §4.2 claim a fully reconciled
"without loss." Until then, use the softened wording above.

---

# TODO (data quality — sort out later): cached fallback placeholders in `question_bank`

**Found 2026-07-21 while exporting the teacher-review docx.** A large share of the cached
question bank is the fallback placeholder — MCQs whose `question` text is literally
`"API Rate Limit Hit. Please try again in 1 minute."` with dummy A/B/C/D options and
`distractor_rationale: {"A": "System error fallback."}`. For **Bahasa Inggeris alone: 99 of 141
cached items (70%) are this junk**; only 42 are real.

- **Root cause:** the seed scripts append the generator's fallback draft into
  `topic_anchors.question_bank` **without** the `_is_fallback_draft` guard that `app/main.py`
  (line ~370) uses before caching. So generation failures (rate-limit exhaustion / unparseable
  content) get persisted as if they were valid items.
- **Live impact:** in **anchor / free-practice mode** these can be served to students verbatim
  (fresh **adaptive** mode regenerates, so lower risk there).
- **Paper impact:** these are silent failures counted as successes — they undercut the
  "1491 generated, 0 failed / 0.0% malformed" framing and are a likely contributor to the −33
  reconciliation gap. Reconcile before citing "completed without loss."
- **Fix later:** (a) add the `_is_fallback_draft` skip to the seed scripts before append;
  (b) one-off purge of existing fallback rows from every subject's `question_bank`;
  (c) re-run skip-on-exist to backfill the purged slots.
- **Not yet audited:** the fallback share for the other ~16 subjects (only Bahasa Inggeris counted).

---

# §4.7 SEDA Dialogic-Quality Analysis — real corpus + coding pack (2026-07-21)

Replaces the **illustrative** SEDA numbers (κ = .81, Table 3 percentages) flagged as
placeholders in "Still unverified on the author's side". The corpus and two-coder pack are
now built; the κ and Table 3 below are filled by running the analyzer after both coders code.

## Corpus and coding (final method text — use this in §4.7 "Corpus and coding")

> The audit corpus comprises **50 machine-generated teacher-intervention scripts** produced by
> the system's production triage generator (`_generate_intervention_scripts`) — the same code
> path that serves the teacher dashboard. Synthetic flagged-student cases were constructed
> without any student data, stratified across the platform's **10 Bahasa Inggeris error
> categories** (Conceptual Gap, Careless Error, Language Barrier, Incomplete Answer, Content
> Weakness, Language Accuracy, Organisation/Register, Below Length Requirement, Structural
> Issue, Insufficient Depth) crossed with **20 KSSM English topics**, each error category
> appearing five times. Scripts were generated via the default provider chain (served by
> Gemini `gemini-3-flash-preview`); none fell back to the deterministic template. Each script
> was segmented at sentence level into communicative acts, yielding **167 acts** (mean 3.3 per
> script), which formed the fixed unit of analysis. Two coders independently assigned each act
> to one of the eight SEDA clusters (Hennessy et al., 2016) or a non-dialogic "ND" category,
> blind to each other and to the item order. Inter-rater reliability was computed with Cohen's
> κ; disagreements were resolved by discussion before reporting the cluster distribution.

Artifacts: `seda/corpus/scripts.jsonl` (50), `seda/corpus/units.csv` (167 acts),
`seda/coding/coder_A.xlsx` + `coder_B.xlsx` (blind), `seda/coding/CODER_BRIEF.md`.

## Results — FILL AFTER CODING

Run `python3 seda/analyze_agreement.py` once both workbooks are coded. It writes
`seda/results/agreement_summary.md` and prints a paste-ready block. Drop the numbers here:

- **Inter-rater reliability (RQ3):** Cohen's κ = `__.__` (percent agreement `__._%`),
  _n_ = `___` acts coded by both. `[FILL]`
- **Table 3 — SEDA cluster distribution (consensus acts):** `[FILL from analyzer]`

| SEDA cluster | count | % |
|---|---|---|
| IRE | `__` | `__._%` |
| RE  | `__` | `__._%` |
| BI  | `__` | `__._%` |
| CO  | `__` | `__._%` |
| RD  | `__` | `__._%` |
| EI  | `__` | `__._%` |
| PC  | `__` | `__._%` |
| GD  | `__` | `__._%` |
| ND  | `__` | `__._%` |

> **Interpretation (§4.7) — write once distribution is known:** report which clusters dominate
> (the substitution argument in §3.5 says the script's dialogic ceiling = what these acts encode).
> A high share of IRE / RE / BI / PC supports the claim that the triage artifacts carry genuine
> dialogic-scaffolding potential; a high ND share would qualify it. Do NOT pre-write the verdict —
> let the coded distribution decide it.
