# WORKSPACE.md — Live Task Tracker

> Claude updates this file after every task. Last updated: 2026-07-27 (special-needs accommodations plan + research committed; clean branch pushed to GitHub; exposed API key needs rotation)

---

## ♿ Special-needs accommodations — planning + first GitHub push — 2026-07-27

**Ask:** incorporate tools tailored to special needs (ADHD-first) grounded in research;
fix bugs → commit to GitHub → then build a per-student profile; commit the plan to MD.

**Done:**
- **Bug triage:** no active code bugs — backend `import app.main` clean, frontend `tsc` clean,
  known bug list already cleared per memory. Pending WORKSPACE items are deployment/verify steps.
- **Research:** cited evidence briefing → `SPECIAL_NEEDS_RESEARCH.md` (ADHD/dyslexia/autism/
  dyscalculia/anxiety; WCAG 2.2 + COGA; BDA style guide; LLM plain-language for BM/EN/ZH).
  Key nuances: immediate feedback is NOT universally best for ADHD; gamification/timed games
  carry distraction/stress risk → make salient/timed elements OPT-IN. OpenDyslexic contested →
  opt-in only.
- **Plan:** `SPECIAL_NEEDS_PLAN.md` — toggleable `accommodation_profile` (never an inferred
  diagnosis), mapped onto existing feed/gameKit/mastery-bar/KBAT/edge-tts. Build phases A–E.
