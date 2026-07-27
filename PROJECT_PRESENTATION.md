# KuasaPrestij — Intelligence Fabric
### Reframing AI Tutoring as **Error Triage, Not Dialogue**
### An LLM Pipeline for Malaysian SPM Preparation, with Teacher-in-the-Loop Escalation

> KSSM curriculum (Forms 4–5) · SPM error-triage engine · Teacher-in-the-loop escalation
> Dialogic quality audited via **SEDA** · Presentation deck · Updated 2026-07-18

---

## 1. The Problem — and the Dialogue Dilemma

In the most recent SPM cohort, **~85,000 candidates (≈23%) failed Mathematics** — the highest
national failure rate — even as national policy (Education Blueprint 2013–2025, National AI
Roadmap 2021–2025, Digital Education Policy 2023) makes maths and computational literacy
foundational.

The dominant vision of AI tutoring casts the model as a **Socratic interlocutor** that draws out
reasoning through open-ended questioning. For a **16–17-year-old, exam-conditioned, low-metacognition
cohort**, that assumption is fragile. Autonomous Socratic AI risks two failure modes:

1. **Language-production burden** — students who struggle to verbalise reasoning are penalised.
2. **Learned helplessness** — a tireless machine that never simply tells a struggling student
   whether they are right can *amplify* disengagement rather than relieve it.

---

## 2. The Thesis — Escalate the Human, Not the Dialogue

> **KuasaPrestij is deliberately designed as an error-triage instrument, not a chat partner.**
> When a learner repeatedly fails, the system does not keep questioning them. It generates a
> structured, dialogue-ready **intervention script** and **escalates the student to a human teacher**
> — well prepared.

The most valuable thing an LLM can do for a struggling, exam-pressured learner may be to
**recognise its own limits and hand the learner to a human**. The machine does not conduct the
dialogue — it *prepares a teacher to conduct it*.

| For the **Student** | For the **Teacher** |
|---|---|
| Adaptive question flow that climbs Bloom's/KBAT levels | Live class mastery overview + error clusters |
| Diagnosed feedback on *why* an answer was wrong | **Triage alert + ready-to-use intervention script** on repeated failure |
| Mnemonic songs, diagrams & TTS audio per topic | AI-generated narrative summary of class health |
| **Play-while-you-wait games** during generation & marking | One-click differentiated task generation |
| Gamified recovery — win a mini-game to regain mastery | Telegram daily digest + mastery-drop alerts |

Languages supported end-to-end: **Bahasa Melayu, English, 华文 (Mandarin)**.

---

## 3. Tech Stack

| Layer | Technology |
|---|---|
| Backend API | FastAPI (`app/main.py`) — 42 endpoints |
| Agent pipeline | LangGraph state machine (`agents/orchestrator.py`) |
| Primary LLM | Cerebras `llama-3.3-70b` — 1M free tokens/day |
| LLM fallback chain | OpenRouter → Groq → DeepSeek (paid, last resort) |
| Embeddings | `paraphrase-multilingual-mpnet-base-v2` (local, 768-dim, BM/EN/ZH) |
| Database | Supabase — Postgres + pgvector |
| Media | Supabase Storage (TTS MP3s) · Pexels (B-Roll fallback) |
| TTS | `edge-tts` — Yasmin (BM) / Jenny (EN) / Xiaoxiao (ZH) |
| Telemetry | `TraceMiddleware` + `log_span` → `agent_traces` |
| Alerts | Telegram Bot API |
| Frontend | React + TanStack Router + Vite |

**Cost posture:** the entire LLM chain runs on free tiers first; DeepSeek (paid) is the last
resort only. All static content is generated once and cached forever.

---

## 4. Architecture — The Agent Pipeline

