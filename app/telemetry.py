"""
Ground-layer telemetry for KuasaPrestij.

Every HTTP request gets a trace_id stamped by TraceMiddleware.
Every agent node and LLM call logs a timed span via log_span().
Every LLM provider attempt is logged via log_llm_call() → llm_call_logs table.
Spans are written to Supabase in daemon threads so they never block the pipeline.

Prerequisites:
  - schema/agent_traces.sql   — run once to create agent_traces
  - schema/llm_call_logs.sql  — run once to create llm_call_logs
"""

import time
import uuid
import threading
import contextvars
from typing import Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest

_supabase = None

# ContextVars propagate through asyncio.to_thread automatically.
# Set by set_llm_context() in _timed_node; read by log_llm_call() in llm_client.py.
_trace_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("trace_id", default="")
_node_var: contextvars.ContextVar[str] = contextvars.ContextVar("node", default="")


def set_llm_context(trace_id: str, node: str) -> None:
    """Call before asyncio.to_thread(node_func) so LLM logs inherit the trace."""
    _trace_id_var.set(trace_id)
    _node_var.set(node)


def get_llm_context() -> tuple[str, str]:
    return _trace_id_var.get(), _node_var.get()


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
    """Fire-and-forget span write to agent_traces."""
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


def _write_llm_log(row: dict):
    """Blocking Supabase insert — runs in a daemon thread. Never raises."""
    try:
        _get_supabase().table("llm_call_logs").insert(row).execute()
    except Exception:
        pass


def log_llm_call(
    provider: str,
    model: str,
    role: str,
    status: str,
    duration_ms: float,
    tokens_in: Optional[int] = None,
    tokens_out: Optional[int] = None,
    prompt: str = "",
    response: str = "",
) -> None:
    """
    Fire-and-forget write to llm_call_logs.
    Picks up trace_id and node from the ContextVars set by set_llm_context().
    """
    trace_id, node = get_llm_context()
    row: dict = {
        "provider": provider,
        "model": model,
        "role": role,
        "status": status,
        "duration_ms": round(duration_ms, 1),
        "prompt_preview": (prompt or "")[:500],
        "response_preview": (response or "")[:500],
    }
    if trace_id:
        row["trace_id"] = trace_id
    if node:
        row["node"] = node
    if tokens_in is not None:
        row["tokens_in"] = tokens_in
    if tokens_out is not None:
        row["tokens_out"] = tokens_out
    threading.Thread(target=_write_llm_log, args=(row,), daemon=True).start()


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
