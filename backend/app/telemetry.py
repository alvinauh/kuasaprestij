"""
Ground-layer telemetry for KuasaPrestij.

Every HTTP request gets a trace_id stamped by TraceMiddleware.
Every agent node and LLM call logs a timed span via log_span().
Spans are written to the Supabase `agent_traces` table in a daemon thread
so they never block the main pipeline.

Prerequisites: run schema/agent_traces.sql once to create the table.
"""

import time
import uuid
import threading
from typing import Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest

_supabase = None


def _get_supabase():
    global _supabase
    if _supabase is None:
        from agents.orchestrator import supabase as _sb
        _supabase = _sb
    return _supabase


def _write_span(span: dict):
    """Blocking Supabase insert — runs in a daemon thread. Never raises."""
    try:
        _get_supabase().table("agent_traces").insert(span).execute()
    except Exception:
        pass


def log_span(
    trace_id: str,
    node: str,
    label: str = "",
    duration_ms: float = 0.0,
    status: str = "ok",
    provider: Optional[str] = None,
):
    """
    Fire-and-forget span write.
    Spawns a daemon thread — guaranteed not to raise or block the caller.
    """
    span: dict = {
        "trace_id": trace_id,
        "node": node,
        "label": (label or "")[:200],
        "duration_ms": round(duration_ms, 1),
        "status": status,
    }
    if provider:
        span["provider"] = provider
    threading.Thread(target=_write_span, args=(span,), daemon=True).start()


class TraceMiddleware(BaseHTTPMiddleware):
    """
    Outermost middleware — wraps every request with:
      - a trace_id (from X-Trace-ID header or freshly generated)
      - a logged HTTP span recording total wall-clock latency
      - X-Trace-ID echoed back in the response header
    """

    async def dispatch(self, request: StarletteRequest, call_next):
        trace_id = request.headers.get("X-Trace-ID") or str(uuid.uuid4())
        request.state.trace_id = trace_id

        start = time.perf_counter()
        status = "ok"
        response = None
        try:
            response = await call_next(request)
            if response.status_code >= 500:
                status = "error"
            elif response.status_code >= 400:
                status = "client_error"
            return response
        except Exception:
            status = "error"
            raise
        finally:
            duration_ms = (time.perf_counter() - start) * 1000
            log_span(trace_id, "http", request.url.path, duration_ms, status)
            if response is not None:
                try:
                    response.headers["X-Trace-ID"] = trace_id
                except Exception:
                    pass