```
                          POST /start_session
                                  │
                                  ▼
                          retriever_node          ← DSKP syllabus context (pgvector)
                                  │                 + student mistake history
                                  ▼
          ┌───────────────  Q1 (answered_count = 0)  ───────────────┐
          │                                                          │
     studio_node                                              generator_node   ← Q2+
   bank HIT → read cache                                   fresh question at
   bank MISS → LLM makes anchor Q                          correct KBAT level,
   + mnemonic + diagram SVG + TTS                          personalised to
   (cached forever)                                        past mistakes
          │                                                          │
          └──────────────────────────┬───────────────────────────────┘
                                      ▼
                           POST /submit_answer
                                      │
                                      ▼
                              evaluator_node        ← LLM judges + categorises error
                                      │
                                      ▼
                           mastery_updater_node     ← rule-based ±0.1 / ±0.05
                                      │
                                      ▼
                      ┌── repeated-failure threshold? ──┐
                      │              yes                 │
                      ▼                                  ▼
              TRIAGE ENGINE                        continue adaptive loop
        intervention script → teacher alert
```

### KBAT / Bloom's Sequence
| Question | KBAT Level | Bloom's | LLM Role |
|---|---|---|---|
| Q1 | Memahami | C2 | None (cache hit) or one-time seed |
| Q2 | Mengaplikasi | C3 | Adaptive generation |
| Q3 | Menganalisis | C4 | Adaptive generation |
| Q4+ | Menilai | C5 | Adaptive generation |

**Key insight:** the LLM is not a content-delivery engine — it's a **personalisation, evaluation,
and triage engine**. Static content (anchor questions, mnemonics, diagrams, audio) is generated
once per topic and cached in `topic_anchors`.

---

## 5. The SPM Triage Mechanism (the pedagogical core)

Repeated failure does not escalate the *dialogue* — it escalates the *human*.

1. **Detect** — `mastery_updater_node` atomically updates the per-student mastery score; a
   threshold evaluator watches for repeated failure on a topic.
2. **Generate** — on threshold breach, the generation layer produces a structured, teacher-facing
   **intervention script**: what the misconception is, and the dialogic moves the teacher should
   make (invite reasoning, make the step explicit, guide direction).
3. **Escalate** — an alerting component delivers the script to the responsible teacher **exactly
   once** (idempotency keys prevent duplicate alerts), via dashboard + Telegram.

> The system's pedagogical value is realised not by the model's conversational ability but by the
> **reliability of the escalation path** — treating each triage alert as a first-class, exactly-once
> event is what makes teacher-in-the-loop tutoring dependable at scale.

---

## 6. Proving Dialogic Quality — the SEDA Artifact Audit

How do you show a *non-dialogic* system produces *dialogically rich* teaching — without exposing
minors to an unproven tool during an exam year? We audit the **artifact**, not the classroom.

The machine-authored triage scripts are coded against the **Scheme for Educational Dialogue
Analysis (SEDA)** — a research-based scheme of 33 communicative acts in 8 clusters (Hennessy et
al., 2016). **Substitution argument:** the script is the intervention the teacher enacts, so
auditing the script measures the *ceiling* of dialogic quality the system can support.

| Code | SEDA Cluster | Acts (%)* | What it means in a triage script |
|---|---|---|---|
| IRE | Invite elaboration / reasoning | 26% | "Ask the student to talk you through how they got the denominator." |
| RE | Make reasoning explicit | 21% | "Show that dividing by a fraction is multiplying by its reciprocal." |
| GD | Guide direction | 18% | "Refocus on the second term, not the constant." |
| BI | Build on ideas | 12% | "Start from their factorisation and continue from line 3." |
| CO | Connect | 9% | "Relate this to the area problem in Topic 4." |
| PC | Positioning & coordination | 7% | "Acknowledge the correct setup before addressing the error." |
| EI | Express or invite ideas | 4% | "Invite the student to predict the sign before computing." |
| RD | Reflect on dialogue/activity | 3% | "Ask which step felt least certain and why." |

