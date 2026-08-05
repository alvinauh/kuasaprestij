"""
Teacher AI Controller — an agentic chat layer that lets a teacher drive the whole
platform through natural language instead of clicking through the dashboard.

It is a bounded ReAct-style planner: on each turn it is given a compact snapshot of
class state (who is weak at what, what was recently assigned) plus the running
conversation, and it decides — one tool per step, up to MAX_STEPS — whether to look
something up, generate slides/questions, assign a task, or reply.

Tools are thin wrappers over the SAME functions the existing endpoints use
(generate_lesson / generate_quiz / assigned_tasks), so the controller produces
identical artifacts to the manual flow — it just orchestrates them from one chat.

Memory:
- Short-term: the `teacher_chat` table (conversation history per teacher+thread).
- Long-term "what students are weak at / what was assigned": read live from
  dskp_mastery + assigned_tasks each turn via the class snapshot, so it is always
  current rather than something the model has to remember.
"""

import json
import os
from typing import Optional

from supabase import create_client, Client
from dotenv import load_dotenv

from agents.llm_client import call_llm
from agents.lesson_agent import generate_lesson, get_or_create_lesson
from agents.quiz_agent import generate_quiz

load_dotenv(override=True)

supabase: Client = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))

TEST_UUID = "00000000-0000-0000-0000-000000000001"
MAX_STEPS = 5


# --------------------------------------------------------------------------- #
# Class-state helpers (long-term memory, read live each turn)
# --------------------------------------------------------------------------- #

def _student_roster() -> list[dict]:
    """All students as [{id, name}] — prefers profiles(role='student'), the canonical table."""
    try:
        res = supabase.table("profiles").select("id, full_name, role").eq("role", "student").execute()
        roster = [{"id": r["id"], "name": r.get("full_name") or "Unnamed"} for r in (res.data or [])]
        if roster:
            return roster
    except Exception as e:
        print(f"[teacher_agent] roster via profiles failed: {e}")
    # Fallback to legacy students table
    try:
        res = supabase.table("students").select("id, full_name").execute()
        return [{"id": r["id"], "name": r.get("full_name") or "Unnamed"} for r in (res.data or [])]
    except Exception:
        return []


def _resolve_students(target, roster: list[dict]) -> list[str]:
    """Resolve an assign target into a list of student ids.

    target may be: "all", "weak", a single name/id, or a list of names/ids.
    "weak" = students whose lowest mastery is below 0.5.
    """
    if isinstance(target, str) and target.lower() == "all":
        return [s["id"] for s in roster]
    if isinstance(target, str) and target.lower() == "weak":
        weak_ids = set()
        try:
            res = supabase.table("dskp_mastery").select("student_id, mastery_level")\
                .lt("mastery_level", 0.5).execute()
            weak_ids = {r["student_id"] for r in (res.data or [])}
        except Exception as e:
            print(f"[teacher_agent] weak lookup failed: {e}")
        return [s["id"] for s in roster if s["id"] in weak_ids] or [s["id"] for s in roster]

    targets = target if isinstance(target, list) else [target]
    by_id = {s["id"]: s["id"] for s in roster}
    by_name = {s["name"].lower(): s["id"] for s in roster}
    out = []
    for t in targets:
        t = str(t).strip()
        if t in by_id:
            out.append(t)
        elif t.lower() in by_name:
            out.append(by_name[t.lower()])
        else:
            # partial name match
            hit = next((s["id"] for s in roster if t.lower() in s["name"].lower()), None)
            if hit:
                out.append(hit)
    return out


