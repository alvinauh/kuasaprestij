"""Local mirror of Skor's schemas/assessment.py output models.

Keep in sync with the Skor repo - field names here are taken from CLAUDE.md, not the real file.
"""
from typing import Literal

from pydantic import BaseModel, Field


class TeacherInsight(BaseModel):
    error_category: str
    root_cause_analysis: str
    actionable_intervention: str


class EvaluatorOutput(BaseModel):
    student_feedback: str
    teacher_insight: TeacherInsight


class TutorReply(BaseModel):
    seda_move: Literal["invite_reasoning", "explain_reasoning", "build_on_ideas"]
    reply: str


class MCQQuestion(BaseModel):
    question: str
    options: list[str] = Field(min_length=4, max_length=4)
    answer_index: int = Field(ge=0, le=3)
    distractor_rationale: list[str]
    stimulus: str | None = None
    object_lesson: str | None = None


class EssayPass1(BaseModel):
    band: Literal["A", "B", "C", "D"]
    score: int = Field(ge=0, le=100)


class EssayPass2(BaseModel):
    strengths: list[str] = Field(min_length=1, max_length=5)
    improvements: list[str] = Field(min_length=1, max_length=5)


SCHEMAS = {
    "evaluator": EvaluatorOutput,
    "tutor": TutorReply,
    "generator": MCQQuestion,
    "essay_pass1": EssayPass1,
    "essay_pass2": EssayPass2,
}
