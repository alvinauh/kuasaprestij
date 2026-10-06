# Session handoff — 2026-10-06

Saved in case the connection drops. Full detail is in WORKSPACE.md (top entries dated 2026-10-06).

## Done and live

| Change | VPS (api.kuasa.tech:8443) | GCP Cloud Run |
|---|---|---|
| Live Arena game-score RLS (students see scores) | ✅ (DB) | ✅ (DB) |
| Join page retries Supabase sign-in on 429 | ✅ | ✅ |
| API runs 2 workers; digest + round sweeper only in the leader (flock) | ✅ restarted 10:46 UTC | n/a |
| Bearer auth on `/classroom_live/*` (except `/expire`) and `/quiz/{id}` | ✅ | ✅ |
| Cloud SQL mirror: Live Arena, personalization, `google_tokens` tables | n/a | ✅ migrate job run |
| GCP frontend reload loop fixed (`DISABLE_HMR=1`, Vite hmr/ws off) | n/a (VPS keeps HMR) | ✅ |
| Never serve an MCQ without 4 real answer texts (`_ensure_usable_draft`) | ✅ restarted 11:20 UTC | ✅ |
| Frontend no longer invents "A/B/C/D" option text | ✅ (HMR) | ✅ |
| Insights: "Questions X got wrong" dropdown per student card | ✅ frontend; endpoint live since 10:46 | ✅ |
| Skip non-JSON LLM replies; reject template/duplicate/wrong-type questions; prefetch bank filtered by type | ✅ restarted 11:20 UTC | ✅ rev 00065 |
| DeepSeek before OpenRouter for ALL LLM calls (+ "Respond with JSON only." when a JSON prompt lacks "json") | ⚠️ needs API restart | ✅ rev 00066 |

## Pending: user action

1. **Restart the VPS API once more** so DeepSeek-before-OpenRouter (a8042cc, edited 11:21, after the 11:20 restart) applies there:
   `! systemctl restart kuasaprestij`
2. Optional: rotate or move the Supabase service-role key that sits as a plain env var on the `kuasaprestij-migrate-moeagentic` Cloud Run job.

## Decisions made

- Live Arena player cap: **20** (stays under Supabase Auth's ~30 sign-in burst per IP). No Auth rate-limit change.
- **Mistral not added** to GCP (open-mistral-7b gave 4 identical options in a test).
- **DeepSeek first, before OpenRouter, for all calls** (more paid usage, much faster; OpenRouter's free nemotron model returns ~90 s of reasoning text and never JSON).

## Open items (not started)

- AI personalization tier 3 (learn from teacher edits/accept/reject), slides grounded in teacher materials, image uploads (Gemini key 402).
- At 40 players, game scores take ~12 s to reach other phones (Realtime RLS fan-out). Fine at the 20 cap (~1 s).
- Cloud SQL still lacks `coin_transactions` and `llm_call_logs` (daily-streak coins and LLM call logging fail on GCP).
- Cloud Run frontend still runs `vite dev`; the real fix is the production build (frontend Dockerfile "TIER 2").
- Teacher dashboard top bar overflows at 390 px (pre-existing).

## Commits (backend, this session)

09908c2 2-worker leader lock · 15671d8 mirror tables · 9bd60fa arena/quiz auth · 53a133c per-instance lock · 2341c9c google_tokens mirror · e10f870 MCQ option guard · 777add0 wrong-answers endpoint · e62bdf2 GCP generation fix · a8042cc DeepSeek before OpenRouter.
Monorepo: 9501eab, 0ef99b7, plus deploy commits from `deploy/sync_and_deploy.sh`.

## How to verify quickly

- VPS: `curl -s localhost:8001/health`; `/quiz/<id>` without a token → 401.
- GCP: `https://kuasaprestij-api-746801891568.asia-southeast1.run.app/health` → `db_reachable: true`.
- Question generation probe: `scratchpad/opts.py <API_URL>` (8 topics, all should return 4 real options).
