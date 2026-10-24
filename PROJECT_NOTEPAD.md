# KuasaPrestij — Project Notepad
> Generated 2026-06-22. Single source of truth for what this project is, how it works, and where things stand.

---

## What It Is

An AI-powered adaptive assessment engine for Malaysian secondary school (KSSM) students, targeting Form 4 & 5 SPM preparation. The core loop:

1. Student picks a topic → gets a question (cached "anchor" or freshly generated)
2. Student submits answer → AI evaluates, updates mastery score, writes error diagnosis
3. Teacher sees class heatmap + AI narrative of what to address today

**Differentiator vs Pandai/Geniebook:** adaptive routing by actual error pattern (not static question bank), root-cause diagnosis per wrong answer, teacher class-level weakness heatmap, AI tutor grounded in the student's specific lesson session.

---

## Tech Stack

| Layer | Tool |
|---|---|
| API | FastAPI (uvicorn, port 8000 / 8001 via nginx) |
| Agent pipeline | LangGraph (StateGraph) |
| AI model | OpenRouter `meta-llama/llama-3.3-70b-instruct:free` (primary) → GroqCloud `llama-3.3-70b-versatile` (fallback) via `agents/llm_client.py` |
| Embeddings | `sentence-transformers/paraphrase-multilingual-mpnet-base-v2` (local, free, 768-dim, BM/EN/ZH) |
| Vector store | Supabase pgvector, `match_syllabus_embeddings` RPC |
| Database | Supabase (Postgres) |
| TTS | Google Cloud TTS — `ms-MY-Wavenet-B` (Malay), `en-US-Wavenet-D` (English) |
| B-Roll video | Pexels API (portrait, small, MP4) |
| Interactive video | H5P Interactive Video JSON blob |
| Frontend | Lovable.dev (React) at `lovableproject.com` / `lovable.app` |
| Ingestion | PyMuPDF → Supabase pgvector |
| Deployment | VPS, systemd, nginx SSL (Let's Encrypt, nip.io) |

---

## Repository Layout

```
kuasaprestij/
├── app/
│   └── main.py              # FastAPI app — all HTTP endpoints
├── agents/
│   ├── orchestrator.py      # LangGraph pipeline + all node functions
│   ├── chat_agent.py        # Tutor chat grounded in lesson notes
│   ├── feedback_loop.py     # Background agent: process user_feedback rows
│   ├── lesson_agent.py      # DSKP → concept notes generator (cached)
│   ├── quiz_agent.py        # Notes → MCQ/short-answer/essay questions
│   └── remediation_planner.py  # Error analysis → prioritised study plan
├── schemas/
│   └── assessment.py        # Pydantic ValidatedQuestion model
├── schema/                  # SQL migration files (apply in Supabase)
│   ├── lessons_quiz.sql
│   ├── c3_role_hardening.sql
│   ├── h5p_interactive_video.sql
│   ├── remediation_plan.sql
│   └── topic_anchors_language.sql
├── deploy/
│   ├── kuasaprestij.service      # systemd unit
│   ├── kuasaprestij-pull.service # auto-pull from GitHub
│   ├── kuasaprestij-pull.timer   # timer for above
│   ├── auto_pull.sh
│   └── nginx-standalone.conf    # SSL reverse proxy config
├── data/                    # DSKP KSSM PDF files (Form 1–5, all subjects)
├── competitive_analysis/    # Playwright scrape of Pandai, Geniebook, Quipper
├── ingest.py                # PDF → Supabase pgvector
├── hf_ingest.py             # Hugging Face dataset → Supabase
├── ingesfailedfiles.py      # Retry failed ingestion
├── seed_anchors.py          # Pre-seed topic_anchors for all KSSM topics
├── seed_english_anchors.py  # English-language anchor seeder
├── seed_anchors_claude.py   # Claude-variant seeder
├── sync_subjects.py         # Sync subject/topic list to Supabase
├── requirements.txt
└── WORKSPACE.md             # Live task tracker (Claude updates after every session)
```

---

## Agent Pipeline

```
/start_session
    └─► retriever_node       — embed topic → pgvector search → get student history
    └─► studio_node          — [anchor mode] serve cached question from topic_anchors
                               [cache miss] generate new anchor + TTS + Pexels B-Roll + H5P blob
    └─► generator_node       — [adaptive mode] generate fresh question tailored to past errors

/submit_answer
    └─► evaluator_node       — MCQ: exact match | short_answer/essay: Gemini rubric eval
                               → produces: is_correct, partial_credit, feedback, error_category, root_cause
    └─► mastery_updater_node — update dskp_mastery score (±0.1/±0.05)
                               → log to event_logs with diagnostic_tag
                               → check topic completion (score ≥ 0.9 OR 10 q/day)
                               → return next_topic from CURRICULUM_MAP
```

**Anchor vs Adaptive:**
- `is_adaptive=False` (default): `studio_node` serves a cached anchor question with mnemonic rap + TTS voiceover + Pexels B-Roll + H5P blob. Generates and caches on first miss.
- `is_adaptive=True`: `generator_node` generates a fresh question informed by the student's error history.

**Background prefetch:** After `/submit_answer`, a background task pre-generates the next question and parks it on `quiz_sessions.prefetched_draft` so the next `/start_session` is instant.

---

## All API Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/start_session` | Retrieve syllabus, serve or generate question, kick off background lesson generation |
| POST | `/submit_answer` | Evaluate answer, update mastery, prefetch next question |
| GET | `/teacher_insights` | Class mastery + wrong-answer alerts + Gemini narrative |
| GET | `/suggest_topic/{student_id}` | Next topic: remediation plan → lowest mastery → random unstarted |
| POST | `/remediation_plan/{student_id}` | Trigger background AI remediation plan generation |
| GET | `/mastery_map/{student_id}` | Per-topic mastery map for frontend progress view |
| GET | `/subjects` | KSSM subjects + topics; `?form_level=4` or `?form_level=5` filter |
| POST | `/generate_lesson` | Generate (or fetch cached) concept notes for a topic |
| POST | `/generate_quiz` | Generate MCQ/short-answer/essay quiz from lesson notes |
| GET | `/lesson/{lesson_id}` | Fetch a generated lesson by ID |
| GET | `/quiz/{quiz_id}` | Fetch a stored quiz by ID |
| POST | `/chat` | Tutor chat grounded in lesson notes |
| GET | `/chat/history/{lesson_id}/{student_id}` | Chat history for a session |
| POST | `/resume_session` | Resume an in-progress quiz session |
| GET | `/session/{session_id}` | Session metadata |
| POST | `/submit_feedback` | Student/teacher feedback submission |
| POST | `/process_feedback` | Manually trigger feedback processing cycle |

---

## Supabase Tables

| Table | Purpose | Key Columns |
|---|---|---|
| `syllabus_embeddings` | pgvector store for DSKP content | `content`, `embedding` (768d), `metadata` (subject, form, topic) |
| `topic_anchors` | Cached anchor questions per topic+language | `topic`, `language`, `anchor_question` (jsonb), `mnemonic_lyrics`, `audio_url`, `video_broll`, `h5p_content` |
| `dskp_mastery` | Per-student per-topic mastery | `student_id`, `curriculum_tag`, `topic`, `mastery_level` (0–1), `next_review_at` |
| `event_logs` | Every answer attempt | `student_id`, `topic`, `kbat_level`, `is_correct`, `diagnostic_tag`, `error_category`, `root_cause`, `intervention` |
| `generated_lessons` | Cached AI-generated concept notes | `topic`, `subject`, `form_level`, `language`, `notes_content`, `notes_json` (summary, key_terms, mindmap, worked_example, _source_chunks) |
| `quizzes` | Generated quiz question sets | `lesson_id`, `topic`, `questions_jsonb`, `difficulty_level`, `question_type`, `language` |
| `quiz_sessions` | Active student quiz sessions | `student_id`, `topic`, `current_draft`, `prefetched_draft`, `answered_count`, `mastery_score`, `status` |
| `chat_history` | Tutor chat turns | `student_id`, `lesson_id`, `role`, `content` |
| `user_feedback` | Student/teacher feedback | `student_id`, `quiz_id`, `lesson_id`, `test_score`, `suggested_improvements`, `status` (pending→processed) |
| `remediation_plans` | AI-generated study priorities per student | `student_id`, `subject`, `topic`, `priority_score`, `reason`, `error_categories[]`, `root_causes[]`, `suggested_intervention`, `status` |
| `student_daily_report` | View used by `/teacher_insights` | aggregated mastery/activity |

**DB naming note:** mastery score in DB is `mastery_level`; in `AgentState` Python dict it is `mastery_score`. Do not confuse.

---

## Curriculum Coverage

**Subjects:** Physics, Biology, Chemistry, Science, Additional Mathematics, Mathematics, Bahasa Melayu, Bahasa Inggeris, Bahasa Cina, Sejarah, Geografi, Pendidikan Moral, Prinsip Perakaunan, Pendidikan Muzik, Pendidikan Seni Visual

**Forms:** 4 and 5 (KSSM SPM tier) — `KSSM_TOPICS_BY_FORM` in `orchestrator.py`

**Languages:** English, Bahasa Melayu (bilingual anchor mode also available)

**Mastery model:** score 0–1, +0.1 correct / −0.05 wrong (MCQ); scaled by `partial_credit` for open questions. Topic unlocks at ≥0.9 or 10 questions/day. Next topic from `CURRICULUM_MAP`.

---

## Data Ingestion

DSKP KSSM PDFs (Form 1–5, all subjects) stored in `data/`. Two ingestion paths:

- `ingest.py` — PyMuPDF PDF → chunk → `sentence-transformers` embed → `syllabus_embeddings`
- `hf_ingest.py` — Hugging Face dataset → same table
- **Re-ingest required** after any embedding model change — old vectors are in a different mathematical space and produce garbage similarity scores. Last re-ingested: 2026-06-27 (migration from Gemini `text-embedding-2` to `paraphrase-multilingual-mpnet-base-v2`).

Debug `.md` files in root (e.g. `debug_001 DSKP KSSM BAHASA MELAYU...`) are per-PDF ingestion logs showing chunk counts and metadata.

---

## Deployment

**Server:** VPS at `178.105.130.105`, accessed via `178.105.130.105.nip.io`

**Services:**
- `kuasaprestij.service` — uvicorn on port 8000, auto-restarts, reads `.env`
- `kuasaprestij-pull.timer` + `kuasaprestij-pull.service` — auto-pulls from GitHub on a schedule
- nginx on port 8443 (SSL) → proxies to port 8001

**Frontend:** Lovable.dev at `github.com/alvinauh/learn-play-shine-96` (Supabase project `bvttqyyzmtlsddpzjpnk`)

---

## Environment Variables

```
SUPABASE_URL
SUPABASE_KEY
OPENROUTER_API_KEY          # primary LLM — OpenRouter
GROQ_API_KEY                # fallback LLM — GroqCloud
GOOGLE_APPLICATION_CREDENTIALS   # path to google-credentials.json (TTS only)
PEXELS_API_KEY
# GEMINI_API_KEY — no longer used (migrated 2026-06-27)
```

---

## Security Status (from AUDIT.md)

| Item | Status |
|---|---|
| C1 — Backend JWT auth; derive student_id from token | **OPEN** |
| C2 — Rotate GitHub PAT + all .env secrets | **OPEN (manual)** |
| C3 — Signup-role trigger hardening + RLS on sensitive tables | **DONE** (2026-06-22) |
| H1 — Lock/remove open API proxy in frontend | **OPEN** |
| M2 — Mastery/streak race condition; feedback in_progress lock | **OPEN** |
| M5 — Gate /docs + /openapi.json behind auth or remove | **OPEN** |
| M6 — Remove localhost CORS origins in prod | **OPEN** |

---

## Known Bugs (from code review 2026-06-22)

### Fixed (commit 2cc9146)
- `app/main.py:649` — `_generate_teacher_narrative` used `str(response)` instead of `response.text`
- `app/main.py:834` — `/mastery_map` selected wrong column `mastery_score` (should be `mastery_level`), caused KeyError crash for all users
- `app/main.py:636` — Falsy-zero: `class_average_mastery=0` rendered as `'unknown'` in teacher prompt
- `app/main.py:218` — Prefetch lookup served stale questions from completed sessions (no status filter)
- `agents/orchestrator.py:861` — MCQ grading was case-sensitive; added `.lower()` normalisation

### Still Open
1. `agents/feedback_loop.py:89` — `analyse_feedback` has no retry; any 429 silently marks feedback as `no_action`
2. `agents/feedback_loop.py:217` — No optimistic lock in `process_pending_batch`; concurrent calls double-process rows
3. `agents/chat_agent.py:128` — If tutor `_save_turn` fails after student turn saved, history ends with unanswered student message
4. `agents/orchestrator.py:1046` — TOCTOU mastery race: two concurrent `/submit_answer` calls for same student+topic can lose one delta
5. `agents/feedback_loop.py:43` — Orphaned quiz (`lesson_id=null`) silently fails regeneration with misleading log

---

## Competitive Landscape (June 2026)

| Competitor | Positioning | Gap KuasaPrestij fills |
|---|---|---|
| Pandai (1M+ students) | Gamified mass-market, static question bank, spans Yr1–Form5 | Adaptive routing by error pattern; root-cause diagnosis; teacher class heatmap; SPM specialist |
| Geniebook | Ecosystem (AI + live tuition + practice), SG-origin | KSSM-specific, BM-native, no live tuition overhead |
| Quipper | Curriculum-aligned video + quizzes | AI grading + teacher insight narrative |
| Delima (MOE) | Government LMS | Modern UX, real-time AI feedback |

---

## Development Conventions

1. **Read WORKSPACE.md first** before starting any session — check priorities and blockers.
2. **Update WORKSPACE.md after every task** — log what changed, what's next, blockers.
3. **Commit atomically** — one logical change per commit; message explains the why.
4. **Never hardcode credentials** — all secrets via `.env`.
5. **Defensive JSON parsing** — Gemini sometimes wraps object in a list; always `isinstance(data, list)` check.
6. **UUID failsafe** — `student_id == "undefined"` → remap to `00000000-0000-0000-0000-000000000001`.
7. **Supabase upserts** — always specify `on_conflict` key.
8. **AgentState fields** — must be fully populated on construction; missing keys cause TypedDict errors.
9. **`studio_node` empty return** — returns `{}` on Gemini rate-limit; calling code must check `if not state.get('draft')`.
10. **DB column name** — mastery score in DB is `mastery_level`; in AgentState Python dict it is `mastery_score`.

---

## Latency Optimisation Log

### Session 2026-06-24 — Diagnosis

Full audit of `/start_session` critical path. Cache-miss case was 10–20s end-to-end:

| Step | Time | Ran |
|---|---|---|
| Gemini embedding (retriever_node) | 2–3s | Sequential |
| Supabase vector search | 0.5s | Sequential |
| Gemini question generation (studio_node) | 3–4s | Sequential |
| **Google TTS synthesis** | **2–4s** | Sequential |
| **Pexels video fetch** | **1–2s** | Sequential after TTS |
| Supabase upload + upsert | 0.5s | Sequential |

Prioritised fix list (ranked by impact):
1. ✅ Parallelize TTS + Pexels in `studio_node` — **DONE 2026-06-24**
2. ✅ Parallelize Gemini embedding + student history query in `retriever_node` — **DONE 2026-06-24**
3. ⬜ Frontend: fire `loadSession` during 1500ms praise overlay, not after (free 1.5s UX win)
4. ⬜ Frontend: fix `submitToBackend` hardcoded test UUID (data integrity bug — real users attributed to test UUID)
5. ⬜ Cache topic embeddings in `topic_anchors` — avoid re-embedding same topic every session
6. ⬜ Frontend: add `AbortController` timeout to `startSession` / `submitToBackend` (currently hangs forever on slow backend)

### Fix #1 — Parallel TTS + Pexels (`agents/orchestrator.py`) — DONE 2026-06-24

**Before:** Pexels fetch (1–2s) ran sequentially, then TTS (2–4s). Combined: 3–6s on every new anchor.

**After:** Both run in a `ThreadPoolExecutor(max_workers=2)`. Wall-clock = whichever is slower (~2–4s). Saves ~1–2s per new anchor generation.

Changes:
- Added `import concurrent.futures` (line 15)
- Extracted Pexels logic into `_fetch_pexels_video(search_query, raw_query) -> (url, duration)` helper (near `_generate_tts_audio`)
- Replaced sequential block in `studio_node` with `executor.submit()` + `.result()` pattern
- Added `timeout=10` to all `requests.get()` calls in Pexels helper (was unbounded before)

### Fix #2 — Parallel embedding + student history (`agents/orchestrator.py`) — DONE 2026-06-24

**Before:** `retriever_node` ran: embed_content (2–3s) → vector search (0.5s) → history query (0.3s) = 2.8–3.8s sequential.

**After:** History query runs concurrently with the embedding+vector chain (which remain sequential since vector search needs the embedding). Wall-clock = ~2.5–3.5s. Saves ~0.3s from `retriever_node` on every adaptive request.

Changes:
- Extracted embedding + vector search into `_fetch_syllabus_context(subject, topic) -> str`
- Extracted history query into `_fetch_student_history(student_id, topic) -> str`
- `retriever_node` now fires both via `ThreadPoolExecutor(max_workers=2)`

**Note on TTS removal:** TTS only runs on cache-miss (first time a topic is generated). Removing it would save 2–4s on first-time topic generation only — cached topics are unaffected. Parallel execution achieves most of that saving without losing the audio feature.

---

## Session 2026-07-01 (continued) — Stability audit + classroom join fix

### All fixes applied

| # | File | Fix |
|---|---|---|
| 1 | `app/main.py:987` | `/chat/history`: renamed `history` → `messages` so frontend can parse it |
| 2 | `app/main.py:804` | `/submit_answer`: renamed `new_mastery_score` → `mastery_score` |
| 3 | `app/main.py:796` | `/submit_answer`: added `correct_answer` and `misconception` to response |
| 4 | `app/main.py:892` | `/penalty_game_result`: added `total_score` and `game_wins` to response |
| 5 | `app/main.py:58` | CORS: replaced dead `178.105.130.105.nip.io:8443` with `api.kuasa.tech:8443` |
| 6 | `app/main.py:118` | `_create_quiz_session`: guard `res.data[0]` with explicit HTTP 500 on empty |
| 7 | `schema/classroom_rls.sql` | **NEW**: RLS for `classrooms` + `classroom_members`; recreate `join_classroom_by_code` as SECURITY DEFINER |
| 8 | `src/routes/__root.tsx` | Invite-link join: replaced silent direct insert with RPC call (consistent with manual code path) |
| 9 | `src/components/teacher/ClassroomsPanel.tsx` | Filter classrooms by `teacher_id` (defense-in-depth) |
| 10 | `requirements.txt` | Added `twilio` and `python-multipart` (were missing; caused startup crash) |

### Classroom join fix — root causes

Two problems caused "student joins but teacher doesn't see them":
1. **Invite-link path** (`__root.tsx`) did a raw `supabase.from("classroom_members").insert()` with no error handling. If RLS blocked the insert (no student INSERT policy), it silently failed.
2. **No teacher SELECT policy** on `classroom_members` — if RLS was enabled with only a student self-select policy, teachers could never read their own classroom members.

`schema/classroom_rls.sql` must be applied in the Supabase SQL Editor. It defines:
- `classrooms`: teacher CRUD own, admin sees all, student sees joined classrooms
- `classroom_members`: student sees own, teacher sees their classroom's members, student can insert own
- `join_classroom_by_code` RPC: recreated as SECURITY DEFINER with `ON CONFLICT DO NOTHING`

### Still open (from earlier audit)

- Dual assignment systems: teacher `assignments` table (Supabase) vs `assigned_tasks` (API) — needs design decision
- No JWT auth on backend endpoints (C1)

---

## Planned / Next Up

- ~~**Latency #2:** Parallelize Gemini embedding + student history query in `retriever_node`~~ DONE
- **Latency #3:** Frontend — fire `loadSession` during 1500ms praise overlay (free UX win)
- **Latency #4:** Frontend — fix `submitToBackend` hardcoded UUID bug
- Stress test script for TOCTOU mastery race + concurrent feedback processing
- Add optimistic lock (`status='in_progress'`) to `feedback_loop.process_one` before Gemini call
- Add retry wrapper to `analyse_feedback`, `quiz_agent.generate_quiz`, `lesson_agent.generate_lesson`
- JWT auth on API endpoints (C1)
- Gate `/docs` and `/openapi.json` (M5)
- Remove localhost CORS in prod nginx config (M6)

---

## Frontend Self-Hosting on VPS — STABLE as of 2026-07-01

**Stack:** `/root/frontend/learn-play-shine-96` · wrangler dev on port 3000 · nginx proxies to 8443 SSL

### How it runs

| Service | Command | Port |
|---|---|---|
| `kuasaprestij.service` | `uvicorn app.main:app` | 8001 |
| `kuasaprestij-frontend.service` | `npx wrangler dev --port 3000 --log-level warn` | 3000 |
| nginx (standalone) | `nginx -c deploy/nginx-standalone.conf` | 8443 (SSL) |

nginx routes: API paths (`/start_session`, `/docs`, etc.) → port 8001; everything else → port 3000.

`kuasaprestij-frontend-pull.timer` runs `frontend_pull.sh` every 5 min — pulls new Lovable commits, `npm install`, restarts the service. wrangler dev rebuilds from source on restart, so no separate build step needed.

### Session 2026-06-28 — Initial setup

Created `deploy/frontend_setup.sh`, `frontend_pull.sh`, and systemd units. nginx `location /` block added with WebSocket headers. CORS updated in `app/main.py`.

### Session 2026-07-01 — Bad gateway + CSS fix + spinner debug (RESOLVED)

**Root cause of outage:** `@lovable.dev/vite-tanstack-config` was bumped `2.6.2 → 2.6.4` in commit `09c1730` (Jun 30). This package wraps the entire build config; 2.6.4 changed the output format from a Node.js-compatible server to a **pure Cloudflare Workers bundle**. `node .output/server/index.mjs` exits with code 0 in ~90ms because the Worker module just exports a `fetch` handler — it never binds a port. Port 3000 was never up, so nginx returned 502 for all frontend routes.

**CSS fix:** Switched to `npm run dev` (Vite dev server). The CSS appeared white/black because `__root.tsx` imports the stylesheet as `import appCss from "../styles.css?url"`. The `?url` import returns a URL string used in a `<link rel="stylesheet">` tag. In Vite dev mode, that path returns `Content-Type: text/javascript` (HMR wrapper), which browsers ignore for styling. Fixed with a dedicated nginx location:
```nginx
location = /src/styles.css {
    proxy_pass http://127.0.0.1:3000/src/styles.css?direct;
    ...
}
```
`?direct` tells Vite to return actual CSS (`text/css`) instead of the HMR wrapper.

**wrangler dev attempted but DOES NOT WORK on this VPS:** Node 22 was installed, wrangler 4.x starts, but the `@cloudflare/workerd-linux-64` binary crashes after ~10–30s with `kj/async-io-unix.c++:186: disconnected: ::write(fd, buffer.begin(), buffer.size()): Connection reset by peer`. Likely a kernel/VPS environment incompatibility. Reverted to Vite dev server.

**Current state — WORKING as of 2026-07-01:**
- App loads cleanly, zero JS console errors
- Redirects unauthenticated users to `/login` correctly
- CSS, fonts, and UI all render correctly

**Root causes found and fixed:**
1. **nginx `?url` module import broken** — `location = /src/styles.css` was rewriting ALL requests (including `?url` module imports) to `?direct`, causing `text/css` response for a JS module → strict MIME check failed. Fixed with `rewrite` inside `if ($query_string = "")` so only bare (no-query-string) stylesheet link fetches get `?direct`; module imports pass through unchanged.
2. **Hardcoded old URL in `src/services/api.ts`** — `BASE_URL` was hardcoded to `https://178.105.130.105.nip.io:8443` (old URL, SSL cert mismatch). Changed to `import.meta.env.VITE_API_BASE_URL ?? "https://api.kuasa.tech:8443"`.
3. **Hardcoded old URL in `src/routes/api.public.skor.$.tsx`** — fallback URL was `http://178.105.130.105:8001`. Updated fallback to `https://api.kuasa.tech:8443`.

---

## DSKP Curriculum Audit — Cached Questions (Session 2026-06-29)

Full audit of BM and English cached anchor questions vs DSKP, plus DB schema review.

### What was audited
- BM topics in `KSSM_TOPICS_BY_FORM` vs `046_DSKP_KSSM_B_Melayu_Ting4_5.pdf`
- English topics vs `042_DSKP_KSSM_B_Inggeris_Ting3.pdf` + `065_DSKP_KSSM_Kesusasteraan_Inggeris_Ting4_5.pdf` + F5 textbook
- All schema SQL files, seed scripts, and seed logs

---

### BM Findings

**Wrong/invented topic names** (fix in `orchestrator.py` lines 531–534 and 607–610):

| Codebase Name | Should Be |
|---|---|
| `Warisan Bangsa dan Negara` | `Sejarah dan Warisan` (DSKP theme 11) |
| `Keluarga Tunjang Negara` | No such DSKP theme — closest is `Jati Diri, Patriotisme dan Kewarganegaraan` |
| `Ekonomi dan Keusahawanan` | `Ekonomi, Keusahawanan dan Pengurusan Kewangan` (truncated) |
| `Nilai Murni Amalan Hidup` | Not a DSKP theme — nilai murni is an EMK cross-curricular element |
| `Alam Sekitar dan Kelestarian` (F5) | `Alam Sekitar dan Teknologi Hijau` |
| `Kepimpinan dan Patriotisme` (F5) | `Jati Diri, Patriotisme dan Kewarganegaraan` |
| `Budaya dan Kesenian` (F5) | `Kebudayaan, Kesenian dan Estetika` |
| `Kesihatan dan Gaya Hidup Sihat` (F5) | `Kesihatan dan Kebersihan` |

**Missing KOMSAS genre:** `KOMSAS: Prosa Tradisional` is entirely absent from both F4 and F5. The DSKP defines 6 KOMSAS genres; codebase has only 5. Add to `orchestrator.py` lines 535 and 611.

**KBAT level gaps:**
- Seed prompt (`seed_anchors_claude.py:159`) only offers `Memahami|Mengaplikasi|Menganalisis`
- TP1–TP2 has no coverage (no `Mengingat` level items for weakest students)
- TP6 has no coverage — `Menilai` and `Mencipta` are absent; SPM Paper 1 (karangan) directly tests TP6

---

### English Findings

**Critical missing file:** The compulsory **DSKP KSSM Bahasa Inggeris Tingkatan 4 dan 5** PDF is NOT in `data/`. Only F1–F3 language DSKP and the F4/F5 Literature elective exist. This means `syllabus_embeddings` has no F4/F5 English curriculum content for RAG grounding. **Action: download this PDF from KPM and drop into `data/`, then run `ingest.py`.**

**Literature topics misassigned in F5** (`orchestrator.py:617–619`): Per the Literature DSKP, Short Stories, Drama, and Novel are Form 4 genres; only Poetry is Form 5. Remove `Literature: Short Stories`, `Literature: Drama`, `Literature: Novel` from `KSSM_TOPICS_BY_FORM[5]["Bahasa Inggeris"]`.

**Missing official DSKP theme:** `Consumerism and Financial Awareness` is one of the 4 official F4/F5 English DSKP themes but has no topic in either form.

**No skill-strand topics:** DSKP primary structure is 5 skills (Listening, Speaking, Reading, Writing, Literature in Action). All 23 English topic slots are purely thematic — Listening, Speaking, Reading, and Writing have zero representation.

**Form 3 English absent:** `KSSM_TOPICS_BY_FORM` has no key `3`. F3 DSKP is present and ingested but F3 English topics cannot be served via `?form_level=3`.

**`kbat_level: "Memahami"` mislabelled:** `Literature: Drama` anchor (`seed_english_anchors.py:369`) uses `Memahami` which is LOTS, not KBAT. The question is factual recall — either upgrade the question or relabel.

---

### DB Schema Findings

**Critical bug — KOMSAS/Literature have no form differentiation:**
- `topic_anchors` unique constraint is `UNIQUE (topic, language)` — no `form_level` column
- Both F4 and F5 define the same 5 KOMSAS topics (BM) and 4 Literature topics (English)
- Only one cached anchor can ever exist per topic — the second form's seed silently overwrites the first
- Fix: add migration `ALTER TABLE topic_anchors ADD COLUMN form_level INTEGER DEFAULT 4`, update constraint to `UNIQUE (topic, language, form_level)`

**Missing migration — `quiz_sessions.prefetched_draft`:**
- Used extensively in `main.py:211,290,455,477` but has no SQL migration file
- `schema/lessons_quiz.sql` does not include this column
- Code wraps reads defensively with a comment acknowledging the column may be absent
- Fix: write `ALTER TABLE quiz_sessions ADD COLUMN IF NOT EXISTS prefetched_draft jsonb` to `schema/`

**Other schema issues:**
- GIN index on `question_bank` doesn't match actual access pattern (btree on `topic+language` is what's used)
- No CHECK constraint on `question_bank` JSONB — malformed AI output silently accepted
- Three scripts cap `question_bank` at different sizes (3 / 5 / 10) — later runs silently truncate banks seeded by earlier ones
- Bank fallback in `studio_node` (`orchestrator.py:797`) returns `h5p_content: None` — students served a bank question get no H5P overlay