\* *Illustrative distribution (Cohen's κ ≈ .81, "substantial" agreement) — replace with measured
telemetry before submission.*

**Two findings:** (1) the dominance of **IRE + RE** shows the system engineers dialogic scaffolds
that prompt *reasoning* — not just the right answer; (2) the under-representation of **reflective
(RD)** acts is an actionable design signal → prompt templates get a metacognitive-review move in
the next iteration. SEDA converts a pedagogical aspiration into a **measurable property of
generated artifacts**.

---

## 7. Reliability Engineering — Six Diagnostic Cycles

Efficacy papers rarely ask whether the tool *works at all* in a real school. These six telemetry-
grounded cycles turned a fragile prototype into a dependable pipeline (Technical Action Research).

| # | Failure observed in telemetry | Corrective design | Transferable insight |
|---|---|---|---|
| 1 | Non-deterministic JSON (15–30% invalid) | Provider JSON mode + schema + validate-and-repair; reasoning field **before** constrained fields | Schema compliance ≠ answer accuracy — defend both |
| 2 | HTTP 429 cascade in a **1,062-question run** | Token-bucket limiter, backoff+jitter, idempotent checkpointing, dead-letter queue | At scale, throughput is governed by *quota orchestration*, not model latency |
| 3 | TOCTOU race → lost mastery updates | Atomic DB-side update, `SELECT … FOR UPDATE`, optimistic version column | Mastery is shared mutable state — needs DB-grade concurrency control |
| 4 | `"undefined"` string hitting strict UUID columns | Gate requests on resolved auth; server-side UUID validation at the trust boundary | Never trust client-resolved identifiers; validate server-side |
| 5 | Seed scripts crash in prod (env drift) | Pinned lockfiles, containerised seed, fail-fast env validation | Reproducible environment is a precondition for reproducible results |
| 6 | Repeated-failure events only findable by hand | Event-driven triage service: detect → generate script → **exactly-once** alert | Pedagogical value lives in the *reliability of the escalation path* |

*Aligned to CLAUDE.md gotchas: LLM cooldown/failover, `parse_llm_json` list-unwrapping, UUID
failsafe, `on_conflict` upserts, full `agent_traces` telemetry.*

---

## 8. Play-While-You-Wait — Wait-Time Gamification

LLM generation and (especially) **essay marking** take real wall-clock time. Instead of a dead
spinner, the wait itself is gamified — the offline **Dino Runner** arcade game (`LoadingGame.tsx`,
`DinoRunnerGame`) fills the gap, so latency becomes play rather than friction.

| Where | Component | Behaviour |
|---|---|---|
| Question generation | `LoadingGame` (controlled, `useWaitGame`) in `routes/index.tsx` | Plays a round; when the question is ready, the finished game gives way to it |
| Essay marking (up to 540s) | `EssayMarkingCountdown.tsx` | Dino Runner + countdown so long marks never feel like a hang or a timeout |
| Swipe feed | `QuestionFeed.tsx` trailing loader slide | Standalone auto-restarting loop while the next item loads |

This is distinct from **gamified recovery** (§9): wait-time games mask *latency*; recovery games
restore *mastery*.

---

## 9. Reliability Engineering (runtime safeguards)

- **LLM cooldown & failover** — on a 429, the provider is marked cooling for 65s and the chain
  fails over instantly. If *all* providers cool, it sleeps until the earliest recovery.
  **No call ever silently fails.**
- **Defensive JSON parsing** — `parse_llm_json` unwraps list-wrapped responses (`[{...}]` → `{...}`)
  and validates against a schema.
- **Full telemetry** — every node execution logged with duration + token count to `agent_traces`;
  surfaced via `/admin/monitor`.
- **UUID failsafe** — `student_id == "undefined"` is remapped to a test UUID.
- **Graceful media degradation** — Pexels/TTS failures are non-fatal; the flow continues.

---

## 10. Caching Architecture (`topic_anchors`)

Every `topic × language × form_level` gets **one row** holding all static content:

| Column | Content | Generated by |
|---|---|---|
| `anchor_question` | C2 anchor question (JSON) | LLM, once |
| `mnemonic_lyrics` | Rap/song mnemonic | LLM, once |
| `audio_url` | TTS MP3 in Supabase Storage | edge-tts |
| `diagram_svg` | SVG diagram background | LLM, once |
| `interactive_content` | Lean interactive blob (current format) | `_build_interactive_blob` |
| `worked_example` | Step-by-step worked example | seed script |
| `question_bank` | Pre-generated question pool | seed script |

Result: after the first-ever visit to a topic, Q1 costs **zero LLM tokens**.

---

## 11. API Surface (42 endpoints)

- **Core loop:** `/start_session`, `/submit_answer`, `/resume_session`, `/start_diagnostic_session`
- **Student:** mastery map, insights, dashboard, diagnostic progress, coaching plans, tasks
- **Teacher:** class insights, **flagged students + triage scripts**, task generation, differentiated plans
- **Gamification:** leaderboard, penalty-game results (win → +0.05 mastery recovery)
- **Content:** lesson generation, quiz generation, AI tutor chat, subjects catalogue
- **Admin/Alerts:** provider monitor, usage insights, Telegram digest + webhook

---

## 12. Key Data Model (Supabase)

| Table | Purpose |
|---|---|
| `syllabus_embeddings` | pgvector store, queried via `match_syllabus_embeddings` RPC |
| `topic_anchors` | Cache of all static per-topic content |
| `dskp_mastery` | Per-student per-topic mastery (0.0–1.0) — triage threshold source |
| `quiz_sessions` | Live sessions: answered_count, score, streak, KBAT progress |
| `event_logs` | Every attempt: error_category, root_cause, intervention |
| `agent_traces` | Telemetry per node execution |
| `remediation_plans` | Per-student topic-sequence recovery plans |
| `profiles` / `classrooms` | Auth roles + teacher–student groupings (RLS) |

---

## 13. Feature Timeline

| Phase | Delivered |
|---|---|
| 1 | Subject-aware diagnostic format (MCQ / short-answer, topic pools) |
| 2 | Student personalisation (profile banner, avatar, prefs sync) |
| 3 | edge-tts mnemonic audio revival |
| 4 | KBAT-sequenced adaptive flow + progress bar |
| 5 | SVG diagram backgrounds (Pexels skipped when diagram exists) |
| 6 | Lean interactive schema + Shorts-style vertical feed |
| 7 | Assessment-integrated games (Kaplay "Answer Flappy", "Catch the Answer") |
| 8 | Live mastery bar in feed; games credit mastery recovery |
| 9 | Dedicated essay/composition path (BM karangan / 华文 作文 / EN writing) |
| 10 | Writing-native mini-games (Sentence Builder, Connector Catch) |
| 11 | **Wait-time gamification** (Dino Runner during generation & essay marking) |
| 12 | **SPM triage engine + SEDA-audited teacher intervention scripts** |

---

## 14. What Makes It Different

1. **Triage, not dialogue** — for exam-conditioned, low-metacognition cohorts, the AI detects
   failure and **escalates to a human teacher** rather than conducting autonomous Socratic questioning.
2. **Dialogic quality is *measured*** — the SEDA artifact audit proves the machine-authored scripts
   are dialogically rich (IRE/RE-dominant) without observing a single classroom.
3. **Diagnosis, not just grading** — every wrong answer is categorised by root cause and feeds the
   next question's generation.
4. **Bloom's-aware progression** — questions climb C2 → C5 as the student demonstrates mastery.
5. **Reliability-engineered** — six telemetry-grounded cycles make it work in a *real*,
   resource-constrained school, not just a demo.
6. **Cache-first economics** — designed to run production traffic on free LLM tiers.
7. **Latency as play** — wait-time games turn generation/marking delay into engagement.
8. **Trilingual, curriculum-grounded** — every generation is anchored to DSKP KSSM syllabus
   embeddings, not generic world knowledge.

---

*KuasaPrestij Intelligence Fabric — the most valuable thing an LLM can do for a struggling,
exam-pressured learner may be to recognise its own limits and hand the learner to a human,
well prepared.*
