#!/usr/bin/env python3
"""
Thin reverse proxy:
  /rest/v1/* → PostgREST (Cloud SQL)
  /auth/v1/* → real Supabase Auth (opavfcpsxnntjylipbwl.supabase.co)
supabase-py calls both paths; we route each to the right backend.
"""
import os
import httpx
from fastapi import FastAPI, Request, Response

app = FastAPI()
POSTGREST_URL = os.environ["POSTGREST_URL"].rstrip("/")
SUPABASE_AUTH_URL = os.environ.get("SUPABASE_AUTH_URL", "https://opavfcpsxnntjylipbwl.supabase.co").rstrip("/")
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


@app.api_route(
    "/auth/v1/{path:path}",
    methods=["GET", "POST", "PATCH", "DELETE", "PUT", "HEAD", "OPTIONS"],
)
async def proxy_auth(path: str, request: Request):
    """Forward Supabase Auth calls to real Supabase Auth service."""
    url = f"{SUPABASE_AUTH_URL}/auth/v1/{path}"
    params = dict(request.query_params)
    headers = {k: v for k, v in request.headers.items() if k.lower() not in SKIP_HEADERS}
    body = await request.body()
    async with httpx.AsyncClient(timeout=30.0) as client:
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
