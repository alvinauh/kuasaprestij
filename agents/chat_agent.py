import os
import json
from typing import Optional
from supabase import create_client, Client
from dotenv import load_dotenv
from agents.llm_client import call_llm

load_dotenv(override=True)

supabase: Client = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))

SYSTEM_PROMPT = """You are a patient, encouraging study tutor for Malaysian secondary school students (KSSM curriculum).
You have been given the official study notes for a specific topic. Your job is to help the student understand this topic.

RULES:
- Answer ONLY from the study notes provided. Do not introduce facts not in the notes.
- If the student asks something not covered in the notes, say: "That's not covered in these notes, but you can ask your teacher."
- Keep answers concise and student-friendly. Use simple language (Form 4–5 level).
- If the student writes in Bahasa Malaysia, reply in Bahasa Malaysia. Otherwise reply in English.
- Never reveal exam answers or do the student's homework for them outright — guide them instead.
- Encourage the student when they show understanding."""

QUESTION_SYSTEM_PROMPT = """You are a patient, encouraging study tutor for Malaysian secondary school students (KSSM curriculum).
The student is working on the specific exam question shown below. Your job is to help them understand it.

RULES:
- Focus on the question shown. Explain the underlying concepts, give hints, and check the student's reasoning.
- Do NOT just give away the final answer. Guide the student to work it out; only confirm and explain the answer after they have attempted it or explicitly ask for the full solution.
- Keep answers concise and student-friendly. Use simple language (Form 4–5 level).
- If the student writes in Bahasa Malaysia, reply in Bahasa Malaysia. Otherwise reply in English.
- Encourage the student when they show understanding."""

# For a Mandarin (Bahasa Cina / 华文) task, reply in Mandarin by default.
MANDARIN_DIRECTIVE = """
MANDARIN MODE — this is a 华文 (Bahasa Cina / Mandarin) task: reply in Mandarin (中文/汉字),
using simple language at Form 4–5 level. Do NOT add pinyin unless the student asks for it."""

# Only when the student explicitly asks: switch the same reply into pinyin.
MANDARIN_PINYIN_DIRECTIVE = """
MANDARIN MODE — this is a 华文 (Bahasa Cina / Mandarin) task and the student asked for PINYIN:
- Write your explanation in Hanyu Pinyin WITH tone marks (e.g. "wǒ men lái kàn zhè ge cí").
- After each Chinese word or phrase you mention, give it as: 汉字 (hànzì pīnyīn) — characters first, pinyin in brackets.
- You may add a short English gloss in brackets for hard terms.
- Keep sentences short and easy to read aloud."""


def _is_mandarin_context(*values: str) -> bool:
    """True when any value signals a Mandarin/华文 task (subject label or CJK text)."""
    for v in values:
        if not v:
            continue
        low = v.lower()
        if any(kw in low for kw in ("cina", "chinese", "mandarin", "华文", "华语", "汉语")):
            return True
        # Any CJK ideograph present → treat as Mandarin content.
        if any("一" <= ch <= "鿿" for ch in v):
            return True
    return False


def _wants_pinyin(message: str) -> bool:
    """True when the student explicitly asks for a pinyin explanation."""
    low = (message or "").lower()
    return any(kw in low for kw in ("pinyin", "pin yin", "拼音", "romani", "rumi", "pronounce", "pronunciation"))


def _build_question_context(ctx: dict) -> str:
    """Render the current question into a prompt block the tutor can reason over."""
    parts = []
    if ctx.get("topic"):
        parts.append(f"Topic: {ctx['topic']}")
    if ctx.get("subject"):
        parts.append(f"Subject: {ctx['subject']}")
    if ctx.get("passage"):
        parts.append(f"Passage / Stimulus:\n{ctx['passage']}")
    if ctx.get("question"):
        parts.append(f"Question:\n{ctx['question']}")
    opts = ctx.get("options")
    if isinstance(opts, dict):
        opt_lines = "\n".join(f"{k}. {v}" for k, v in opts.items() if v)
        if opt_lines:
            parts.append(f"Options:\n{opt_lines}")
    if ctx.get("correct_answer"):
        parts.append(f"Correct answer: {ctx['correct_answer']}")
    return "\n\n".join(parts)


def _load_lesson_context(lesson_id: str) -> dict:
    res = supabase.table("generated_lessons").select("title, notes_content, notes_json").eq("id", lesson_id).execute()
    if not res.data:
        return {}
    row = res.data[0]
    notes_json = row.get("notes_json") or {}
    return {
        "title": row.get("title", ""),
        "notes_content": row.get("notes_content", ""),
        "summary": notes_json.get("summary", ""),
        "key_concepts": notes_json.get("key_concepts", []),
        "key_terms": notes_json.get("key_terms", []),
    }


