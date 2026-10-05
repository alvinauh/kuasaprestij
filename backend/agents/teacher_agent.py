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
from contextvars import ContextVar
from typing import Optional

from supabase import create_client, Client
from dotenv import load_dotenv

from agents.llm_client import call_llm
from agents.lesson_agent import generate_lesson, get_or_create_lesson
from agents.quiz_agent import generate_quiz

load_dotenv(override=True)

supabase: Client = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))

TEST_UUID = "00000000-0000-0000-0000-000000000001"
MAX_STEPS = 8

# Who is driving this chat turn. Set by run_teacher_chat / confirm_assignment so every
# tool only sees the caller's own classes. ContextVar (not a global) because requests
# run concurrently in worker threads; asyncio.to_thread copies the context per call.
_caller: ContextVar[dict] = ContextVar("teacher_agent_caller", default={"teacher_id": None, "is_admin": False})


# --------------------------------------------------------------------------- #
# Class-state helpers (long-term memory, read live each turn)
# --------------------------------------------------------------------------- #

def _teacher_classes() -> list[dict]:
    """The caller's classrooms as [{id, name, subject}]. Admins see every classroom."""
    caller = _caller.get()
    try:
        q = supabase.table("classrooms").select("id, name, subject").order("name")
        if not caller["is_admin"]:
            if not caller["teacher_id"]:
                return []
            q = q.eq("teacher_id", caller["teacher_id"])
        return q.execute().data or []
    except Exception as e:
        print(f"[teacher_agent] classes lookup failed: {e}")
        return []


def _class_members(class_ids: list[str]) -> dict[str, list[str]]:
    """classroom_id -> [student_id, ...]"""
    if not class_ids:
        return {}
    out: dict[str, list[str]] = {cid: [] for cid in class_ids}
    try:
        res = supabase.table("classroom_members").select("classroom_id, student_id")\
            .in_("classroom_id", class_ids).execute()
        for r in (res.data or []):
            out.setdefault(r["classroom_id"], []).append(r["student_id"])
    except Exception as e:
        print(f"[teacher_agent] members lookup failed: {e}")
    return out


def _names_for(ids: list[str]) -> list[dict]:
    if not ids:
        return []
    try:
        res = supabase.table("profiles").select("id, full_name").in_("id", ids).execute()
        names = {r["id"]: r.get("full_name") or "Unnamed" for r in (res.data or [])}
    except Exception as e:
        print(f"[teacher_agent] names lookup failed: {e}")
        names = {}
    return [{"id": i, "name": names.get(i, "Unnamed")} for i in ids]


def _student_roster() -> list[dict]:
    """Students the caller may see, as [{id, name}]: members of the teacher's own
    classes. Admins see every student on the platform."""
    if not _caller.get()["is_admin"]:
        members = _class_members([c["id"] for c in _teacher_classes()])
        ids = sorted({sid for sids in members.values() for sid in sids})
        return _names_for(ids)
    return _all_students()


def _roster_ids(roster: list[dict]) -> list[str]:
    # The nil UUID keeps .in_() valid and matches no one when the roster is empty.
    # (Not TEST_UUID: that is a real test student with mastery data.)
    return [s["id"] for s in roster] or ["00000000-0000-0000-0000-000000000000"]


