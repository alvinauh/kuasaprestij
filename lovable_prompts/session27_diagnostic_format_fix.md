# Session 27 — Diagnostic & Free Practice Format Fix

**Date:** 2026-07-06  
**Status:** In progress

---

## Problem Statement

The Diagnostic test and Free Practice are both largely static in format:

1. **Diagnostic forces MCQ for every subject** — `question_type="mcq"` is hardcoded in `start_diagnostic_session` regardless of subject. BM/BI structured comprehension, Add Maths short-answer with working, and Maths show-working are all collapsed into 4-option MCQ. This misrepresents real SPM format and produces a misleading diagnostic signal.

2. **Diagnostic topics are a fixed list of 10 strings** — The same one topic per subject every time. Students who retake the diagnostic see identical questions. No topic variety, no pool rotation.

3. **Free practice defaults to MCQ** — `anchor_question` is always MCQ. `short_answer_question` entries live in `question_bank` but are rarely surfaced because `studio_node` always serves the anchor first.

---

## Subject → Question Type Mapping (SPM-grounded)

| Subject | Real SPM format | Correct question_type |
|---|---|---|
| Physics | Paper 1 = 50 MCQ | `mcq` |
| Biology | Paper 1 = 50 MCQ | `mcq` |
| Chemistry | Paper 1 = 50 MCQ | `mcq` |
| Science | Paper 1 = 50 MCQ | `mcq` |
| Sejarah | Paper 1 = MCQ with stimulus | `mcq` |
| Geografi | Paper 1 = MCQ with map/data | `mcq` |
| Mathematics | Paper 2 = show full working | `short_answer` |
| Additional Mathematics | Paper 1 = short answer, no options | `short_answer` |
| Bahasa Melayu | Kertas 2 = structured sub-parts | `short_answer` |
| Bahasa Inggeris | Paper 2 = comprehension sub-parts | `short_answer` |

---

## Changes Implemented

### 1. `DIAGNOSTIC_QUESTION_TYPE` dict — `app/main.py`
Maps every subject to its correct SPM question type. Used by `start_diagnostic_session`.

### 2. `DIAGNOSTIC_TOPIC_POOLS` — replaces `DIAGNOSTIC_TOPICS_BY_FORM`
Instead of one fixed topic per subject, each subject now has a pool of 3 topics.
Selection logic: for each subject, pick the **first unanswered topic** from its pool.
- First attempt → topic[0]
- If topic[0] already answered (retake) → topic[1], and so on
- This gives variety between students and across retakes without breaking the 10-question structure.

### 3. `_diagnostic_topics_for_student()` helper
Reconstructs `(completed, remaining)` from the pool given the student's answered history.
Replaces all three `DIAGNOSTIC_TOPICS_BY_FORM.get(...)` calls in:
- `GET /diagnostic_progress/{student_id}`
- `POST /start_diagnostic_session`

### 4. `start_diagnostic_session` — 3 hardcoded `"mcq"` removed
- `AgentState(question_type=...)` → uses `next_topic["question_type"]`
- `_create_quiz_session(question_type=...)` → uses `next_topic["question_type"]`
- Return dict `"question_type"` → uses `next_topic["question_type"]`

---

## Files Changed

| File | What changed |
|---|---|
| `app/main.py` | `DIAGNOSTIC_TOPICS_BY_FORM` → `DIAGNOSTIC_TOPIC_POOLS` + `DIAGNOSTIC_QUESTION_TYPE`; `_diagnostic_topics_for_student()` helper; 3 hardcoded `"mcq"` replaced |
| `lovable_prompts/session27_diagnostic_format_fix.md` | This file |

---

## Not changed (deferred)

- **Free practice question type selector** — surfacing short_answer/essay in free practice requires a UI toggle or subject-default override in `loadSession`. Deferred.
- **Diagnostic topic count** — still 10 (one per subject). Increasing to 15 or 20 would require frontend progress bar changes. Deferred.
- **Past year questions** — anchor questions are still AI-generated. Human-reviewed past year questions remain the gold standard. Deferred.
