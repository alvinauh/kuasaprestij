"""
Teacher memory — what makes the AI Controller personal to each teacher.

Tier 1 (profile): explicit settings (subjects, forms, language, style) plus durable facts
the controller learns from chat ("I teach 4 Sains Tulen", "keep quizzes short"). Facts come
from the `remember` tool and from a periodic background pass over recent teacher messages.

Tier 2 (materials): the teacher's own uploaded notes, chunked and embedded with the same
local model as the syllabus, searched per teacher via the match_teacher_materials RPC.

Readiness: a 0–100 score per teacher of how much the controller has to personalize with,
plus the concrete next steps that would raise it (shown in the admin console and to the
teacher). Tables: schema/teacher_personalization.sql.
"""

import json
import os
import threading
import time
from datetime import datetime, timezone
from typing import Optional

from dotenv import load_dotenv
from supabase import Client
from agents.db_client import make_supabase_client

from agents.llm_client import call_llm, _get_embedder

load_dotenv(override=True)

supabase: Client = make_supabase_client()

MAX_FACTS = 25
LEARN_EVERY = 4            # new teacher messages before a background learning pass
CHUNK_CHARS = 900
CHUNK_OVERLAP = 150
MAX_CHUNKS_PER_FILE = 200  # ~180k chars; keeps CPU embedding time bounded
MIN_SIMILARITY = 0.35      # below this a "match" is noise for the mpnet model
_CACHE_TTL = 60

_profile_cache: dict[str, tuple[float, dict]] = {}
_material_count_cache: dict[str, tuple[float, int]] = {}
_learning: set[str] = set()
_learning_lock = threading.Lock()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# --------------------------------------------------------------------------- #
# Tier 1 — profile
# --------------------------------------------------------------------------- #

_EMPTY_PROFILE = {"subjects": [], "form_levels": [], "preferred_language": None,
                  "teaching_style": None, "facts": [], "last_learned_at": None}


def get_profile(teacher_id: str, fresh: bool = False) -> dict:
    hit = _profile_cache.get(teacher_id)
    if hit and not fresh and time.time() - hit[0] < _CACHE_TTL:
        return hit[1]
    try:
        res = supabase.table("teacher_profile").select("*").eq("teacher_id", teacher_id).limit(1).execute()
        prof = {**_EMPTY_PROFILE, **(res.data[0] if res.data else {})}
    except Exception as e:
        print(f"[teacher_memory] profile load failed: {e}")
        prof = dict(_EMPTY_PROFILE)
    prof["facts"] = prof.get("facts") or []
    _profile_cache[teacher_id] = (time.time(), prof)
    return prof


def _save_profile(teacher_id: str, fields: dict) -> dict:
    row = {"teacher_id": teacher_id, **fields, "updated_at": _now()}
    supabase.table("teacher_profile").upsert(row, on_conflict="teacher_id").execute()
    _profile_cache.pop(teacher_id, None)
    return get_profile(teacher_id, fresh=True)


def update_profile(teacher_id: str, subjects=None, form_levels=None,
                   preferred_language=None, teaching_style=None) -> dict:
    """Explicit edits from the teacher. None leaves a field unchanged."""
    fields: dict = {}
    if subjects is not None:
        fields["subjects"] = [s.strip() for s in subjects if str(s).strip()][:12]
    if form_levels is not None:
        fields["form_levels"] = sorted({int(f) for f in form_levels if 1 <= int(f) <= 6})
    if preferred_language is not None:
        fields["preferred_language"] = preferred_language.strip() or None
    if teaching_style is not None:
        fields["teaching_style"] = teaching_style.strip()[:500] or None
    return _save_profile(teacher_id, fields) if fields else get_profile(teacher_id)