---

### Prioritised Fix List (pick up here)

**Step 1 — File ingestion (just drop file + run ingest):**
- [ ] Download **DSKP KSSM Bahasa Inggeris Tingkatan 4 dan 5 (compulsory)** from KPM website, drop into `data/`
- [ ] Run `python ingest.py` to embed it into `syllabus_embeddings`
- [ ] Run `python seed_grounded_bank.py --subject "Bahasa Inggeris" --force` to regenerate English anchors with real DSKP grounding

**Step 2 — Code fixes in `orchestrator.py`:**
- [ ] Fix 8 wrong BM theme names (lines 531–534, 607–610) — see table above
- [ ] Add `KOMSAS: Prosa Tradisional` to both F4 (line 535) and F5 (line 611)
- [ ] Remove `Literature: Short Stories`, `Literature: Drama`, `Literature: Novel` from F5 English (lines 617–619)
- [ ] Add `Consumerism and Financial Awareness` to F4 or F5 English topics
- [ ] Add `Menilai` to kbat_level options in `seed_anchors_claude.py:159`

**Step 3 — DB schema migrations (apply in Supabase SQL editor):**
- [ ] Add `form_level` column to `topic_anchors` + update unique constraint to `(topic, language, form_level)`
- [ ] Write missing `quiz_sessions.prefetched_draft` migration file

