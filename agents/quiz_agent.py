import os
import json
from typing import Optional
from supabase import create_client, Client
from dotenv import load_dotenv
from agents.llm_client import call_llm

load_dotenv(override=True)

supabase: Client = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))

_KBAT_MAP = {
    "easy":   "Mengingat / Memahami — recall and basic comprehension",
    "medium": "Mengaplikasi / Menganalisis — applying concepts, spotting patterns",
    "hard":   "Menilai / Mencipta — evaluating trade-offs, synthesising new scenarios",
}

_SHORT_ANSWER_PROMPT = """You are a KSSM SPM exam question setter. Generate exactly {n} structured short-answer questions.

STRICT GROUNDING RULE: Every question MUST be based EXCLUSIVELY on the notes below.
If the notes cannot support {n} distinct questions, generate as many as the material allows.

STUDENT NOTES:
{notes}

REQUIREMENTS:
- KBAT cognitive level: {kbat}
- Language: {lang}
- SPM PAPER 2 FORMAT: Divide each question into 2-3 sub-parts labeled (a), (b), (c) with marks in square brackets e.g. "(a) [2 marks]". Sub-parts must progress from recall → application → analysis. The stem may include a short scenario or described observation. Sum of sub-part marks must equal max_marks (4).
- Include "source_excerpt": the exact 1-2 sentence snippet from the notes being tested.

Return ONLY a JSON array:
[
  {{
    "question_type": "short_answer",
    "kbat_level": "string",
    "question": "The scenario/stem text only (do NOT include sub-part labels here)",
    "sub_parts": [
      {{"label": "(a)", "question": "sub-question text", "marks": 2, "sample_answer": "model answer for part (a)"}},
      {{"label": "(b)", "question": "sub-question text", "marks": 2, "sample_answer": "model answer for part (b)"}}
    ],
    "sample_answer": "Full combined model answer covering all sub-parts",
    "key_concepts": ["concept1", "concept2", "concept3"],
    "marking_rubric": "Per sub-part: (a) marks for ..., (b) marks for ...",
    "max_marks": 4,
    "source_excerpt": "exact 1-2 sentence quote from the notes above"
  }}
]"""

_ESSAY_PROMPT = """You are a KSSM SPM exam question setter. Generate exactly {n} essay questions.

STRICT GROUNDING RULE: Every question MUST be based EXCLUSIVELY on the notes below.
If the notes cannot support {n} distinct questions, generate as many as the material allows.

STUDENT NOTES:
{notes}

REQUIREMENTS:
- KBAT cognitive level: {kbat}
- Language: {lang}
- SPM PAPER 2 ESSAY FORMAT: Begin each question with a stimulus — 'Based on the following information:' followed by a 2-4 sentence scenario or observation. Then state the task (e.g. 'Explain...', 'Discuss...', 'Compare...'). Marking is split: content points (1-2 marks each) and communication quality. Model answer must be 150-200 words with clear introduction, body points, and conclusion.
- Include "source_excerpt": the exact 1-2 sentence snippet from the notes being tested.

Return ONLY a JSON array:
[
  {{
    "question_type": "essay",
    "kbat_level": "string",
    "stimulus": "Based on the following information: [2-4 sentence scenario or data description]",
    "question": "The essay task instruction only (e.g. 'Explain... [10 marks]')",
    "model_answer": "A full model answer of 150-200 words — intro, content points each explained, brief conclusion",
    "marking_rubric_bands": [
      {{"band": "A", "marks_range": "8-10", "descriptors": "Strong content, accurate well-explained points. Clear structure. Fluent language."}},
      {{"band": "B", "marks_range": "5-7",  "descriptors": "Adequate content, mostly correct. Generally organised. Some language errors."}},
      {{"band": "C", "marks_range": "1-4",  "descriptors": "Limited content, partial/vague explanations. Weak structure. Frequent errors."}}
    ],
    "max_marks": 10,
    "themes": ["theme1", "theme2"],
    "source_excerpt": "exact 1-2 sentence quote from the notes above"
  }}
]"""