def _all_students() -> list[dict]:
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
        return [s["id"] for s in roster if s["id"] in weak_ids]

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
            .select("student_id, topic, mastery_level").in_("student_id", _roster_ids(roster))\
            .order("mastery_level", desc=False).limit(40).execute()
        for r in (res.data or []):
            weak_topics.append({
                "student": name_by_id.get(r["student_id"], "Unknown"),
                "topic": r.get("topic"),
                "mastery_pct": round((r.get("mastery_level") or 0) * 100),
            })
    except Exception as e:
        print(f"[teacher_agent] mastery snapshot failed: {e}")

    top_performers: list[dict] = []
    try:
        res = supabase.table("dskp_mastery")\
            .select("student_id, topic, mastery_level").in_("student_id", _roster_ids(roster))\
            .order("mastery_level", desc=True).limit(20).execute()
        for r in (res.data or []):
            top_performers.append({
                "student": name_by_id.get(r["student_id"], "Unknown"),
                "topic": r.get("topic"),
                "mastery_pct": round((r.get("mastery_level") or 0) * 100),
            })
    except Exception as e:
        print(f"[teacher_agent] top performers snapshot failed: {e}")

    recent_assignments: list[dict] = []
    try:
        res = supabase.table("assigned_tasks")\
            .select("student_id, topic, task_type, status, assigned_at").in_("student_id", _roster_ids(roster))\
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
        "classes": [{"name": c["name"], "subject": c.get("subject")} for c in _teacher_classes()],
        "students": [s["name"] for s in roster],
        "weakest_topics": weak_topics[:limit_topics],
        "top_performers": top_performers[:limit_topics],
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


def _parse_form_level(raw) -> int:
    """Accept int 4, string '4', or string 'Form 4' / 'form4' — always return an int."""
    import re as _re
    if raw is None:
        return 4
    if isinstance(raw, int):
        return raw
    m = _re.search(r"\d+", str(raw))
    return int(m.group()) if m else 4


def _tool_generate_slides(args: dict) -> dict:
    topic = args.get("topic")
    subject = args.get("subject", "")
    if not topic:
        return {"error": "topic is required to generate slides."}
    form_level = _parse_form_level(args.get("form_level"))
    language = args.get("language", "English")
    lesson = get_or_create_lesson(topic, subject, form_level, language)
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
    num = min(int(args.get("num_questions") or 5), 8)  # cap at 8 to prevent JSON truncation
    difficulty = args.get("difficulty", "medium")
    qtype = args.get("question_type", "mcq")
    language = args.get("language", "English")
    form_level = _parse_form_level(args.get("form_level"))

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


_TASK_FIELDS = ("subject", "topic", "task_type", "instructions", "teacher_note",
                "priority_score", "lesson_id", "quiz_id")


def _tool_assign_task(args: dict) -> dict:
    """Never assigns directly: returns a proposal the teacher must confirm, choosing
    which of their classes receive it (see confirm_assignment)."""
    classes = _teacher_classes()
    if not classes:
        return {"error": "You have no classes yet. Create one in My Classrooms first.", "stop": True}
    members = _class_members([c["id"] for c in classes])

    target = args.get("students", "all")
    if isinstance(target, str) and target.lower() in ("all", "weak"):
        target = target.lower()
        subj = (args.get("subject") or "").lower()
        suggested = {c["id"] for c in classes if subj and subj in (c.get("subject") or "").lower()}
        suggested = suggested or {c["id"] for c in classes}
    else:
        named = _resolve_students(target, _student_roster())
        if not named:
            return {"error": f"No student in your classes matched {target!r}."}
        target = named
        suggested = {cid for cid, sids in members.items() if set(sids) & set(named)}

    task = {k: args.get(k) for k in _TASK_FIELDS if args.get(k) not in (None, "")}
    task.setdefault("task_type", "quiz")
    who = {"all": "all students", "weak": "students below 50% mastery"}.get(
        target, ", ".join(s["name"] for s in _names_for(target)) if isinstance(target, list) else "")
    return {
        "artifact": {
            "type": "assignment_proposal",
            "status": "pending",
            "task": task,
            "target": target,
            "target_label": who,
            "classes": [{
                "id": c["id"], "name": c["name"], "subject": c.get("subject"),
                "student_count": len(members.get(c["id"], [])),
                "suggested": c["id"] in suggested,
            } for c in classes],
        },
        "stop": True,
        "reply": (f"Are you sure? Before I assign the {task['task_type']} on "
                  f"'{task.get('topic') or 'this topic'}' to {who}, pick which classes should get it below."),
    }