def class_snapshot(limit_topics: int = 8) -> dict:
    """Compact live picture injected into every planner turn."""
    roster = _student_roster()
    name_by_id = {s["id"]: s["name"] for s in roster}

    weak_topics: list[dict] = []
    try:
        res = supabase.table("dskp_mastery")\
            .select("student_id, topic, mastery_level")\
            .order("mastery_level", desc=False).limit(40).execute()
        for r in (res.data or []):
            weak_topics.append({
                "student": name_by_id.get(r["student_id"], "Unknown"),
                "topic": r.get("topic"),
                "mastery_pct": round((r.get("mastery_level") or 0) * 100),
            })
    except Exception as e:
        print(f"[teacher_agent] mastery snapshot failed: {e}")

    recent_assignments: list[dict] = []
    try:
        res = supabase.table("assigned_tasks")\
            .select("student_id, topic, task_type, status, assigned_at")\
            .order("assigned_at", desc=True).limit(10).execute()
        for r in (res.data or []):
            recent_assignments.append({
                "student": name_by_id.get(r["student_id"], "Unknown"),
                "topic": r.get("topic"),
                "task_type": r.get("task_type"),
                "status": r.get("status"),
            })
    except Exception as e:
        print(f"[teacher_agent] assignments snapshot failed: {e}")

    return {
        "students": [s["name"] for s in roster],
        "weakest_topics": weak_topics[:limit_topics],
        "recent_assignments": recent_assignments,
    }


# --------------------------------------------------------------------------- #
# Tools
# --------------------------------------------------------------------------- #

def _tool_class_overview(args: dict) -> dict:
    return class_snapshot(limit_topics=20)


def _tool_student_detail(args: dict) -> dict:
    roster = _student_roster()
    ids = _resolve_students(args.get("student", ""), roster)
    if not ids:
        return {"error": f"No student matched '{args.get('student')}'."}
    sid = ids[0]
    name = next((s["name"] for s in roster if s["id"] == sid), "Unknown")
    mastery, tasks = [], []
    try:
        m = supabase.table("dskp_mastery").select("topic, mastery_level")\
            .eq("student_id", sid).order("mastery_level", desc=False).limit(15).execute()
        mastery = [{"topic": r["topic"], "mastery_pct": round((r.get("mastery_level") or 0) * 100)}
                   for r in (m.data or [])]
    except Exception as e:
        print(f"[teacher_agent] student mastery failed: {e}")
    try:
        t = supabase.table("assigned_tasks").select("topic, task_type, status")\
            .eq("student_id", sid).order("assigned_at", desc=True).limit(10).execute()
        tasks = t.data or []
    except Exception as e:
        print(f"[teacher_agent] student tasks failed: {e}")
    return {"student": name, "mastery": mastery, "assignments": tasks}


def _tool_generate_slides(args: dict) -> dict:
    topic = args.get("topic")
    subject = args.get("subject", "")
    if not topic:
        return {"error": "topic is required to generate slides."}
    form_level = int(args.get("form_level") or 4)
    language = args.get("language", "English")
    lesson = generate_lesson(topic, subject, form_level, language)
    if not lesson:
        return {"error": "Lesson generation failed (LLM/DSKP)."}
    return {
        "artifact": {
            "type": "lesson",
            "lesson_id": lesson.get("id"),
            "topic": topic,
            "subject": subject,
            "title": lesson.get("title") or topic,
        },
        "summary": f"Slides/notes generated for '{topic}'.",
    }


def _tool_generate_questions(args: dict) -> dict:
    topic = args.get("topic")
    lesson_id = args.get("lesson_id")
    subject = args.get("subject", "")
    num = int(args.get("num_questions") or 5)
    difficulty = args.get("difficulty", "medium")
    qtype = args.get("question_type", "mcq")
    language = args.get("language", "English")
    form_level = int(args.get("form_level") or 4)

    # Ground questions in a lesson: if none supplied, get-or-create one for the topic.
    if not lesson_id:
        if not topic:
            return {"error": "Provide a topic or lesson_id to generate questions."}
        lesson = get_or_create_lesson(topic, subject, form_level, language)
        lesson_id = lesson.get("id") if lesson else None

    quiz = generate_quiz(
        lesson_id=lesson_id, topic=topic, num_questions=num,
        difficulty=difficulty, language=language, question_type=qtype,
    )
    if "error" in quiz:
        return {"error": quiz["error"]}
    questions = quiz.get("questions", [])
    preview = [q.get("question") or q.get("stem") or "" for q in questions][:num]
    return {
        "artifact": {
            "type": "quiz",
            "quiz_id": quiz.get("id"),
            "lesson_id": lesson_id,
            "topic": topic,
            "num_questions": len(questions),
            "question_type": qtype,
        },
        "summary": f"Generated {len(questions)} {qtype} question(s) on '{topic}'.",
        "preview": preview,
    }