**Step 4 — Re-seed after code + schema fixes:**
- [ ] `python seed_grounded_bank.py --subject "Bahasa Melayu" --force`
- [ ] `python seed_grounded_bank.py --subject "Bahasa Inggeris" --force`
- [ ] `python seed_english_anchors.py` (updates hardcoded English anchors)

---

## Session 2026-07-01 (cont.) — Dual assignment system + AI suggest task

### Design decision: two assignment tables, different purposes

| Table | Path | Who writes | Who sees | Purpose |
|---|---|---|---|---|
| `assignments` | Supabase direct from frontend | Teacher via Supabase client | All students in that classroom | Class-wide tasks: homework, tests, practice sets |
| `assigned_tasks` | Backend API `/teacher/assign_task` | Teacher via AI suggest flow | Individual student only | AI-personalised tasks targeting a student's weak spots |

### What was built (commit 2b6574c)

**`src/services/api.ts`**
- New types: `AiTask`, `GenerateTaskResult`
- New functions: `fetchStudentAiTasks`, `startAiTask`, `generateAiTask`, `assignAiTask`
- `BASE_URL` changed from hardcoded to `import.meta.env.VITE_API_BASE_URL ?? "https://api.kuasa.tech:8443"`

**`src/components/StudyModeSelect.tsx`**
- Fetches both class assignments and AI tasks in parallel when "Assigned Tasks" tab is selected
- AI tasks rendered with violet styling, distinct from white class assignments

