# QA critique of skor.space — 2026-10-23

Tested as a student (Form 4) on https://skor.space with headless Chrome plus direct API sampling of 33 questions
(2 topics for each of the 18 Form 4 subjects). Teacher view, games, Live Arena and the offline app were NOT tested.
Verdict at the time: **not ready for market** — strong design and idea, blocked by infra, privacy and content correctness.

Work through the items in order. Tick a box (and log it in WORKSPACE.md) in the same commit that fixes it.

## A. Launch blockers

- [x] **A1. Production build.** Public site is the Vite dev server: 188 requests, ~10.5 MB, no gzip, routes take 4–7 s.
      Serve a built bundle with compression + cache headers.
      **Done 2026-10-23:** login page now 11 requests / 286 KB gzipped / ~0.7–1.0 s. Logged-in home (~3.2 s) and dashboard (~3.8 s)
      are now bound by API calls, not JS — follow up under B2.
- [ ] **A2. Routing + privacy.**
  - [x] A2a. nginx regex `leaderboard` / `lesson/` swallows SPA routes: `/leaderboard` shows raw JSON, `/lesson/<id>` returns 500 JSON.
  - [x] A2b. `GET /leaderboard` is unauthenticated and returns real minors' full names (PDPA). Require auth, show first name/initials.
        **Done 2026-10-23:** `/leaderboard` needs a signed-in user (401 otherwise); students get pseudonym + `is_me` only (no ids/names);
        teachers get names for their own class, admins for all; `limit` capped at 50. Also fixes C7. Teacher/admin path not tested (no teacher login).
  - [x] A2c. API `/docs` and `/openapi.json` are public.
        **A2a + A2c done 2026-10-23:** nginx splits `skor.space`/`www` (web app only) from `api.skor.space` (API); API-host `/docs`, `/redoc`, `/openapi.json` return 404 (still reachable on the box at :8001).
- [~] **A3. Question quality gate + bad content.** (gate + purge done; A3g/A3h only partly, see notes below) ~8 of 33 sampled questions have a real defect:
  - [x] A3a. Bahasa Cina / Membaca Teks: options are malformed pinyin fragments, no valid answer.
  - [x] A3b. "Core Material" placeholder topics (Additional Science, General Elective, Kesusasteraan Cina) all serve one
        off-syllabus transformer-core question + identical worked example / object lesson.
        **Done 2026-10-23:** placeholder-only subjects are hidden from `/subjects` (Form 4: 18 -> 15) and `/start_session` rejects the
        topic with 422 (`SHOW_PLACEHOLDER_SUBJECTS=1` overrides). Root cause kept as a known limit: `topic_anchors` is keyed
        `(topic, language, form_level)` without subject, so same-named topics in two subjects (Form 5 "Ecosystem": Biology/Science)
        share a row; the A3j audit flags cross-subject questions. Additional Science / General Elective / Kesusasteraan Cina need real topic lists to come back.
  - [x] A3c. Muzik / Notasi: stem refers to a staff that is not shown and gives away the answer.
  - [x] A3d. Sejarah / Kebangkitan Nasionalisme: factual error (Kongres Kebangsaan Melayu "1919").
  - [x] A3e. Physics / Force and Motion I: contradictory numbers (4.0 m in 1.2 s at 30°).
  - [x] A3f. Add Maths inverse function: upward parabola described as a thrown ball.
  - [~] A3g. Ambiguous items (ruler uncertainty ±0.05 vs ±0.1, appraisal "4", "characteristic of science").
  - [~] A3h. Subject mismatch: Bahasa Inggeris / Bahasa Melayu serve science / history, not language skills; Mendengar topic has no audio.
  - [x] A3i. Generation-time validation gate (second-model solve, one correct option, subject fit, reject placeholder topics).
  - [x] A3j. Audit cached `topic_anchors` with the gate; purge/regenerate failures.
        **Done 2026-10-23:** `agents/question_validator.py` (structural checks + blind-solve LLM review, hard vs soft findings),
        wired into every cache write (`gate()` in studio_node anchor upsert and both bank saves in `app/main.py`; `QUESTION_GATE=0` /
        `QUESTION_GATE_LLM=0` switch it down). `scripts/audit_questions.py` audited all cached questions: pass 1 removed 180 of 1,163 (15.5%),
        a textbook/curriculum-reference rule removed 51, pass 2 (stricter prompt) removed 34 of 988; 254 soft warnings kept. 971 questions
        remain; emptied topics were regenerated through the gate (`scripts/warm_empty_anchors.py`). Removed questions are backed up in
        `qa_audit/removed*.json`. Verified gone from the cache: the malformed-pinyin item, the 1919 Kongres date, the staff-shown/answer
        leak, the 4.0 m / 1.2 s block, the transformer item, the thrown-ball parabola. Re-review of the 30 questions now served: 0 hard flags.
        **Open:** A3g — single-ambiguity items are kept as warnings (254 in the bank), not removed; A3h — a subject-fit check exists
        ("off-topic for the subject") but BI/BM topics still mix content-subject questions in, and listening topics still have no audio;
        the reviewer missed some contradictory-number cases (it caught the physics one only after the prompt change), so expect a small
        residual defect rate — spot-check with `scripts/audit_questions.py --subject <name>`.