def _tool_assign_task(args: dict) -> dict:
    roster = _student_roster()
    ids = _resolve_students(args.get("students", "all"), roster)
    if not ids:
        return {"error": "No students matched the assign target."}
    row_base = {
        "subject": args.get("subject", ""),
        "topic": args.get("topic", ""),
        "task_type": args.get("task_type", "quiz"),
        "instructions": args.get("instructions", ""),
        "teacher_note": args.get("teacher_note", ""),
        "priority_score": float(args.get("priority_score") or 0.7),
        "status": "pending",
    }
    assigned = 0
    for sid in ids:
        try:
            supabase.table("assigned_tasks").insert({**row_base, "student_id": sid}).execute()
            assigned += 1
        except Exception as e:
            print(f"[teacher_agent] assign failed for {sid}: {e}")
    name_by_id = {s["id"]: s["name"] for s in roster}
    return {
        "artifact": {
            "type": "assignment",
            "topic": row_base["topic"],
            "task_type": row_base["task_type"],
            "student_count": assigned,
            "students": [name_by_id.get(i, "?") for i in ids],
        },
        "summary": f"Assigned '{row_base['topic']}' {row_base['task_type']} to {assigned} student(s).",
    }


def _tool_list_assignments(args: dict) -> dict:
    status = args.get("status")
    roster = _student_roster()
    name_by_id = {s["id"]: s["name"] for s in roster}
    try:
        q = supabase.table("assigned_tasks").select(
            "student_id, subject, topic, task_type, status, assigned_at"
        ).order("assigned_at", desc=True)
        if status:
            q = q.eq("status", status)
        res = q.limit(50).execute()
        rows = [{
            "student": name_by_id.get(r["student_id"], "Unknown"),
            "topic": r.get("topic"), "task_type": r.get("task_type"),
            "status": r.get("status"),
        } for r in (res.data or [])]
        return {"assignments": rows}
    except Exception as e:
        return {"error": f"list failed: {e}"}


TOOLS = {
    "class_overview": _tool_class_overview,
    "student_detail": _tool_student_detail,
    "generate_slides": _tool_generate_slides,
    "generate_questions": _tool_generate_questions,
    "assign_task": _tool_assign_task,
    "list_assignments": _tool_list_assignments,
}

TOOL_SPEC = """Available tools (call ONE per step):
- class_overview {}  -> class-wide weakest topics + who is weak at what.
- student_detail {"student": "<name>"}  -> one student's mastery + assignments.
- generate_slides {"topic","subject","form_level"?,"language"?}  -> creates a lesson/slide deck, returns lesson_id.
- generate_questions {"topic","subject"?,"lesson_id"?,"num_questions"?,"difficulty":"easy|medium|hard","question_type":"mcq|short_answer|essay","language"?}  -> creates a quiz, returns quiz_id.
- assign_task {"students":"all"|"weak"|["name",...], "subject","topic","task_type":"quiz|lesson|practice","instructions","teacher_note"?}  -> assigns a task to students.
- list_assignments {"status"?:"pending|in_progress|completed"}  -> recent assigned tasks.
"""


# --------------------------------------------------------------------------- #
# Memory (teacher_chat table)
# --------------------------------------------------------------------------- #

def get_teacher_history(teacher_id: str, thread_id: str, limit: int = 20) -> list[dict]:
    try:
        res = supabase.table("teacher_chat").select("role, content, artifacts, created_at")\
            .eq("teacher_id", teacher_id).eq("thread_id", thread_id)\
            .order("created_at", desc=False).limit(limit).execute()
        return res.data or []
    except Exception as e:
        print(f"[teacher_agent] history load failed: {e}")
        return []


def _save_turn(teacher_id: str, thread_id: str, role: str, content: str, artifacts: list):
    try:
        supabase.table("teacher_chat").insert({
            "teacher_id": teacher_id, "thread_id": thread_id,
            "role": role, "content": content, "artifacts": artifacts or [],
        }).execute()
    except Exception as e:
        print(f"[teacher_agent] save turn failed: {e}")


# --------------------------------------------------------------------------- #
# Planner loop
# --------------------------------------------------------------------------- #