**`src/components/teacher/ClassroomsPanel.tsx`**
- New "AI Task" button on each student row in the class roster table
- New `AiTaskDialog` component:
  1. Teacher enters subject (pre-filled from classroom) and optional topic
  2. "Generate AI Suggestion" calls `POST /teacher/generate_task`
  3. Response shows task type, topic, mastery %, teacher tip, editable instructions
  4. "Assign Task →" calls `POST /teacher/assign_task` → writes `assigned_tasks` row
  5. Student sees task in their Assigned Tasks panel on next load

**`schema/assignments_rls.sql`** (apply in Supabase SQL Editor):
- Creates `assignments` table if missing (class-wide)
- RLS: teachers manage own, students see assignments for joined classrooms
- Adds `due_at` column to `assigned_tasks` if missing
- RLS: students see/update own tasks, teachers see all

### Backend endpoints used (already existed in `app/main.py`)
- `POST /teacher/generate_task` → line 1595
- `POST /teacher/assign_task` → line 1650
- `GET /student/tasks/{student_id}` → called by `fetchStudentAiTasks`
- `POST /student/tasks/{task_id}/start` → called by `startAiTask`

### Manual steps still required
1. **Apply `schema/assignments_rls.sql`** in Supabase SQL Editor
2. **Push frontend** to GitHub: `! git -C /root/frontend/learn-play-shine-96 push origin main`

