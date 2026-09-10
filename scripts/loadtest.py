import asyncio, time, statistics, sys
import httpx

BASE = "http://127.0.0.1:8001"

async def worker(client, path, deadline, lats, errs):
    while time.monotonic() < deadline:
        t0 = time.monotonic()
        try:
            r = await client.get(BASE + path, timeout=30)
            dt = time.monotonic() - t0
            if r.status_code == 200:
                lats.append(dt)
            else:
                errs.append(r.status_code)
        except Exception as e:
            errs.append(repr(e)[:100])

async def run_level(path, conc, dur):
    lats, errs = [], []
    deadline = time.monotonic() + dur
    limits = httpx.Limits(max_connections=conc+10, max_keepalive_connections=conc+10)
    async with httpx.AsyncClient(limits=limits, trust_env=False) as client:
        await asyncio.gather(*[worker(client, path, deadline, lats, errs) for _ in range(conc)])
    n = len(lats)
    thr = n / dur
    def pct(p):
        if not lats: return float('nan')
        s = sorted(lats); return s[min(len(s)-1, int(len(s)*p))]
    import collections
    if errs: print("   sample errs:", collections.Counter(errs).most_common(2))
    print(f"  conc={conc:>3}  ok={n:>5}  err={len(errs):>4}  thr={thr:6.1f} req/s  "
          f"p50={pct(.5)*1000:7.1f}ms  p95={pct(.95)*1000:8.1f}ms  p99={pct(.99)*1000:8.1f}ms")
    return thr, pct(.95)

async def main():
    path = sys.argv[1]
    dur = float(sys.argv[2]) if len(sys.argv) > 2 else 5
    levels = [int(x) for x in sys.argv[3].split(",")] if len(sys.argv) > 3 else [1,5,10,20,40]
    print(f"# LOAD TEST {path}  (each level {dur}s)")
    for c in levels:
        await run_level(path, c, dur)

asyncio.run(main())
