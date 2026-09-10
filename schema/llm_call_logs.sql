-- Granular LLM call log — one row per provider attempt.
-- Run once: paste into Supabase SQL editor or psql < schema/llm_call_logs.sql

CREATE TABLE IF NOT EXISTS llm_call_logs (
    id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    trace_id         UUID,                        -- joins agent_traces.trace_id
    node             TEXT,                        -- agent node that triggered the call
    provider         TEXT        NOT NULL,        -- Gemini | Cerebras | GroqCloud | OpenRouter | DeepSeek
    model            TEXT        NOT NULL,
    role             TEXT        DEFAULT 'main',  -- main | light
    status           TEXT        DEFAULT 'ok',    -- ok | rate_limited | error | no_content
    duration_ms      FLOAT,
    tokens_in        INT,
    tokens_out       INT,
    prompt_preview   TEXT,                        -- first 500 chars of prompt
    response_preview TEXT,                        -- first 500 chars of response
    created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_llm_logs_trace_id   ON llm_call_logs (trace_id);
CREATE INDEX IF NOT EXISTS idx_llm_logs_created_at ON llm_call_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_logs_provider   ON llm_call_logs (provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_logs_status     ON llm_call_logs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_logs_node       ON llm_call_logs (node, created_at DESC);