---

## Session 2026-07-03 — LLM provider chain rewrite

### Provider chain (`agents/llm_client.py`)

| Priority | Provider | Model | Cost | Limit |
|---|---|---|---|---|
| 1 | Cerebras | `llama-3.3-70b` | Free | 1M tokens/day |
| 2 | OpenRouter | `meta-llama/llama-3.3-70b-instruct:free` | Free | ~1000 req/day |
| 3 | GroqCloud | `llama-3.3-70b-versatile` | Free | 14 400 req/day, 30 RPM |
| 4 | DeepSeek | `deepseek-chat` (V3) | $0.14/M in · $0.28/M out | Paid, no hard cap |
| 5 | Gemini | `gemini-2.5-flash` | $0.30/M in · $2.50/M out | Emergency only |

All tiers use Llama 3.3 70B (free) for consistency with existing anchor cache. DeepSeek and Gemini are fallbacks only. All endpoints are OpenAI-compatible.

### Keys in `/root/kuasaprestij/.env` — STATUS: ✅ BOTH SET (2026-07-04)

```bash
CEREBRAS_API_KEY=SET
DEEPSEEK_API_KEY=SET
```

`systemctl restart kuasaprestij` run after keys added.

### Cooldown strategy (implemented 2026-07-04)
`llm_client.py` now tracks per-provider cooldowns (`_mark_cooling`, `_is_cooling`, `_wait_for_any`). On a 429: mark provider cooling for 65 s, immediately fail over to next. When ALL providers are cooling: sleep until earliest recovery. `_gemini_with_retry` `max_retries` reduced from 5 → 2 so failover is fast.