def confirm_assignment(teacher_id: str, is_admin: bool, message_id: str,
                       artifact_index: int, classroom_ids: list[str], cancel: bool = False) -> dict:
    """Act on a pending assignment_proposal stored in teacher_chat: insert the tasks for
    the chosen classes (or cancel), mark the proposal settled, and log the outcome."""
    _caller.set({"teacher_id": teacher_id, "is_admin": is_admin})
    row = supabase.table("teacher_chat").select("id, thread_id, artifacts")\
        .eq("id", message_id).eq("teacher_id", teacher_id).limit(1).execute()
    if not row.data:
        return {"error": "Proposal not found.", "status_code": 404}
    msg = row.data[0]
    arts = msg.get("artifacts") or []
    if not (0 <= artifact_index < len(arts)) or arts[artifact_index].get("type") != "assignment_proposal":
        return {"error": "Proposal not found.", "status_code": 404}
    prop = arts[artifact_index]
    if prop.get("status") != "pending":
        return {"error": f"This proposal was already {prop.get('status')}.", "status_code": 409}

    def settle(status: str, extra: dict):
        arts[artifact_index] = {**prop, "status": status, **extra}
        supabase.table("teacher_chat").update({"artifacts": arts}).eq("id", message_id).execute()

    if cancel:
        settle("cancelled", {})
        reply = "Okay, cancelled. Nothing was assigned."
        _save_turn(teacher_id, msg["thread_id"], "assistant", reply, [])
        return {"reply": reply, "artifacts": [], "proposal": arts[artifact_index]}

    own = {c["id"]: c for c in _teacher_classes()}
    chosen = [cid for cid in dict.fromkeys(classroom_ids or []) if cid in own]
    if not chosen:
        return {"error": "Pick at least one of your classes.", "status_code": 400}

    members = _class_members(chosen)
    pool = _names_for(sorted({sid for sids in members.values() for sid in sids}))
    target = prop.get("target", "all")
    ids = (_resolve_students(target, pool) if isinstance(target, str)
           else [sid for sid in target if sid in {p["id"] for p in pool}])
    if not ids:
        return {"error": "No students in the chosen classes match this task's target.", "status_code": 400}

    task = prop.get("task") or {}
    row_base = {
        "subject": task.get("subject", ""), "topic": task.get("topic", ""),
        "task_type": task.get("task_type", "quiz"), "instructions": task.get("instructions", ""),
        "teacher_note": task.get("teacher_note", ""),
        "priority_score": float(task.get("priority_score") or 0.7), "status": "pending",
    }
    for k in ("lesson_id", "quiz_id"):
        if task.get(k):
            row_base[k] = task[k]
    supabase.table("assigned_tasks").insert([{**row_base, "student_id": sid} for sid in ids]).execute()

    class_names = [own[c]["name"] for c in chosen]
    settle("confirmed", {"assigned_classes": class_names, "student_count": len(ids)})
    names = {p["id"]: p["name"] for p in pool}
    artifact = {
        "type": "assignment", "topic": row_base["topic"], "task_type": row_base["task_type"],
        "student_count": len(ids), "students": [names.get(i, "?") for i in ids],
        "classes": class_names,
    }
    reply = (f"Done. Assigned '{row_base['topic']}' {row_base['task_type']} to {len(ids)} "
             f"student(s) in {', '.join(class_names)}.")
    _save_turn(teacher_id, msg["thread_id"], "assistant", reply, [artifact])
    return {"reply": reply, "artifacts": [artifact], "proposal": arts[artifact_index]}


def _tool_list_assignments(args: dict) -> dict:
    status = args.get("status")
    roster = _student_roster()
    name_by_id = {s["id"]: s["name"] for s in roster}
    try:
        q = supabase.table("assigned_tasks").select(
            "student_id, subject, topic, task_type, status, assigned_at"
        ).in_("student_id", _roster_ids(roster)).order("assigned_at", desc=True)
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


