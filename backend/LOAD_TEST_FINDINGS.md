# Load Test Findings & Scaling Plan

**Date:** 2026-07-25
**Target:** live backend, `uvicorn app.main:app` on `127.0.0.1:8001` (systemd `kuasaprestij.service`, single worker)
**Box:** 4 vCPU, 7.6 GB RAM (~3 GB free — shared with thesissifu + Vite frontend)
**Tool:** custom asyncio/httpx tester — `scripts/loadtest.py`

## Scope / honesty note
Tested **read-only and cached paths only**. Did **not** load `/start_session` fresh generation, to avoid
burning the Cerebras daily token budget and disrupting live students. So these numbers are the
**request-plumbing ceiling**; the LLM-generation ceiling sits *below* them.

## How to reproduce
```bash
# usage: python3 scripts/loadtest.py <path> <seconds-per-level> <comma,sep,concurrency>
python3 scripts/loadtest.py /openapi.json 4 "1,10,50,100"     # raw framework (no DB)
python3 scripts/loadtest.py /teacher_insights 4 "1,10,50,100" # in-memory cache hit
python3 scripts/loadtest.py /subjects 5 "1,4,8,16,32"         # DB-backed read
```

## Measured results

| Path | Exercises | Peak throughput | Behaviour under load |
|---|---|---|---|
| `/openapi.json` | Pure framework, no DB | **~330 req/s** @ conc 10 | Degrades: 141 req/s @ conc 100, p99 **3.5s** |
| `/teacher_insights` | In-memory cache hit | ~190–250 req/s | Same one-core degradation |
| `/subjects` | **DB-backed read** (~0.57s each) | **~5–6 req/s, FLAT** | Latency 235ms → **7.2s** from conc 1→32 |
| Direct Supabase probe | Shared client, concurrent | ~5 req/s, single call ~310ms | Concurrency → **"Server disconnected"** |

Raw detail (`/subjects`):
```
conc=  1  thr= 4.0 req/s  p50= 235ms
conc=  4  thr= 4.8 req/s  p50= 904ms
conc=  8  thr= 5.0 req/s  p50=1855ms
conc= 16  thr= 6.4 req/s  p50=4242ms
conc= 32  thr= 6.6 req/s  p50=7175ms   <- throughput flat, latency linear = queue saturation
```

## Verdict — two hard walls

**Wall 1: one worker = one CPU core.** No `--workers` flag. CPU-bound work (JSON serialization, and
critically the **local embedding model**) serializes. Framework tops out ~330 req/s for trivial payloads;
latency balloons past ~10–50 concurrent.

**Wall 2 (the real one): a single shared Supabase client.** Every DB-touching request funnels through
**module-level singleton `create_client()` instances** (6 of them across `agents/*.py` + `app/`) — each
HTTP/2 over a *single* TCP connection. That is why the DB path is pinned at **~5–6 req/s regardless of
concurrency**, and why the concurrent probe *disconnected the connection*. Not Supabase's capacity — one
multiplexed pipe.

## Translating to students
Binding constraint ≈ **5–6 DB requests/second sustained**.
- An actively-practising student ≈ 2–4 backend calls/min (~0.05 req/s).
- Perfectly smooth traffic ⇒ **~75–120 concurrently-active students**.
- Real traffic is bursty: a synchronized burst of **~20–30 requests** (a class all clicking "start"
  together) already gives 4–7s latency ⇒ the "infinite loading" timeout failure mode.
- **Honest capacity today:** one class (~30–40) at human pace = fine. Two+ classes at once, or any
  synchronized burst = breaks. And this is *before* the LLM path, which is lower still (Cerebras 1M
  tokens/day ≈ a few hundred fresh generations/day; each call 2–10s occupying a thread).

## Fix plan (evidence-ranked, cheapest first)

1. **Cache hot reads (biggest win / lowest risk).** `/teacher_insights` is cached → 4.5ms and scales;
   `/subjects` (0.57s) and `/leaderboard` (1.0s) are not. Add the same TTL cache → removes them from the
   5-req/s DB wall.
2. **Fix the Supabase client concurrency.** Give its httpx transport a real connection pool
   (`Limits(max_connections=20)`) and/or one client per worker instead of a shared HTTP/2 singleton.
   Directly lifts Wall 2 — highest-leverage code change.
3. **Run 2–3 uvicorn workers** (`gunicorn -w 3 -k uvicorn.workers.UvicornWorker`). ~3× loops + thread
   pools + separate DB clients. **Caveat:** each worker reloads the embedding model (~0.5–1 GB); only
   ~3 GB free on a shared box ⇒ start with 2 workers, or make the embedder lazy/shared.
4. **Get embeddings off the request path.** Anchor syllabus text is static — precompute those vectors
   once. Removes the per-request CPU spike that fights Wall 1.
5. **Bump the asyncio thread pool** to 32 (`set_default_executor`) — only helps once #2 is done.
6. **Supabase-side:** index hot queries (`event_logs` by `student_id/topic/created_at`); use the
   connection pooler. 0.57–1.0s read times hint at unindexed scans.
7. **LLM path:** more keys / paid tier + keep the existing cooldown failover; pre-seed anchors so most
   traffic is cache-hit, not generation.

**Rough outcome:** #1 + #2 alone ≈ 5 req/s → a few tens of req/s (~4–8× safe student count).
Adding #3 + #4 puts a whole-school cohort within reach if they're mostly on cached anchor content.

## Next step (not yet done)
Implement low-risk set — **#1 (cache decorator on hot GETs), #2 (pooled Supabase client),
#3 (2-worker gunicorn), #5 (thread-pool bump)** — on a branch, then re-run this exact load test to
capture before/after numbers.