---

## Session 2026-07-04 — Telemetry, admin monitoring, Telegram alerts

### What was built

**`app/telemetry.py`** (new file)
- `TraceMiddleware` — outermost Starlette middleware; stamps every request with a `trace_id` (from `X-Trace-ID` header or generated), echoes it in the response header, logs an `http` span with total wall-clock duration.
- `log_span(trace_id, node, label, duration_ms, status, provider)` — fire-and-forget span write to `agent_traces` table via daemon thread. Never blocks the main pipeline.

**`app/main.py`** — new additions
- `_timed_node(trace_id, node_func, state)` — wraps every LangGraph node call, emits a telemetry span with the node name, topic, and duration.
- `TraceMiddleware` added as outermost middleware (runs first).
- `GET /admin/monitor` — live pipeline health: p50/p95 latency per node (last 24 h), error counts, LLM provider distribution.
- `GET /admin/insights?days=7` — returns full insights dict from `app/insights.py`.
- `POST /admin/digest?days=7` — sends formatted Markdown digest to Telegram admin chat.
- `POST /webhook/telegram` — receives inbound Telegram commands (for future bot commands).
- `_daily_digest_loop()` + `@app.on_event("startup")` scheduler — sends digest at 08:00 MYT every day automatically.

**`app/insights.py`** (new file)
- `run_insights(supabase, days)` — aggregates from `event_logs`, `dskp_mastery`, `topic_anchors`, `agent_traces`: worst topics, language barrier alert topics, stuck students, seed gaps, provider health.
- `format_digest(insights)` — formats into Telegram Markdown.

