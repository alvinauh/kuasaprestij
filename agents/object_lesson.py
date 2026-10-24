"""Object-lesson hook generator.

An object lesson is ONE concrete everyday object whose behaviour works exactly
like the concept a specific MCQ tests, followed by an explicit bridge sentence
mapping the object onto the question's own terms. It is shown full-screen right
before that MCQ, so it is generated per question — never shared across a topic.
"""
import json
import os
import re
import subprocess

from agents.llm_client import call_llm

# Subjects whose cached MCQs get object lessons generated automatically (bulk regen
# default + /start_session background backfill). Every other subject is left alone
# until someone explicitly asks: scripts/regen_object_lessons.py --subjects "<Subject>".
AUTO_OBJECT_LESSON_SUBJECTS = {"Additional Mathematics", "Bahasa Inggeris"}


def auto_object_lessons(subject: str) -> bool:
    return (subject or "").strip() in AUTO_OBJECT_LESSON_SUBJECTS


# Shared with the question generators in orchestrator.py so freshly generated
# questions get hooks in the same style as backfilled ones.
OBJECT_LESSON_SCHEMA_HINT = (
    "An OBJECT LESSON for THIS exact question: name ONE concrete everyday object a Malaysian "
    "student can picture instantly (e.g. Touch 'n Go card, ceiling fan, rice cooker, teh tarik jug) "
    "whose behaviour works exactly like the concept being tested. Sentence 1: what the object does "
    "(mirror the question's numbers/structure). Sentence 2: the pattern to notice. Sentence 3 must "
    "explicitly map the object onto the question's own terms ('In this question, X is like ...'). "
    "Decide the question and options first, then write this hook for them. "
    "Max 65 words, no people's names, no story, no markdown, never reveal the answer. "
    "Same language as the question."
)


def _lang_directive(language: str) -> str:
    l = (language or "").lower()
    if any(k in l for k in ("malay", "melayu", "bm")) or l == "ms":
        return "Write in Bahasa Melayu (standard Malaysian school register)."
    if any(k in l for k in ("cina", "mandarin", "chinese", "中文")) or l == "zh":
        return "Write in Simplified Chinese."
    return "Write in English."


def _options_text(options) -> str:
    if isinstance(options, dict):
        items = [f"{k}) {v}" for k, v in options.items() if v]
    elif isinstance(options, list):
        items = [f"{'ABCD'[i] if i < 4 else i + 1}) {v}" for i, v in enumerate(options) if v]
    else:
        items = []
    return "  ".join(str(x) for x in items)


def _clean(text: str) -> str:
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = text.replace("*", "").replace("#", "")
    return re.sub(r"\s+", " ", text).strip().strip('"')


def _reveals_answer(text: str, correct: str) -> bool:
    """True if the hook quotes the correct option verbatim (only meaningful for
    distinctive answers — short ones like '4' or 'Yes' appear naturally)."""
    c = re.sub(r"\s+", " ", (correct or "")).strip().lower()
    if len(c) < 6:
        return False
    return c in text.lower()


def generate_object_lesson(
    topic: str,
    subject: str,
    language: str,
    question: str,
    stimulus: str = "",
    options=None,
    correct_answer: str = "",
    form_level: int | None = None,
) -> str:
    """Return the object-lesson hook for one MCQ, or "" on failure (callers skip gracefully)."""
    if not (question or "").strip() or "API Rate Limit Hit" in question:
        return ""
    stimulus_block = f"\nStimulus shown with the question: {stimulus}" if stimulus else ""
    opts = _options_text(options)
    options_block = f"\nOptions: {opts}" if opts else ""
    answer_block = (
        f"\nCorrect answer (for YOUR accuracy only — never state, hint at, or compute it): {correct_answer}"
        if correct_answer else ""
    )
    form = f" Form {form_level}" if form_level else ""

    prompt = f"""You write OBJECT LESSON cards for Malaysian KSSM{form} secondary students. The card appears full-screen right before ONE multiple-choice question and must make that question's concept click instantly.

An object lesson is built around ONE concrete, physical, everyday object the student can picture in a second — something they actually see in Malaysia (e.g. a Touch 'n Go card, a ceiling fan, a pressure cooker, a teh tarik jug, a staircase, a phone battery bar, a durian, a kite). The object's BEHAVIOUR must work exactly like the specific relationship this question tests — not merely share a theme with the topic.

Subject: {subject}
Topic: {topic}
Question: {question}{stimulus_block}{options_block}{answer_block}

Work in this order (fill the JSON fields in order):
- "mechanism": in one plain line, the exact relationship/cause/fact THIS question tests.
- "object": ONE real object whose behaviour has that SAME mechanism. It must be physically true (no invented behaviour). For maths/science, use an everyday object that works the same way (constant rate + starting value → a taxi meter: flag-fall plus a fixed amount per km; half-life → a phone battery that loses half its remaining charge every hour). For history, geography, language or fact-recall questions, use a real tangible object tied to the event itself (an old coin, a map, a port, a document, a monument, a tool) and let what it shows reveal the idea.
  The objects named here are only illustrations — pick whatever object fits THIS question best and avoid defaulting to them.
- "check": one line confirming a teacher would agree the object matches the mechanism; if not, pick a better object before writing.
- "object_lesson": exactly 3 sentences, at most 65 words, simple words a 15-year-old understands:
  1. Name the object and show what it physically does — follow the question's numbers or structure where it has them.
  2. Point at the one pattern the student should notice.
  3. The BRIDGE: explicitly map the object onto the question's own terms (e.g. "In this question, the study hours are like the kilometres, and the marks are like the fare.").
Never state, hint at, or calculate the correct option. No people's names, no story or characters, no markdown or asterisks, do not start with "Imagine"/"Bayangkan".
{_lang_directive(language)}

Return ONLY JSON: {{"mechanism": "...", "object": "...", "check": "...", "object_lesson": "..."}}"""

    best, best_score, feedback = "", -1, ""
    for attempt in range(3):
        retry_note = (
            f"\n\nYour previous attempt was REJECTED by a reviewer: {feedback}\nChoose a different, accurate object."
            if feedback else ""
        )
        data = _llm_json(prompt + retry_note, temperature=0.6 + 0.15 * attempt, max_tokens=700, topic=topic)
        val = data.get("object_lesson") or ""
        if isinstance(val, dict):
            val = next((v for v in val.values() if isinstance(v, str)), "")
        val = _clean(str(val))
        if len(val.split()) < 12 and not _CJK.search(val):
            feedback = "the lesson was empty or too short."
            continue
        if _BANNED_OPENER.match(val):
            feedback = 'it opened with "Imagine/Bayangkan/Picture" instead of naming the object.'
            continue
        if _reveals_answer(val, correct_answer):
            feedback = "it quoted the correct answer."
            continue
        score, issue = _review(val, subject, question, correct_answer, language, stimulus, opts)
        if score > best_score:
            best, best_score = val, score
        if score >= 4:
            return val
        feedback = issue or "the object does not accurately match what the question tests."
    # Keep a near-miss rather than nothing; drop anything the reviewer called wrong.
    return best if best_score >= 3 else ""


