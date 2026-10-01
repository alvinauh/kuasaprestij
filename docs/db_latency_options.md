# DB Latency Reduction Options

**Context:** Supabase REST round-trip from VPS = ~250ms (US-hosted project, SE Asia VPS).
Hot path: 6 DB calls in start_session, 3 in submit_answer.

## Measured impact by path

| Path | LLM time | DB overhead | DB as % of total |
|---|---|---|---|
| Cache hit (prefetch/bank) | 0ms | ~500ms sequential | ~90% of response |
| LLM question gen | 3–10s | ~750ms | ~10–20% |
| Submit answer (eval) | 2–5s | ~450ms | ~10–15% |

## Options (ordered by effort)

### Option A — In-memory LRU cache (1–2 hours, low risk)
Cache `topic_anchors` reads in a Python dict with TTL. That table is read-heavy,
seeded offline, and never changes mid-session. Saves 1–2 DB calls per request
with zero infrastructure change. Best bang-for-buck for cache-hit paths.

### Option B — Direct Postgres connection (half a day, medium risk)
Supabase exposes direct Postgres on port 5432 (or pooler 6543).
Switch from supabase-py REST to asyncpg. Cuts per-query time from ~250ms to
~120ms (still network-bound but bypasses PostgREST/HTTPS overhead).
No data migration needed, keep Supabase auth + Storage.

### Option C — Local Postgres for hot tables only (1–2 days, higher risk)
Run local Postgres on VPS for: quiz_sessions, topic_anchors, dskp_mastery, event_logs.
Keep Supabase only for auth and Storage. DB calls drop to ~2ms.
Risk: need to replicate auth UID checks at application level (Supabase RLS lost).

## Recommendation
Start with Option A. topic_anchors is read on every request and never changes
mid-session — LRU cache with 5-min TTL captures most of the benefit immediately.
