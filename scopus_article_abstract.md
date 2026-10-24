# Orchestrating Robust Agentic Formative Assessment Platforms for National Syllabi: A Technical Action Research Approach

## Abstract

Traditional educational platforms frequently rely on static item-response banks that lack the granular diagnostic capacity required for country-specific secondary curricula, such as the Malaysian Kurikulum Standard Sekolah Menengah (KSSM). While generative artificial intelligence (AI) offers a pathway toward dynamic, adaptive formative assessment, deploying autonomous multi-agent pipelines into live software environments introduces unique architectural and data-engineering challenges. A further challenge, rooted in adolescent educational psychology, is that AI-driven Socratic dialogue—an increasingly proposed intervention for wrong answers—assumes metacognitive self-awareness that secondary school students frequently do not yet possess (Flavell, 1979; VanLehn, 2011). This study applies Technical Action Research (TAR) to design, implement, and validate KuasaPrestij, an agentic adaptive assessment engine grounded in KSSM standards using LangGraph. Rather than pursuing autonomous Socratic AI dialogue, the system implements an AI-mediated error triage layer: when a student's repeated errors of the same category exceed a configurable threshold, the system generates a targeted teacher intervention script and routes the student for direct human attention. All evidence is drawn from system telemetry, state machine execution logs, and database transaction states across six iterative engineering cycles. The findings demonstrate how structural constraints—including TOCTOU mastery race conditions, LLM JSON validation anomalies, and API rate-limiting thresholds—can be systematically mitigated, and how a teacher-in-the-loop diagnostic architecture positions AI as a precision triage instrument rather than an autonomous pedagogical agent. This study provides a reproducible, zero-respondent engineering protocol for localising global large language models to complex national curricula with enterprise-grade stability.

---

## Keywords

- Adaptive formative assessment
- Multi-agent systems
- LangGraph
- Generative AI
- KSSM (Kurikulum Standard Sekolah Menengah)
- Technical Action Research
- Large Language Models
- Educational technology
- Teacher-in-the-loop
- Error triage
- Dialogic assessment
- Metacognition

---

## System Under Study

**KuasaPrestij** — an agentic adaptive assessment engine for Malaysian secondary school students (KSSM curriculum).

| Component | Technology |
|---|---|
| Orchestration framework | LangGraph |
| LLM | Llama 3.3 70B (OpenRouter primary → GroqCloud fallback) |
| Backend | FastAPI |
| Vector store | Supabase (pgvector) |
| Embeddings | paraphrase-multilingual-mpnet-base-v2 (local, 768-dim) |

## Agent Pipeline

```
retriever_node → studio_node (Anchor Mode) → evaluator_node → mastery_updater_node
                        ↓ (Adaptive Mode)
                 generator_node → evaluator_node → mastery_updater_node
```

---

## Evidence Sources (System Telemetry)

| Source | Description |
|---|---|
| `logs/errors.jsonl` | LLM JSON validation anomalies and API errors |
| `logs/question_bank_seed.log` | Anchor question generation runs |
| `logs/seed_anchors_auto.log` | Automated seeding telemetry |
| Supabase `event_logs` | Per-answer attempt records with error_category, root_cause, intervention |
| Supabase `dskp_mastery` | Mastery score state transitions per student per topic |

---

## Key Engineering Findings (TAR Cycles)

1. **TOCTOU mastery race condition** — concurrent answer submissions could read stale mastery scores; mitigated by atomic upserts with `on_conflict` keys.
2. **LLM JSON validation anomalies** — Gemini occasionally returns a list wrapping an object; mitigated by `isinstance(data, list)` defensive parsing guard.
3. **API rate-limiting thresholds** — Gemini quota exhaustion causes `studio_node` to return `{}`; mitigated by caller-side `if not state.get('draft')` checks and fallback caching via `topic_anchors`.
4. **`student_id` integrity** — `"undefined"` student IDs remapped to test UUID `00000000-0000-0000-0000-000000000001` to prevent orphaned records.
5. **AgentState completeness** — all TypedDict fields must be populated on construction; missing keys cause runtime errors in LangGraph transitions.

---

## Methodology: Technical Action Research (TAR)

TAR cycles followed:
1. **Diagnose** — instrument logs and database states to surface failure modes
2. **Plan** — design architectural mitigation
3. **Act** — implement and deploy change
4. **Evaluate** — compare telemetry before and after; confirm stable state machine execution

Zero human respondents; evaluation based entirely on system telemetry, execution logs, and database transaction states.

---

## Notes for Full Paper

- Include log excerpts from `logs/errors.jsonl` as evidence of LLM anomaly patterns
- Include mastery score distribution from `dskp_mastery` table as quantitative outcome
- Reference commit history as audit trail of TAR cycles
- Cite LangGraph documentation for state machine semantics
- Cite KSSM curriculum source for localization context