_CJK = re.compile(r"[\u4e00-\u9fff]")
_BANNED_OPENER = re.compile(r"^\s*(imagine|picture|bayangkan|cuba bayangkan|想象)", re.I)


class LLMUnavailable(RuntimeError):
    """The configured LLM can't answer (usage limit, auth, outage). Callers must not
    record a blank hook for the question — it was never actually attempted."""


# OBJECT_LESSON_LLM=claude routes hook generation through the Claude Code CLI
# (`claude -p`, billed to the logged-in claude.ai subscription) instead of the
# app's provider chain. Used by scripts/regen_object_lessons.py --llm claude.
_CLAUDE_MODEL = os.getenv("OBJECT_LESSON_CLAUDE_MODEL", "sonnet")


def _claude_cli(prompt: str) -> str:
    cmd = [
        "claude", "-p", "--output-format", "json", "--model", _CLAUDE_MODEL,
        "--system-prompt", "You are a precise educational content writer. Reply with ONLY the requested JSON object.",
        "--tools", "", "--strict-mcp-config", "--no-session-persistence",
        "--setting-sources", "", "--disable-slash-commands",
    ]
    try:
        out = subprocess.run(cmd, input=prompt, capture_output=True, text=True, timeout=180, cwd="/tmp")
    except subprocess.TimeoutExpired as e:
        raise LLMUnavailable("claude CLI timed out") from e
    try:
        env = json.loads(out.stdout)
    except json.JSONDecodeError as e:
        raise LLMUnavailable(f"claude CLI gave no JSON: {(out.stderr or out.stdout)[:200]}") from e
    if env.get("is_error"):
        raise LLMUnavailable(f"claude CLI error: {str(env.get('result'))[:200]}")
    text = str(env.get("result") or "").strip()
    m = re.search(r"\{.*\}", text, re.S)  # tolerate ```json fences / stray prose
    return m.group(0) if m else text


def _llm_json(prompt: str, temperature: float, max_tokens: int, topic: str) -> dict:
    if os.getenv("OBJECT_LESSON_LLM", "").lower() == "claude":
        text = _claude_cli(prompt)  # LLMUnavailable propagates — never swallow it
    else:
        try:
            res = call_llm(prompt, want_json=True, temperature=temperature, max_tokens=max_tokens)
            text = res.text if res else ""
        except Exception as e:
            print(f"[object_lesson] LLM error for {topic}: {e}")
            return {}
    try:
        data = json.loads(text) if isinstance(text, str) else text
    except json.JSONDecodeError:
        return {}
    if isinstance(data, list) and data:
        data = data[0]
    return data if isinstance(data, dict) else {}


def _review(lesson: str, subject: str, question: str, correct_answer: str, language: str,
            stimulus: str = "", options: str = "") -> tuple[int, str]:
    """Strict second opinion: is the analogy accurate, physically true, explicitly bridged?
    Returns (score 1-5, issue). Reviewer failure → neutral 4 so the run never stalls."""
    prompt = f"""You are a strict KSSM {subject} teacher reviewing an "object lesson" card shown before a multiple-choice question.

Stimulus: {stimulus or "(none)"}
Question: {question}
Options: {options or "(none)"}
Correct answer (already verified — do NOT re-solve or dispute it): {correct_answer or "(not given)"}
Object lesson: {lesson}

Judge ONLY the object lesson, not the question.
Score 1-5 (5 = a student instantly grasps exactly what this question tests):
- Is it built on ONE concrete real object (not a story about people)?
- Does the object's behaviour really work like the concept tested? Is everything it claims about the real object physically/historically TRUE (no invented behaviour such as bricks bending)? Analogies may use simple made-up numbers that mirror the question's structure.
- Does the last sentence explicitly map the object onto this question's terms?
- It must NOT reveal or hint which option is correct.
Any false claim or answer leak → score at most 2. A vague or loose match → at most 3.

Return ONLY JSON: {{"score": <1-5>, "issue": "<the main problem in one short English sentence, or empty>"}}"""
    data = _llm_json(prompt, temperature=0.0, max_tokens=200, topic="review")
    try:
        return int(data.get("score")), str(data.get("issue") or "")
    except (TypeError, ValueError):
        return 4, ""