- [x] **A4. Dead media.** `cdn.kuasaprestij.tech` fallback video/audio no longer resolves (expired domain).
      **Done 2026-10-23:** the fallback files existed nowhere locally, so the fallback is now empty (no B-roll / no audio; the card shows
      its diagram instead). Runtime code + 5 seed scripts no longer write the dead host; 68 `topic_anchors` rows (and 16 JSON blobs) cleaned.

## B. Learning experience

- [x] **B1. Wrong-answer feedback.** Never states the correct answer; says "show each step" on an MCQ; "How to work through it"
      shows an unrelated static worked example; maths shown as raw text (`f^{-1}(x)`, `x^2`) — render with KaTeX.
      **Done 2026-10-23:** evaluator returns `explanation` (why the correct option is right, stepwise for calculations) with an MCQ-appropriate
      action; the panel shows a "Correct answer" card; the static worked-example box is hidden for MCQ; `src/lib/formatMath.ts` renders
      `^{}`/`_{}`/`\frac`/`\sqrt`/`$…$` as Unicode (no KaTeX dependency) and `cleanOption` removes the doubled option letter (B4) — display only,
      so submitted answer text is untouched. Chose Unicode over KaTeX: no new dependency/CSS, works in the offline build. Not covered: matrices,
      long fractions and multi-line equations would still need KaTeX.
