"""
Supabase client factory for the API process.

supabase-py's default postgrest transport is one HTTP/2 connection per client.
Every thread multiplexes over it, and once Supabase's edge recycles that
connection (GOAWAY after ~1k streams) every request still in flight fails with
`RemoteProtocolError: Server disconnected`. Under a 20-player Live Arena that was
126 HTTP 500s (LOAD_TEST_FINDINGS.md). A pooled HTTP/1.1 client spreads requests
over real connections: a 3,000-query run at concurrency 32 went from 122 failures
to 0, with p95 613ms -> 253ms.

All modules share one connection pool; each still gets its own Client object, so
auth state is never shared between them.
"""
import os

import httpx
from supabase import Client, ClientOptions, create_client

_http = httpx.Client(
    http2=False,
    follow_redirects=True,
    timeout=httpx.Timeout(120, connect=10),  # matches supabase-py's postgrest default
    limits=httpx.Limits(max_connections=64, max_keepalive_connections=32, keepalive_expiry=30),
)


def make_supabase_client() -> Client:
    return create_client(
        os.getenv("SUPABASE_URL"),
        os.getenv("SUPABASE_KEY"),
        options=ClientOptions(httpx_client=_http),
    )
