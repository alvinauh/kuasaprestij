# CLAUDE.md — KuasaPrestij Intelligence Fabric

## Project Overview
An AI-powered adaptive assessment engine for Malaysian secondary school students (KSSM curriculum).
- **Backend:** FastAPI + LangGraph multi-agent pipeline (`app/main.py`)
- **LLM chain** (`agents/llm_client.py`): Cerebras `llama-3.3-70b` (primary, 1M free tokens/day) → OpenRouter `llama-3.3-70b-instruct:free` → GroqCloud `llama-3.3-70b-versatile` → DeepSeek `deepseek-chat` (paid fallback only)
- **Embeddings:** `sentence-transformers/paraphrase-multilingual-mpnet-base-v2` (local, 768-dim, BM/EN/ZH)
- **Database:** Supabase (Postgres + pgvector for semantic search)
- **Media:** Pexels API for B-Roll video; TTS via `edge-tts` (free, `ms-MY-YasminNeural` / `en-US-JennyNeural` / `zh-CN-XiaoxiaoNeural`)
- **Telemetry:** `app/telemetry.py` — `TraceMiddleware` + `log_span` → `agent_traces` table
- **Alerts:** `agents/telegram_agent.py` — daily digest + mastery-drop alerts via Telegram Bot API
- **Frontend:** React/TanStack Router app served from VPS via `npm run dev` (NOT Lovable.dev)
  - **Live path:** `/root/frontend/learn-play-shine-96` — edit here, Vite HMR picks up instantly
  - **Secondary clone:** `/root/learn-play-shine-96` — keep in sync after edits
- **Data Ingestion:** DSKP KSSM PDF syllabus files → Supabase vector embeddings

## Architecture — Agent Pipeline
```
retriever_node → studio_node (Anchor Mode) → evaluator_node → mastery_updater_node
                        ↓ (Adaptive Mode)
                 generator_node → evaluator_node → mastery_updater_node
```
- **Anchor Mode** (`is_adaptive=False`): serves cached questions from `topic_anchors` table; generates + caches if missing
- **Adaptive Mode** (`is_adaptive=True`): generates fresh question tailored to student's past mistakes
- Mastery score: ±0.1/±0.05 per answer; topic unlocks at score ≥0.9 OR 10 questions/day

## Key Supabase Tables
| Table | Purpose |
|---|---|
| `syllabus_embeddings` | pgvector store; queried via `match_syllabus_embeddings` RPC |
| `topic_anchors` | Cached anchor questions + mnemonic lyrics + audio/video URLs |
| `dskp_mastery` | Per-student mastery score per topic |
| `event_logs` | Every answer attempt with error_category, root_cause, intervention |
| `student_daily_report` | View used by `/teacher_insights` endpoint |

## API Endpoints
| Method | Path | Purpose |
|---|---|---|
| POST | `/start_session` | Phase 1: retrieve syllabus + serve or generate question |
| POST | `/submit_answer` | Phase 2: evaluate answer + update mastery |
| GET | `/teacher_insights` | Class mastery overview + recent error alerts |

## Environment Variables Required
```
SUPABASE_URL, SUPABASE_KEY
CEREBRAS_API_KEY                  # primary LLM — 1M free tokens/day
OPENROUTER_API_KEY                # fallback LLM
GROQ_API_KEY                      # fallback LLM
DEEPSEEK_API_KEY                  # paid fallback only (omit to skip)
PEXELS_API_KEY                    # B-Roll video for H5P blobs
TELEGRAM_BOT_TOKEN                # admin alerts + daily digest
TELEGRAM_ADMIN_CHAT_ID            # your Telegram chat ID
# GOOGLE_APPLICATION_CREDENTIALS # TTS disabled — not required unless re-enabling TTS
# GEMINI_API_KEY                  # not used — removed from stack
```

## Build & Run Commands
```bash
# Start the API server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Ingest DSKP PDFs into Supabase vector store
python ingest.py

# Ingest from Hugging Face dataset
python hf_ingest.py

# Check server health
curl http://localhost:8000/docs
```

## Autonomous Work Rules
1. **Read WORKSPACE.md first** — check current priorities and blocked items before starting any task.
2. **Update WORKSPACE.md after every task** — log what changed, what's next, and any blockers found.
3. **Commit atomically** — one logical change per commit; commit message explains the why, not the what.
4. **Never hardcode credentials** — all secrets via `.env` / environment variables only.
5. **Defensive JSON parsing** — LLMs occasionally return a list wrapping an object; always shield with `isinstance(data, list)` check. Full schema validation via `parse_llm_json` in `schemas/assessment.py`.
6. **UUID failsafe** — `student_id == "undefined"` must always be remapped to the test UUID `00000000-0000-0000-0000-000000000001` (pattern in `app/main.py`).
7. **Supabase upserts** — always specify `on_conflict` key to avoid duplicates.

## Known Gotchas
- `AgentState` fields must be fully populated on construction — missing keys cause TypedDict errors at runtime.
- `studio_node` returns `{}` (not an error) when ALL LLM providers are cooling; calling code must check `if not state.get('draft')`.
- Pexels fetch has a fallback URL (`cdn.kuasaprestij.tech/assets/fallback_video.mp4`); failure is non-fatal.
- TTS is disabled — `_generate_tts_audio` always returns `""`. H5P blobs skip the Audio interaction layer.
- `student_history` key is required in `AgentState` but not always set before `generator_node` — always set it in `retriever_node`.
- LLM provider cooldown: on 429, `llm_client.py` marks the provider cooling for 65s and immediately fails over. When ALL providers cool, it sleeps until earliest recovery — no call ever silently fails.
- `isinstance(data, list)` guard in `parse_llm_json` (`schemas/assessment.py`) unwraps list-wrapped JSON responses — LLMs occasionally return `[{...}]` instead of `{...}`.
- `agent_traces` table must be applied in Supabase SQL Editor (`schema/agent_traces.sql`) before telemetry writes succeed.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
