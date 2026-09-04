-- Ground-layer telemetry table.
-- Each row is one timed span: an HTTP request, an agent node call, or an LLM call.
-- Run once: psql $DATABASE_URL < schema/agent_traces.sql
-- Or paste into Supabase SQL editor.

CREATE TABLE IF NOT EXISTS agent_traces (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    trace_id    UUID        NOT NULL,
    node        TEXT        NOT NULL,           -- "http", "retriever_node", "studio_node", …
    label       TEXT        DEFAULT '',          -- topic name or endpoint path
    duration_ms FLOAT,                           -- wall-clock milliseconds
    status      TEXT        DEFAULT 'ok',        -- "ok" | "error" | "client_error"
    provider    TEXT,                            -- LLM provider when node="llm_call"
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_traces_trace_id   ON agent_traces (trace_id);
CREATE INDEX IF NOT EXISTS idx_agent_traces_created_at ON agent_traces (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_traces_node       ON agent_traces (node, created_at DESC);