def _load_history(student_id: str, *, lesson_id: str = None, session_id: str = None, limit: int = 10) -> list[dict]:
    """Load prior turns for a student, keyed by lesson (lesson mode) or session (question mode)."""
    q = (
        supabase.table("chat_history")
        .select("role, content, created_at")
        .eq("student_id", student_id)
    )
    if lesson_id:
        q = q.eq("lesson_id", lesson_id)
    elif session_id:
        q = q.eq("session_id", session_id)
    else:
        return []
    res = q.order("created_at", desc=False).limit(limit).execute()
    return res.data if res.data else []


def chat(
    student_id: str,
    lesson_id: Optional[str] = None,
    message: str = "",
    question_context: Optional[dict] = None,
    history: Optional[list] = None,
    session_id: Optional[str] = None,
) -> dict:
    """
    Process one student message and return the tutor's reply.

    Two grounding modes, both persisted to `chat_history` and recallable later:
      - Lesson mode: `lesson_id` points at a row in `generated_lessons` — the tutor is
        grounded in the official study notes; history is keyed by lesson_id.
      - Question mode: no lesson exists (e.g. the adaptive question feed). The tutor is
        grounded in `question_context` (the question the student is looking at); history
        is keyed by `session_id` (FK to quiz_sessions).
    """
    print(f"[CHAT] student={student_id} lesson={lesson_id} session={session_id} msg={message[:60]!r}")

    lesson = _load_lesson_context(lesson_id) if lesson_id else {}

    # Build conversation turns from persisted history, keyed by lesson or session.
    if lesson:
        turns = _load_history(student_id, lesson_id=lesson_id)
    elif session_id:
        turns = _load_history(student_id, session_id=session_id)
    else:
        turns = []
    # Fall back to client-supplied turns when nothing is persisted yet.
    if not turns and history:
        turns = [
            t for t in history
            if isinstance(t, dict) and t.get("role") in ("student", "tutor") and t.get("content")
        ]

    history_text = ""
    for turn in turns:
        prefix = "Student" if turn["role"] == "student" else "Tutor"
        history_text += f"{prefix}: {turn['content']}\n"

    # Mandarin tasks → tutor replies in Mandarin by default, switching to pinyin only when
    # the student asks. Detect Mandarin from the subject/topic (question mode) or the lesson
    # title (lesson mode).
    qc = question_context or {}
    mandarin = _is_mandarin_context(
        qc.get("subject", ""), qc.get("topic", ""), lesson.get("title", "")
    )
    if mandarin:
        pinyin_directive = MANDARIN_PINYIN_DIRECTIVE if _wants_pinyin(message) else MANDARIN_DIRECTIVE
    else:
        pinyin_directive = ""

    if lesson:
        key_terms_text = ""
        if lesson.get("key_terms"):
            key_terms_text = "\n".join(
                f"- {t['term']}: {t['definition']}" for t in lesson["key_terms"] if isinstance(t, dict)
            )
        prompt = f"""{SYSTEM_PROMPT}{pinyin_directive}

--- STUDY NOTES: {lesson['title']} ---
{lesson['notes_content']}

Key Concepts: {', '.join(lesson.get('key_concepts', []))}

Key Terms:
{key_terms_text}
--- END OF NOTES ---

{history_text}Student: <student_input>{message}</student_input>
Tutor:"""
    elif question_context and question_context.get("question"):
        prompt = f"""{QUESTION_SYSTEM_PROMPT}{pinyin_directive}

--- CURRENT QUESTION ---
{_build_question_context(question_context)}
--- END OF QUESTION ---

{history_text}Student: <student_input>{message}</student_input>
Tutor:"""
    else:
        return {"reply": "Sorry, I couldn't load the context for this question. Please try again."}

    try:
        res = call_llm(prompt, role="light", temperature=0.4, max_tokens=512)
        reply = res.text.strip() if res and res.text else "I'm not sure about that. Could you rephrase your question?"
    except Exception as e:
        print(f"-> LLM error: {e}")
        reply = "Sorry, I'm having trouble answering right now. Please try again in a moment."

    # Persist both turns, anchored to whichever context we have. chat_history requires
    # exactly one of lesson_id / session_id (CHECK constraint), so key on the lesson when
    # it exists, otherwise on the session.
    anchor = {"lesson_id": lesson_id} if lesson else ({"session_id": session_id} if session_id else None)
    if anchor:
        try:
            supabase.table("chat_history").insert([
                {"student_id": student_id, **anchor, "role": "student", "content": message},
                {"student_id": student_id, **anchor, "role": "tutor", "content": reply},
            ]).execute()
        except Exception as e:
            print(f"-> Failed to save chat turns: {e}")

    return {
        "reply": reply,
        "lesson_title": lesson.get("title", ""),
    }


def get_chat_history(student_id: str, lesson_id: str = None, session_id: str = None) -> list[dict]:
    """Return full chat history for a student, keyed by lesson or session."""
    return _load_history(student_id, lesson_id=lesson_id, session_id=session_id, limit=100)
