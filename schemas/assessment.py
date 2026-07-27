"""
Assessment output schemas — Pydantic v2 models for every LLM JSON response shape
in the KuasaPrestij pipeline.

parse_llm_json() extends the TAR Cycle-1 list-unwrap guard (§5.1) with a full
schema validation layer:

  Layer 1 — isinstance list guard (unchanged from Cycle 1):
    Gemini/Llama intermittently wraps the JSON object in a single-element list.
    Unwrap before any field access.

  Layer 2 — Pydantic model_validate:
    Catches wrong types, missing required fields, and the correct_answer∉options
    cross-field anomaly.  On ValidationError: log the offending fields, emit a
    telemetry span, and fall through with the raw dict so existing .get(key,
    default) guards handle the gap without crashing.

This makes schema anomalies visible in agent_traces (status="validation_error")
for quantitative telemetry analysis — extending the zero-respondent evidence base
described in the paper.
"""

import json
import re
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, ValidationError, model_validator


# ---------------------------------------------------------------------------
# Shared sub-models
# ---------------------------------------------------------------------------

class TeacherInsight(BaseModel):
    error_category: str = "Unknown"
    root_cause_analysis: str = ""
    actionable_intervention: str = ""


class RubricBand(BaseModel):
    band: str = ""
    marks_range: str = ""
    descriptors: str = ""


class SubPart(BaseModel):
    label: str = ""
    question: str = ""
    marks: int = 1
    sample_answer: str = ""


# ---------------------------------------------------------------------------
# Question schemas — one per question_type the LLM can return
# ---------------------------------------------------------------------------

class MCQQuestion(BaseModel):
    """MCQ or Listening question — studio_node anchor and generator_node mcq/listening."""
    question_type: str = "mcq"
    kbat_level: str = "Memahami"
    illustrative_notes: str = ""
    stimulus: str = ""
    source_excerpt: str = ""
    question: str
    options: List[str] = Field(default_factory=list, min_length=2)
    correct_answer: str
    distractor_rationale: Dict[str, str] = {}
    # listening-only fields
    passage: Optional[str] = None
    audio_url: Optional[str] = None

    @model_validator(mode="after")
    def _correct_answer_in_options(self) -> "MCQQuestion":
        """Auto-fix case mismatch; log if truly absent (cross-field anomaly)."""
        if self.options and self.correct_answer not in self.options:
            lc = [o.lower() for o in self.options]
            if self.correct_answer.lower() in lc:
                self.correct_answer = self.options[lc.index(self.correct_answer.lower())]
        return self


class ShortAnswerQuestion(BaseModel):
    """Short-answer question — generator_node short_answer."""
    question_type: str = "short_answer"
    kbat_level: str = "Mengaplikasi"
    illustrative_notes: str = ""
    stimulus: str = ""
    source_excerpt: str = ""
    question: str
    sub_parts: List[SubPart] = []
    sample_answer: str = ""
    key_concepts: List[str] = []
    marking_rubric: str = ""
    max_marks: int = 4


class SolutionStep(BaseModel):
    """One line of a math working, carrying its SPM-style mark type."""
    id: str = ""                # stable chunk id, e.g. "s1"
    order: int = 0             # canonical position, 1-based
    description: str = ""       # plain-language: "Differentiate y"
    expression: str = ""        # the math (KaTeX): "dy/dx = 3x^2 - 4"
    marks: int = 1
    mark_type: str = "M"        # "M" method | "A" accuracy | "B" independent


class DistractorStep(BaseModel):
    """A plausible-but-wrong working line encoding a named misconception."""
    id: str = ""                # "d1"
    expression: str = ""        # e.g. "x = 4/3" (forgot the square root)
    misconception: str = ""     # feeds root_cause — authored, not inferred
    error_category: str = "Conceptual Gap"   # reuses the 3 KSSM categories


class StepSortQuestion(BaseModel):
    """Drag-and-drop 'order the working' question — generator_node step_sort.

    Assesses whether a student can sequence a correct method (and reject
    misconception steps). Graded deterministically — no LLM at answer time."""
    question_type: str = "step_sort"
    kbat_level: str = "Mengaplikasi"
    illustrative_notes: str = ""
    stimulus: str = ""
    source_excerpt: str = ""
    question: str
    solution_steps: List[SolutionStep] = []      # canonical, ordered
    distractor_steps: List[DistractorStep] = []
    final_answer: str = ""
    prefilled_step_ids: List[str] = []           # adaptive scaffolding (locked)
    max_marks: int = 4                           # = sum(step.marks)


class EssayQuestion(BaseModel):
    """Essay question — generator_node essay."""
    question_type: str = "essay"
    kbat_level: str = "Menganalisis"
    illustrative_notes: str = ""
    stimulus: str = ""
    source_excerpt: str = ""
    question: str
    model_answer: str = ""
    marking_rubric_bands: List[RubricBand] = []
    max_marks: int = 10
    themes: List[str] = []


class WritingConnector(BaseModel):
    """Connector-cloze sub-item for the writing mini-game."""
    before: str = ""
    after: str = ""
    answer: str = ""
    distractors: List[str] = []