def _tool_get_student_roster(args: dict) -> dict:
    roster = _student_roster()
    enriched = []
    for s in roster:
        try:
            m = supabase.table("dskp_mastery").select("mastery_level")\
                .eq("student_id", s["id"]).execute()
            scores = [r.get("mastery_level") or 0 for r in (m.data or [])]
            avg = round(sum(scores) / len(scores) * 100) if scores else 0
        except Exception:
            avg = None
        enriched.append({"id": s["id"], "name": s["name"], "avg_mastery_pct": avg})
    return {"students": enriched, "count": len(enriched)}


def _tool_query_mastery(args: dict) -> dict:
    student = args.get("student")
    subject = args.get("subject")
    topic = args.get("topic")
    threshold = args.get("threshold")        # lte filter (max mastery, e.g. 0.5 → below 50%)
    min_threshold = args.get("min_threshold")  # gte filter (min mastery, e.g. 0.8 → above 80%)
    sort = args.get("sort", "asc")           # "asc" = worst first; "desc" = best first

    roster = _student_roster()
    name_by_id = {s["id"]: s["name"] for s in roster}
    try:
        q = supabase.table("dskp_mastery").select("student_id, curriculum_tag, topic, mastery_level")\
            .in_("student_id", _roster_ids(roster))
        if subject:
            q = q.ilike("curriculum_tag", f"%{subject}%")  # dskp_mastery has no subject column
        if topic:
            q = q.ilike("topic", f"%{topic}%")
        if threshold is not None:
            q = q.lte("mastery_level", float(threshold))
        if min_threshold is not None:
            q = q.gte("mastery_level", float(min_threshold))
        if student:
            ids = _resolve_students(student, roster)
            if not ids:
                return {"error": f"No student in your classes matched '{student}'."}
            q = q.in_("student_id", ids)
        order_desc = (sort == "desc")
        res = q.order("mastery_level", desc=order_desc).limit(40).execute()
        rows = [{
            "student": name_by_id.get(r["student_id"], "Unknown"),
            "subject": r.get("curriculum_tag"),
            "topic": r.get("topic"),
            "mastery_pct": round((r.get("mastery_level") or 0) * 100),
        } for r in (res.data or [])]
        return {"records": rows, "count": len(rows)}
    except Exception as e:
        return {"error": str(e)}


def _tool_get_platform_integrations(args: dict) -> dict:
    try:
        res = supabase.table("platform_integrations").select(
            "id, name, base_url, status, last_synced_at"
        ).execute()
        return {"integrations": res.data or []}
    except Exception as e:
        return {"error": str(e)}


def _tool_pull_integration_data(args: dict) -> dict:
    integration_name = args.get("integration_name")
    integration_id = args.get("integration_id")
    endpoint = args.get("endpoint", "")

    try:
        import httpx
        q = supabase.table("platform_integrations").select(
            "id, name, base_url, api_key_encrypted, headers"
        )
        if integration_id:
            q = q.eq("id", integration_id)
        elif integration_name:
            q = q.ilike("name", f"%{integration_name}%")
        res = q.limit(1).execute()
        if not res.data:
            return {"error": "No matching integration found."}
        integ = res.data[0]
        base_url = (integ.get("base_url") or "").rstrip("/")
        url = f"{base_url}/{endpoint.lstrip('/')}" if endpoint else base_url
        hdrs = integ.get("headers") or {}
        api_key = integ.get("api_key_encrypted")
        if api_key:
            hdrs.setdefault("Authorization", f"Bearer {api_key}")
        r = httpx.get(url, headers=hdrs, timeout=10)
        try:
            data = r.json()
        except Exception:
            data = r.text[:500]
        return {"integration": integ.get("name"), "status": r.status_code, "data": data}
    except Exception as e:
        return {"error": str(e)}