_MCQ_PROMPT = """You are a KSSM SPM exam question setter. Generate exactly {n} multiple-choice questions.

STRICT GROUNDING RULE: Every question MUST be based EXCLUSIVELY on the notes below.
Do NOT use any knowledge outside these notes.
If the notes cannot support {n} distinct questions, generate as many as the material allows.

STUDENT NOTES:
{notes}

REQUIREMENTS:
- KBAT cognitive level: {kbat}
- Language: {lang}
- SPM PAPER 1 OBJECTIVE FORMAT: The question stem may include a short stimulus (described scenario, diagram, or data) before the question. Provide exactly 4 options — one correct answer, three plausible distractors based on real student misconceptions. Options must be parallel in structure and similar in length. For science/maths: correct SI units and realistic values required. Do NOT make the correct answer obviously different in length or style.
- Each question MUST include "source_excerpt": the exact 1-2 sentence snippet from the notes being tested.

Return ONLY a JSON array:
[
  {{
    "question_type": "mcq",
    "kbat_level": "string",
    "question": "The question stem (include stimulus description before the question if relevant)",
    "options": ["option A text", "option B text", "option C text", "option D text"],
    "correct_answer": "exact string of correct option (must match one of the options exactly)",
    "distractor_rationale": {{
      "option text": "The specific misconception that leads a student to choose this wrong answer (2 sentences)"
    }},
    "source_excerpt": "exact 1-2 sentence quote from the notes above"
  }}
]"""


def generate_quiz(
    lesson_id: Optional[str] = None,
    notes_content: Optional[str] = None,
    topic: Optional[str] = None,
    num_questions: int = 5,
    difficulty: str = "medium",
    language: str = "English",
    question_type: str = "mcq",
) -> dict:
    """
    Generate questions strictly grounded in the provided lesson notes.
    question_type: "mcq" | "short_answer" | "essay"
    Supply either lesson_id (fetched from DB) or notes_content directly.
    """
    if lesson_id and not notes_content:
        lesson_res = supabase.table("generated_lessons").select("*").eq("id", lesson_id).execute()
        if not lesson_res.data:
            return {"error": f"Lesson {lesson_id} not found."}
        row = lesson_res.data[0]
        notes_content = row["notes_content"]
        topic = topic or row.get("topic", "Unknown Topic")

    if not notes_content:
        return {"error": "Either lesson_id or notes_content must be provided."}

    kbat = _KBAT_MAP.get(difficulty, _KBAT_MAP["medium"])
    print(f"--- QUIZ AGENT: {num_questions} {difficulty} {question_type} questions for '{topic}' ---")

    template_map = {
        "short_answer": _SHORT_ANSWER_PROMPT,
        "essay": _ESSAY_PROMPT,
        "mcq": _MCQ_PROMPT,
    }
    prompt = template_map.get(question_type, _MCQ_PROMPT).format(
        n=num_questions, notes=notes_content, kbat=kbat, lang=language
    )

    try:
        res = call_llm(prompt, want_json=True, temperature=0.4)
        questions = json.loads(res.text)
        if isinstance(questions, dict):
            questions = next(iter(questions.values()), [])
    except Exception as e:
        print(f"-> LLM error: {e}")
        return {"error": str(e), "questions": []}

    quiz_id = None
    try:
        row = {
            "lesson_id": lesson_id,
            "topic": topic,
            "questions_jsonb": questions,
            "difficulty_level": difficulty,
            "question_type": question_type,
            "num_questions": len(questions),
            "language": language,
        }
        # M3: avoid duplicate rows — update in place if an identical quiz already exists
        existing = None
        if lesson_id:
            existing_res = (
                supabase.table("quizzes")
                .select("id")
                .eq("lesson_id", lesson_id)
                .eq("question_type", question_type)
                .eq("difficulty_level", difficulty)
                .eq("language", language)
                .limit(1)
                .execute()
            )
            existing = existing_res.data[0]["id"] if existing_res.data else None

        if existing:
            supabase.table("quizzes").update({
                "questions_jsonb": questions,
                "num_questions": len(questions),
            }).eq("id", existing).execute()
            quiz_id = existing
            print(f"-> Quiz updated. ID: {quiz_id} | {len(questions)} {question_type} questions")
        else:
            result = supabase.table("quizzes").insert(row).execute()
            quiz_id = result.data[0]["id"] if result.data else None
            print(f"-> Quiz saved. ID: {quiz_id} | {len(questions)} {question_type} questions")
    except Exception as e:
        print(f"-> Supabase insert error: {e}")

    return {"id": quiz_id, "topic": topic, "difficulty": difficulty, "question_type": question_type, "questions": questions}


if __name__ == "__main__":
    from lesson_agent import get_or_create_lesson

    lesson = get_or_create_lesson(
        topic="Kinematics",
        subject="Physics",
        form_level=4,
        language="English"
    )

    notes = lesson.get("notes_content") or lesson.get("notes_markdown", "")
    if notes:
        quiz = generate_quiz(
            lesson_id=lesson.get("id"),
            notes_content=notes,
            topic="Kinematics",
            num_questions=3,
            difficulty="medium",
            language="English"
        )
        print(json.dumps(quiz, indent=2, ensure_ascii=False))
    else:
        print("Lesson generation failed — no notes to quiz from.")