def _merge_facts(existing: list, new: list[str], source: str) -> list:
    seen = {f.get("fact", "").strip().lower() for f in existing}
    merged = list(existing)
    for fact in new:
        fact = str(fact).strip()[:300]
        if fact and fact.lower() not in seen:
            seen.add(fact.lower())
            merged.append({"fact": fact, "source": source, "created_at": _now()})
    return merged[-MAX_FACTS:]


def add_fact(teacher_id: str, fact: str, source: str = "explicit") -> dict:
    prof = get_profile(teacher_id, fresh=True)
    return _save_profile(teacher_id, {"facts": _merge_facts(prof["facts"], [fact], source)})


def remove_fact(teacher_id: str, index: int) -> dict:
    prof = get_profile(teacher_id, fresh=True)
    facts = prof["facts"]
    if 0 <= index < len(facts):
        facts = facts[:index] + facts[index + 1:]
    return _save_profile(teacher_id, {"facts": facts})


def profile_prompt_block(teacher_id: str) -> str:
    """Compact profile for the planner prompt — kept short so small models still emit
    valid JSON."""
    p = get_profile(teacher_id)
    lines = []
    if p["subjects"]:
        lines.append("Teaches: " + ", ".join(p["subjects"]))
    if p["form_levels"]:
        lines.append("Forms: " + ", ".join(f"Form {f}" for f in p["form_levels"]))
    if p["preferred_language"]:
        lines.append(f"Default language for generated content: {p['preferred_language']}")
    if p["teaching_style"]:
        lines.append(f"Style preferences: {p['teaching_style']}")
    for f in p["facts"][-10:]:
        lines.append(f"- {f.get('fact')}")
    return "\n".join(lines)[:1200] or "(nothing known yet)"


def maybe_learn_async(teacher_id: str) -> None:
    """Kick off a background learning pass if enough new teacher messages have arrived.
    One pass per teacher at a time; failures are logged, never raised."""
    with _learning_lock:
        if teacher_id in _learning:
            return
        _learning.add(teacher_id)
    threading.Thread(target=_learn, args=(teacher_id,), daemon=True).start()


def _learn(teacher_id: str) -> None:
    try:
        prof = get_profile(teacher_id, fresh=True)
        q = supabase.table("teacher_chat").select("content, created_at")\
            .eq("teacher_id", teacher_id).eq("role", "teacher")\
            .order("created_at", desc=True).limit(30)
        if prof.get("last_learned_at"):
            q = q.gt("created_at", prof["last_learned_at"])
        msgs = q.execute().data or []
        if len(msgs) < LEARN_EVERY:
            return
        convo = "\n".join(f"- {m['content'][:400]}" for m in reversed(msgs))
        known = "\n".join(f"- {f.get('fact')}" for f in prof["facts"]) or "(none)"
        prompt = f"""You maintain a memory profile of a Malaysian secondary school teacher who uses an AI
assistant. From the teacher's recent messages below, extract ONLY durable facts about the teacher
that will still be true next week and would help personalize future help: subjects and forms they
teach, class characteristics, preferred language, question/slide style preferences, constraints.
Ignore one-off requests ("make a quiz on X") unless they reveal a lasting preference.
Do not repeat facts already known.

ALREADY KNOWN:
{known}

RECENT TEACHER MESSAGES:
{convo}

Reply with ONE JSON object:
{{"facts": ["short fact", ...], "subjects": ["..."], "form_levels": [4, 5],
  "preferred_language": "English|Bahasa Melayu|Chinese|null", "teaching_style": "short phrase or null"}}
Use empty lists / null when unknown."""
        resp = call_llm(prompt, role="main", want_json=True, temperature=0.1, max_tokens=600)
        data = json.loads(resp.text)
        if isinstance(data, list):
            data = data[0] if data and isinstance(data[0], dict) else {}

        fields: dict = {"last_learned_at": _now(),
                        "facts": _merge_facts(prof["facts"], data.get("facts") or [], "chat")}
        # Learned values only fill gaps — never overwrite what the teacher set explicitly.
        if not prof["subjects"] and data.get("subjects"):
            fields["subjects"] = [str(s) for s in data["subjects"]][:12]
        if not prof["form_levels"] and data.get("form_levels"):
            fields["form_levels"] = sorted({int(f) for f in data["form_levels"]
                                            if str(f).isdigit() and 1 <= int(f) <= 6})
        lang = data.get("preferred_language")
        if not prof["preferred_language"] and lang and str(lang).lower() != "null":
            fields["preferred_language"] = str(lang)
        style = data.get("teaching_style")
        if not prof["teaching_style"] and style and str(style).lower() != "null":
            fields["teaching_style"] = str(style)[:500]
        _save_profile(teacher_id, fields)
        print(f"[teacher_memory] learned for {teacher_id[:8]}: {len(fields['facts']) - len(prof['facts'])} new fact(s)")
    except Exception as e:
        print(f"[teacher_memory] learning pass failed: {e}")
    finally:
        with _learning_lock:
            _learning.discard(teacher_id)