def _tool_sync_external_data(args: dict) -> dict:
    integration_name = args.get("integration_name")
    integration_id = args.get("integration_id")
    try:
        q = supabase.table("platform_integrations").select("id, name")
        if integration_id:
            q = q.eq("id", integration_id)
        elif integration_name:
            q = q.ilike("name", f"%{integration_name}%")
        res = q.limit(1).execute()
        if not res.data:
            return {"error": "Integration not found."}
        integ = res.data[0]
        supabase.table("platform_integrations").update({"status": "syncing"})\
            .eq("id", integ["id"]).execute()
        return {"synced": integ.get("name"), "status": "sync initiated"}
    except Exception as e:
        return {"error": str(e)}


def _tool_generate_embed_link(args: dict) -> dict:
    game = args.get("game", "blockblast")
    topic = args.get("topic", "")
    subject = args.get("subject", "")
    form_level = args.get("form_level", 4)
    lang = args.get("lang", "en")

    import urllib.parse
    base = "https://app.kuasaprestij.com"
    params = urllib.parse.urlencode({
        "topic": topic, "subject": subject, "form_level": form_level, "lang": lang
    })
    embed_url = f"{base}/embed/{game}?{params}"
    iframe_snippet = (
        f'<iframe src="{embed_url}" width="100%" height="620" '
        f'frameborder="0" allow="fullscreen" title="KuasaPrestij — {topic}"></iframe>'
    )
    gc_share = (
        f"https://classroom.google.com/share?url={urllib.parse.quote(embed_url)}"
        f"&title={urllib.parse.quote(f'KuasaPrestij: {topic} ({subject})')}"
    )
    return {"embed_url": embed_url, "iframe_snippet": iframe_snippet, "google_classroom_url": gc_share}


def _tool_export_questions(args: dict) -> dict:
    subject = args.get("subject")
    topic = args.get("topic")
    limit = min(int(args.get("limit") or 10), 20)
    try:
        q = supabase.table("topic_anchors").select("topic, subject, question_bank")
        if subject:
            q = q.ilike("subject", f"%{subject}%")
        if topic:
            q = q.ilike("topic", f"%{topic}%")
        res = q.limit(10).execute()
        questions: list[dict] = []
        for row in (res.data or []):
            bank = row.get("question_bank") or []
            if isinstance(bank, str):
                try:
                    bank = json.loads(bank)
                except Exception:
                    bank = []
            for item in (bank if isinstance(bank, list) else []):
                questions.append({
                    "topic": row.get("topic"),
                    "subject": row.get("subject"),
                    "question": item.get("question") or item.get("stem", ""),
                    "type": item.get("type", "mcq"),
                })
                if len(questions) >= limit:
                    break
            if len(questions) >= limit:
                break
        return {"questions": questions, "count": len(questions)}
    except Exception as e:
        return {"error": str(e)}


def _tool_list_external_classes(args: dict) -> dict:
    """Return students imported from MoE/external connectors, grouped by class."""
    try:
        res = supabase.table("students") \
            .select("id, full_name, grade_level, metadata, external_id") \
            .not_.is_("metadata", "null") \
            .execute()
        rows = res.data or []
        external = [r for r in rows if isinstance(r.get("metadata"), dict) and r["metadata"].get("source") == "moe_integration"]
        classes: dict[str, list] = {}
        for r in external:
            meta = r.get("metadata") or {}
            cls = meta.get("namakelas") or "Unassigned"
            classes.setdefault(cls, []).append({
                "name": r["full_name"],
                "grade": r["grade_level"],
                "id": r["id"],
                "aliran": meta.get("alirankelas"),
                "school": meta.get("nama_sekolah"),
            })
        return {
            "total_students": len(external),
            "classes": [{"class_name": k, "count": len(v), "students": v} for k, v in sorted(classes.items())],
        }
    except Exception as e:
        return {"error": str(e)}