SYSTEM = """You are the Teacher AI Controller for KuasaPrestij, an adaptive KSSM assessment platform.
You help a Malaysian secondary-school teacher run their class through chat: you can read what
students are weak at, generate slides and questions grounded in the DSKP syllabus, assign tasks,
and recall what was already assigned.

You work in steps. At EACH step reply with a SINGLE JSON object and nothing else:
  {"thought": "...", "action": "call_tool", "tool": "<name>", "args": { ... }}
  OR
  {"thought": "...", "action": "final", "reply": "<message to the teacher>"}

Rules:
- Use tools to DO things; do not claim you generated slides/questions/assignments unless a tool did it.
- One tool per step. After a tool result comes back you may call another tool or finish.
- Prefer concrete action: if the teacher says "quiz the weak students on Photosynthesis", generate the
  questions then assign them, then finish with a short summary.
- Ground content in the class snapshot (real student names, real weak topics) when relevant.
- Keep the final reply concise and teacher-friendly. Reply in Bahasa Malaysia if the teacher wrote in BM.
- Never fabricate student names or mastery numbers — only use those given in the snapshot or tool results.
"""


def _parse_json(text: str) -> Optional[dict]:
    text = (text or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    try:
        data = json.loads(text)
        if isinstance(data, list):
            data = data[0] if data else {}
        return data if isinstance(data, dict) else None
    except Exception:
        # Try to salvage the first {...} block
        start, depth = text.find("{"), 0
        if start == -1:
            return None
        for i in range(start, len(text)):
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
                if depth == 0:
                    try:
                        d = json.loads(text[start:i + 1])
                        return d if isinstance(d, dict) else None
                    except Exception:
                        return None
        return None


def run_teacher_chat(message: str, teacher_id: str = TEST_UUID,
                     thread_id: str = TEST_UUID) -> dict:
    """Main entry: one teacher message -> orchestrated reply + artifacts. Synchronous
    (offload to a thread from the async endpoint)."""
    teacher_id = TEST_UUID if teacher_id in (None, "undefined") else teacher_id
    thread_id = TEST_UUID if thread_id in (None, "undefined") else thread_id

    snapshot = class_snapshot()
    history = get_teacher_history(teacher_id, thread_id, limit=20)

    hist_str = "\n".join(
        f"{h['role'].upper()}: {h['content']}" for h in history if h.get("content")
    ) or "(no prior messages)"

    observations: list[str] = []
    artifacts: list[dict] = []

    _save_turn(teacher_id, thread_id, "teacher", message, [])

    final_reply = None
    for step in range(MAX_STEPS):
        obs_block = "\n".join(observations) or "(none yet)"
        prompt = f"""{SYSTEM}

{TOOL_SPEC}

CLASS SNAPSHOT (live):
{json.dumps(snapshot, ensure_ascii=False)}

CONVERSATION SO FAR:
{hist_str}

TEACHER'S LATEST MESSAGE:
{message}

TOOL RESULTS THIS TURN:
{obs_block}

Respond with the next single JSON object now."""

        resp = call_llm(prompt, role="main", want_json=True, temperature=0.3, max_tokens=900)
        data = _parse_json(resp.text)

        if not data:
            final_reply = (resp.text or "").strip() or "Sorry, I couldn't process that."
            break

        action = data.get("action")
        if action == "final" or "reply" in data and action != "call_tool":
            final_reply = data.get("reply") or "Done."
            break

        tool_name = data.get("tool")
        tool_fn = TOOLS.get(tool_name)
        if not tool_fn:
            observations.append(f"[{tool_name}] ERROR: unknown tool.")
            continue

        try:
            result = tool_fn(data.get("args") or {})
        except Exception as e:
            result = {"error": str(e)}

        if isinstance(result, dict) and result.get("artifact"):
            artifacts.append(result["artifact"])
        observations.append(f"[{tool_name}] -> {json.dumps(result, ensure_ascii=False)[:1200]}")
    else:
        # Ran out of steps — synthesize from what we have.
        final_reply = "I've done what I can for this request. " + \
            (f"Completed: {'; '.join(a.get('type','') for a in artifacts)}." if artifacts else "")

    _save_turn(teacher_id, thread_id, "assistant", final_reply, artifacts)
    return {"reply": final_reply, "artifacts": artifacts, "steps": step + 1}
