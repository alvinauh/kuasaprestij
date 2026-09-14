#!/usr/bin/env python3
"""
Thin reverse proxy: strips /rest/v1 prefix and forwards to PostgREST.
supabase-py calls {SUPABASE_URL}/rest/v1/... — we forward to {POSTGREST_URL}/...
"""
import os
import httpx
from fastapi import FastAPI, Request, Response

app = FastAPI()
POSTGREST_URL = os.environ["POSTGREST_URL"].rstrip("/")
SKIP_HEADERS = {"host", "content-length", "transfer-encoding"}
# When PostgREST is configured for a non-public schema, rewrite profile headers
# so supabase-py (which always sends Content-Profile: public) hits the right schema.
PGRST_SCHEMA = os.environ.get("PGRST_SCHEMA", "")


@app.api_route(
    "/rest/v1/{path:path}",
    methods=["GET", "POST", "PATCH", "DELETE", "PUT", "HEAD", "OPTIONS"],
)
async def proxy_postgrest(path: str, request: Request):
    url = f"{POSTGREST_URL}/{path}"
    params = dict(request.query_params)
    headers = {k: v for k, v in request.headers.items() if k.lower() not in SKIP_HEADERS}
    if PGRST_SCHEMA:
        for profile_header in ("content-profile", "accept-profile"):
            if profile_header in headers:
                headers[profile_header] = PGRST_SCHEMA
    body = await request.body()

    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.request(
            method=request.method,
            url=url,
            params=params,
            headers=headers,
            content=body,
        )

    resp_headers = {
        k: v for k, v in r.headers.items()
        if k.lower() not in {"transfer-encoding", "content-encoding", "content-length"}
    }
    return Response(content=r.content, status_code=r.status_code, headers=resp_headers)


@app.get("/health")
def health():
    return {"ok": True}