def _tool_import_external_students(args: dict) -> dict:
    """Trigger import of staged MoE data into the students table."""
    import requests as _req
    integration_id = args.get("integration_id") or args.get("id")
    if not integration_id:
        # Auto-detect: find a postgres integration
        try:
            res = supabase.table("platform_integrations") \
                .select("id, name") \
                .eq("connection_type", "postgres") \
                .eq("enabled", True) \
                .limit(1) \
                .execute()
            row = (res.data or [None])[0]
            if not row:
                return {"error": "No active Postgres connector found. Create one in Settings → Integrations."}
            integration_id = row["id"]
        except Exception as e:
            return {"error": str(e)}

    try:
        res = supabase.table("integration_staging") \
            .select("id", count="exact") \
            .eq("integration_id", integration_id) \
            .execute()
        count = res.count or 0
        if count == 0:
            return {"error": "No staged data for this connector. Pull data first (↺ button in Settings)."}
    except Exception as e:
        return {"error": str(e)}

    # Call the import endpoint via internal HTTP
    import os
    base = os.environ.get("INTERNAL_API_URL", "http://localhost:8000")
    try:
        r = _req.post(f"{base}/admin/integrations/{integration_id}/import-students", timeout=60)
        return r.json()
    except Exception as e:
        return {"error": str(e)}


def _tool_get_event_logs(args: dict) -> dict:
    from datetime import datetime, timedelta
    student = args.get("student")
    topic = args.get("topic")
    days = int(args.get("days") or 7)

    roster = _student_roster()
    name_by_id = {s["id"]: s["name"] for s in roster}
    try:
        since = (datetime.utcnow() - timedelta(days=days)).isoformat()
        q = supabase.table("event_logs").select(
            "student_id, topic, subject, is_correct, error_category, created_at"
        ).in_("student_id", _roster_ids(roster)).gte("created_at", since).order("created_at", desc=True)
        if topic:
            q = q.ilike("topic", f"%{topic}%")
        if student:
            ids = _resolve_students(student, roster)
            if not ids:
                return {"error": f"No student in your classes matched '{student}'."}
            q = q.in_("student_id", ids)
        res = q.limit(30).execute()
        rows = [{
            "student": name_by_id.get(r["student_id"], "Unknown"),
            "topic": r.get("topic"),
            "correct": r.get("is_correct"),
            "error": r.get("error_category"),
        } for r in (res.data or [])]
        return {"events": rows, "count": len(rows), "days": days}
    except Exception as e:
        return {"error": str(e)}


TOOLS = {
    "class_overview": _tool_class_overview,
    "student_detail": _tool_student_detail,
    "generate_slides": _tool_generate_slides,
    "generate_questions": _tool_generate_questions,
    "assign_task": _tool_assign_task,
    "list_assignments": _tool_list_assignments,
    "get_student_roster": _tool_get_student_roster,
    "query_mastery": _tool_query_mastery,
    "get_platform_integrations": _tool_get_platform_integrations,
    "pull_integration_data": _tool_pull_integration_data,
    "sync_external_data": _tool_sync_external_data,
    "generate_embed_link": _tool_generate_embed_link,
    "export_questions": _tool_export_questions,
    "get_event_logs": _tool_get_event_logs,
    "list_external_classes": _tool_list_external_classes,
    "import_external_students": _tool_import_external_students,
}

