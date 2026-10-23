# SLM Training Data Plan — using AI personalization to train a small language model

> Status: **not started** (written 2026-10-08). Build later. Related: AI personalization (2026-10-05,
> `agents/teacher_memory.py`, `schema/teacher_personalization.sql`), teacher-edited copies
> (`schema/teacher_edited_copies.sql`).

## TL;DR
Personalization today is **retrieval + memory**: profile facts and material chunks are fed into the
model at request time. That doesn't train a small model, because it isn't "input → good output" data.
The training signal is the **teacher's reaction** to what the AI generated: edits, accepts and rejects.
Plan: log every generation together with what the teacher did to it, starting now. Later, use that
dataset to fine-tune or distill a ~1–3B model for routine KSSM content.

## What exists now
| Source | What it holds | Training value |
|---|---|---|
| `teacher_profile` (subjects, form_levels, language, style, facts) | inputs for conditioning | Medium: teaches the model to adapt to context, but only if logged with each example |
| `teacher_materials` / `teacher_material_chunks` | private uploaded notes, embedded | Low/risky: domain text, but privacy + copyright issues |
| `quizzes.source_quiz_id` / `generated_lessons.source_lesson_id` → teacher's own copy | AI original ↔ teacher-edited version | **High**: preference pairs and fine-tuning pairs already accumulating |
| `event_logs` | student answers, error_category, root_cause | Medium: diagnostic/feedback task data |

## How it helps an SLM
1. **Fine-tuning (SFT) pairs:** (full prompt incl. profile + retrieved chunks, teacher's final version).
2. **Preference pairs (DPO):** teacher's version is *chosen*, AI draft is *rejected*. Accept-unchanged = positive; delete/regenerate = negative.
3. **Conditioning:** include profile fields (subject, form, language, style) in every logged prompt. The SLM learns the general skill of following context, and each teacher's specifics stay in retrieval. **Never bake per-teacher facts into the model's weights.**
4. **Distillation:** big models (DeepSeek/Mistral/Groq/Gemini) generate now. Accepted outputs become training data for a small model that takes over routine generation (anchor questions, object lessons, MCQs) and cuts paid calls.

## To build (tier 3 feedback logging)
### 1. Table `generation_feedback` (draft)
```sql
create table if not exists public.generation_feedback (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references public.profiles(id) on delete set null,
  kind text not null,                 -- quiz | lesson | question | object_lesson | chat_reply
  subject text, form_level int, language text, topic text,
  prompt jsonb not null,              -- exact messages sent to the LLM (system + user), incl. profile + material blocks
  provider text, model text,          -- which LLM in the chain produced it
  output jsonb not null,              -- raw AI output
  final jsonb,                        -- teacher's edited version (null if untouched)
  verdict text,                       -- accepted | edited | rejected | regenerated | ignored
  source_id uuid,                     -- quizzes.id / generated_lessons.id of the AI original
  edited_id uuid,                     -- the teacher's copy
  training_consent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists idx_genfb_kind_verdict on public.generation_feedback (kind, verdict);
alter table public.generation_feedback enable row level security;  -- service key only
```
Apply via the Supabase Management API (MCP is read-only). Also add to the Cloud SQL mirror schema.

### 2. Hooks
- `agents/llm_client.py`: return/record the exact prompt + provider + model with each generation (or a `generation_id` callers can attach).
- Quiz/lesson generation paths: insert a `generation_feedback` row with `verdict = null`.
- Command Centre editor save (creates the teacher copy): set `final`, `edited_id`, `verdict = 'edited'`.
- Assign/publish without edits → `accepted`; delete/regenerate → `rejected` / `regenerated`.
- AI Controller confirm/cancel on proposals → accepted / rejected.

### 3. Consent
- Teacher opt-in toggle in the "Personalise" drawer (`training_consent`). Default off.
- Never export `teacher_material_chunks` content into training sets without consent; strip names/student identifiers.

### 4. Admin
- Add a dataset counter to the AI Personalization admin tab: rows by kind × verdict, consented only.
- Export script: `scripts/export_training_set.py` → JSONL (SFT format + DPO chosen/rejected).

## Before training (later)
- **Volume:** need roughly thousands of consented edited/accepted pairs per task before a fine-tune does better than a strong model + RAG. Check the current count with
  `select count(*) from quizzes where source_quiz_id is not null;`
- **Provider terms:** some providers restrict using their outputs to train other models. Check each provider in the chain, and filter by `provider` on export.
- **Copyright:** uploaded materials are often textbook extracts. Exclude them from training data and use them only for retrieval.
- **Candidate base models:** small multilingual open models (~1–3B) with good BM support; LoRA fine-tune, then evaluate against the current chain on a held-out set of teacher-accepted items.
- **Eval:** compare against held-out teacher-accepted items. Measure the rate at which teachers accept without editing, plus JSON-schema pass rate via `parse_llm_json`.