**`agents/telegram_agent.py`** (new file)
- `send_telegram(chat_id, text)` — outbound Telegram message via Bot API. Never raises.
- `alert_admin(text)` — sends to `TELEGRAM_ADMIN_CHAT_ID`.

**`agents/whatsapp_agent.py`** (new file, kept as legacy fallback)
- Twilio-based WhatsApp sender; only activates if `TWILIO_ACCOUNT_SID` is set.

**`agents/orchestrator.py`** — question schema improvements
- Added `stimulus` field (1-2 sentence scenario/diagram description) separate from `question` stem — matches SPM Paper 1 format where stimulus precedes the question.
- Added explicit `question_type: "mcq"` field in anchor question schema prompt.

**`schema/agent_traces.sql`** (new file)
- Creates `agent_traces` table with indexes on `trace_id`, `created_at DESC`, `node + created_at DESC`.

### Environment variables to add to `.env`
```bash
TELEGRAM_BOT_TOKEN=        # from @BotFather
TELEGRAM_ADMIN_CHAT_ID=    # from getUpdates after starting chat with bot
```

### Manual steps still required
1. **Apply `schema/agent_traces.sql`** in Supabase SQL Editor — telemetry writes silently fail until this is done.
2. **Set `TELEGRAM_BOT_TOKEN` + `TELEGRAM_ADMIN_CHAT_ID`** in `.env` — daily digest and admin alerts silent until then.
3. **Register Telegram webhook** (one-time, once token is set):
   ```
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://api.kuasa.tech:8443/webhook/telegram"
   ```

---

## Session 2026-07-04 (cont.) — Pydantic schema validation layer

### What was built

**`schemas/assessment.py`** — complete rewrite (was 6-line stub, now 130 lines)

Seven Pydantic v2 models matching every LLM JSON response shape in the pipeline:

