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
| Cloud SQL mirror: coins, perks, skips, Google course links, LLM call log (last missing tables) | n/a | ✅ migrate job run 13:19 |
| GCP frontend reload loop fixed: Cloud Run serves the production build (rev 00052) | n/a (VPS keeps vite dev + HMR) | ✅ |
| Teacher dashboard top bar fits phones (320–390 px) | ✅ (HMR) | ✅ |
| Insights class picker + full class roster, no hidden flagged students | ✅ restarted 15:49 | ✅ |
| My Classrooms "View insights": radar keeps all topics, teachers see student names (RLS), page needs login | ✅ restarted 16:13 | ✅ |
| AI Tasks = cached questions + object lessons adapted by AI (hint, object lesson, simpler wording), assigned as a practice set | ✅ restarted 2026-10-07 00:53 | ✅ |
| Never serve an MCQ without 4 real answer texts (`_ensure_usable_draft`) | ✅ restarted 11:20 UTC | ✅ |
| Frontend no longer invents "A/B/C/D" option text | ✅ (HMR) | ✅ |
| Insights: "Questions X got wrong" dropdown per student card | ✅ frontend; endpoint live since 10:46 | ✅ |
| Skip non-JSON LLM replies; reject template/duplicate/wrong-type questions; prefetch bank filtered by type | ✅ restarted 11:20 UTC | ✅ rev 00065 |
| DeepSeek before OpenRouter for ALL LLM calls (+ "Respond with JSON only." when a JSON prompt lacks "json") | ✅ restarted 13:07 UTC | ✅ rev 00066 |

## Pending: user action

1. **Restart the VPS API** for AI Tasks from cached work (4aee7a6); the student insights fix is live since the 16:13 restart: `! systemctl restart kuasaprestij`
2. Optional: rotate or move the Supabase service-role key that sits as a plain env var on the `kuasaprestij-migrate-moeagentic` Cloud Run job.

## Decisions made

- Live Arena player cap: **20** (stays under Supabase Auth's ~30 sign-in burst per IP). No Auth rate-limit change.
- **Mistral not added** to GCP (open-mistral-7b gave 4 identical options in a test).
- **DeepSeek first, before OpenRouter, for all calls** (more paid usage, much faster; OpenRouter's free nemotron model returns ~90 s of reasoning text and never JSON).

## Open items (not started)

- Offline pack: offline questions accept 2–3 answer options (online needs 4); newer offline model. User: not for now.

- AI personalization tier 3 (learn from teacher edits/accept/reject), slides grounded in teacher materials, image uploads (Gemini key 402).
- At 40 players, game scores take ~12 s to reach other phones (Realtime RLS fan-out). Fine at the 20 cap (~1 s).

## Commits (backend, this session)

09908c2 2-worker leader lock · 15671d8 mirror tables · 9bd60fa arena/quiz auth · 53a133c per-instance lock · 2341c9c google_tokens mirror · e10f870 MCQ option guard · 777add0 wrong-answers endpoint · e62bdf2 GCP generation fix · a8042cc DeepSeek before OpenRouter.
Monorepo: 9501eab, 0ef99b7, plus deploy commits from `deploy/sync_and_deploy.sh`.

## How to verify quickly

- VPS: `curl -s localhost:8001/health`; `/quiz/<id>` without a token → 401.
- GCP: `https://kuasaprestij-api-746801891568.asia-southeast1.run.app/health` → `db_reachable: true`.
- Question generation probe: `scratchpad/opts.py <API_URL>` (8 topics, all should return 4 real options).
