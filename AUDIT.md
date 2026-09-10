# Security & Code Audit — KuasaPrestij

> Generated 2026-06-14. Backend (`/root/kuasaprestij`) + Lovable frontend (`alvinauh/learn-play-shine-96`).
> Check items off as fixed. Tackle in the order under "Suggested fix order" at the bottom.

**Headline:** The frontend has a sound Supabase auth/RLS layer, but it's bypassed by the backend, which is internet-exposed, unauthenticated, and holds a `service_role` key. Frontend and backend also point at *different* Supabase projects (frontend `bvttqyyzmtlsddpzjpnk`, backend `opavfcpsxnntjylipbwl`), so the RLS does not protect the data the backend stores.

---

## 🔴 Critical

- [ ] **C1 — Backend has no authentication; trusts client `student_id`; uses `service_role` key.**
  - `app/main.py` exposes `/start_session`, `/submit_answer`, `/teacher_insights`, `/mastery_map/{id}`, `/chat/history/...`, `/session/{id}` with no auth dependency.
  - `student_id` taken from request body and trusted: `main.py:154`, `main.py:251`, `main.py:669`.
  - Supabase client uses **service_role** JWT (`agents/orchestrator.py:18`) → bypasses all RLS.
  - Impact: anyone hitting `…/mastery_map/<uuid>` or `/teacher_insights` reads/writes any student's mastery, answers, chat history, and the class report (full IDOR / PII exposure). `/resume_session` (`main.py:441`) is the only handler that checks ownership.
  - **Fix:** Require a Supabase JWT on the backend; verify the bearer token, derive `student_id` from `sub`, ignore the body field. Move backend to the **anon** key + per-request user JWT so RLS applies, or enforce ownership in every handler. Never expose `service_role` behind an open endpoint.

- [ ] **C2 — GitHub PAT embedded in the git remote URL.**
  - `git remote -v` → `https://alvinauh:ghp_…@github.com/alvinauh/kuasaprestij.git` (PAT in `.git/config` on the VPS).
  - **Fix:** Rotate the PAT now. Switch to a read-only deploy key (SSH) or a credential helper. While rotating, also rotate `service_role`, Gemini, Pexels, ElevenLabs, and Llama keys in `.env` (plaintext on VPS; service_role is effectively public via C1).

- [ ] **C3 — Privilege escalation via self-service signup role.**
  - `supabase/migrations/…932.sql:116` — `handle_new_user()` reads role from `NEW.raw_user_meta_data->>'role'`; `src/lib/auth.tsx:97` passes `role` from the signup form. A user can self-register as `teacher`/`admin`.
  - **C3b (related):** route protection is client-only — `src/routes/__root.tsx:185-191` just `navigate()`s on `profile.role`; `teacher.tsx` has no server guard.
  - **Fix:** Force `role := 'student'` in the trigger; grant teacher/admin only via an admin-approved path. Don't rely on client navigation for authorization.

- [ ] **C4 — Correct answers shipped to the browser.**
  - `/start_session` returns `question_data: state.get("draft")` (`main.py:242`); draft contains `correct_answer` + `distractor_rationale` (`orchestrator.py:446,539,609`). Frontend reads `data.question_data?.correct_answer` (`src/services/api.ts:241`). Same for `/generate_quiz` (`quiz_agent.py`).
  - **Fix:** Strip `correct_answer`/`distractor_rationale`/`sample_answer` from any pre-answer response; grade server-side and return them only with the result.

---

## 🟠 High

- [ ] **H1 — Open proxy reflecting arbitrary Origin.** `src/routes/api.public.skor.$.tsx` forwards any path/method to the backend and sets `Access-Control-Allow-Origin: <reflected origin>` (`:9`). Unauthenticated open relay. Lock to known paths + own origin, or remove it (app calls the VPS directly via `api.ts:2`).

- [ ] **H2 — Prompt injection; guardrails bypassable.** Raw user input concatenated into Gemini prompts without delimiting: chat `message` (`chat_agent.py:117,121`), `student_answer` (`orchestrator.py:684`), `suggested_improvements`/`raw_payload` (`feedback_loop.py:68` — can force repeated `regenerate_lesson` → cost amplification). Delimit/escape user content; validate model-returned actions against an allow-list.

- [ ] **H3 — `num_questions` unbounded** (`quiz_agent.py:144`) — client-controlled, no cap → prompt-size/cost DoS. Clamp to 1–20.

---

## 🟡 Medium (correctness)

- [ ] **M1 — `evaluator_node` KeyError on missing draft.** `studio_node` returns `{}` on Gemini rate-limit; `evaluator_node` reads `state['draft']` unguarded (`orchestrator.py:670`). Add the `if not state.get('draft')` guard.
- [ ] **M2 — Mastery/streak race** (`orchestrator.py:894`) and **feedback batch re-entrancy** (`feedback_loop.py:219`) — counts/selects not atomic; concurrent requests double-count or double-process. Mark rows `in_progress` / use atomic increments.
- [ ] **M3 — `quizzes` insert has no `on_conflict`** (`quiz_agent.py:172`) — violates CLAUDE.md rule 7; regeneration duplicates rows.
- [ ] **M4 — `_source_chunks` leaks** into stored `notes_json` and the API return (`lesson_agent.py:185,208`).
- [ ] **M5 — `/docs` + `/openapi.json` publicly proxied** (`nginx-standalone.conf:15`) — full API map for attackers. Gate them.
- [ ] **M6 — CORS `allow_credentials=True` with localhost origins** (`main.py:30-36`) — remove localhost in prod.

---

## 🟢 Low / quality

- [ ] **L1 — Duplicate `_gemini_with_retry`** in 3 files with different retry counts; consolidate.
- [ ] **L2 — `requests.get` has no timeout** (`orchestrator.py:477`) — can hang the worker.
- [ ] **L3 — Second full copy of the app** at `/root/kuasaprestij/kuasaprestij/` with its own identical `.env` (same secrets) — delete it.
- [ ] **L4 — Dead `__main__` dev blocks** in `lesson_agent.py`, `quiz_agent.py`; magic numbers (mastery ±0.1/0.05, 0.9, 10/day) → named constants.
- [ ] **L5 — `CURRICULUM_MAP` vs `KSSM_TOPICS` key mismatches** (e.g. "Force and Motion I" vs "Force & Motion") silently break `next_topic` progression.

---

## Suggested fix order
1. **C2** — rotate the GitHub PAT + other keys (you do this; manual).
2. **C1 + C4** — backend auth layer + strip answers from pre-answer responses.
3. **C3** — fix signup-role trigger + add server-side route/role guards.
4. **H1, H2, H3** — proxy lockdown, prompt-injection hardening, input clamps.
5. **M1–M6** — correctness + hardening.
6. **L1–L5** — cleanup.

## What's already good
- `.env`/credentials correctly gitignored, never committed.
- Supabase RLS policies sound (apart from the role trigger, C3).
- `src/lib/study-pack.functions.ts` is the model pattern: Zod-validated input, server-only key, schema-constrained output.