| Model | Used by | Validates |
|---|---|---|
| `MCQQuestion` | `studio_node`, `generator_node` mcq/listening | question, options, correct_answer (cross-field: correct_answer∈options, case-auto-fixed) |
| `ShortAnswerQuestion` | `generator_node` short_answer | question, sub_parts, key_concepts, max_marks |
| `EssayQuestion` | `generator_node` essay | question, model_answer, marking_rubric_bands, max_marks |
| `AnchorOutput` | `studio_node` | mnemonic_lyrics, b_roll_search_query, anchor_question (typed as MCQQuestion) |
| `MCQFeedback` | `evaluator_node` MCQ/listening | student_feedback, teacher_insight |
| `OpenAnswerEval` | `evaluator_node` short_answer | marks_awarded, partial_credit, concepts_addressed/missing |
| `EssayEval` | `evaluator_node` essay | marks_awarded, partial_credit, band_awarded, strengths, improvements |

`parse_llm_json(raw, schema, context)` helper:
- Layer 1: `isinstance(data, list)` unwrap (TAR Cycle 1 guard — unchanged)
- Layer 2: `schema.model_validate(data)` — catches type errors, missing required fields, cross-field anomalies
- On `ValidationError`: logs field paths to stdout, emits `agent_traces` span with `status="validation_error"`, falls through with raw dict (existing `.get(key, default)` guards still handle gaps)

**`agents/orchestrator.py`** — 5 parse blocks updated
- Added import of all 7 schemas + `parse_llm_json`
- Replaced `json.loads(res.text)` + `isinstance` guard at all 5 LLM consumption points:
  - `studio_node` → `parse_llm_json(res.text, AnchorOutput, "studio_node")`
  - `generator_node` → `parse_llm_json(res.text, _GEN_SCHEMAS[q_type], f"generator_node:{q_type}")`
  - `evaluator_node` MCQ → `parse_llm_json(res.text, MCQFeedback, "evaluator_node:mcq_feedback")`
  - `evaluator_node` short_answer → `parse_llm_json(res.text, OpenAnswerEval, "evaluator_node:short_answer")`
  - `evaluator_node` essay → `parse_llm_json(res.text, EssayEval, "evaluator_node:essay")`

### Why this matters for the Scopus paper
- Extends TAR Cycle 1 (LLM JSON Validation Anomaly, §5.1) from a list-unwrap guard to a full schema validation layer
- `validation_error` spans in `agent_traces` become quantitative telemetry evidence for schema anomaly frequency — exactly the kind of zero-respondent evidence the paper claims
- The `correct_answer∉options` cross-field validator catches a silent data quality bug (LLM generates an answer that doesn't exactly match any option) that was invisible before

### Confirmed working
All 5 unit tests pass: normal MCQ, list-wrapped output, case-mismatch auto-fix, missing required field fallthrough, nested feedback schema.

---

## Session 2026-07-04 (cont.) — Frontend gap fixes

### Read-only audit findings
Full frontend-backend alignment audit across 10 areas. 8 were ✅ aligned. Two gaps found:

### Gap 1 fixed: Admin monitoring endpoints
**Files:** `src/routes/admin.tsx`
- Added "Platform" 5th tab with `MonitorPanel` component
- Calls `GET /admin/monitor` (HTTP latency cards + agent node breakdown table + slowest spans)
- Calls `GET /admin/insights?days=7` (today's activity, top problem topics, stuck students)
- "Send Telegram Digest" button calls `POST /admin/digest`
- Error state shown if `agent_traces` table not yet applied (with instructions)
- Added `BASE_URL` import from `api.ts`; added `Activity`, `Send`, `Zap`, `BookOpen`, `UserX` icons

### Gap 2 fixed: Mastery map
**Files:** `src/routes/dashboard.tsx`
- `fetchMasteryMap(studentId)` now called in the parallel load on mount
- New "Mastery Map" section between stats and alerts/leaderboard
- Per-subject groups, per-topic progress bars colour-coded: emerald = complete, indigo = ≥50%, amber = started, grey = unstarted
- Overall progress badge (% complete)
- Bilingual (EN/BM) labels
- Gracefully hidden if no mastery data yet

### TypeScript
Zero errors in either changed file. Two pre-existing errors in `auth.tsx` (unrelated, pre-date this session).

---

## Session 2026-07-04 (cont.) — Backend restart + frontend push

- Backend restarted to load Pydantic schema validation changes. Startup: clean, no errors. Running on port 8001.
- `agent_traces` table confirmed applied in Supabase by user → `/admin/monitor` now returns real telemetry.
- Committed and pushed frontend (7 files, 948 insertions): admin Platform tab, mastery map, SPM exam mode toggle, ExamPaperCard, ExamPrefsSheet, StudentSettingsSheet exam prefs, useStudentPrefs exam fields.
- Secondary clone (`/root/learn-play-shine-96`) pulled to match — local stash changes were duplicates of what was already committed to primary. Both clones now at `01436dd`.

---

## Planned / Next Up (updated 2026-07-04 session 2)

- [ ] Add `TELEGRAM_BOT_TOKEN` + `TELEGRAM_ADMIN_CHAT_ID` to `.env`; register webhook
- [ ] Apply `schema/assignments_rls.sql` in Supabase SQL Editor
- [ ] DSKP: Add `form_level` column to `topic_anchors` + update unique constraint (see DB Schema Findings above)
- [ ] DSKP: English F4/F5 compulsory DSKP PDF — confirm ingested and seeded
- [x] Latency #3: Already done — code at index.tsx line 802 already fires advanceToNext() before the setTimeout, loading next Q during the overlay. No change needed.
- [x] Latency #4: Fixed — `authLoading` guard added to loadSession and submitToBackend (commit 1fc7615). Auth-race UUID contamination eliminated.
- [ ] JWT auth on API endpoints (C1)
- [ ] Gate `/docs` and `/openapi.json` (M5)
- [x] Apply `schema/agent_traces.sql` in Supabase SQL Editor — DONE
- [x] Push frontend to GitHub — DONE (commit 01436dd)