- **GitHub:** local branch history was UNPUSHABLE (4.6 GB `.git`; a 375 MB file + dozens of
  >100 MB DSKP PDFs in history exceed GitHub's 100 MB/file + 2 GiB/pack limits). Full 208-commit
  history archived as text → `GIT_HISTORY_ARCHIVE.txt`. Pushed a squashed clean snapshot
  (current tree on `origin/main`) as branch **`cleanup/pushable-base`** (commit `62e8e05`).
- **Security:** GitHub secret-scanning caught a Gemini/GCP API key in `.claude/settings.local.json`
  (permission allow-list). Untracked + gitignored the file, redacted the value on disk.

**⚠️ USER ACTION REQUIRED:** ROTATE the exposed Gemini/GCP key (`GKEY`, prefix `AQ.Ab8RN6…`) —
it was in a committed file in local history.

**Phase A DONE (2026-07-27):** `accommodation_profile` foundation — **no behavior change yet**
(nothing reads the flags; all default OFF).
- Model: `AccommodationPrefs` (10 neutral booleans) + `DEFAULT_ACCOMMODATIONS` +
  shared `ACCOMMODATION_GROUPS` metadata in `useStudentPrefs.ts`; nested-merge made robust in
  localStorage read + DB load; `setAccommodation()` helper. Stored in `profiles.preferences` jsonb.
- Student UI: "Comfort & Accessibility" section in `StudentSettingsSheet.tsx` (grouped toggles).
- Teacher UI: `TeacherAccommodationsCard` in `teacher/ClassroomsPanel.tsx` (student detail view) —
  reads/writes the student's prefs via UPDATE.
- RLS: `schema/profiles_teacher_accommodations.sql` — teachers may UPDATE profiles of students in
  their own classrooms (role changes still blocked by existing trigger). **Applied live** to
  project `opavfcpsxnntjylipbwl` via Management API; policy `profiles_update_student_by_teacher`
  verified present. Frontend uses UPDATE (not upsert) so no INSERT policy needed.
- `tsc` clean; synced to secondary clone `/root/learn-play-shine-96`.
- NOT yet verified in a live browser walk; frontend repo not committed/pushed.

**PIVOT DONE (2026-07-27):** teacher no longer hand-picks toggles — they enter the student's
KNOWN condition(s) and the system DERIVES the accommodation flags + a PACE profile (AI adapts;
app never diagnoses).
- `agents/accommodations.py` — deterministic evidence-based map (ADHD/dyslexia/autism/dyscalculia/
  anxiety/low working memory) → flags + pace (`session_length`, `break_cadence`, `difficulty_ramp`,
  `time_limits`, `feedback_style`); multi-condition = most-supportive combine; severity scaling;
  optional LLM refinement when teacher adds notes (baseline is a floor). Unit-tested.
- `POST /derive_accommodations` (`require_teacher` + `_teacher_owns_student`) writes
  accommodations + pace_profile + condition_profile into `profiles.preferences`. Live on :8001;
  401 on no/bad token verified. Backend restarted.
- Frontend teacher card = condition picker + severity + notes → "Generate support plan" → shows
  rationale/pace/supports; manual toggles kept as an advanced override. `tsc` clean; synced.

**Phase B DONE (2026-07-27) — runtime consumption (first slice):**
- Backend (`app/main.py`): `_load_accommodation_context()` + `_kbat_index(answered_count, ramp)`;
  `start_session` now loads the student's profile, modulates the KBAT climb by `difficulty_ramp`
  (gentle=2 q/level, normal=1:1, fast=skips), and returns `accommodations` + `pace_profile` in the
  response. Verified live on :8001 (response carries both; ramp math unit-checked).
- Frontend: `StudentPrefs` gains typed `pace_profile` (+ `DEFAULT_PACE_PROFILE`, robust nested
  merge). `useStudentPrefs` applies sensory flags globally via `<html>` classes + `data-reduce-motion`
  (`reduce-motion` / `high-contrast` / `dyslexia-font` / `focus-mode`). `styles.css` implements those
  classes (motion kill, BDA dyslexia font/spacing, contrast, focus hide `[data-nonessential]`).
  `gameKit.ts` `motionEnabled()` gates particle bursts + screen shake on `reduce_motion`. `tsc`
  clean; synced to secondary clone.

**Phase B.2 (remaining runtime hooks):** consume the rest of `pace_profile` — `session_length`/
`break_cadence` (break reminders in the feed), `time_limits` (essay/answer countdowns +
`no_timed_games` routing to a calm penalty), `feedback_style` (pause+explain), and
`simplified_language`/`worked_example_first` in `generator_node`. `read_aloud` via edge-tts on the
answer path.

**GCP migration:** plan written → `GCP_MIGRATION_PLAN.md` (recommended hybrid = Cloud Run backend +
keep Supabase; full-GCP option flagged as a large re-platform of auth/RLS/PostgREST).

Optional: open PR `cleanup/pushable-base` → `main`
(URL: github.com/alvinauh/kuasaprestij/pull/new/cleanup/pushable-base).

---

## 🧮 NEW QUESTION TYPE: `step_sort` (drag-and-drop working) — 2026-07-20 (backend live, tested)

**Goal:** assess Mathematics / Additional Mathematics students on their *working/method*, not
just the final answer. Duolingo/Parsons-style: student drags shuffled solution steps into the
correct chronological order and must reject misconception distractors. Grades **method (M) vs
accuracy (A) marks** the way an SPM scheme does.

**Backend (done, unit-tested via `agents/orchestrator.py::grade_step_sort`):**
- `schemas/assessment.py`: added `SolutionStep`, `DistractorStep`, `StepSortQuestion`.
- `agents/orchestrator.py`:
  - `grade_step_sort()` + `_lis_ids()` — **deterministic, NO LLM at answer time** (can't time
    out). Method marks = longest-increasing-subsequence of correctly-ordered steps; picking a
    distractor scores 0 for it and surfaces its **authored** `misconception`/`error_category`
    straight into `event_logs` (no inference). Prefilled scaffolding steps excluded from pool.
  - Evaluator branch: `if q_type == 'step_sort': return grade_step_sort(draft, state)`.
  - Generator: `step_sort` prompt (math-framed, emits `solution_steps` + `distractor_steps`),
    registered in `_GEN_SCHEMAS` + `_GEN_MAX_TOKENS` (3072) + fallback draft.
  - Routing verified: `step_sort` ≠ mcq → skips `studio_node`, runs `generator_node`. No graph change.
  - `mastery_updater_node` unchanged — step_sort falls into the `0.1 * partial` open-question branch.
- `app/main.py`: `SubmitAnswerRequest.sequence: Optional[List[str]]` (ordered chunk ids); injected
  into evaluator state as `state["sequence"]` (grader also falls back to JSON-parsing `student_answer`).

**Tested:** perfect=1.0/correct; missing-step=0.75; out-of-order drops misplaced step; distractor
pick → not-correct + misconception root cause; empty=0.0; prefilled shrinks pool; JSON fallback OK.

**PENDING / next:**
1. **Frontend drag renderer** — reuse the games-phase `GameChallenge`/drag infra. Chunk bank =
   `solution_steps + distractor_steps` (shuffle server-side), drop zone = ordered list, KaTeX render
   `expression`, `prefilled_step_ids` locked. POST `sequence: [ids]` to `/submit_answer`.
2. **Caller gating** — only request `question_type='step_sort'` for Mathematics / Additional
   Mathematics (prompt is math-framed). Escalate to typed `short_answer` once topic mastery ≥ 0.9
   (prove *production*, not just *recognition*).
3. Optionally seed `step_sort` questions into `topic_anchors.question_bank` for instant Q1.

---

## 🩹 Admin Console: missing table + admin read policies — 2026-07-18 (live, DB only)

**Two admin-console bugs, both RLS/schema, no app-code change:**

1. **"Could not find table public.app_errors"** — the table was referenced by
   `src/lib/log-app-error.ts` (client error logger) + the admin Error Log tab, and was in the
   generated types.ts, but never created. Created `public.app_errors` (id, user_id, level, message,
   source, url, stack, context, created_at) → `schema/app_errors.sql`. RLS: anyone (anon+auth) may
   INSERT, only admins may SELECT. Reloaded PostgREST schema cache. REST now 200.

2. **"Only one user shows in Users tab"** — actually 6 users exist (1 admin, 5 students, 0 teachers).
   `profiles` had only `profiles_select_own` (auth.uid()=id), so an admin's session saw only its own
   row. Added `profiles_select_admin` using a SECURITY DEFINER `public.is_admin()` helper (avoids
   the recursive-RLS trap of SELECTing profiles inside a profiles policy) → `schema/profiles_admin_read.sql`.
   Verified with RLS on: admin sees 6, student sees 1.
   **Re-verified 2026-07-18 (later):** policies intact — 4 permissive, no restrictive; `is_admin()`
   returns true for admin `ddb41463` (alvinauh@hotmail.com); DB provably returns all 6 profiles to an
   authenticated admin. Fix is fully live server-side — if the tab still looks short, it's a stale
   client session (hard-refresh / re-login). NOTE: only `alvinauh@hotmail.com` is admin; logging in
   as a student (han/pigraider@gmail.com, ipgm-2284) redirects out of the console.

**Note:** other admin tabs reading cross-user tables (e.g. Classrooms) may have the same
own-row-only RLS limitation — not audited yet; flag if a tab looks empty/short.

---

## 🔒 SECURITY: /admin/* API now requires admin auth — 2026-07-18 (live)

**Trigger:** reviewing who can reach the Admin Console (incl. new Feedback Quality tab).

**Findings:**
- UI `/admin` route is gated to `role='admin'` — only ONE admin exists: "alvin".
- Role **self-escalation was ALREADY blocked** — pre-existing trigger `block_role_self_update`
  (`prevent_role_self_update`) raises on any `role` change. (My initial "a user can self-promote"
  claim was WRONG — inferred from the column-blind RLS UPDATE policy without checking triggers.
  Verified: non-admin `update … set role='admin'` → rejected; non-role updates → allowed.)
- Signup can't set admin — `handle_new_user` hardcodes `role='student'`, ignores signup metadata.
- **Real hole:** `/admin/*` backend endpoints had NO auth — reachable by anyone with the URL
  (curl returned 200). The frontend role check only hid the UI button.

**Fix (backend `app/main.py` + frontend `admin.tsx`):**
- `require_admin` FastAPI dependency: validates caller's Supabase access token via
  `supabase.auth.get_user(token)`, then confirms that uid has `role='admin'`. Added
  `Depends(require_admin)` to all 5 admin routes (`/admin/monitor`, `/admin/insights`,
  `/admin/digest`, `/admin/feedback_quality`, `/admin/feedback_quality/run`).
- Frontend `adminFetch()` helper attaches `Authorization: Bearer <session token>`; all 5 admin
  calls in admin.tsx routed through it. `tsc` clean; synced to secondary clone.
- Daily Telegram digest UNAFFECTED — it runs via internal `_daily_digest_loop` (calls alert_admin
  directly), not the HTTP endpoint.

**Verified live:** no-token & bad-token → 401 (were 200). Backend restarted.
**Note:** I dropped a redundant role-guard trigger I briefly added (`trg_prevent_role_self_change`)
since the pre-existing one already covers it. Positive-path (real admin token) relies on
`get_user` — logic verified, not exercised with a live session.

---

## 📊 NEW: "Feedback Quality" admin audit (generic SEDA implementation) — 2026-07-18 (live)

**Ask:** implement the SCOPUS paper's SEDA "artifact audit" as a real feature, but named
generically (not "SEDA"). Audits the *dialogic richness* of the AI-generated teacher intervention
notes by coding each utterance into one of 8 teaching-move types.

**Built (backend `agents/feedback_quality.py` + `app/main.py`, frontend `admin.tsx`):**
- `agents/feedback_quality.py` — 8 plain-labelled move-types (Invites Reasoning / Makes Reasoning
  Explicit / Builds on Ideas / Connects Concepts / Reflects on Learning / Invites Ideas /
  Acknowledges & Positions / Guides Direction; provenance = SEDA clusters, noted only in a code
  comment). `_segment` (EN/BM/ZH sentence split) → `_classify_batch` (LLM) → distribution + coverage
  + coded sample. Corpus = the RICHER generated intervention scripts (dialogic), NOT the one-line
  `event_logs.intervention` (which is purely directive → skewed 98% "Guides Direction").
- Endpoints: `GET /admin/feedback_quality` (latest), `POST /admin/feedback_quality/run` (run+store).
  Batch job, off the answer hot path.
- Table `feedback_quality_audit` (jsonb result + created_at) — created via Supabase **Management
  API** (`SUPABASE_ACCESS_TOKEN`; MCP is read-only). SQL saved to `schema/feedback_quality_audit.sql`.
- Admin Console gets a **"Feedback Quality"** tab: run button, move distribution bars, coverage,
  under-represented-move flag, coded sample. `tsc --noEmit` clean; synced to secondary clone.

**Live result (real data):** 22 notes → 34 utterances, 100% coverage; Invites Reasoning 32%,
Builds on Ideas 21%, … Reflects on Learning 3% (under-represented) — matches the paper's RD finding.

**⚠️ Surfaced separately — Gemini truncates long outputs:** the default LLM chain is Gemini-first,
and Gemini truncates long classification/generation outputs mid-stream (spends output budget
"thinking") — returned 7 of 20 lines regardless of `max_tokens`. Free chain (Cerebras→Groq→
OpenRouter) returns full output. Also `cerebras_only` currently ERRORS (key/quota). The audit
classifier pins `free_only=True` to dodge Gemini. **Broader impact on other default-chain calls
not yet audited — flagged for follow-up.**

**PENDING:** frontend HMR picks it up live; backend restarted. Not committed/pushed.

---

## 🩹 BUGFIX: dashboard "Conceptual Gap" cards had no feedback text — 2026-07-18 (code done, restart pending)

**Symptom (user-reported):** on the student dashboard, where an error category like "Conceptual
Gap" is shown, no feedback text appears.

**Root cause (confirmed on prod `/teacher_insights`):** the "Latest Teacher Feedback" section
renders `flagged_students[].intervention_script`, but **every** flagged case came back with
`intervention_script: ""` (while `root_cause` was populated). `_generate_intervention_scripts`
(`app/main.py`) batched all flagged cases into one LLM JSON call, then parsed it with raw
`json.loads`. Two failure modes: (1) the response truncated at `max_tokens=2000` for 11
bilingual (BM/EN/ZH) cases → `Unterminated string`; (2) unescaped quotes mid-string →
`Expecting ',' delimiter`. Either way the exception was caught and **all** scripts wiped to "".

**Fix (`app/main.py`, backend only — frontend already renders correctly):**
- Defensive parse: `json.loads` → `_extract_json_payload()` recovery (imported from
  `schemas/assessment.py`) → `{}`; index→script map skips items missing `index`/`script`.
- `_fallback_intervention(f)`: deterministic teacher note built from the `error_category` +
  `root_cause` we already have, so a "Conceptual Gap" card is **never** blank again. Used per-case
  when the LLM yields no script (and on total exception).
- `max_tokens` 2000 → **4096** so the batch JSON completes and parses (covers up to 20 cases).

**Verified against live flagged data (11 cases):** was 11/11 empty → now 0 empty; all 11 return
real LLM scripts, fallback confirmed working when JSON is unparseable. `import app.main` clean.

**PENDING:** not live until the prod backend (`api.kuasa.tech:8443`) restarts.

---

## 🎞️ PROJECT_PRESENTATION.md reframed: SEDA + SPM triage + wait-time gamification — 2026-07-18 (doc only)

**Ask:** override the presentation deck to add framing that wasn't there before — the academic
reframe from `scopus_full_article.md` (AI as **error triage, not dialogue**; teacher-in-the-loop
escalation; **SEDA** dialogic-quality audit) and the **wait-time gamification** (loading + essay
marking games) that is built in the frontend but was missing from the deck.

**Done (`PROJECT_PRESENTATION.md`, doc only — no code touched):**
- §1 reframed to the *dialogue dilemma* (23% SPM maths failure; language-production burden +
  learned-helplessness failure modes of autonomous Socratic AI).
- §2 new thesis — *"Escalate the human, not the dialogue"*: error-triage instrument that routes a
  repeatedly-failing student to a prepared human teacher.
- §5 new — SPM triage mechanism (detect mastery threshold → generate teacher intervention script →
  exactly-once escalation).
- §6 new — **SEDA artifact-audit**: 8-cluster table + illustrative distribution (IRE 26% / RE 21%
  dominant; RD under-represented = design signal) + substitution argument. Figures marked
  illustrative per the paper's editorial note.
- §7 new — the **six reliability cycles** table (JSON validation, 429/1062-run, TOCTOU, UUID
  trust-boundary, env drift, exactly-once alerting), cross-referenced to CLAUDE.md gotchas.
- §8 new — **wait-time games**: Dino Runner `LoadingGame` during generation (`routes/index.tsx`),
  essay marking up to 540s (`EssayMarkingCountdown.tsx`), feed trailing loader (`QuestionFeed.tsx`);
  distinguished from mastery-recovery games.
- Architecture diagram now branches into the triage engine; endpoints/data-model/timeline/
  differentiators updated to include triage.

**Source of truth:** `scopus_full_article.md` (Dr Alvin Auh — TAR study reframing AI tutoring as
error triage, SEDA-as-artifact-audit protocol).

**Follow-up:** SEDA numbers (κ ≈ .81, cluster %) are the paper's illustrative placeholders —
carried over with an asterisk; swap in measured telemetry/coding outputs before any submission.

---

## ✍️ Separate curated essay-topic set for BM / English / Mandarin — 2026-07-17 (code complete)

**Ask:** the general DSKP/textbook-vectored topics (grammar, comprehension, KOMSAS/literature)
aren't suitable as essay prompts. Give essays their own curated topic set for the three
language subjects, derived from textbook thematic units.

**Design:** essay themes are a SEPARATE namespace shown only when question type = "essay".
Each theme becomes the FIXED theme of the generated composition, marked with that language's
flagship SPM essay rubric. Themes overlap with content-unit names, so composition detection is
gated on `question_type == "essay"` to keep them valid MCQ/short-answer topics too.

**Done (local branch, NOT deployed):**
- `agents/orchestrator.py` — `ESSAY_TOPICS_BY_FORM` (BM/English/Bahasa Cina, Form 4 & 5) +
  `ESSAY_TOPICS` union + `essay_topics_for(subject, form)` + `_is_curated_essay_theme()`.
  `_language_composition_spec(subject, topic, question_type=None)` now also resolves a curated
  theme → flagship rubric with `spec["theme"]` set; generator's essay branch injects a
  `FIXED THEME` directive; evaluator passes `question_type` so marking uses the composition rubric.
- `app/main.py` — `/subjects` entries gain `essay_topics`; the 3 force-essay call sites now pass
  `question_type` (curated themes only force essay when essay was chosen; legacy "Penulisan
  Karangan"/"Continuous Writing" still always force essay).
- Frontend — `api.ts` (`SubjectWithTopics.essay_topics` + parse), `index.tsx`
  (`selectableTopics()` swaps to curated themes in essay mode; subject/type switches snap the
  active topic). `tsc --noEmit` clean. Synced to secondary clone `/root/learn-play-shine-96`.

**Cost note:** zero new LLM calls — same single generation/marking call, only theme selection changes.

**Follow-ups (same day):**
- Mandarin essay themes are now Chinese-only (dropped the Malay glosses) in `ESSAY_TOPICS_BY_FORM`.
- `agents/chat_agent.py` — the "Ask Tutor" chat handles Mandarin: `_is_mandarin_context()` detects
  华文/Bahasa Cina (subject/topic label or any CJK char). Default reply is in **Mandarin**
  (`MANDARIN_DIRECTIVE`); it switches to **pinyin** (`MANDARIN_PINYIN_DIRECTIVE`, Hanyu Pinyin w/
  tone marks, terms as 汉字 (pīnyīn)) ONLY when the student asks — `_wants_pinyin(message)` matches
  "pinyin/拼音/romanise/pronounce/…". Works in question mode (subject/topic) and lesson mode (title).

**PENDING:** live verify (backend restart + browser walk of essay-mode topic dropdown + a Mandarin
tutor reply); not deployed.

---

## ✍️ Essay marking now returns a worked "how it should look" format — 2026-07-17 (code complete, verify deferred)

**Ask:** essays should give students a *format/model of how the essay should look*, not just a
short critique; and marking must not time out even when it takes a while.

**Done (local branch, NOT yet deployed to prod api.kuasa.tech):**
- `schemas/assessment.py` — `EssayEval` gains `model_structure` (worked intro→body→conclusion outline).
- `agents/orchestrator.py` — both essay eval prompts (composition + generic content) now request
  `model_structure`; the marking `_llm_call` gets `max_output_tokens=4096` so the longer report
  never truncates; `evaluator_node` returns new `essay_detail` dict = {band, strengths, improvements,
  model_answer (from draft), model_structure}. Added `essay_detail` to `AgentState`.
- `app/main.py` — `essay_detail=None` added to all 7 `AgentState` constructors; `/submit_answer`
  response now includes `essay_detail`.
- Frontend — `api.ts` (`EssayDetail` type + `AnswerResponse.essay_detail`, essay submit timeout
  300s→540s), `QuestionSlide.tsx` renders the essay report card (band/marks, strengths, improvements,
  "How it should look" outline, collapsible model answer; countdown now 540s), `EssayMarkingCountdown.tsx`
  default 540s. Synced to secondary clone `/root/learn-play-shine-96`. `tsc --noEmit` clean.

**Cost note (answering "is it too API-heavy"):** change adds **zero** new LLM calls per essay —
reuses the single existing marking call, only raises its output-token cap. No frontend polling.

**PENDING (deferred by user — "save this progress, continue later"):**
- Playwright verification of the essay flow. NOTE: local frontend :3000 → PROD api (old code);
  a live e2e mark would spend real prod tokens AND test old code. Options captured: skip / trace-only
  (no submit) / full e2e / start local backend on :8000 first then drive browser at it.
- Not yet deployed to production.

---

## 🩹 Essay "timeout" bounce ROOT CAUSE = infra, not code — A+ applied 2026-07-15

**Symptom:** essays "periodically time out" and push the student back to the study-mode
screen, with NO warning/countdown shown.

**Root cause (confirmed via Playwright console + systemd logs):** NOT the essay code.
The student-facing site runs on a **Vite _dev_ server** (`kuasaprestij-frontend.service`,
`npm run dev` on :3000). The **`kuasaprestij-frontend-pull.timer` fired every 5 minutes**,
ran `deploy/frontend_pull.sh`, and on any new commit did `systemctl restart` — every ~5 min
like clockwork (09:54, 09:59, 10:04…). Each restart drops the Vite HMR websocket →
browser logs `[vite] server connection lost` → **full page reload** → React state resets
(`studyMode`→null) → student dumped to study screen mid-essay, in-flight submit killed.
The "warning never shows" because it's a hard browser reload, not the app's timeout path.
Auth was NOT involved (session stayed `SIGNED_IN` throughout). Playwright "worked" only
because a fast click-through rarely straddles a 5-min restart.

**A+ mitigation applied (bridge, reversible):**
- `systemctl disable --now kuasaprestij-frontend-pull.timer` — stops the 5-min restart storm.
- Killed a stale duplicate `vite dev --host 0.0.0.0` process (running since Jul 8).
- Frontend still `vite dev` on :3000; site 200; only backend autosave timer remains.

**Adverse effects of A+ (accepted for now):** auto-deploy is now MANUAL (push→live no longer
automatic; deploy = manual pull+restart, which still reloads any active users → only deploy
when no class is live). Dev-server-in-prod fragility REMAINS: a crash (`Restart=always`),
manual restart, or VPS reboot still full-reloads live users. Heavier/slower than a build;
source exposed. Fine as a days/weeks bridge, bad as a permanent state.

**Proper fix (B1, revisit later):** app is **TanStack Start SSR built for Cloudflare Workers**
(`.output/server/index.mjs` is a Workers `fetch()` handler; `@cloudflare/vite-plugin` +
`wrangler.jsonc`). A VPS node-server build was tried and **fails** (Lovable/CF config fights
the node preset). Correct prod path = **`wrangler deploy` to Cloudflare Workers** (edge-served,
no HMR, no VPS reload issues) — needs CF account/auth, `VITE_*` secrets, DNS/URL move off
`IP:3000`. Docker does NOT fix this (containerized `vite dev` still reloads on restart); it's
only useful as packaging once a real production build exists.

---

## ⏱️ Essay submit timeout → 5 min + marking countdown — DONE 2026-07-15

Essays are marked by a live LLM generation (band rubric + written feedback) that can
take minutes; the old 60s client abort could kill it mid-marking, and the card path
then **silently mock-graded the essay wrong** ("answer is C"). Fixed end-to-end:

- **`services/api.ts` `submitAnswer`**: new `questionType` param → essays get a **300s
  (5 min)** AbortController timeout (MCQ/short stay 60s). nginx proxy_read_timeout is
  600s, so 5 min is safe. **Never mock-grades an essay** — on failure it throws so the
  real marking + feedback is preserved and the student can retry.
- **`components/EssayMarkingCountdown.tsx`** (new): self-driving overlay showing
  remaining time before the 5-min timeout; switches to an amber alert state at ≤30s
  ("your answer is safe, re-submit if needed"). BM/EN copy.
- Wired into **feed** (`QuestionSlide.tsx`, `active={checking && !isMcq}`, + timeout
  toast) and **card** (`index.tsx`, `active={submittingText && question_type==='essay'}`).
- **`agents/orchestrator.py` `mastery_updater_node`**: `event_logs.diagnostic_tag` now
  always records the marker's `teacher_action_plan` (band + marks + intervention) — so
  the **teacher sees essay feedback even on a PASS**, not just "Mastery demonstrated".
  Student feedback already returned in the /submit_answer response.

Also switched the **feed essay input to a multi-line `<Textarea>`** (was single-line Input).

Verified: `tsc` clean; orchestrator syntax OK; backend restarted (:8001) /docs 200.
Synced to secondary clone. **Live-tested (Playwright, dev :3000, real LLM)** with a new
test account **Test Student 2** (`teststudent2@kuasa.tech`, id `ac69baa8…00f8`): 10-mark
essay → countdown overlay (4:52→), marking finished ~40s, student saw "Correct! 🎉" +
feedback, mastery 0%→9%, `event_logs` recorded `Band A — 9/10` + root_cause + intervention.
Screenshot: `essay-marking-countdown.png`.

## 🔗 Invite-code join fixed — DONE 2026-07-15

Invite code was dropped before use: `login.tsx` never read `?invite=`, sign-in navigated
away stripping the query string, and signup's `emailRedirectTo` didn't carry it. Also
`<Toaster />` was never mounted, so all `toast()` calls were invisible.
- **`routes/__root.tsx`**: capture `?invite=` into `localStorage` the instant it appears
  (survives login redirect + email confirmation), consume it once a **student** profile
  loads via `join_classroom_by_code` RPC, with success/error toast. Mounted `<Toaster />`.
- Enrollment is student-self-service (RPC inserts `auth.uid()`); teachers/admins opening
  the link are skipped by design.

---

## ✍️ Essay-writing audit fixes + game cooldown — DONE 2026-07-14

Acting on `ESSAY_WRITING_AUDIT.md`. Language composition was being generated by the
science/humanities content-essay prompt (stimulus-explain, 150–200 words, 10 marks).

1. **Dedicated composition path** (`agents/orchestrator.py`):
   - `_language_composition_spec(subject, topic)` — detects BM karangan / 华文 作文 /
     English Continuous & Directed Writing; returns paper ref, genre task line, correct
     min length, realistic max_marks (20–30), and a language-weighted band rubric.
   - Essay generator now branches: composition topics use a writing prompt (title/theme +
     genre + 3 guiding points, **no** "Based on the following information" stimulus, correct
     length) instead of the content-essay prompt.
   - Essay evaluator branches: composition responses marked on isi + bahasa + pengolahan
     (content/language/organisation) with writing-specific feedback.
   - Added English **"Continuous Writing"** + **"Directed Writing"** topics and hints
     (previously English had NO writing path — audit's biggest gap).
2. **Routing** (`app/main.py`): composition topics force `question_type='essay'` in
   start_session + submit_answer so generation, session row, and marking stay consistent
   regardless of the per-subject default.
3. **Penalty-game one-question cooldown** (`app/main.py` + `schema/gamification.sql`):
   new `quiz_sessions.last_penalty_count` column (applied via Management API). A game fires
   on a wrong answer only if ≥1 question answered since the last game — no back-to-back
   games. Authoritative for both feed and card entry points (both read `trigger_penalty_game`).

Backend restarted (systemd :8001), /docs 200, no import errors.

---

## 🎮 Writing-native mini-games (essay gamification) — DONE 2026-07-14

Essays have no correct-letter, so Answer Flappy / Catch the Answer can't wrap them. Built
writing-native penalty games instead:

**Backend**
- `agents/orchestrator.py::generate_writing_challenge(subject, topic, language)` — LLM
  produces a model sentence (tokenised) + a connector-cloze item, themed on the topic, in
  the subject's language. Safe generic fallback when LLM cools. Schema `WritingGameChallenge`
  in `schemas/assessment.py`.
- `POST /writing_game_challenge` (`app/main.py`) returns the payload.
- `_VALID_GAMES` extended with `sentence_builder`, `connector_catch` so `/penalty_game_result`
  credits mastery (+0.05) on a win, same as MCQ games.

**Frontend** (`/root/frontend/learn-play-shine-96`, synced to secondary clone)
- `components/games/writing.ts` — `WritingChallenge` type, `shuffled()`, `isWritingComposition()`
  (mirrors backend composition detection).
- `components/games/SentenceBuilderGame.tsx` — DOM tap-to-order word tiles; check validates
  order, wrong prefix highlighted, 3 lives; gameKit Sfx. Flagship writing game.
- `components/games/ConnectorCatchGame.tsx` — canvas catch game (adapted from CatchStars):
  catch the correct cohesive connector, dodge wrong ones. Full gameKit juice.
- `components/WritingGameModal.tsx` — fetches challenge, random-picks a writing game, records
  result + mastery. Mirrors PenaltyGameModal.
- `QuestionFeed.tsx` — composition wrong-answers now route to `WritingGameModal` (via
  `isWritingComposition`), MCQ/other stay on the arcade/Answer-Flappy path.
- `routes/gametest.tsx` — added `sentence-builder` + `connector-catch` tabs.

**Verified:** `tsc` clean; `/gametest` — Sentence Builder completes to a win (onGameEnd(true)),
Connector Catch renders with a live physics loop. Backend endpoint returns real LLM content
(BM tested). Vite HMR live on :3000.

**Not yet wired:** the card view (`routes/index.tsx`) penalty still uses PenaltyGameModal only —
compositions there fall back to arcade. Feed is the primary path; wire index.tsx if needed.

---

## Current Status
**Phase:** UX Revamp complete (1–5). **Sophisticated Games — Phases 1–3 DONE.**

### ▶ Pick up here (resume summary 2026-07-12)
Built an assessment-integrated game layer on top of the penalty-game trigger:
1. **gameKit.ts** — reusable canvas juice engine (particles, shake, WebAudio SFX, floats).
2. **Catch the Answer** (`CatchStarsGame.tsx`) — canvas game, catch the correct falling answer.
3. **Answer Flappy** (`FlappyAnswerGame.tsx`) — **Kaplay 3001** real-engine flagship, flap
   through the correct-answer gate. This is what the penalty modal now shows for MCQs.
4. **Mastery loop** — winning an assessment game credits **+0.05** mastery recovery
   (`/penalty_game_result` → `increment_mastery` RPC); verified live on backend :8001.

**Contract:** `GameChallenge { question, options{A–D}, correctLetter }` exported from
`CatchStarsGame.tsx`. `buildChallenge(session)` in `index.tsx` feeds the just-wrong MCQ
into the game. Test/verify any game at **`/gametest`**.

**Live state:** backend restarted (systemd `kuasaprestij.service`, :8001) with new code;
frontend Vite HMR (:3000) has all changes; secondary clone `/root/learn-play-shine-96`
synced (needs `npm install` there to pull kaplay). NOT yet committed to git.

**Optional next steps:** sprite art + sound on the Kaplay game; "Answer Dino" 2nd title.

---

## 🎮 Games Phase 4 — Live mastery bar + ready-gate bugfix — DONE 2026-07-13

### 1. Live mastery bar (no refetch)
- `src/components/feed/MasteryBar.tsx` — NEW: animated topic-mastery bar for the feed HUD;
  flashes green "+N%" when mastery rises.
- `QuestionFeed.tsx` — added `mastery` state (seeded from `seed.mastery_score`), rendered
  `<MasteryBar>` under XpBar. Updates from every answer (`SlideResult.mastery`) AND from a
  game-win recovery (see below) — no session refetch.
- **Feed penalty games now credit mastery.** The feed's own `PenaltyGameModal` previously
  passed NO `challenge`/`topic`/`subject`, so its wins credited nothing and always ran arcade
  games. Now it builds the challenge from the just-wrong slide and forwards topic/subject →
  MCQ penalties run Answer Flappy + credit +0.05, reflected live in the bar.
- `PenaltyGameModal.onComplete(masteryScore?)` — now returns the credited `mastery_score` so
  callers update the bar live. (index.tsx's no-arg handler is unaffected.)
- `buildChallenge` extracted from `index.tsx` → shared `src/lib/challenge.ts` (used by both
  index.tsx and QuestionFeed).
- Backend `app/main.py /start_session` — response now includes `mastery_score` (best-effort
  `dskp_mastery` lookup for the topic) so the bar seeds correctly. `SessionResponse` +
  `normalizeSessionResponse` in `api.ts` carry `mastery_score`.

### 2. Bugfix — mini-game "times out before you can start"
Root cause: arcade `FlappyBirdGame` ran gravity + loop from frame 1 with no start gate — if
you didn't tap instantly, the bird fell and lost immediately. `DinoRunnerGame` also ran its
world clock unprompted.
- Added a **tap-to-start ready gate** to both (mirrors Answer Flappy): the physics loop draws
  a static "Tap / Space to start" frame and holds until the first input. Header hint reflects
  start state.

### 3. Fix — penalty game wasn't incorporating the question (arcade fallback)
Root cause: `/start_session` strips `correct_answer` (`_ANSWER_FIELDS`), so `session.correct`
is empty in the live feed → `buildChallenge(session)` returned null → penalty always fell back
to a short arcade game (which ends fast = "times out / stops halfway"). The correct answer IS
in the submit-answer feedback (`AnswerResponse.correct_answer`, not stripped).
- `src/lib/challenge.ts` — added `buildChallengeFrom(question, options, correctRaw, type)`;
  `buildChallenge(session)` now delegates to it.
- `QuestionSlide.tsx` — builds the challenge from the feedback's `correct_answer` and passes it
  up via `SlideResult.challenge`. `QuestionFeed` uses `r.challenge` for the penalty (was the
  stripped session). Now a wrong MCQ replays as Answer Flappy.
- `FlappyAnswerGame` GOAL 5 → 3 so it doesn't end abruptly. (Committed dcd2d95.)

### Verified
- `tsc`: 0 new errors (3 pre-existing auth.tsx). Backend restarted (:8001); `/start_session`
  returns `mastery_score: 0.1` for test student.
- Answer Flappy played 7s @ /gametest with no premature end (no timer exists in it — the
  "timeout" was the arcade fallback).
- Playwright @ `/gametest` flappy mode: 3s idle → still shows "tap / space to start", game did
  NOT auto-end (screenshot `flappy-ready-gate.png`). Bug fixed.
- Secondary clone `/root/learn-play-shine-96` synced. NOT yet committed to git.

---

## 🎮 Games Phase 1 — Catch the Answer — DONE 2026-07-12

Goal: turn the throwaway penalty mini-games into a polished, assessment-integrated
experience (gameplay = answering). Chosen approach: upgrade existing games + add a
reusable juice engine. Flagship built first as proof; Flappy/Dino to follow.

### What was done
- `src/lib/gameKit.ts` — NEW zero-dep juice toolkit (SSR-safe; instantiated only in
  useEffect): `Particles` (confetti bursts), `Shake` (trauma-based screen shake),
  `Sfx` (WebAudio-synthesized coin/buzz/win/lose — no audio files), `FloatingText`
  (+1 / COMBO callouts), `roundRect`/`verticalGradient`/easing helpers.
- `src/components/games/CatchStarsGame.tsx` — REWRITTEN into "Catch the Answer".
  New optional prop `challenge: { question, options{A–D}, correctLetter }`. When set,
  answer tiles fall (letter badge + option text); move basket to catch the CORRECT
  answer (goal 5), dodge distractors (3 lives). Combos, particles, shake, SFX, pop-in.
  Backward compatible: no challenge → original arcade star-catch.
- `src/components/PenaltyGameModal.tsx` — accepts `challenge`; forces catch_stars in
  assessment mode, else random arcade. (removed stale post-game index reshuffle.)
- `src/routes/index.tsx` — `buildChallenge(session)` derives the challenge from the
  current MCQ (resolves correctLetter by letter OR option-text match; null for
  non-MCQ → arcade fallback). Passed to PenaltyGameModal. Pedagogy: the question the
  student just got WRONG replays as the game → active reinforcement of the right answer.
- `src/routes/gametest.tsx` — added "catch-the-answer" mode with a sample challenge
  for direct verification at `/gametest`.

### Verified
- `npx tsc --noEmit`: 0 new errors (3 pre-existing in `src/lib/auth.tsx`, untouched).
- Rendered live at `/gametest` via Playwright — question banner, 🎯0/5, hearts,
  glowing falling answer tiles over animated starfield. Screenshot: `catch-answer.png`.
- Secondary clone `/root/learn-play-shine-96` synced.

---

## 🎮 Games Phase 2 — Kaplay flagship "Answer Flappy" — DONE 2026-07-12

User chose "go further with a real engine". Adopted **Kaplay 3001.0.19** (KAPLAY, the
Kaboom successor) for a proper physics-driven flagship.

### What was done
- `npm install kaplay` (3001.0.19) — added to package.json.
- `src/components/games/FlappyAnswerGame.tsx` — NEW Kaplay game, same `GameChallenge`
  contract. Real gravity/body physics, nested game objects, parallax stars, screen shake.
  Two-gap obstacles: each gate opening is labelled with an answer option (correct placed
  randomly top/bottom); flap through the CORRECT answer, crash/dodge the distractor.
  Goal 5 correct gates, 3 lives. **Ready-state**: gravity held (setGravity 0) + "Tap to
  start" until first flap, so idle time isn't instant death. Dynamic `import("kaplay")`
  inside useEffect → SSR-safe (TanStack Start renders routes server-side). Clean teardown
  via `k.quit()` + `spawner.cancel()` on unmount.
- `PenaltyGameModal.tsx` — assessment challenges now route to `FlappyAnswerGame`
  (`activeGame = "flappy_bird"`); arcade fallback unchanged. CatchStars remains available.
- `gametest.tsx` — added "answer-flappy (kaplay)" mode (default) for verification.

### Verified (Playwright @ /gametest)
- `tsc`: 0 new errors (3 pre-existing auth.tsx). 0 runtime console errors.
- Ready state renders (hovering bird + "Tap/Space to start"); after flap, gates scroll
  in with randomized labelled openings ("A. Volt" / "B. Ampere"), physics + parallax run.
  Screenshots: answer-flappy-ready.png, answer-flappy-play.png.
- Secondary clone synced (needs `npm install` there to pull kaplay).

### Two assessment games now exist
- Canvas + gameKit: **Catch the Answer** (CatchStarsGame, challenge mode).
- Kaplay: **Answer Flappy** (FlappyAnswerGame) — the real-engine flagship, wired to the
  penalty trigger.

---

## 🎮 Games Phase 3 — Wins count toward mastery — DONE 2026-07-12

Assessment-game wins now credit **partial mastery recovery** (not just leaderboard points).

### What was done
- `app/main.py` `/penalty_game_result` — `PenaltyGameResultRequest` gained optional
  `topic` + `subject`. On `result=="win"` WITH a topic, calls the `increment_mastery`
  RPC with `_GAME_MASTERY_DELTA = 0.05` (half a full first-try correct's +0.1) and logs
  an `event_logs` row tagged "Recovered via game reinforcement". Response now returns
  `mastery_score` + `mastery_delta`. Best-effort: a mastery failure never fails the game
  result. Arcade wins (no topic) and losses credit nothing.
- `src/services/api.ts` — `recordPenaltyGameResult` sends `topic`/`subject`;
  `PenaltyGameResultResponse` gained `mastery_score`/`mastery_delta`.
- `PenaltyGameModal.tsx` — accepts `topic`/`subject`, forwards them only for `challenge`
  runs, shows a green "Mastery recovered +5%" toast on credit.
- `index.tsx` — passes `session.topic`/`session.subject` to the modal.

### Rationale
Wrong answer already applied −0.05; a game win adds +0.05 → nets ~neutral. Can't exceed a
genuine correct (+0.1), so mastery can't be farmed by replaying games.

### Verified (live backend :8001, restarted via `systemctl restart kuasaprestij.service`)
- win+topic → mastery 0.05 then 0.10 (cumulative, clamped via RPC), delta 0.05.
- arcade win (no topic) → mastery null, delta 0.
- loss+topic → mastery null, delta 0.
- Frontend `tsc` clean (3 pre-existing auth.tsx). Secondary clone synced.
- NOTE: left test data on test UUID …0001 (dskp_mastery Algebra=0.10 + 2 event_logs) —
  inconsequential test student.

### Next (optional)
- Add sprite art / sound to the Kaplay game (reuse gameKit `Sfx` or Kaplay audio).
- Kaplay "Answer Dino" as a second real-engine title if desired.
- Consider surfacing the recovered mastery in the live mastery bar without a full refetch.

---

## ✅ Phase 3 — Audio Revival — DONE 2026-07-07

### What was done
- `edge-tts 7.2.8` installed into venv + added to `requirements.txt`
- `_generate_tts_audio` in `agents/orchestrator.py` re-enabled:
  - `ms-MY-YasminNeural` for BM, `en-US-JennyNeural` for English, `zh-CN-XiaoxiaoNeural` for Mandarin
  - Generates MP3 to tempfile, uploads to Supabase Storage `media_bucket`, returns public URL
  - TTS + Pexels B-Roll now run in parallel (`ThreadPoolExecutor`) on new anchor generation
  - `audio_url` saved in `topic_anchors` upsert so it's cached
- Bank-hit path in `studio_node` fixed: was hardcoding `audio_url=""` — now uses `row.get('audio_url')`
  → 376 existing rows immediately get mnemonic audio back in H5P
- `seed_audio.py` created for backfills (`--subject`, `--force`, `--dry-run`)
- 3 null `audio_url` rows seeded (Mathematics/Algebra, Physics/Force, Kesusasteraan Cina/Core Material)
- Backend restarted and active

### Pending (circle back if issues)
- `seed_diagrams.py` still running; some SVGs skipped due to token truncation (missing `</svg>`).
  Fix is on disk (`extract_svg` now patches closing tag). Re-run after current job finishes:
  `python3 seed_diagrams.py --force` (will skip rows that already have diagram_svg)
- `seed_worked_examples.py` still running (~56/379 as of restart). Some LLM providers returning
  empty responses — those rows will be retried on the next `python3 seed_worked_examples.py` run
  (script skips rows that already have `worked_example`)

### SQL migrations applied 2026-07-07
All 8 sections of `/tmp/kuasaprestij_migrations_2026_07_07.sql` applied in Supabase:
`diagram_svg`, `worked_example`, `profiles.preferences`, gamification cols, `game_scores`,
`increment_mastery()`, classrooms RLS, `assignments`/`assigned_tasks` tables.

---

## ✅ Diagnostic Format Fix — DONE 2026-07-06

### Problem
Diagnostic hardcoded `question_type="mcq"` for all 10 subjects regardless of SPM paper format. Single fixed topic per subject — no variety on retakes.

### Changes made (`app/main.py`)

1. **`DIAGNOSTIC_QUESTION_TYPE` dict** — maps each subject to its SPM-correct type:
   - Sciences / Sejarah / Geografi → `mcq`
   - Mathematics / Add Maths / BM / BI → `short_answer`

2. **`DIAGNOSTIC_TOPICS_BY_FORM` → `DIAGNOSTIC_TOPIC_POOLS`** — each subject now has a pool of 3 topics. First unanswered topic from pool is used. Gives variety on retakes without changing 10-question structure.

3. **`_diagnostic_topics_for_student()` helper** — rebuilds `(completed, remaining)` from the pool given the student's event_log history. Used by both `GET /diagnostic_progress` and `POST /start_diagnostic_session`.

4. **3 hardcoded `"mcq"` removed** from `start_diagnostic_session`:
   - `AgentState(question_type=...)` → `question_type` variable
   - `_create_quiz_session(question_type=...)` → `question_type` variable
   - return dict `"question_type"` → `question_type` variable

### Documented in
`lovable_prompts/session27_diagnostic_format_fix.md`

---

---

## 🎯 Revamp Roadmap (2026-07-05)

### Context
Full pedagogical + implementation audit done 2026-07-05. Key finding: the mnemonic/H5P intro plays on **every question**, adding 4-8s of forced animation that wears off instantly after the first session. Pexels B-roll is irrelevant stock footage that actively adds cognitive load. `diagram_svg` is a better replacement — generated by Claude CLI, stored as SVG text in Supabase, rendered inline (zero latency).

### Phase 1 — Fix UX damage ✅ DONE 2026-07-05
- [x] **1a. Gate KineticLyrics + H5P intro to first encounter only** — `index.tsx`: `hasSeenIntro` state read from `localStorage.getItem("kp_intro_<uid>_<subject>_<topic>")` at start of every `loadSession`. First time: intro plays and key is written. Second time: `skipIntro=true`, compact diagram panel shown instead.
- [x] **1b. Wire `diagram_svg` into frontend** — `api.ts`: `diagram_svg` added to `SessionResponse` + `normalizeSessionResponse`. `index.tsx`: `diagramSvg` state set from API response. Compact diagram panel rendered (rounded card, full-width SVG). "Review intro" button resets `hasSeenIntro=false` for current session.
- [x] **InteractiveVideoPlayer: `skipIntro` prop** — when true: starts in `"mcq"` phase (skips video + DragText); shows SVG diagram as video background; MCQ overlay uses light `bg-white/80` instead of `bg-black/70`; `onIntroComplete` callback marks localStorage when intro naturally finishes.
- [x] **Backend**: `diagram_svg` added to `AgentState`, all 3 `studio_node` return paths, all 6 `AgentState` constructions in `main.py`, and both `/start_session` response blocks.
- [x] **Schema**: `schema/topic_anchors_diagram.sql` — `ALTER TABLE topic_anchors ADD COLUMN IF NOT EXISTS diagram_svg text`.
- [x] **Seed script**: `seed_diagrams.py` — calls `claude -p` for each row in `topic_anchors` where `diagram_svg IS NULL`. Supports `--subject`, `--force`, `--dry-run`.

**Manual steps still required for Phase 1:**
- [ ] Apply `schema/topic_anchors_diagram.sql` in Supabase SQL Editor
- [ ] Run `python3 seed_diagrams.py` to fill diagrams (skips existing rows)
- [ ] Push frontend changes to GitHub and confirm VPS pulls them

### Phase 2 — Strengthen feedback loop ✅ DONE 2026-07-06
- [x] `schema/topic_anchors_worked_example.sql` — `ALTER TABLE topic_anchors ADD COLUMN IF NOT EXISTS worked_example text`
- [x] `seed_worked_examples.py` — subject-aware prompts (equations for Math/Physics, model paragraph for BM/English, etc.)
- [x] `agents/orchestrator.py` — `worked_example` added to `AgentState`; all 3 `studio_node` return paths carry it from DB
- [x] `app/main.py` — `worked_example` added to all 7 `AgentState` constructions + both `/start_session` response dicts
- [x] `src/services/api.ts` — `worked_example` added to `SessionResponse` + `normalizeSessionResponse`
- [x] `src/routes/index.tsx` — indigo card shown between misconception and source excerpt, only when `!feedback.correct`

**Manual steps still required:**
- [ ] Apply `schema/topic_anchors_worked_example.sql` in Supabase SQL Editor
- [ ] Run `python3 seed_worked_examples.py` to populate all rows (skips existing)
- [ ] Restart backend: `systemctl restart kuasaprestij`
- [ ] Push frontend to GitHub

### Phase 3 — Audio revival ✅ DONE 2026-07-07
- [x] Install `edge-tts` into venv + requirements.txt
- [x] `seed_audio.py` — generates mnemonic audio for rows with null `audio_url`, uploads to media_bucket
- [x] `_generate_tts_audio` re-enabled with edge-tts (BM/EN/Mandarin voices)
- [x] Bank-hit path now passes stored `audio_url` from DB (376 rows get audio back immediately)
- [x] 3 null rows seeded; backend restarted

### Phase 4 — KBAT-sequenced question flow ✅ DONE 2026-07-07
- [x] `answered_count` + `target_kbat` added to `AgentState`
- [x] `KBAT_SEQUENCE = ["Memahami","Mengaplikasi","Menganalisis","Menilai"]` in `main.py`
- [x] `start_session` reads `answered_count` from active session, computes `target_kbat`, sets `effective_adaptive`
- [x] Q1 (`answered_count=0`): anchor/studio_node as before (H5P + mnemonic, Memahami)
- [x] Q2+ (`answered_count≥1`): `effective_adaptive=True` → bypasses studio_node → generator_node
- [x] `generator_node`: KBAT instruction block injected into all 4 question prompts (mcq, short_answer, essay, listening)
- [x] Response includes `kbat_level` + `answered_count` so frontend can show badge
- [x] Backend restarted — active
- [x] **Frontend done** — `KbatProgressBar.tsx` + wired into `index.tsx` above question card; committed + pushed + secondary clone synced

### Phase 5 — SVG diagram background in H5P ✅ DONE 2026-07-07
- [x] `_build_h5p_content` + `_build_h5p_drag_plus_mcq`: `video_url=""` sets `files:[]` (no video)
- [x] Bank-hit path: if `diagram_svg` present, skip Pexels B-Roll entirely (`video_url=""`)
- [x] `InteractiveVideoPlayer`: `noDiagramVideo` flag detects `files:[]` + `diagramSvg` present
  - Auto-starts at drag/mcq phase (skips intro), SVG renders as full-bleed background
  - Mnemonic audio autoplays via `useEffect` (no video `canplay` event needed)
  - "Video unavailable" fallback replaced with gradient
- [x] Frontend committed (87f71dc), pushed to GitHub, secondary clone synced

---

## 🎯 Current Objectives & Todo

### Security (remaining from AUDIT.md)
- [ ] **C1** — Add backend JWT auth; derive `student_id` from token `sub`; drop service_role key from open endpoints
- [ ] **C2** — Rotate GitHub PAT + all `.env` secrets (manual — user action required)
- [x] **C3** — Fix signup-role trigger (`role := 'student'`); RLS on profiles/event_logs/dskp_mastery; SQL applied 2026-06-22
- [ ] **H1** — Lock or remove open proxy at `api.public.skor.$.tsx`
- [ ] **M2** — Fix mastery/streak race condition; mark feedback rows `in_progress` before processing
- [ ] **M5** — Gate `/docs` + `/openapi.json` behind auth or remove from nginx proxy
- [ ] **M6** — Remove localhost origins from CORS in prod config

### Games
- [x] **G1** — Leaderboard: `GET /leaderboard?subject=&limit=10` endpoint live; aggregates quiz score + game-win bonus (50 pts/win). Frontend prompt in `session21_competitive.md`.
- [x] **G2** — Mini-game persistence: `POST /penalty_game_result` endpoint live; `schema/game_scores.sql` created. Frontend to POST result + show "+50 pts" toast. Apply schema in Supabase.
- [x] **G3** — Richer H5P types: `_pick_h5p_game_type()` + `_build_h5p_drag_plus_mcq()` added to `orchestrator.py`. Language subjects (BM/BI/BC) now generate DragText teaching step before graded MCQ. Frontend rendering prompt in `session21_competitive.md`.
- [ ] **G-timed** — Timed challenge mode: frontend countdown, send elapsed time in `/submit_answer`, backend awards bonus points for fast correct (still in backlog)

### Agentic improvements (background, non-blocking for students)
- [x] **A1 — Remediation planner** — `agents/remediation_planner.py` + `schema/remediation_plan.sql`; `/suggest_topic` now checks `remediation_plans` first; `POST /remediation_plan/{student_id}` triggers background re-plan
- [x] **A2 — Teacher insight narrative** — `_generate_teacher_narrative()` added to `app/main.py`; `/teacher_insights` now returns a `narrative` field (3–5 sentence Gemini summary of class health, weakest topic, error patterns, recommended action).
- [x] **A3 — Anchor pre-seeder** — `seed_anchors.py` dry-run confirmed 347/348 anchors already cached; nothing to generate. Done.

### Infrastructure
- [x] **SPINNER FIXED** — `withTimeout` + 8s safety net applied to all Supabase calls in `auth.tsx` (2026-07-01)
- [x] Upgrade Node.js 20 → 22 on VPS
- [x] Switch `kuasaprestij-frontend.service` to Vite dev server (`npm run dev -- --port 3000`)
- [x] nginx CSS rewrite: `location = /src/styles.css` → `proxy_pass .../src/styles.css?direct`
- [ ] wrangler dev — workerd binary crashes on this VPS kernel; skip until Hetzner kernel updates or workerd fixes compatibility
- [ ] Frontend: optimistic auth in `src/lib/auth.tsx` — don't block render on `getSession()`; show skeleton immediately from localStorage
- [ ] Enable nginx service on VPS for new endpoints (chat, resume_session, session)
- [x] Update Lovable frontend to pass `question_type` in `/start_session` and `/generate_quiz`, branch UI on returned `question_type`, and display `marks_awarded / max_marks` for open questions
- [x] Run new SQL migrations in Supabase: `quiz_sessions` + `chat_history` tables (section 4 & 5 in `schema/lessons_quiz.sql`)
- [x] Establish automated Git pull cadence on VPS from Lovable's connected repo
- [x] Add `question_type` column to `quizzes` table in Supabase
- [x] Initialize Supabase schema for `generated_lessons`, `quizzes`, and `user_feedback` tables → `schema/lessons_quiz.sql`
- [x] Build `lesson_agent.py` — DSKP → grounded student notes (cached in `generated_lessons`)
- [x] Build `quiz_agent.py` — Notes → MCQs with source_excerpt citations (stored in `quizzes`)
- [x] Create `feedback_loop.py` — background agent parsing Lovable dashboard requests
- [x] Add `GET /mastery_map/{student_id}` endpoint so Lovable can render topic progress map
- [x] Expand `CURRICULUM_MAP` in `orchestrator.py` beyond the current 4 subject-topic progressions
- [x] Add retry/backoff logic for Gemini rate limit errors (currently returns empty `{}`)

---

## Completed
- [x] Core LangGraph pipeline: retriever → studio/generator → evaluator → mastery_updater
- [x] Supabase pgvector integration via `match_syllabus_embeddings` RPC
- [x] Google Cloud TTS (ms-MY Wavenet-B) voiceover generation
- [x] Pexels B-Roll video fetch with portrait/small filter
- [x] Topic mastery progression and spaced repetition scheduling
- [x] `event_logs` structured with `error_category`, `root_cause`, `intervention` columns
- [x] `/teacher_insights` endpoint with class mastery + error alerts
- [x] Lovable frontend CORS configured
- [x] UUID failsafe for `student_id == "undefined"`
- [x] Evaluator loop fix + UUID handling update (commit 4c235e9)

---

## 🛠️ Recent Edits Ledger

### 2026-07-05 — UX Revamp Phase 1: intro gating + diagram wiring

**Pedagogical rationale:** Mnemonic/H5P intro was shown on every question for same topic — 4-8s forced animation that degrades to noise after first encounter. Pexels B-roll is irrelevant stock footage (adds extraneous cognitive load per Sweller). SVG diagrams are subject-specific, zero-latency, and pedagogically sound (Mayer dual-coding).

**Backend (kuasaprestij repo):**
- `CLAUDE.md` — updated to reflect actual stack (Cerebras→OpenRouter→Groq→DeepSeek chain; TTS disabled; Telegram alerts; Pydantic schema validation)
- `schema/topic_anchors_diagram.sql` — new: `ALTER TABLE topic_anchors ADD COLUMN diagram_svg text`
- `seed_diagrams.py` — new: generates SVG diagram per topic via `claude -p`, upserts to `topic_anchors.diagram_svg`. Supports `--subject`, `--force`, `--dry-run`
- `agents/orchestrator.py` — `diagram_svg: Optional[str]` added to `AgentState`; all 3 `studio_node` return paths pass it through
- `app/main.py` — `diagram_svg=None` added to all 6 `AgentState` constructions; `"diagram_svg": state.get("diagram_svg")` added to both `/start_session` response blocks

**Frontend (learn-play-shine-96 repo):**
- `src/services/api.ts` — `diagram_svg?: string | null` added to `SessionResponse`; mapped in `normalizeSessionResponse`
- `src/routes/index.tsx`:
  - `diagramSvg` + `hasSeenIntro` states added
  - `loadSession`: reads `localStorage("kp_intro_<uid>_<subject>_<topic>")` before API call; writes it after; sets `diagramSvg` from response
  - Media area: when `hasSeenIntro=true` and `diagramSvg` present → compact diagram card + "Review intro" button instead of full KineticLyrics
  - `InteractiveVideoPlayer` call: passes `skipIntro={hasSeenIntro}`, `diagramSvg`, `onIntroComplete` (marks localStorage + sets state)
- `src/components/InteractiveVideoPlayer.tsx`:
  - Props added: `skipIntro`, `onIntroComplete`, `diagramSvg`
  - Initial phase: `useState(() => skipIntro ? "mcq" : "intro")` — MCQ starts immediately when skipping
  - `handleTimeUpdate`: calls `onIntroComplete?.()` when intro naturally transitions to drag/mcq
  - Background: when `skipIntro=true` → renders SVG diagram (or indigo gradient) instead of `<video>`
  - MCQ overlay: `bg-white/80` (light) when `skipIntro=true`, `bg-black/70` (dark, over video) when false

### 2026-07-03 — Latency fixes: AbortController + syllabus context cache
- **[Claude]** `src/services/api.ts` — `postJSON` now accepts `timeoutMs`; adds `AbortController` so hung fetches abort instead of waiting forever. `startSession` wired to 90s, `submitAnswer` to 60s.
- **[Claude]** `agents/orchestrator.py` — `_fetch_syllabus_contexts` decorated with `@lru_cache(maxsize=256)`. First call per (subject, topic) pair does the embed + pgvector search; all subsequent calls in the same process return cached result instantly (~2–3s saved per repeat session).

### 2026-06-27 (session 22 — LLM migration Gemini → OpenRouter/GroqCloud + re-ingest)
- **[Claude]** Created `agents/llm_client.py` — unified LLM client: OpenRouter (primary, `meta-llama/llama-3.3-70b-instruct:free`) → GroqCloud (fallback, `llama-3.3-70b-versatile`) with auto-retry and rate-limit backoff. Exposes `call_llm(prompt, role, want_json)` returning a `_TextResponse` with `.text` / `.strip()` matching the old Gemini response interface. Embeddings via local `sentence-transformers/paraphrase-multilingual-mpnet-base-v2` (768-dim, free, multilingual — handles BM/EN/Mandarin).
- **[Claude]** Fixed `agents/llm_client.py` — added `load_dotenv(override=True)` at module top so API keys are available when the module is imported by ingest scripts (env vars were not loaded at import time, causing `OpenAIError: Missing credentials`).
- **[Claude]** Added `OPENROUTER_API_KEY` + `GROQ_API_KEY` to both `.env` (root) and `kuasaprestij/.env`.
- **[Claude]** Cleared all 24,714 old Gemini vectors from `syllabus_embeddings` in 200-row batches (old Gemini `text-embedding-2` vectors are incompatible with the new sentence-transformers embedding space; re-ingestion is required).
- **[In progress]** `python3 ingest.py` — re-ingesting 156 DSKP PDFs from `data/` with new sentence-transformers embeddings. PID 3646837, logging to `logs/ingest_pdf.log`.
- **[Done]** `python3 hf_ingest.py` — re-ingested 149 HuggingFace textbook chunks (20 skipped, too short). Logging at `logs/ingest_hf.log`.
- **[Note]** `topic_anchors` (cached questions, H5P, audio/video URLs) are unaffected — they contain no embeddings and remain fully usable with the new LLM provider.
- **[Note]** Once PDF ingest completes (~2 hours from start), semantic search in `retriever_node` will be fully functional again. Monitor: `tail -f logs/ingest_pdf.log`

### 2026-06-27 (session 21b — DSKP-grounded question regeneration)
- **[Claude]** Created `seed_grounded_bank.py` — regenerates Q1 (anchor) and Q2-Q3 (question_bank) using real DSKP text from `syllabus_embeddings`. No Gemini API. Uses Claude CLI for generation, text search for context retrieval.
- **[Claude]** Verified: all subjects (including Physics, Biology, Chemistry) find real DSKP/textbook chunks via content keyword search even where metadata-subject filters miss.
- **[Action required]** Run commands below to regenerate all questions. Full run ~142 min. Can do subject-by-subject.

```bash
# Test one subject first
python3 seed_grounded_bank.py --bank-only --subject Geografi --force --delay 2

# Regenerate Q2-Q3 bank for all (fastest — skips TTS/Pexels): ~70 min
python3 seed_grounded_bank.py --bank-only --force --delay 2

# Regenerate Q1 anchor + bank for all (includes TTS audio): ~142 min
python3 seed_grounded_bank.py --force --delay 2

# Subject-by-subject (recommended for monitoring):
python3 seed_grounded_bank.py --force --subject "Bahasa Melayu" --delay 2
python3 seed_grounded_bank.py --force --subject Sejarah --delay 2
python3 seed_grounded_bank.py --force --subject Mathematics --delay 2
python3 seed_grounded_bank.py --force --subject Physics --delay 2
python3 seed_grounded_bank.py --force --subject Biology --delay 2
python3 seed_grounded_bank.py --force --subject Chemistry --delay 2
# ... etc

# Show what will be done without writing:
python3 seed_grounded_bank.py --dry-run --force
```

Grounding source legend (shown in output):
- `dskp_topic_match` — chunks found that mention the topic by keyword ✓ best
- `dskp_subject_only` — chunks from the right subject but not topic-specific
- `dskp_keyword_fallback` — cross-subject keyword match
- `generic_fallback` — no DSKP chunks found; uses topic name only ⚠

### 2026-06-27 (session 21 — H5P backfill complete + competitive games)
- **[Done]** Ran `python3 backfill_h5p.py` — all 359 topic_anchors already had h5p_content (previous run completed everything). Zero gaps remain.
- **[Claude — G1]** `app/main.py` — added `GET /leaderboard` endpoint: fetches all `quiz_sessions` scores, aggregates by `student_id`, adds 50-pt bonus per game win from `game_scores` (table may not exist yet — non-fatal). Returns ranked list with `rank`, `total_score`, `quiz_sessions`, `game_wins`.
- **[Claude — G2]** `app/main.py` — added `PenaltyGameResultRequest` + `POST /penalty_game_result` endpoint: validates game_type (catch_stars/dino_runner/flappy_bird) and result (win/loss), inserts row to `game_scores`, returns `points_awarded: 50` on win.
- **[Claude — G2]** Created `schema/game_scores.sql` — `game_scores` table with RLS. **Apply in Supabase SQL Editor.**
- **[Claude — G3]** `agents/orchestrator.py` — added `_pick_h5p_game_type(subject, topic)`: returns `drag_words` for language subjects (BM/BI/BC) and vocabulary topics, `mcq` otherwise.
- **[Claude — G3]** `agents/orchestrator.py` — added `_build_h5p_drag_plus_mcq()`: builds a 3-interaction H5P blob (TTS audio → DragText teaching step → graded MCQ). The drag step uses `H5P.DragText 1.10` with instant feedback; MCQ is the server-graded question unchanged.
- **[Claude — G3]** `agents/orchestrator.py` — `studio_node` now calls `_pick_h5p_game_type()` before building the Gemini prompt. For `drag_words`, injects a TASK 4 into the prompt requesting `drag_sentence` and `drag_distractors`. After parsing, calls `_build_h5p_drag_plus_mcq()` when drag data is present, else falls back to `_build_h5p_content()`.
- **[Claude]** Created `lovable_prompts/session21_competitive.md` — full frontend prompt covering: (1) POST penalty game result with win toast, (2) Leaderboard page with podium + ranked list + subject filter, (3) DragText rendering in `InteractiveVideoPlayer`, (4) teacher dashboard "Top 5" widget.
- **[Action required]** Apply `schema/game_scores.sql` in Supabase SQL Editor.
- **[Action required]** Apply `lovable_prompts/session21_competitive.md` in Lovable.

### 2026-06-25 (session 20 — question cache fixes, Pexels speed, h5p backfill)
- **[Claude]** `app/main.py` — fixed question loop root cause: prefetch query no longer requires `prefetched_draft IS NOT NULL`; now finds any active session for (student, topic, subject, language). Race-miss path now tries bank before touching Gemini inline.
- **[Claude]** `app/main.py` — fixed hardcoded `is_adaptive=True` → `req.is_adaptive` in `start_session` adaptive routing logic.
- **[Claude]** `app/main.py` — added `_pregen_to_bank()` async function: on Q1 (no active session), kicks off a background task to generate a generic question via Gemini and store it in `topic_anchors.question_bank` (self-throttles at 5+ questions). This gives the Q3 bank question time to be ready before the student answers Q1+Q2.
- **[Claude]** `app/main.py` — `_prefetch_next_question`: now queries `current_draft` from DB before picking a bank question; filters out the question the student is currently seeing to prevent repeats.
- **[Claude]** `app/main.py` — `lesson_data = None` initialised at top of `start_session`; final `if lesson_data is None:` guard added so prefetch-hit path doesn't skip the lesson data fetch.
- **[Claude]** `agents/orchestrator.py` — `_fetch_pexels_video`: timeout reduced 10s→5s, quality `hd`→`sd`, removed sequential fallback retry loop (was worst-case 30s). Now returns CDN fallback immediately on any failure or no-results.
- **[Claude]** `seed_anchors_claude.py` — `fetch_cached_pairs()` now requires both `anchor_question` AND `audio_url` (previously treated rows with only `question_bank` as cached — false positive).
- **[Claude]** `seed_anchors_claude.py` — `generate_anchor()` now computes `_build_h5p_content` and saves `h5p_content` to `topic_anchors` on every new anchor write.
- **[Claude]** `seed_anchors_claude.py` — `fetch_broll()` changed Pexels quality `hd`→`sd` to match production.
- **[Claude]** Created `backfill_h5p.py` — zero API calls; pure Python; fetches all `topic_anchors` rows with `audio_url + video_broll` but no `h5p_content`, computes `_build_h5p_content`, writes back to Supabase. Supports `--dry-run` and `--limit N`.
- **[Done]** Ran `python3 backfill_h5p.py --limit 168` — 168/335 rows backfilled (50%), 0 failures, 0 API calls.
- **[Pending]** Run `python3 backfill_h5p.py` to complete remaining 167 rows (no API cost).

### 2026-06-24 (session 19 — langfuse removal + question bank seeding)
- **[Claude]** `agents/orchestrator.py` — removed all `langfuse` imports and usages (`@observe` decorators + `_langfuse_client()` calls from `_gemini_with_retry`, `retriever_node`, `studio_node`, `generator_node`, `evaluator_node`). Langfuse requires a paid subscription and was crashing every seed script that imports orchestrator.
- **[Claude]** Started `seed_question_bank.py --count 3 --delay 3` in background (PID 3454213). Seeding 3 questions per topic/language = 1062 Gemini calls, ~142 min. Progress at `logs/question_bank_seed_progress.md`.
- **[Done]** `schema/question_bank.sql` confirmed already applied in Supabase (column exists).
- **[Note]** Once seed completes, Q2/Q3/Q4 are served from `topic_anchors.question_bank` with zero Gemini cost. Q1 is served from `topic_anchors.anchor_question` (H5P). Only Q4+ (adaptive) calls Gemini.

### 2026-06-24 (session 18 — boss battle UI + anchor seed)
- **[Claude]** Created `lovable_prompts/session17_boss_battle_and_latency.md` — two frontend-only fixes:
  - **Latency fix:** Fire `startSession` API call during the 1500ms praise overlay concurrently, not after it closes. Saves 1.5s perceived wait per correct answer.
  - **Boss Battle UI:** When `mastery_score >= 0.7` and topic not complete, show a 2-second dramatic "Boss Battle" intro overlay before the next question. Red-tinted card border during boss question. "🏆 Topic Mastered!" shown on correct answer. Pure frontend — no backend changes needed.
- **[Claude]** Started `seed_anchors_claude.py` to fill 12 missing Bahasa Cina topic anchors (Membaca Teks, Tatabahasa Cina, Kosa Kata Lanjutan, Pemahaman Teks Lanjutan, Penulisan Karangan Lanjutan, Tatabahasa Lanjutan — both English and BM language variants).
- **[Claude]** Added G1/G2/G3 medium-effort game features to WORKSPACE backlog.
- **[Action required]** Apply pending prompts in this order:
  1. `lovable_prompts/session14_gamification.md` — Quizizz UI, streak bar, penalty game (3 mini-games)
  2. `lovable_prompts/session16_score_fix.md` — score/streak reset bug + hardcoded UUID bug
  3. `lovable_prompts/session17_boss_battle_and_latency.md` — boss battle + praise overlay latency fix

### 2026-06-24 (session 17 — asyncio latency improvements)
- **[Claude]** `app/main.py` — added `import asyncio`.
- **[Claude]** `app/main.py` — added `_check_anchor_cache(topic, language)` async helper (reused across endpoints to avoid duplicated Supabase queries).
- **[Claude]** `app/main.py` — `_prefetch_next_question` converted from sync to `async def`; all node calls now use `asyncio.to_thread()` so the event loop is not blocked during background Gemini/Supabase calls.
- **[Claude]** `app/main.py` — `start_session`: anchor cache check + lesson cache lookup now run in parallel via `asyncio.gather()` (saves ~0.5–1 s in the anchor MCQ path); all node calls wrapped in `asyncio.to_thread()`.
- **[Claude]** `app/main.py` — `submit_answer`: `evaluator_node` + `mastery_updater_node` wrapped in `asyncio.to_thread()` — frees event loop during the Gemini grading call.
- **[Claude]** `app/main.py` — `resume_session`: all three node calls wrapped in `asyncio.to_thread()`.
- **[Claude]** `app/main.py` — `start_diagnostic_session`: anchor check + lesson cache run in parallel via `asyncio.gather()`; all node calls wrapped in `asyncio.to_thread()`.
- **[Note]** studio_node TTS + Pexels fetch already parallelized with `concurrent.futures.ThreadPoolExecutor` (session 5) — no change needed there.
- **[Note]** Remaining latency in `generator_node` for listening type (TTS is inline after Gemini) is irreducible without a bigger API contract change (return draft first, poll for audio_url). Flagged for future work.

### 2026-06-23 (session 16 — language fixes + autosave hook)
- **[Claude]** `agents/orchestrator.py` — added `_lang_config(language)` helper that maps any language label ("Bahasa Melayu", "Bahasa Cina", "English", etc.) to a concrete Gemini instruction string and the correct Google Cloud TTS voice/language code.
- **[Claude]** `agents/orchestrator.py` — `_generate_tts_audio` now uses `_lang_config` for voice selection; Mandarin ("Bahasa Cina" / "mandarin") now routes to `cmn-CN-Wavenet-A` instead of falling through to English TTS.
- **[Claude]** `agents/orchestrator.py` — `studio_node` anchor generation: prompts now use `lang_instruction` from `_lang_config`; mnemonic lyrics now have an explicit Mandarin branch alongside the existing BM branch.
- **[Claude]** `agents/orchestrator.py` — `generator_node` (all 4 question types: mcq, short_answer, essay, listening): replaced `CRITICAL LANGUAGE INSTRUCTION: Write entirely in {lang}` with the resolved instruction from `_lang_config`.
- **[Claude]** `agents/orchestrator.py` — `evaluator_node` (MCQ, short_answer, essay feedback prompts): replaced `Write fluently in {lang}` with resolved `lang_instruction`.
- **[Claude]** `agents/feedback_loop.py` — model stays `gemini-3.1-flash-lite` (correct and current; reverted an erroneous change to `gemini-2.0-flash-lite`).
- **[Claude]** `.claude/settings.local.json` — added `Stop` hook: auto-commits any uncommitted tracked-file changes at the end of every Claude turn (WIP autosave safety net).
- **[Note]** Mandarin anchor questions already cached in `topic_anchors` with `language='Bahasa Cina'` were generated in English. They will be re-generated on the next request (cache miss due to explicit language check). No migration needed.
- **[Claude]** `app/main.py` — added `_effective_language(subject, requested)` helper + `_SUBJECT_LANGUAGE_MAP`; `start_session` now auto-overrides language for language subjects: Bahasa Cina → "Bahasa Cina", Bahasa Melayu → "Bahasa Melayu", Bahasa Inggeris → "English". Prefetch lookup also uses effective language.
- **[Claude]** `agents/orchestrator.py` — added `_subject_topic_hint(subject, topic)` that returns format-specific Gemini instructions for BM (Penulisan Karangan, Pemahaman+Rumusan, KOMSAS, Tatabahasa) and Bahasa Cina (composition, reading comprehension, grammar, literature, vocabulary) topics. Wired into both `studio_node` and `generator_node` (all 4 question types).
- **[Claude]** `agents/orchestrator.py` — expanded Bahasa Cina topic lists: Form 4 now has 7 topics; Form 5 now has 6 topics (previously only 4 each).
- **[Claude]** `agents/orchestrator.py` — reverted erroneous `gemini-3.1-flash-lite` model change in feedback_loop; `gemini-3.1-flash-lite` is correct per user.

### 2026-06-23 (session 15 — 5 open bugs fixed)
- **[Claude]** `agents/feedback_loop.py` — added `_gemini_with_retry` helper; wired into `analyse_feedback` (bug #1: 429s no longer silently mark rows as no_action).
- **[Claude]** `agents/feedback_loop.py` — `process_pending_batch` now atomically claims each row (`pending → in_progress`) before processing; concurrent callers skip already-claimed rows (bug #2: double-process race eliminated).
- **[Claude]** `agents/feedback_loop.py` — `_resolve_lesson_meta` returns `{}` immediately when a quiz has `lesson_id=null`; clear log emitted (bug #5: orphaned quiz no longer silently continues with partial metadata).
- **[Claude]** `agents/chat_agent.py` — replaced sequential `_save_turn` pair with a single batch `insert([student, tutor])` call; orphaned student message can't occur if tutor save fails (bug #3).
- **[Claude]** `agents/orchestrator.py` — `mastery_updater_node` replaced SELECT+upsert read-modify-write with `supabase.rpc("increment_mastery", ...)` atomic stored function (bug #4: TOCTOU race eliminated).
- **[Claude]** Created `schema/increment_mastery.sql` — `increment_mastery()` Postgres function + widens `user_feedback.status` CHECK to include `'in_progress'`.
- **[Action required]** Apply `schema/increment_mastery.sql` in Supabase SQL Editor.

### 2026-06-23 (session 14 — Gamification + Quizizz-style UI)
- **[Claude]** Created `schema/gamification.sql` — adds `wrong_count`, `streak`, `score` INTEGER columns (DEFAULT 0) to `quiz_sessions`. **Apply in Supabase SQL Editor.**
- **[Claude]** `_create_quiz_session` in `app/main.py` — initialises `wrong_count=0`, `streak=0`, `score=0` on new sessions.
- **[Claude]** `/submit_answer` in `app/main.py` — fetches current gamification state from session, computes new streak/wrong/score, writes back, returns `streak`, `wrong_count`, `score`, `points_awarded`, `trigger_penalty_game` in response. Penalty game flag fires every 3rd wrong answer (wrong_count % 3 == 0).
- **[Claude]** Created `lovable_prompts/session14_gamification.md` — full Lovable prompt covering: Quizizz/Kahoot UI redesign, score + streak top bar, random praise messages + confetti on streak≥3, PenaltyGameModal (random 1 of 3 mini-games: Catch Stars / Dino Runner / Flappy Bird), and all component specs.
- **[Action required]** Apply `schema/gamification.sql` in Supabase.
- **[Action required]** Paste `lovable_prompts/session14_gamification.md` into Lovable.

### 2026-06-22 (session 13 — A2 Teacher Narrative + A3 Anchor Seeder)
- **[Claude]** A2: Added `_generate_teacher_narrative()` helper to `app/main.py` — builds a prompt from class stats (active students, average mastery, weakest topic, recent wrong-answer alerts, mastery snapshot), calls Gemini 2.5 Flash (temp=0.4), returns a 3–5 sentence plain-English summary. Failure is non-fatal (returns `""`).
- **[Claude]** A2: `/teacher_insights` response now includes `narrative` field alongside existing structured fields.
- **[Done]** A3: `seed_anchors.py --dry-run` confirmed 347/348 anchors already cached — nothing to generate.
- **[Done]** All 4 pending SQL migrations (sessions 8, 9, 11, 12) confirmed applied in Supabase.

### 2026-06-19 (session 12 — A1 Remediation Planner)
- **[Claude]** Created `agents/remediation_planner.py` — pulls `event_logs` + `dskp_mastery` per student, aggregates errors by topic, calls Gemini 2.5 Flash to rank topics by urgency and generate targeted interventions, upserts to `remediation_plans` table.
- **[Claude]** Created `schema/remediation_plan.sql` — `remediation_plans` table with `(student_id, topic)` unique index, RLS policies matching existing tables, `priority_score`, `error_categories[]`, `root_causes[]`, `suggested_intervention` columns.
- **[Claude]** Updated `/suggest_topic/{student_id}` in `app/main.py` — now checks `remediation_plans` (highest `priority_score` active row) before falling back to lowest mastery → random unstarted. Response extended with `priority_score`, `why`, `suggested_intervention` fields.
- **[Claude]** Added `POST /remediation_plan/{student_id}` endpoint — triggers background re-plan for a student; returns immediately.
- **[Done 2026-06-22]** `schema/remediation_plan.sql` confirmed applied in Supabase.
- **[Action required]** Bootstrap existing students: `python3 agents/remediation_planner.py --all` (or per-student with `--student_id <uuid>`).

### 2026-06-17 (session 11 — H5P Interactive Video for anchor mode)
- **[Claude]** Added `_build_h5p_content()` helper to `orchestrator.py` — assembles valid H5P Interactive Video JSON from Pexels video URL + TTS audio URL + MCQ options. Correct answers excluded from blob (grading stays server-side).
- **[Claude]** Added `h5p_content: Optional[dict]` to `AgentState` TypedDict.
- **[Claude]** `studio_node` bank-hit path now loads `h5p_content` from `topic_anchors`; backfills the column on first serve for old cached rows.
- **[Claude]** `studio_node` new-anchor generation path now builds and stores `h5p_content` alongside existing fields.
- **[Claude]** All four `AgentState` constructions in `app/main.py` updated with `h5p_content=None`.
- **[Claude]** `/start_session` response now includes `h5p_content` (non-null only for anchor-mode MCQ).
- **[Claude]** Created `schema/h5p_interactive_video.sql` — adds `h5p_content JSONB` column to `topic_anchors`.
- **[Done 2026-06-22]** `schema/h5p_interactive_video.sql` confirmed applied in Supabase.
- **[Done]** Lovable prompt (session 11) applied — `InteractiveVideoPlayer.tsx` confirmed in frontend repo.

### 2026-06-16 (session 10 — Form 4 / Form 5 split)
- **[Claude]** Added `KSSM_TOPICS_BY_FORM` dict to `orchestrator.py` — per-form topic lists for all 15 subjects (99 F4 topics, 89 F5 topics). `KSSM_TOPICS` (union) is now auto-derived from it; all existing callers unchanged.
- **[Claude]** Updated `_get_dynamic_subjects(form_level=None)` — accepts optional int, filters static map and `syllabus_embeddings` metadata by form.
- **[Claude]** Updated `GET /subjects` — now accepts `?form_level=4` or `?form_level=5` query param; returns `form_level` in response body.
- **[Done]** Lovable prompt (session 10) applied — Form 4/5 selector, form_level in all session requests confirmed in frontend repo.

### 2026-06-16 (session 9 — bilingual anchor cache)
- **[Claude]** Fixed language toggle not translating anchor questions: `studio_node` now filters `topic_anchors` by both `topic` AND `language` (was topic-only, so BM-cached question was served even for English requests).
- **[Claude]** `studio_node` upserts with `on_conflict="topic,language"` — one cached anchor per (topic, language) pair.
- **[Claude]** Mnemonic lyrics prompt is now language-aware: BM-mode produces predominantly BM lyrics; English/other modes keep the bilingual BM+EN style.
- **[Claude]** TTS voiceover already selected the correct voice by language; no change needed there.
- **[Claude]** Created `schema/topic_anchors_language.sql` — adds `language TEXT DEFAULT 'English'` column, drops old `topic_anchors_topic_key`, adds `topic_anchors_topic_language_key UNIQUE (topic, language)`.
- **[Done 2026-06-22]** `schema/topic_anchors_language.sql` confirmed applied in Supabase.
- **[Note]** Existing rows in `topic_anchors` will be tagged as `language = 'English'` by the migration default. They will be served to English-language sessions immediately. A BM request on those topics will generate+cache a new BM row on first hit.

### 2026-06-16 (session 8 — C3 role hardening)
- **[Claude]** C3: Created `schema/c3_role_hardening.sql` — fixes `handle_new_user()` to always assign `role := 'student'` (ignores client-supplied role in `raw_user_meta_data`).
- **[Claude]** C3: Added `promote_user_role(uuid, text)` admin-only function (REVOKE'd from public/anon/authenticated) for safe teacher/admin promotion.
- **[Claude]** C3: Added `prevent_role_self_update` trigger on `profiles` — blocks UPDATE of the `role` column by the row owner.
- **[Claude]** C3: Enabled RLS on `profiles`, `event_logs`, `dskp_mastery` — students see only their own rows; teacher/admin see all.
- **[Done]** C3b: Lovable prompt (session 8) applied — role stripped from signup, profiles-table role read confirmed in frontend repo.
- **[Done 2026-06-22]** `schema/c3_role_hardening.sql` confirmed applied in Supabase.

### 2026-06-14 (session 6d — security hardening)
- **[Claude]** C4: `_strip_answer_fields()` helper strips `correct_answer`, `distractor_rationale`, `sample_answer`, `model_answer`, `marking_rubric`, `marking_rubric_bands` from all pre-answer API responses (`/start_session`, `/resume_session`, `/generate_quiz`).
- **[Claude]** C4: `/submit_answer` now loads the authoritative draft from `quiz_sessions.current_draft` (via `session_id`) instead of trusting the client-sent `req.draft` for evaluation.
- **[Claude]** H2: Delimited all user-controlled input with `<student_input>` / `<user_input>` tags in evaluator prompts (`orchestrator.py`), chat prompt (`chat_agent.py`), and feedback analysis prompt (`feedback_loop.py`). Also truncated `suggestions` to 500 chars and raw payload to 400 chars in feedback analysis.
- **[Claude]** H3: `QuizRequest.num_questions` now validated with `Field(ge=1, le=20)` — request with >20 questions returns 422.
- **[Claude]** M1: `evaluator_node` now uses `state.get('draft') or {}` and returns a safe error state when draft is missing (prevents KeyError on rate-limit).
- **[Claude]** M3: `quiz_agent.py` now checks for an existing quiz by `(lesson_id, question_type, difficulty, language)` before inserting — updates in place instead of duplicating.
- **[Claude]** M4: `_flatten_lesson()` now also strips `_source_chunks` from the top-level dict (previously only stripped from nested `notes_json`).

### 2026-06-10 (session 6c)
- **[Claude]** Added question prefetch system: `/submit_answer` fires a `BackgroundTask` that runs `retriever → generator` for the next question and parks it in `quiz_sessions.prefetched_draft`. `/start_session` checks for a matching prefetch first — if found, serves it instantly and skips the Gemini call. Skipped for anchor-mode MCQ (already cached in `topic_anchors`) and when topic is complete (student moving to a new topic).
- **[Pending]** Run SQL migration: `ALTER TABLE quiz_sessions ADD COLUMN IF NOT EXISTS prefetched_draft JSONB;`
- **[Claude]** Patched `syllabus_embeddings` metadata: renamed 191 rows `"English"` → `"Bahasa Inggeris"` and 3,526 rows `"General Elective"` → `"Bahasa Melayu"`. RAG retrieval now works for both subjects.

### 2026-06-10 (session 6)
- **[Claude]** Fixed concept note blank display: `GET /lesson/{lesson_id}`, `POST /generate_lesson`, and `/start_session` all now flatten `notes_json` to top level; `_source_chunks` stripped. `LessonRequest.form_level` defaulted to 4.
- **[Claude]** Added `_flatten_lesson()` helper and `get_cached_lesson()` (DB-only, no Gemini) to `lesson_agent.py`.
- **[Claude]** Decoupled lesson generation from `/start_session` — question generation no longer blocks on a second Gemini call. Cache-only lookup used; frontend fetches lesson via `POST /generate_lesson` on cache miss.
- **[Confirmed]** Backend lesson generation works: `generate_lesson()` tested locally, produces all fields correctly.
- **[Blocked]** Concept note still not displaying in Lovable. Root cause is in the Lovable frontend — it is not correctly calling `POST /generate_lesson` on cache miss, or not rendering the flat response fields.

### 2026-06-09 (session 5)
- **[Claude]** Built `agents/chat_agent.py` — lesson-grounded tutor chatbot backed by `generated_lessons`; saves turns to `chat_history` table.
- **[Claude]** Added `quiz_sessions` + `chat_history` tables to `schema/lessons_quiz.sql` (sections 4 & 5).
- **[Claude]** Added `/chat` (POST) + `/chat/history/{lesson_id}/{student_id}` (GET) endpoints to `app/main.py`.
- **[Claude]** Added `/resume_session` (POST) + `/session/{session_id}` (GET) endpoints — session-resume flow persisting draft question in `quiz_sessions`.
- **[Claude]** Added `quiz_sessions` row creation in `/start_session` and progress update in `/submit_answer`.
- **[Claude]** Added `GET /subjects` endpoint — returns merged KSSM static map + DB-discovered subjects.
- **[Claude]** Added `listening` question type to `generator_node` — generates a passage + MCQ, then calls `_generate_tts_audio` for the passage audio.
- **[Claude]** Added `illustrative_notes` field to all question types (MCQ, short_answer, essay, listening).
- **[Claude]** Extracted inline TTS code to `_generate_tts_audio()` helper in `orchestrator.py`.
- **[Claude]** Expanded `KSSM_TOPICS` — added Science, Additional Mathematics, Bahasa Melayu, Bahasa Inggeris, and fleshed out Biology/Chemistry/Physics with DSKP chapter names.
- **[Claude]** Added CORS `allow_origin_regex` for all `*.lovable.app` / `*.lovableproject.com` domains.
- **[Claude]** Renamed `curriculum` → `subject` throughout state + DB writes; kept `curriculum` as deprecated alias in API.
- **[Claude]** Fixed invalid model default `gemini-3.1-flash-lite` → `gemini-2.0-flash` in `_gemini_with_retry`.
- **[Claude]** Updated `deploy/nginx-standalone.conf` — added `chat`, `resume_session`, `session` to proxy location regex.

### 2026-06-06 (session 4)
- **[Claude]** Added `question_type TEXT DEFAULT 'mcq'` to `quizzes` table in `schema/lessons_quiz.sql` (CREATE + ALTER migration).
- **[Claude]** Created `deploy/` folder with 4 files: `auto_pull.sh` (git fetch → pull → pip install → systemctl restart), `kuasaprestij.service` (uvicorn systemd unit), `kuasaprestij-pull.service` + `kuasaprestij-pull.timer` (5-minute auto-pull cron via systemd timer). See deploy instructions below.

### 2026-06-06 (session 3)
- **[Claude]** Added `question_type` (`"mcq"` | `"short_answer"` | `"essay"`) and `partial_credit` fields to `AgentState`.
- **[Claude]** Updated `generator_node` — branches on `question_type` to produce distinct JSON schemas for MCQ, short answer (key_concepts + marking_rubric), and essay (marking_rubric_bands + model_answer).
- **[Claude]** Updated `evaluator_node` — MCQ keeps exact string match; short answer and essay use Gemini AI rubric evaluation returning `partial_credit` (0.0–1.0) and `marks_awarded`.
- **[Claude]** Updated `mastery_updater_node` — open questions scale mastery gain by `partial_credit` (+0.1 × partial if pass ≥ 0.6, −0.05 if fail).
- **[Claude]** Updated `quiz_agent.py` — added `question_type` param with three prompt templates (`_MCQ_PROMPT`, `_SHORT_ANSWER_PROMPT`, `_ESSAY_PROMPT`); saves `question_type` to `quizzes` table.
- **[Claude]** Updated `app/main.py` — `StartSessionRequest`, `SubmitAnswerRequest`, `QuizRequest` all accept `question_type`; `/submit_answer` response now includes `partial_credit`, `marks_awarded`, `max_marks`; anchor (studio) node skipped for non-MCQ sessions.

### 2026-06-02 (session 2)
- **[Claude]** Added `_gemini_with_retry` helper in `orchestrator.py` — exponential backoff (1s→2s→4s, up to 3 attempts) on 429/rate-limit errors; wired into all three Gemini call sites (studio, generator, evaluator).
- **[Claude]** Expanded `CURRICULUM_MAP` to cover all KSSM_TOPICS: added full Mathematics chain, completed Geografi, Pendidikan Moral, Sejarah, Biology, Chemistry, Physics tails, and Prinsip Perakaunan tail.
- **[Claude]** Added `GET /mastery_map/{student_id}` to `app/main.py` — returns per-subject topic entries with `mastery_score`, `status` (locked/started/complete), and `overall_progress` ratio for Lovable progress map UI.

### 2026-06-02
- **[Claude]** Built `agents/feedback_loop.py` — polls `user_feedback` table, Gemini diagnosis, triggers lesson/quiz regeneration per score threshold (< 0.6 → full regen, < 0.8 or has suggestions → quiz regen, ≥ 0.8 clean → no-op). Runnable as `python agents/feedback_loop.py` (one-shot) or `--loop` for continuous polling.
- **[Claude]** Added `POST /submit_feedback` endpoint — Lovable posts feedback here; stored as `pending` in `user_feedback`.
- **[Claude]** Added `POST /process_feedback` endpoint — manual trigger for one batch cycle.

### 2026-06-01
- **[Claude]** Fixed absolute import errors in the main execution pipeline.
- **[Claude]** Created `CLAUDE.md` — project system instructions.
- **[Claude]** Created `WORKSPACE.md` — live task tracker initialized.
- **[User]** Updated environment variable keys in `.env.example`.
- **[Claude]** Added missing `video_broll: Optional[str]` field to `AgentState` TypedDict (`orchestrator.py`).
- **[Claude]** Initialized `student_history`, `error_category`, `root_cause`, `intervention_plan` in both `start_session` and `submit_answer` state construction (`main.py`) — prevented TypedDict runtime crash.
- **[Claude]** Removed dead/out-of-scope code block (lines 208–234) from `ingest.py` that referenced `all_files` outside `__main__` block.
- **[Claude]** Built `agents/lesson_agent.py` — queries `syllabus_embeddings`, synthesizes DSKP-grounded student notes via Gemini (temp=0.2), upserts to `generated_lessons` with cache-hit path.
- **[Claude]** Built `agents/quiz_agent.py` — generates MCQs with `source_excerpt` citations strictly grounded in lesson notes (temp=0.4), saves to `quizzes` table.
- **[Claude]** Created `schema/lessons_quiz.sql` — DDL for `generated_lessons`, `quizzes`, `user_feedback` tables. Run in Supabase SQL Editor before first use.
- **[Claude]** Added `/generate_lesson`, `/generate_quiz`, `/lesson/{id}`, `/quiz/{id}` endpoints to `app/main.py`.

---

## 🛑 Blockers / Notes
- Awaiting validation on the maximum token limits for local embedding runs.
- **[Session 21 — required]** Apply `schema/game_scores.sql` in Supabase SQL Editor (G2 penalty game persistence).
- **[Session 21 — required]** Apply `lovable_prompts/session21_competitive.md` in Lovable (G1 leaderboard UI + G2 game result POST + G3 DragText player).
- **[Session 21 — in progress]** Run `seed_grounded_bank.py` to regenerate all Q1/Q2-Q3 grounded in real DSKP syllabus text (no Gemini). See commands below.
- **[Session 20 — superseded]** `seed_question_bank.py` (Gemini-based) is replaced by `seed_grounded_bank.py`.

## Deploy: VPS Auto-Pull Setup
Run once on the VPS to enable 5-minute auto-pull from origin/main:
```bash
sudo cp deploy/kuasaprestij.service       /etc/systemd/system/
sudo cp deploy/kuasaprestij-pull.service  /etc/systemd/system/
sudo cp deploy/kuasaprestij-pull.timer    /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now kuasaprestij
sudo systemctl enable --now kuasaprestij-pull.timer
# Verify
systemctl status kuasaprestij-pull.timer
journalctl -u kuasaprestij-pull -f
```
Logs land in `/var/log/kuasaprestij_deploy.log`.

---

## ✅ Supabase Migrations (already applied — kept for reference)
Sessions 5, 6c, 6d: `quiz_sessions`, `chat_history`, `prefetched_draft` column — all live in Supabase.
Session 8: `c3_role_hardening.sql` — RLS + role trigger — confirmed applied 2026-06-22.
Session 9: `topic_anchors_language.sql` — bilingual anchor unique key — confirmed applied 2026-06-22.
Session 11: `h5p_interactive_video.sql` — `h5p_content` JSONB column — confirmed applied 2026-06-22.
Session 12: `remediation_plan.sql` — `remediation_plans` table + RLS — confirmed applied 2026-06-22.

## Schema reference (session 5)

```sql
-- ─────────────────────────────────────────────
-- 4. quiz_sessions  (session resume)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quiz_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id      UUID NOT NULL,
    topic           TEXT NOT NULL,
    subject         TEXT NOT NULL,
    language        TEXT NOT NULL DEFAULT 'English',
    question_type   TEXT NOT NULL DEFAULT 'mcq',
    is_adaptive     BOOLEAN NOT NULL DEFAULT FALSE,
    lesson_id       UUID REFERENCES generated_lessons(id) ON DELETE SET NULL,
    current_draft   JSONB,
    answered_count  INTEGER NOT NULL DEFAULT 0,
    mastery_score   NUMERIC(5,3) NOT NULL DEFAULT 0.0,
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'complete')),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quiz_sessions_student ON quiz_sessions (student_id, status);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS quiz_sessions_updated_at ON quiz_sessions;
CREATE TRIGGER quiz_sessions_updated_at
    BEFORE UPDATE ON quiz_sessions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────
-- 5. chat_history  (tutor chat)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_history (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id  UUID NOT NULL,
    lesson_id   UUID NOT NULL REFERENCES generated_lessons(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('student', 'tutor')),
    content     TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_history_student_lesson
    ON chat_history (student_id, lesson_id, created_at);
```

---

## Applied: Lovable Frontend Prompt (session 5) ✓
Confirmed in frontend repo — question type selector, marks display, tutor chat all live.

```
Update the KuasaPrestij quiz flow with these backend changes. Do not change anything unrelated.

──────────────────────────────────────
1. QUESTION TYPE SELECTOR  (StartSession / topic picker screen)
──────────────────────────────────────
Add a segmented control or dropdown labelled "Question Type" with four options:
  • MCQ (default)
  • Short Answer
  • Essay
  • Listening

Send the selected value as `question_type` (string) in the POST /start_session body alongside
the existing fields. Also send `form_level: 4` (integer, hardcoded for now).

──────────────────────────────────────
2. BRANCH THE QUESTION UI on `question_data.question_type`
──────────────────────────────────────
The /start_session response includes `question_data` and `question_type` at the top level.

• "mcq"          → existing radio-button UI (no change)
• "listening"    → show an audio player using `question_data.audio_url`, display the passage
                   text in a read-only card, then show radio buttons for `question_data.options`
• "short_answer" → show the question text + a textarea (2–4 lines) for free-text input;
                   show `question_data.illustrative_notes` as a subtle hint below the question
• "essay"        → show the question text + a tall textarea (8+ lines);
                   show `question_data.illustrative_notes` as a subtle hint below the question

For all types, send the student's answer as `student_answer` (string) in POST /submit_answer.
Also send `session_id` (returned by /start_session) and `subject` (replacing the old `curriculum`
field).

──────────────────────────────────────
3. RESULTS SCREEN — show marks for open questions
──────────────────────────────────────
The /submit_answer response now includes:
  • `marks_awarded` (number)
  • `max_marks` (number)
  • `partial_credit` (0.0–1.0)

For short_answer and essay results, display:
  "You scored X / Y marks"
  and a progress bar filled to `partial_credit`.

For mcq and listening, keep the existing correct/incorrect UI.

──────────────────────────────────────
4. TUTOR CHAT (lesson detail screen)
──────────────────────────────────────
If a lesson has been generated (you have a `lesson_id`), show a chat panel or expandable
drawer at the bottom of the lesson view.

API calls:
  POST /chat  { student_id, lesson_id, message }  → { reply, lesson_title }
  GET  /chat/history/{lesson_id}/{student_id}      → { history: [{role, content}] }

Render messages in a simple chat bubble list (student on right, tutor on left).
Load history on open. Append new turns optimistically.
```

---

## Deploy: nginx HTTPS Proxy Setup (session 5)
Run once on the VPS to enable the HTTPS proxy on port 8443:
```bash
sudo cp deploy/kuasaprestij-nginx.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now kuasaprestij-nginx
# Verify
systemctl status kuasaprestij-nginx
curl -k https://178.105.130.105.nip.io:8443/docs
```

---

## Deploy: VPS Auto-Pull Setup
Run once on the VPS to enable 5-minute auto-pull from origin/main:
```bash
sudo cp deploy/kuasaprestij.service       /etc/systemd/system/
sudo cp deploy/kuasaprestij-pull.service  /etc/systemd/system/
sudo cp deploy/kuasaprestij-pull.timer    /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now kuasaprestij
sudo systemctl enable --now kuasaprestij-pull.timer
# Verify
systemctl status kuasaprestij-pull.timer
journalctl -u kuasaprestij-pull -f
```
Logs land in `/var/log/kuasaprestij_deploy.log`.

---

## Applied: Lovable Frontend Prompt (session 8 — C3b role hardening) ✓
Confirmed in frontend repo — no role in signup, profiles-table guard, teacher route check, 403 friendly error.

```
Security hardening for the KuasaPrestij signup and teacher route flow. Do not change anything unrelated.

──────────────────────────────────────
1. SIGNUP FORM — remove the role selector
──────────────────────────────────────
In `src/lib/auth.tsx` (or wherever signUp is called), remove the `role` field from
`options.data` / `raw_user_meta_data` entirely. The backend trigger now always assigns
`role = 'student'`; passing a role from the client has no effect but signals intent.

If there is a "I am a teacher" checkbox or role dropdown on the signup page, remove it.
Keep the full_name and any other metadata fields.

──────────────────────────────────────
2. ROUTE GUARDS — read role from Supabase profile, never from signup payload
──────────────────────────────────────
In `src/routes/__root.tsx` (or the auth context), ensure that the `role` used for
routing decisions comes exclusively from the Supabase `profiles` table query result
(e.g. `profile.role` fetched via the session's `user.id`), never from
`user.user_metadata.role` or `session.user.user_metadata`.

If any guard currently reads `user.user_metadata?.role`, replace it with the
profile-table value.

──────────────────────────────────────
3. TEACHER ROUTES — add a server-side ownership check
──────────────────────────────────────
In `src/routes/teacher.tsx` (and any other teacher-only pages), add an early check
at the top of the component / loader:

  if (!profile || profile.role !== 'teacher' && profile.role !== 'admin') {
    navigate('/dashboard')
    return null
  }

This complements the existing `navigate()` guard and ensures the component never
renders teacher data for a student who finds the URL directly.

──────────────────────────────────────
4. ERROR HANDLING — show a friendly message on 403
──────────────────────────────────────
If any Supabase query returns a 403 / RLS error because the user tries to access
another student's data, catch it and display:
  "You don't have permission to view this information."
rather than an uncaught error or blank screen.
```

---

## Applied: Lovable Frontend Prompt (session 10 — Form 4 / Form 5 selector) ✓
Confirmed in frontend repo — form selector, filtered subject fetch, form_level in all session calls.

```
Add a Form Level selector to the KuasaPrestij topic/subject picker screen.
Do not change anything unrelated.

──────────────────────────────────────
1. FORM LEVEL SELECTOR  (topic picker / start session screen)
──────────────────────────────────────
Add a segmented control or toggle labelled "Form" with two options:
  • Form 4  (default)
  • Form 5

Store the selected value as an integer (4 or 5) in component state (e.g. `formLevel`).

──────────────────────────────────────
2. FETCH SUBJECTS filtered by form level
──────────────────────────────────────
When fetching subjects from the backend, append `?form_level=<formLevel>` to the URL:
  GET /subjects?form_level=4   (or 5)

Re-fetch whenever the Form selector changes. The response shape is:
  {
    "form_level": 4,
    "subjects": [
      { "name": "Physics", "subject": "Physics", "topics": ["Measurement", ...] },
      ...
    ]
  }

Populate the subject dropdown and topic list from this response.

──────────────────────────────────────
3. PASS form_level in all session requests
──────────────────────────────────────
Replace the hardcoded `form_level: 4` with the dynamic `formLevel` state value in:
  • POST /start_session    body field `form_level`
  • POST /generate_lesson  body field `form_level`
  • POST /generate_quiz    body field `form_level`

──────────────────────────────────────
4. DISPLAY form level in UI labels
──────────────────────────────────────
Where the subject or topic name is displayed (e.g. question header, lesson title),
append the form label: "Physics · Form 4" or "Fizik · Tingkatan 4".
```

---

## Applied: Lovable Frontend Prompt (session 11 — H5P Interactive Video) ✓
Confirmed in frontend repo — InteractiveVideoPlayer.tsx exists and is integrated into quiz screen.

```
Add an H5P-style interactive video player to the KuasaPrestij quiz screen for anchor-mode MCQ questions.
Do not change anything unrelated.

──────────────────────────────────────
CONTEXT
──────────────────────────────────────
The POST /start_session response now includes a new optional field `h5p_content`.
It is only present (non-null) when the question is an anchor-mode MCQ (is_adaptive=false, question_type="mcq").

The h5p_content JSON structure is:
{
  interactiveVideo: {
    video: {
      files: [{ path: "<pexels-video-url>", mime: "video/mp4" }]
    },
    assets: {
      interactions: [
        {
          // interaction[0] = TTS mnemonic audio
          duration: { from: 0, to: 8 },
          action: { params: { files: [{ path: "<tts-audio-url>", mime: "audio/mpeg" }] } }
        },
        {
          // interaction[1] = MCQ overlay
          duration: { from: 8, to: 9999 },
          pause: true,
          action: {
            params: {
              question: "<p>Question text here</p>",
              answers: [
                { text: "Option A" },
                { text: "Option B" },
                { text: "Option C" },
                { text: "Option D" }
              ]
            }
          }
        }
      ]
    }
  }
}

──────────────────────────────────────
1. CREATE InteractiveVideoPlayer COMPONENT
──────────────────────────────────────
Create a new component `InteractiveVideoPlayer` that accepts these props:
  h5pContent       — the h5p_content object from /start_session
  questionData     — the question_data object (same as before; used for submit)
  sessionId        — string
  studentId        — string
  topic            — string
  subject          — string
  language         — string
  onAnswerSubmit   — callback(result) called after /submit_answer returns

Extract from h5pContent:
  videoUrl     = h5pContent.interactiveVideo.video.files[0].path
  audioUrl     = h5pContent.interactiveVideo.assets.interactions[0].action.params.files[0].path
  pauseAt      = h5pContent.interactiveVideo.assets.interactions[1].duration.from   // default 8
  rawQuestion  = h5pContent.interactiveVideo.assets.interactions[1].action.params.question
  options      = h5pContent.interactiveVideo.assets.interactions[1].action.params.answers.map(a => a.text)
  questionText = rawQuestion.replace(/<[^>]+>/g, '')   // strip HTML tags

Component behaviour (use React state + refs):
  Phase 1 — Video + Audio playing:
    • Render a <video> element (ref: videoRef) with src=videoUrl, autoPlay, muted=false, playsInline
    • Render a hidden <audio> element (ref: audioRef) with src=audioUrl
    • On video canplay: also play audioRef (synchronised start)
    • Show mnemonic lyrics (from the parent's mnemonic_lyrics prop if provided) as scrolling subtitle over the video
    • On video timeupdate: if currentTime >= pauseAt and question not yet shown:
        – videoRef.current.pause()
        – set showQuestion = true

  Phase 2 — MCQ overlay:
    • Fade in a dark semi-transparent overlay covering the video
    • Display questionText in a card at the top of the overlay
    • Show the options as large tap-friendly buttons (full width)
    • Highlight selectedOption with a border/colour when tapped
    • Show a "Submit Answer" button (disabled until option selected)

  Phase 3 — After submit:
    • Call POST /submit_answer with:
        { student_id, topic, subject, student_answer: selectedOption,
          draft: questionData, session_id: sessionId,
          question_type: "mcq", language }
    • While waiting: show a spinner over the overlay
    • On success:
        – if is_correct: overlay turns green, show "✓ Correct!" + feedback text
        – if !is_correct: overlay turns red, show "✗ Try again!" + feedback text
        – Show "Next Question" button after 1.5 s
        – On "Next Question": call onAnswerSubmit(result) to let the parent advance

──────────────────────────────────────
2. INTEGRATE INTO QUIZ SCREEN
──────────────────────────────────────
In the component that renders the question after /start_session returns:

  if (sessionResponse.h5p_content) {
    // Render InteractiveVideoPlayer instead of the standard question card
    return (
      <InteractiveVideoPlayer
        h5pContent={sessionResponse.h5p_content}
        questionData={sessionResponse.question_data}
        sessionId={sessionResponse.session_id}
        studentId={studentId}
        topic={sessionResponse.topic}
        subject={sessionResponse.subject}
        language={language}
        mnemonicLyrics={sessionResponse.mnemonic_lyrics}
        onAnswerSubmit={(result) => { /* handle next question */ }}
      />
    )
  }
  // Otherwise fall through to the existing question card (short_answer, essay, adaptive MCQ, listening)

──────────────────────────────────────
3. STYLING NOTES
──────────────────────────────────────
• The video should fill the question card area (aspect-ratio 9:16 on mobile, capped at 480px wide on desktop)
• The MCQ overlay should be absolute-positioned over the video, not below it
• Buttons: rounded-xl, py-3, full-width, white text on primary colour; selected state: ring-2 ring-white
• Keep the existing mnemonic lyrics card hidden while InteractiveVideoPlayer is shown (it's embedded in the player)
• Do not show the standard "Question" card or radio-button MCQ when h5p_content is present
```

---

## Anchor Pre-Seeder (`seed_anchors.py`)
Run **after** applying `schema/topic_anchors_language.sql` in Supabase.

```bash
# Preview what would be generated (no API calls)
python seed_anchors.py --dry-run

# Seed everything missing (paid Gemini quota — 3s delay)
python seed_anchors.py

# Slower pacing for free-tier Gemini quota
python seed_anchors.py --delay 8

# Seed one subject in BM only (useful for testing)
python seed_anchors.py --subject Sejarah --lang "Bahasa Melayu"

# Re-run is safe — already-cached rows are skipped automatically
```

Estimated time: ~260 topics × 2 languages × ~8s per call ≈ 35 min for full seed at default 3s delay.
Failed rows (rate limit / Gemini error) print `✗` and are retried on the next run.

## Notes
- Test UUID: `00000000-0000-0000-0000-000000000001`
- Supabase storage bucket: `media_bucket`
- Fallback audio: `https://cdn.kuasaprestij.tech/assets/fallback_beat.mp3`
- Fallback video: `https://cdn.kuasaprestij.tech/assets/fallback_video.mp4`
