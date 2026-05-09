from pydantic import BaseModel
from typing import List

class ValidatedQuestion(BaseModel):
    curriculum_tag: str
    question: str
    options: List[str]
    correct_answer: str
    difficulty_score: float
    pedagogical_feedback: str