TOOL_SPEC = """Available tools (call ONE per step):
- class_overview {}  -> class-wide snapshot: weakest topics, TOP performers, recent assignments.
- student_detail {"student": "<name>"}  -> one student's mastery + assignments.
- get_student_roster {}  -> all students in the teacher's classes with average mastery %.
- query_mastery {"student"?,"subject"?,"topic"?,"threshold"?,"min_threshold"?,"sort"?}  -> filtered mastery records. threshold=0.5 returns only below 50%; min_threshold=0.8 returns only above 80%; sort="desc" returns highest mastery first (use for top-performer queries).
- generate_slides {"topic","subject","form_level"?,"language"?}  -> creates a lesson/slide deck, returns lesson_id.
- generate_questions {"topic","subject"?,"lesson_id"?,"num_questions"?,"difficulty":"easy|medium|hard","question_type":"mcq|short_answer|essay","language"?}  -> creates a quiz, returns quiz_id.
- assign_task {"students":"all"|"weak"|["name",...], "subject","topic","task_type":"quiz|lesson|practice","instructions","teacher_note"?,"lesson_id"?,"quiz_id"?}  -> PROPOSES a task; the teacher then confirms and picks the classes in the UI. Pass lesson_id (task_type="lesson") or quiz_id from a prior generate step. Call it LAST — it ends the turn.
- list_assignments {"status"?:"pending|in_progress|completed"}  -> recent assigned tasks.
- get_platform_integrations {}  -> list all configured external platform integrations.
- pull_integration_data {"integration_name"?,"integration_id"?,"endpoint"?}  -> fetch live data from an external platform via its configured API.
- sync_external_data {"integration_name"?,"integration_id"?}  -> trigger a sync for an external integration.
- generate_embed_link {"game":"blockblast|catch|flappy","topic","subject","form_level"?,"lang"?}  -> generate an embeddable game URL + iframe snippet + Google Classroom share link.
- export_questions {"subject"?,"topic"?,"limit"?}  -> export cached questions from the question bank.
- get_event_logs {"student"?,"topic"?,"days"?}  -> recent student activity logs (answers, errors).
- list_external_classes {}  -> show all students imported from MoE/external connectors, grouped by class (namakelas).
- import_external_students {"integration_id"?}  -> import staged MoE student data into the system's student roster. Omit integration_id to auto-detect the active Postgres connector.
"""


# --------------------------------------------------------------------------- #
# Memory (teacher_chat table)
# --------------------------------------------------------------------------- #

def get_teacher_history(teacher_id: str, thread_id: str, limit: int = 20) -> list[dict]:
    try:
        res = supabase.table("teacher_chat").select("id, role, content, artifacts, created_at")\
            .eq("teacher_id", teacher_id).eq("thread_id", thread_id)\
            .order("created_at", desc=False).limit(limit).execute()
        return res.data or []
    except Exception as e:
        print(f"[teacher_agent] history load failed: {e}")
        return []


def _save_turn(teacher_id: str, thread_id: str, role: str, content: str, artifacts: list) -> Optional[str]:
    try:
        res = supabase.table("teacher_chat").insert({
            "teacher_id": teacher_id, "thread_id": thread_id,
            "role": role, "content": content, "artifacts": artifacts or [],
        }).execute()
        return res.data[0]["id"] if res.data else None
    except Exception as e:
        print(f"[teacher_agent] save turn failed: {e}")
        return None


# --------------------------------------------------------------------------- #
# Planner loop
# --------------------------------------------------------------------------- #

SYSTEM = """You are the AI Command Centre for KuasaPrestij, a full-service AI assistant for this adaptive
KSSM assessment platform. You can control every aspect of the platform through natural language:

• Student intelligence: read mastery scores, event logs, activity history for any student or the whole class.
• Content generation: create lesson slides and quiz questions grounded in the DSKP syllabus.
• Task management: assign and track work for any student or group.
• Integrations: list, pull live data from, and sync external platform integrations.
• Games & embedding: generate embed links and iframe snippets for interactive games (BlockBlast, Catch, Flappy);
  produce Google Classroom share URLs in one step.
• Question bank: export cached questions as a structured list.

You work in steps. At EACH step reply with a SINGLE JSON object and nothing else:
  {"thought": "...", "action": "call_tool", "tool": "<name>", "args": { ... }}
  OR
  {"thought": "...", "action": "final", "reply": "<message to the teacher>"}

Rules:
- Use tools to DO things; never claim you did something unless a tool confirmed it.
- One tool per step. After a result arrives you may call another tool or finish.
- Be EFFICIENT: skip discovery tools when the request already names the topic and students.
- When assigning a deck/quiz generated this turn, pass its lesson_id/quiz_id into assign_task.
- You only see the teacher's own classes and students. Never say a task WAS assigned — assign_task
  only proposes it; the teacher confirms and chooses the classes.
- Stop as soon as the request is satisfied: a question needs one lookup then "final".
- Ground replies in real data from tool results — never fabricate student names or mastery numbers.
- Keep the final reply concise and actionable. Reply in the SAME language as the teacher's latest
  message: English in → English out; Bahasa Malaysia in → Bahasa Malaysia out.
"""