- [x] **B2. Answer latency.** `/submit_answer` takes ~3.4 s with only a spinner on the tapped option.
      **Done 2026-10-23:** measured 12 topics live before/after: wrong answer median 3.8 s -> 0.85 s (p90 1.1 s), correct 1.3 s -> 0.83 s.
      Stored `why_correct` (made by the gate's reviewer, backfilled for 856 questions) + per-option misconception answer a wrong MCQ with no LLM
      call; the teacher diagnosis is added to the event row in a background task (`enrich_mcq_event`); the 3 DB calls in `mastery_updater_node`
      run in parallel. Falls back to the old LLM path for questions without `why_correct`. `MCQ_INSTANT_FEEDBACK=0` turns the instant path off.
      Logged-in home/dashboard load (~3-4 s, API-bound) is NOT addressed here — see the note under C-items.
- [x] **B3. Object lessons.** Raw Python dict text shown (`{'context': {…`), a bare `Malaysian_Student`, "Aisha/Aisyah" in 11 of 33,
      Kbat label in Malay inside an English UI.
      **Done 2026-10-23:** `scripts/regen_object_lessons.py --subjects all --bad-only` regenerated 128 broken/legacy-story hooks with the
      no-names v2 generator (21 left without a hook after review); broken hooks now 0 (of 510), "Siti" 84 -> 0; `gate()` drops dict/placeholder hooks
      before caching; the UI hides unusable hooks and `src/lib/kbat.ts` translates the KBAT chip (EN/ZH). Not seen in the browser: the chip
      is not shown in the default SPM-Exam view, only in other feed views.
- [x] **B4. Option formatting.** Doubled letters ("A  A) x = …") in some questions.
- [~] **B5. Guessability.** Correct option is often the longest; distractors absurd.
      **Position bias fixed 2026-10-23:** measured on the cache, the key was A in 57% of questions and D in 3% (always tapping A scored 57%).
      `shuffle_options()` (agents/question_validator.py; deterministic per question, flagged `options_shuffled`, key made text-based, letter-keyed
      rationales re-keyed, "all of the above"-style options left in place) was applied to 829 cached questions with
      `scripts/shuffle_cached_options.py --apply` (now 25/26/22/26%), runs in `gate()` for newly cached questions and at serve time for
      uncached drafts. Live check, 14 topics: every correct and wrong answer marked correctly, served keys spread over A-D.
      **Still open:** length bias (correct option is the strictly longest in 27% overall, 52% in Bahasa Inggeris, 46% Bahasa Melayu, 37% Bahasa Cina;
      random ~23%) and weak distractors are not fixed — the generator prompt already asks for parallel options, the LLM does not comply.

## C. Design / UX

- [x] **C1. Login hero text contrast** (headline, subtext, KSSM chip) fails accessibility.
      **Done:** raised the hero/form text opacities, field borders (white/40) and the 'Forgot password?' link; measured with a canvas-based
      WCAG check on the live page: 32 text nodes, 0 below AA (4.5:1 / 3:1 large). Inputs now have a placeholder-visible border.
- [x] **C2. Fake social proof.** Login demo stats (2,847 pts / #2 / "trusted by students across Malaysia") and hardcoded "1.2k" likes on every question.
      **Done:** the dashboard preview is labelled "Example dashboard" (aria-label says sample data), "Trusted by students across Malaysia" replaced by
      "Built around the KSSM syllabus · Form 4 & 5 · BM / EN / 中文", the 1.2k heart is now a real per-question toggle with no counter.
- [x] **C3. Crowded 390 px header** + truncated subject picker.
      **Done:** header = logo, language, Leaderboard, Dashboard, "More" menu (Join game, Settings, Sign out); all controls 44x44 (measured at 390 px:
      no overlap, no horizontal scroll); subject pill shows subject + topic on up to 2 lines with Form/lang visible; stray render-time console.log removed.
- [x] **C4. "Free Practice" drops into the diagnostic feed.**
      **Done (clarified, not rerouted):** Free Practice answers do count toward the Study Coach report, so the card is now titled "Study Coach progress"
      with "every question you practise counts" outside the diagnostic, and "Diagnostic progress" only inside it.
- [x] **C5. Counters disagree** ("Q 1" vs "4/10 answered" after reload).
      **Done:** in the diagnostic the pill and exam card show answered+1. (Not seen live: the QA student had already finished the diagnostic.)
- [x] **C6. Dashboard copy** ("0 of 179 topics… Physics is your strongest area at 0%").
      **Done:** `MasteryPanel.generateReport`: a first-step message when nothing is started; strongest/weakest only among started subjects; never praise
      and scold the same subject. Checked live: "Physics is your strongest area so far (2%). Give Biology (1%) more attention…".
- [x] **C7. Leaderboard identity mismatch** (dashboard shows hash prefixes, /leaderboard shows names). Fixed with A2b: both show the same pseudonym.
- [x] **C8. Offline page shows a raw `run.app` URL.**
      **Done:** replaced by a "Copy link to share" button. (Rest of the offline page still unaudited, see D.)
- [x] **C9. `/teacher` silently redirects after a 403.**
      **Done:** toast (EN/BM) explains the redirect and teacher endpoints are no longer called for non-teachers (no console 403). Teacher view itself not audited.
- [x] **C10. `BASE_URL` fallback** in `src/services/api.ts` is the expired `api.kuasa.tech:8443`.
      **Done:** the three fallbacks (`services/api.ts`, `lib/coins.ts`, `routes/api.public.skor.$.tsx`) now point at `https://api.skor.space`; 0 `kuasa.tech` left in `src/`.

## E. Load time of signed-in screens (added after profiling)

- [x] **E1. Logged-in load.** Profiled the real page with a request waterfall: the home screen shows content at **0.33 s** and the dashboard at
      **0.25 s** (the "3-4 s" I first reported was `networkidle`, i.e. background calls finishing, and overstated what a student feels).
      Real problems found and fixed: the dashboard effect depended on the `user` object and sent all its calls twice (10 requests queueing on
      the 2 API workers; now 5; network idle 2.94 s -> 1.73 s); `/leaderboard` re-aggregated every `quiz_sessions` row per request (680 ms,
      and unbounded) -> 45 s per-subject cache (~250 ms warm). **Still open:** the profile row is fetched 3x concurrently on the home screen
      (`profiles?select=id,full_name,role`), `/classroom_live/now` takes ~0.8 s, and `teacher_insights` is called for students on the dashboard.

## D. Offline app — NOT audited yet (added 2026-10-23 on request)

There is no APK/Android project in the repos: the "offline app" is a PWA on Cloud Run (`kuasaprestij-offline`, built from the same
frontend source via `cloudbuild-offline.yaml`, manual `gcloud builds submit`). The Capacitor SLM plugin is a contract only, not built.
How the items above touch it:
- A1 (prod build): no change for it, it was already a production build on Cloud Run.
- A2b (leaderboard): the *deployed* offline build still sends no token, so its leaderboard/dashboard widget will be empty (401 is
  swallowed) until it is rebuilt and redeployed.
- A3 (questions): the offline pack is made from the same cached questions, so bad ones are in downloaded packs too; devices keep old
  packs until they re-download.
- [ ] D1. **Rebuild + redeploy the offline app — BLOCKED: `gcloud` needs an interactive login** (`Reauthentication failed`). Everything is
      prepared: `cloudbuild-offline.yaml` now bakes `https://api.skor.space` (it was the dead `https://api.kuasa.tech`), and the monorepo
      frontend source is identical to the live source (`diff -rq` clean). To finish, run in this session:
      `! gcloud auth login`, then
      `cd /root/kuasaprestij-monorepo && gcloud builds submit frontend --config cloudbuild-offline.yaml --region asia-southeast1 --substitutions _TAG=$(git rev-parse --short HEAD)`
      (re-check the Cloud Run CPU quota first, see memory `project-cloudrun-cpu-quota`).
- [~] D2. Audit of the **currently deployed** offline app (https://kuasaprestij-offline-746801891568.asia-southeast1.run.app), Playwright 390 px:
  - **BROKEN in production:** every API call goes to the dead `https://api.kuasa.tech` (`ERR_CONNECTION_CLOSED`): subjects, diagnostic status,
    live-class check. Sign-in (Supabase) and the question-bank download (Supabase REST) still work. Fixed in the build config, needs D1.
  - Works: offline page, sign-in, pack download (854 questions, 21 subjects, 2.3 MB), service worker precache (132 files, ~18 s), app shell opens with
    no network.
  - Found, not fixed here (needs the redeploy to verify): the *old* build sat on "Loading question…" offline for the default subject
    ("Sains · Asid, Bes dan Garam", a BM label); the current source already has the "System maintenance … Retry" card for failed loads, so this
    is expected to be fixed by the redeploy, but unverified. Pack subject list showed duplicates/stray labels ("Biologi · 6" + "Biology · 200",
    "Kimia", "Matematik", "KSSM") — `packSubjects()` now merges aliases and drops "KSSM" (unverified live).
  - **Assessment-integrity risk (by design, worth a decision):** the pack is read straight from `topic_anchors` through Supabase REST with the
    student's own login, so any signed-in student can read every question's answer key (and `why_correct`). Offline marking needs the key on the
    device, but the table is readable online too. Consider a narrower view/RPC that returns only the keys for downloaded subjects.
  - Not tested: install-to-home-screen, the 800 MB on-device model, queued-answer sync, offline sign-up, iPhone Safari.
- [x] D3. Supabase Redirect URLs now include the offline Cloud Run URL (added `https://kuasaprestij-offline-…run.app/**` via the Management API,
      additive; Site URL unchanged). Dead `https://api.kuasa.tech/**` left in place.

## Not tested yet
Teacher dashboard, games, Live Arena, offline app, sign-up + email confirmation.