# --------------------------------------------------------------------------- #
# Tier 2 — materials
# --------------------------------------------------------------------------- #

def chunk_text(text: str) -> list[str]:
    text = " ".join((text or "").split())
    chunks, i = [], 0
    while i < len(text) and len(chunks) < MAX_CHUNKS_PER_FILE:
        end = min(i + CHUNK_CHARS, len(text))
        if end < len(text):
            cut = text.rfind(" ", i + CHUNK_CHARS // 2, end)
            end = cut if cut > i else end
        chunks.append(text[i:end].strip())
        if end >= len(text):
            break
        i = max(end - CHUNK_OVERLAP, i + 1)
    return [c for c in chunks if len(c) > 40]


def add_material(teacher_id: str, filename: str, raw_text: str,
                 subject: Optional[str] = None, topic_hint: Optional[str] = None) -> dict:
    chunks = chunk_text(raw_text)
    if not chunks:
        return {"error": "No readable text found in this file."}
    vectors = _get_embedder().encode(chunks, batch_size=16).tolist()
    mat = supabase.table("teacher_materials").insert({
        "teacher_id": teacher_id, "filename": filename[:200],
        "subject": (subject or "").strip() or None, "topic_hint": (topic_hint or "").strip() or None,
        "chunk_count": len(chunks), "char_count": len(raw_text or ""),
    }).execute().data[0]
    rows = [{"material_id": mat["id"], "teacher_id": teacher_id, "chunk_index": i,
             "content": c, "embedding": v} for i, (c, v) in enumerate(zip(chunks, vectors))]
    try:
        for start in range(0, len(rows), 50):
            supabase.table("teacher_material_chunks").insert(rows[start:start + 50]).execute()
    except Exception:
        supabase.table("teacher_materials").delete().eq("id", mat["id"]).execute()
        raise
    _material_count_cache.pop(teacher_id, None)
    return mat


def list_materials(teacher_id: str) -> list[dict]:
    res = supabase.table("teacher_materials")\
        .select("id, filename, subject, topic_hint, chunk_count, char_count, created_at")\
        .eq("teacher_id", teacher_id).order("created_at", desc=True).execute()
    return res.data or []


def delete_material(teacher_id: str, material_id: str) -> bool:
    res = supabase.table("teacher_materials").delete()\
        .eq("id", material_id).eq("teacher_id", teacher_id).execute()
    _material_count_cache.pop(teacher_id, None)
    return bool(res.data)


def _material_count(teacher_id: str) -> int:
    hit = _material_count_cache.get(teacher_id)
    if hit and time.time() - hit[0] < _CACHE_TTL:
        return hit[1]
    try:
        n = supabase.table("teacher_materials").select("id", count="exact")\
            .eq("teacher_id", teacher_id).limit(1).execute().count or 0
    except Exception:
        n = 0
    _material_count_cache[teacher_id] = (time.time(), n)
    return n


def search_materials(teacher_id: str, query: str, k: int = 3) -> list[dict]:
    """Top-k relevant chunks from this teacher's own uploads (empty if none / no match)."""
    if not query or not _material_count(teacher_id):
        return []
    try:
        vec = _get_embedder().encode(query[:1000]).tolist()
        res = supabase.rpc("match_teacher_materials", {
            "p_teacher_id": teacher_id, "query_embedding": vec, "match_count": k,
        }).execute()
        return [r for r in (res.data or []) if (r.get("similarity") or 0) >= MIN_SIMILARITY]
    except Exception as e:
        print(f"[teacher_memory] material search failed: {e}")
        return []


def materials_prompt_block(hits: list[dict], max_chars: int = 1500) -> str:
    out, used = [], 0
    for h in hits:
        snippet = h["content"][: max(0, max_chars - used)]
        if not snippet:
            break
        out.append(f"[{h['filename']}] {snippet}")
        used += len(snippet)
    return "\n".join(out)


# --------------------------------------------------------------------------- #
# Readiness — how far along each teacher's personalization is
# --------------------------------------------------------------------------- #

TARGETS = {"facts": 5, "materials": 5, "messages": 30, "decisions": 5}
LEVELS = [(75, "Well tuned"), (50, "Personalised"), (25, "Getting to know you"), (0, "Generic")]


def _score(profile: dict, class_subjects: list[str], materials: list[dict],
           teacher_msgs: int, decisions: int) -> dict:
    subjects = profile.get("subjects") or sorted(
        {s for s in class_subjects if s and s.strip().lower() not in ("all", "general", "-")})
    facts = len(profile.get("facts") or [])
    mat_subjects = {(m.get("subject") or "").strip().lower() for m in materials}
    uncovered = [s for s in subjects if s.strip().lower() not in mat_subjects]

    profile_pts = (7 if subjects else 0) + (5 if profile.get("form_levels") else 0) \
        + (4 if profile.get("preferred_language") else 0) + (4 if profile.get("teaching_style") else 0)
    coverage = (1 - len(uncovered) / len(subjects)) if subjects else (1.0 if materials else 0.0)
    components = [
        {"key": "profile", "label": "Profile basics", "points": profile_pts, "max": 20,
         "detail": f"{'subjects ✓' if subjects else 'no subjects'}, "
                   f"{'forms ✓' if profile.get('form_levels') else 'no forms'}, "
                   f"{'language ✓' if profile.get('preferred_language') else 'no language'}, "
                   f"{'style ✓' if profile.get('teaching_style') else 'no style'}"},
        {"key": "facts", "label": "Learned facts", "max": 15,
         "points": round(min(facts / TARGETS["facts"], 1) * 15), "detail": f"{facts}/{TARGETS['facts']}"},
        {"key": "materials", "label": "Uploaded materials", "max": 30,
         "points": round(min(len(materials) / TARGETS["materials"], 1) * 20 + coverage * 10),
         "detail": f"{len(materials)} file(s); "
                   + (f"missing: {', '.join(uncovered)}" if uncovered else "all subjects covered")},
        {"key": "conversation", "label": "Conversations", "max": 15,
         "points": round(min(teacher_msgs / TARGETS["messages"], 1) * 15),
         "detail": f"{teacher_msgs}/{TARGETS['messages']} messages"},
        {"key": "feedback", "label": "Assignment decisions", "max": 20,
         "points": round(min(decisions / TARGETS["decisions"], 1) * 20),
         "detail": f"{decisions}/{TARGETS['decisions']} confirmed or cancelled"},
    ]

    steps = []
    if not subjects:
        steps.append("Set the subjects they teach (AI profile) or create a classroom with a subject.")
    if not profile.get("form_levels"):
        steps.append("Set the form levels they teach.")
    if not profile.get("preferred_language"):
        steps.append("Choose a default language for generated content.")
    if not profile.get("teaching_style"):
        steps.append("Describe their teaching style (e.g. 'short KBAT-heavy quizzes, exam-style wording').")
    if len(materials) < TARGETS["materials"]:
        steps.append(f"Upload {TARGETS['materials'] - len(materials)} more teaching material(s) (notes, worksheets, past papers).")
    for s in uncovered[:3]:
        steps.append(f"Upload at least one material for {s}.")
    if facts < TARGETS["facts"]:
        steps.append("Tell the AI Controller lasting preferences ('remember that…') so it learns facts.")
    if teacher_msgs < TARGETS["messages"]:
        steps.append(f"Use the AI Controller more ({teacher_msgs}/{TARGETS['messages']} messages so far).")
    if decisions < TARGETS["decisions"]:
        steps.append(f"Confirm or cancel AI-proposed assignments ({decisions}/{TARGETS['decisions']}) — future feedback learning uses these.")

    score = sum(c["points"] for c in components)
    level = next(name for floor, name in LEVELS if score >= floor)
    return {"score": score, "level": level, "components": components, "next_steps": steps,
            "subjects": subjects, "fact_count": facts, "material_count": len(materials)}


def _chat_stats(rows: list[dict]) -> dict[str, dict]:
    stats: dict[str, dict] = {}
    for r in rows:
        s = stats.setdefault(r["teacher_id"], {"msgs": 0, "decisions": 0, "last": None})
        if r["role"] == "teacher":
            s["msgs"] += 1
            s["last"] = max(s["last"] or "", r["created_at"])
        for a in r.get("artifacts") or []:
            if isinstance(a, dict) and a.get("type") == "assignment_proposal" \
                    and a.get("status") in ("confirmed", "cancelled"):
                s["decisions"] += 1
    return stats


def readiness(teacher_id: str) -> dict:
    prof = get_profile(teacher_id, fresh=True)
    classes = supabase.table("classrooms").select("subject").eq("teacher_id", teacher_id).execute().data or []
    chat = supabase.table("teacher_chat").select("teacher_id, role, artifacts, created_at")\
        .eq("teacher_id", teacher_id).limit(5000).execute().data or []
    st = _chat_stats(chat).get(teacher_id, {"msgs": 0, "decisions": 0})
    return _score(prof, [c["subject"] for c in classes], list_materials(teacher_id), st["msgs"], st["decisions"])


def readiness_all() -> list[dict]:
    """Every teacher/admin account with its personalization score, lowest first."""
    people = supabase.table("profiles").select("id, full_name, role, school")\
        .in_("role", ["teacher", "admin"]).execute().data or []
    profiles = {p["teacher_id"]: {**_EMPTY_PROFILE, **p}
                for p in supabase.table("teacher_profile").select("*").execute().data or []}
    mats: dict[str, list] = {}
    for m in supabase.table("teacher_materials").select("teacher_id, subject").execute().data or []:
        mats.setdefault(m["teacher_id"], []).append(m)
    cls: dict[str, list] = {}
    for c in supabase.table("classrooms").select("teacher_id, subject").execute().data or []:
        cls.setdefault(c["teacher_id"], []).append(c["subject"])
    stats = _chat_stats(supabase.table("teacher_chat")
                        .select("teacher_id, role, artifacts, created_at")
                        .order("created_at", desc=True).limit(20000).execute().data or [])

    out = []
    for p in people:
        st = stats.get(p["id"], {"msgs": 0, "decisions": 0, "last": None})
        r = _score(profiles.get(p["id"], dict(_EMPTY_PROFILE)), cls.get(p["id"], []),
                   mats.get(p["id"], []), st["msgs"], st["decisions"])
        out.append({"teacher_id": p["id"], "name": p.get("full_name") or "(no name)",
                    "role": p["role"], "school": p.get("school"),
                    "last_chat_at": st.get("last"), **r})
    out.sort(key=lambda r: r["score"])
    return out