def _parse_json(text: str) -> Optional[dict]:
    import re
    text = (text or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    text = text.strip()

    # Fast path: valid JSON
    try:
        data = json.loads(text)
        if isinstance(data, list):
            data = data[0] if data else {}
        return data if isinstance(data, dict) else None
    except Exception:
        pass

    # Robust fallback: strip the "thought" field value (LLMs often embed unescaped
    # double-quotes inside it, breaking json.loads). Replace the thought value with
    # a safe placeholder so the rest of the object can be parsed normally.
    cleaned = re.sub(
        r'"thought"\s*:\s*".*?"(?=\s*,\s*"action")',
        '"thought": ""',
        text,
        count=1,
        flags=re.DOTALL,
    )
    if cleaned != text:
        try:
            data = json.loads(cleaned)
            if isinstance(data, list):
                data = data[0] if data else {}
            if isinstance(data, dict):
                return data
        except Exception:
            pass

    # Last resort: brace-match the first {...} block
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
                     thread_id: str = TEST_UUID, is_admin: bool = False) -> dict:
    """Main entry: one teacher message -> orchestrated reply + artifacts. Synchronous
    (offload to a thread from the async endpoint)."""
    teacher_id = TEST_UUID if teacher_id in (None, "undefined") else teacher_id
    thread_id = TEST_UUID if thread_id in (None, "undefined") else thread_id
    _caller.set({"teacher_id": teacher_id, "is_admin": is_admin})

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

        resp = call_llm(prompt, role="main", want_json=True, temperature=0.3, max_tokens=1500)
        data = _parse_json(resp.text)

        if not data:
            final_reply = (resp.text or "").strip() or "Sorry, I couldn't process that."
            break

        action = data.get("action")
        # Smaller models sometimes put the tool name in "action" ({"action": "assign_task", ...});
        # accept it rather than burning every remaining step on "unknown tool".
        if action in TOOLS and not data.get("tool"):
            data["tool"], action = action, "call_tool"
        # ...or answer under another key ({"message": "..."}) with no action at all.
        if not action and not data.get("tool"):
            alt = next((data[k] for k in ("reply", "message", "response", "answer") if isinstance(data.get(k), str)), None)
            if alt:
                final_reply = alt
                break
        if action == "final" or "reply" in data and action != "call_tool":
            final_reply = data.get("reply") or "Done."
            break

        tool_name = data.get("tool")
        tool_fn = TOOLS.get(tool_name)
        if not tool_fn:
            observations.append(
                f"[{tool_name}] ERROR: unknown tool. Reply with "
                '{"action": "call_tool", "tool": "<one of the listed tools>", "args": {...}}.'
            )
            continue

        try:
            result = tool_fn(data.get("args") or {})
        except Exception as e:
            result = {"error": str(e)}

        if isinstance(result, dict) and result.get("artifact"):
            artifacts.append(result["artifact"])
        if isinstance(result, dict) and result.get("stop"):
            # Tools that hand control back to the teacher (assignment proposals) end the
            # turn here — no extra LLM call, and the planner can't claim it "assigned".
            final_reply = result.get("reply") or result.get("error") or "Done."
            break
        observations.append(f"[{tool_name}] -> {json.dumps(result, ensure_ascii=False)[:1200]}")
    else:
        # Ran out of steps — synthesize from what we have.
        final_reply = "I've done what I can for this request. " + \
            (f"Completed: {'; '.join(a.get('type','') for a in artifacts)}." if artifacts else "")

    message_id = _save_turn(teacher_id, thread_id, "assistant", final_reply, artifacts)
    return {"reply": final_reply, "artifacts": artifacts, "steps": step + 1, "message_id": message_id}