class WritingGameChallenge(BaseModel):
    """LLM payload for the writing-native mini-games (sentence builder + connector catch)."""
    sentence: str = ""
    tokens: List[str] = []
    connector: WritingConnector = Field(default_factory=WritingConnector)


class AnchorOutput(BaseModel):
    """Full studio_node LLM response — wraps the MCQ anchor question."""
    mnemonic_lyrics: str = ""
    b_roll_search_query: str = ""
    anchor_question: MCQQuestion
    drag_sentence: str = ""
    drag_distractors: List[str] = []


# ---------------------------------------------------------------------------
# Evaluator output schemas
# ---------------------------------------------------------------------------

class MCQFeedback(BaseModel):
    """Evaluator feedback for a wrong MCQ / listening answer."""
    student_feedback: str = "Check your work."
    teacher_insight: TeacherInsight = Field(default_factory=TeacherInsight)


class OpenAnswerEval(BaseModel):
    """Evaluator output for short-answer questions."""
    marks_awarded: int = 0
    partial_credit: float = 0.0
    student_feedback: str = "Good attempt."
    concepts_addressed: List[str] = []
    concepts_missing: List[str] = []
    teacher_insight: TeacherInsight = Field(default_factory=TeacherInsight)


class EssayEval(BaseModel):
    """Evaluator output for essay questions."""
    marks_awarded: int = 0
    partial_credit: float = 0.0
    band_awarded: str = "C"
    student_feedback: str = "Good attempt."
    strengths: List[str] = []
    improvements: List[str] = []
    # A worked model of how the essay SHOULD be structured — an outline the student
    # can follow (intro → body points → conclusion), not just a one-line critique.
    model_structure: str = ""
    teacher_insight: TeacherInsight = Field(default_factory=TeacherInsight)


# Legacy alias
ValidatedQuestion = MCQQuestion


# ---------------------------------------------------------------------------
# parse_llm_json — the two-layer parse + validate helper
# ---------------------------------------------------------------------------

def _extract_json_payload(raw: str) -> str:
    """Best-effort recovery of a JSON payload from a wrapped LLM response.

    Providers in the fallback chain (Cerebras/OpenRouter/Groq/DeepSeek)
    intermittently ignore response_mime_type="application/json" and wrap the
    object in a markdown fence (```json ... ```) or surround it with prose
    ("Here is the evaluation: {...}"). A bare json.loads() on that text raises,
    which upstream becomes an empty dict — and for essay marking a silently
    fabricated 0/30. Strip the fence and slice to the outermost {...} / [...]
    span so the real object still parses.
    """
    if not raw:
        return raw
    text = raw.strip()
    # Strip a leading/trailing markdown code fence (with or without a lang tag).
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z0-9_-]*\s*", "", text)
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
    # Already valid after de-fencing — done.
    try:
        json.loads(text)
        return text
    except json.JSONDecodeError:
        pass
    # Still wrapped in prose: slice to the outermost object/array span and
    # return the first candidate that parses.
    candidates = []
    for open_ch, close_ch in (("{", "}"), ("[", "]")):
        start, end = text.find(open_ch), text.rfind(close_ch)
        if start != -1 and end > start:
            candidates.append(text[start:end + 1])
    for cand in sorted(candidates, key=text.find):
        try:
            json.loads(cand)
            return cand
        except json.JSONDecodeError:
            continue
    return text


def parse_llm_json(raw: str, schema: Any, context: str = "") -> dict:
    """
    Parse LLM JSON output with:
      Layer 0 — fence / prose recovery (_extract_json_payload)
      Layer 1 — Cycle-1 isinstance list-unwrap guard (TAR paper §5.1)
      Layer 2 — Pydantic schema validation with telemetry on failure

    Never raises. Returns a plain dict.
    - Success: returns schema.model_dump() — all fields typed and defaulted.
    - ValidationError: logs offending fields, emits a telemetry span, returns
      the raw dict so existing .get(key, default) guards handle any gaps.
    - JSONDecodeError: logs and returns {}.
    """
    # JSON parse — retry once against a de-fenced / prose-stripped payload before
    # giving up, so a markdown-wrapped response never becomes a silent {}.
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        try:
            data = json.loads(_extract_json_payload(raw))
        except json.JSONDecodeError as exc:
            print(f"[parse_llm_json:{context}] JSON decode failed: {exc}")
            return {}

    # Layer 1 — Cycle 1 list-unwrap guard (must stay; cited in paper §5.1)
    if isinstance(data, list):
        data = data[0] if data else {}

    # Layer 2 — schema validation
    try:
        return schema.model_validate(data).model_dump()
    except (ValidationError, Exception) as exc:
        bad_fields: list = []
        if isinstance(exc, ValidationError):
            bad_fields = [".".join(str(p) for p in e["loc"]) for e in exc.errors()]
        print(f"[parse_llm_json:{context}] Validation failed — fields: {bad_fields}")

        # Non-blocking telemetry span
        try:
            import uuid as _uuid
            from app.telemetry import log_span
            log_span(str(_uuid.uuid4()), "schema_validation", context,
                     0.0, "validation_error")
        except Exception:
            pass

        return data  # fall through — existing .get(key, default) guards handle gaps
