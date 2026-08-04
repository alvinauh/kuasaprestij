from fastapi import FastAPI, HTTPException, BackgroundTasks, Request, Form, Header, Depends
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, Dict, List

import asyncio
import json
import os
import random
import time
import uuid as _uuid
from datetime import datetime, timezone, timedelta

from app.error_logger import log_error
from app.telemetry import TraceMiddleware, log_span
from app.insights import run_insights, format_digest

from agents.orchestrator import (
    retriever_node,
    studio_node,
    generator_node,
    evaluator_node,
    mastery_updater_node,
    AgentState,
    supabase,
    KSSM_TOPICS,
    KSSM_TOPICS_BY_FORM,
    essay_topics_for,
    _get_dynamic_subjects,
    _language_composition_spec,
    generate_writing_challenge,
    _llm_call,
    _generate_tts_audio,
    _h5p_to_lean,
)
from agents.lesson_agent import get_or_create_lesson, generate_lesson, get_cached_lesson
from agents.quiz_agent import generate_quiz
from agents.feedback_loop import process_pending_batch
from agents.chat_agent import chat as lesson_chat, get_chat_history
from agents.remediation_planner import get_top_suggestion, plan_for_student
from agents.teacher_agent import run_teacher_chat, get_teacher_history
from agents.llm_client import call_llm
from agents.feedback_quality import run_feedback_quality_audit
from schemas.assessment import _extract_json_payload
from agents.telegram_agent import send_telegram, alert_admin

app = FastAPI(title="KuasaPrestij Intelligence Core")

@app.exception_handler(Exception)
async def _global_exception_handler(request: Request, exc: Exception):
    context = f"{request.method} {request.url.path}"
    log_error(exc, context=context)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


_SUBJECT_LANGUAGE_MAP = {
    "Bahasa Cina": "Bahasa Cina",
    "Bahasa Melayu": "Bahasa Melayu",
    "Bahasa Inggeris": "English",
}

# KBAT difficulty arc: Q1=C2, Q2=C3, Q3=C4, Q4+=C5
# Q1 is always served from the anchor cache (studio_node) at Memahami.
# Q2+ are generated fresh by generator_node at escalating cognitive levels.
KBAT_SEQUENCE = ["Memahami", "Mengaplikasi", "Menganalisis", "Menilai"]

# ── Accommodation / pace profile (special-needs support) ──────────────────────
# A student's condition-derived profile (set by a teacher via /derive_accommodations)
# lives in profiles.preferences. The engine reads it to adapt pace + surface flags.
_DEFAULT_PACE = {
    "session_length": 10, "break_cadence": 0, "difficulty_ramp": "normal",
    "time_limits": "normal", "feedback_style": "instant",
}

def _load_accommodation_context(student_id: str) -> dict:
    """Best-effort read of a student's derived accommodation flags + pace profile."""
    try:
        res = supabase.table("profiles").select("preferences").eq("id", student_id).single().execute()
        prefs = (res.data or {}).get("preferences") or {}
    except Exception:
        prefs = {}
    return {
        "accommodations": prefs.get("accommodations") or {},
        "pace_profile": {**_DEFAULT_PACE, **(prefs.get("pace_profile") or {})},
    }

def _kbat_index(answered_count: int, ramp: str) -> int:
    """Map answered_count -> KBAT index, modulated by difficulty_ramp.
    gentle: 2 questions per level (slower climb); fast: 2 levels per question."""
    if ramp == "gentle":
        idx = answered_count // 2
    elif ramp == "fast":
        idx = answered_count * 2
    else:
        idx = answered_count
    return min(max(idx, 0), len(KBAT_SEQUENCE) - 1)

def _effective_language(subject: str, requested: str) -> str:
    """For language subjects, override the requested language to match the subject medium."""
    return _SUBJECT_LANGUAGE_MAP.get(subject, requested)

# Languages that should be auto-populated whenever content is generated for any other language.
_CROSS_POPULATE_LANGS = ["English", "Bahasa Melayu"]

def _cross_populate_content(
    background_tasks: BackgroundTasks,
    topic: str,
    subject: str,
    form_level: int,
    generated_language: str,
):
    """
    After generating content in one language, queue background tasks to ensure the
    other languages are also cached. get_or_create_lesson and _prewarm_topic_anchor
    both no-op if content already exists, so this is safe to call unconditionally.
    Language-medium subjects (Bahasa Melayu, Bahasa Inggeris, Bahasa Cina) are skipped
    because they have a fixed language that doesn't cross-populate.
    """
    if subject in _SUBJECT_LANGUAGE_MAP:
        return  # language-medium subject — don't cross-populate
    for lang in _CROSS_POPULATE_LANGS:
        if lang == generated_language:
            continue
        background_tasks.add_task(
            get_or_create_lesson, topic, subject, form_level, lang
        )
        background_tasks.add_task(
            _prewarm_topic_anchor, topic, subject, lang, form_level
        )

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "https://api.kuasa.tech:8443",
        "http://api.kuasa.tech:8443",
        "http://178.105.130.105:3000",
        "http://178.105.130.105:8443",
        "https://kuasaprestij.tech",
        "https://www.kuasaprestij.tech",
        "http://kuasaprestij.tech",
    ],
    allow_origin_regex=r"https?://(.*\.kuasa\.tech.*|.*\.lovable\.app|.*\.lovableproject\.com|.*\.run\.app|178\.105\.130\.105.*)",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# TraceMiddleware is outermost (added last = runs first in Starlette's LIFO order)
app.add_middleware(TraceMiddleware)

class StartSessionRequest(BaseModel):
    student_id: str
    topic: str
    subject: str                        # e.g. "Physics", "Biology"
    curriculum: str = ""                # deprecated alias for subject; kept for backward compat
    language: str = "English"
    is_adaptive: bool = False
    question_type: str = "mcq"          # "mcq" | "short_answer" | "essay"
    form_level: int = 4                 # used for lesson lookup

class DiagnosticSessionRequest(BaseModel):
    student_id: str
    language: str = "English"
    form_level: int = 4

class SubmitAnswerRequest(BaseModel):
    student_id: str
    topic: str
    subject: str                        # e.g. "Physics", "Biology"
    curriculum: str = ""                # deprecated alias; kept for backward compat
    student_answer: str
    sequence: Optional[List[str]] = None  # step_sort: ordered chunk ids the student placed
    draft: dict
    language: str = "English"
    question_type: str = "mcq"          # "mcq" | "short_answer" | "step_sort" | "essay"
    is_adaptive: bool = False
    session_id: Optional[str] = None    # if provided, session progress is updated


def _create_quiz_session(student_id: str, topic: str, subject: str, language: str,
                          question_type: str, is_adaptive: bool, lesson_id: Optional[str],
                          draft: Optional[dict]) -> str:
    """Insert a new quiz_sessions row and return its id."""
    # Omit wrong_count/streak/score — rely on DB column defaults (set by gamification.sql).
    # This keeps session creation working even if the migration hasn't been applied yet.
    row = {
        "student_id": student_id,
        "topic": topic,
        "subject": subject,
        "language": language,
        "question_type": question_type,
        "is_adaptive": is_adaptive,
        "lesson_id": lesson_id,
        "current_draft": draft,
        "answered_count": 0,
        "mastery_score": 0.0,
        "status": "active",
    }
    res = supabase.table("quiz_sessions").insert(row).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create quiz session")
    return res.data[0]["id"]


_ANSWER_FIELDS = frozenset({
    "correct_answer", "distractor_rationale",
    "sample_answer", "model_answer",
    "marking_rubric", "marking_rubric_bands",
})

def _strip_answer_fields(draft: Optional[dict]) -> Optional[dict]:
    """Remove server-only answer fields before sending a question to the client."""
    if not draft:
        return draft
    return {k: v for k, v in draft.items() if k not in _ANSWER_FIELDS}


# Markers of an LLM fallback/error draft (generator_node returns these when all
# providers cool or JSON parsing fails). These must NEVER be cached to the
# question_bank — a cached fallback poisons the topic forever ("API Rate Limit
# Hit" with placeholder A/B/C/D options served on every subsequent visit).
_FALLBACK_MARKERS = ("API Rate Limit Hit", "System error fallback", "Please try again in 1 minute")

def _is_fallback_draft(draft: Optional[dict]) -> bool:
    """True if this draft is an LLM error/fallback that must not be cached or served."""
    if not draft or not isinstance(draft, dict):
        return True
    q = str(draft.get("question", ""))
    if any(m in q for m in _FALLBACK_MARKERS):
        return True
    # Placeholder options with no real answer text
    if draft.get("options") == ["A", "B", "C", "D"]:
        return True
    return False


def _flatten_lesson(data: dict) -> dict:
    """Return lesson dict with notes_json merged to top level, _source_chunks removed."""
    if not data:
        return {}
    data = dict(data)
    data.pop("_source_chunks", None)  # M4: strip if promoted to top level
    notes_json = data.pop("notes_json", None) or {}
    notes_json.pop("_source_chunks", None)
    return {**data, **notes_json}


async def _timed_node(trace_id: str, node_func, state: AgentState) -> dict:
    """Run a blocking agent node in a thread and emit a telemetry span for its duration."""
    start = time.perf_counter()
    status = "ok"
    try:
        return await asyncio.to_thread(node_func, state)
    except Exception:
        status = "error"
        raise
    finally:
        log_span(trace_id, node_func.__name__, state.get("topic", ""),
                 (time.perf_counter() - start) * 1000, status)


from app import anchor_cache as _ac

async def _get_anchor_row(topic: str, language: str, form_level: int) -> Optional[dict]:
    """Return the full topic_anchors row, served from shared in-memory cache (5-min TTL)."""
    row = _ac.get(topic, language, form_level)
    if row is not None:
        return row
    res = await asyncio.to_thread(
        lambda: supabase.table("topic_anchors")
            .select("*")
            .eq("topic", topic)
            .eq("language", language)
            .eq("form_level", form_level)
            .limit(1)
            .execute()
    )
    row = res.data[0] if res.data else None
    _ac.put(topic, language, form_level, row)
    return row

def _anchor_invalidate(topic: str, language: str, form_level: int):
    _ac.invalidate(topic, language, form_level)

async def _check_anchor_cache(topic: str, language: str, form_level: int = 4) -> bool:
    """Returns True if a cached anchor exists (uses in-memory cache)."""
    return (await _get_anchor_row(topic, language, form_level)) is not None


async def _generate_listening_audio(session_id: str, passage: str, topic: str, language: str):
    """TTS disabled — no-op. Listening questions will not have audio until TTS is re-enabled."""
    print(f"[Listening TTS] Skipped (TTS disabled) for session {session_id}")


async def _prefetch_next_question(
    session_id: str,
    student_id: str,
    topic: str,
    subject: str,
    language: str,
    question_type: str,
    is_adaptive: bool,
    total_answers: int = 0,
    form_level: int = 4,
):
    """Background task: generate the next question and park it on the session row.
    Q1–Q3: served from question_bank cache (no LLM call); bank grows as questions are generated.
    Q4+: fully adaptive, personalized to student error history.
    Called after /submit_answer and immediately when Q1 is served."""
    print(f"[Prefetch] Next {question_type} for session {session_id} (answer #{total_answers})...")
    try:
        use_adaptive = is_adaptive and total_answers >= 3

        # Q2/Q3 — try the question bank first (zero LLM cost)
        if not use_adaptive:
            try:
                _anchor_row = await _get_anchor_row(topic, language, form_level)
                bank = (_anchor_row.get("question_bank") or []) if _anchor_row else []
                if bank:
                    # Avoid serving the question the student is currently looking at.
                    try:
                        cur_res = await asyncio.to_thread(
                            lambda: supabase.table("quiz_sessions")
                                .select("current_draft")
                                .eq("id", session_id)
                                .execute()
                        )
                        current_q = ""
                        if cur_res.data and cur_res.data[0].get("current_draft"):
                            current_q = cur_res.data[0]["current_draft"].get("question", "")
                        candidates = [q for q in bank if q.get("question", "") != current_q] or bank
                    except Exception:
                        candidates = bank
                    draft = random.choice(candidates)
                    await asyncio.to_thread(
                        lambda: supabase.table("quiz_sessions")
                            .update({"prefetched_draft": draft})
                            .eq("id", session_id)
                            .execute()
                    )
                    print(f"[Prefetch] Bank hit for {topic} ({len(bank)} cached) — no LLM call")
                    return
            except Exception:
                pass  # column not yet migrated; fall through to generator

        # Bank empty or adaptive: generate via AI
        state = AgentState(
            student_id=student_id,
            topic=topic,
            subject=subject,
            language=language,
            form_level=form_level,
            is_adaptive=use_adaptive,
            question_type=question_type,
            context="",
            dskp_criteria="",
            student_history="",
            draft=None,
            student_answer=None,
            is_correct=False,
            partial_credit=None,
            mastery_score=0.0,
            feedback="",
            teacher_action_plan="",
            mnemonic_lyrics=None,
            media_url=None,
            video_broll=None,
            h5p_content=None,
            diagram_svg=None,
            worked_example=None,
            topic_complete=False,
            next_topic=topic,
            error_category=None,
            root_cause=None,
            intervention_plan=None,
            essay_detail=None,
            answered_count=0,
            target_kbat=None,
        )

        state.update(await asyncio.to_thread(retriever_node, state))
        if not use_adaptive:
            state["student_history"] = ""
        if not state.get("draft"):
            state.update(await asyncio.to_thread(generator_node, state))

        if state.get("draft"):
            draft = state["draft"]
            if question_type == 'listening':
                passage = draft.get('passage', '')
                if passage and not draft.get('audio_url'):
                    print(f"[Prefetch] Generating listening TTS for session {session_id}...")
                    audio_url = await asyncio.to_thread(
                        _generate_tts_audio, passage, f"listening_{topic}", language, 0.9
                    )
                    draft = {**draft, "audio_url": audio_url}

            # Save non-adaptive question to bank so future students skip LLM
            # — but NEVER cache an LLM fallback/error draft (would poison the topic).
            if not use_adaptive and not _is_fallback_draft(draft):
                try:
                    _brow = await _get_anchor_row(topic, language, form_level)
                    existing = (_brow.get("question_bank") or []) if _brow else []
                    updated = (existing + [draft])[-10:]  # cap at 10
                    await asyncio.to_thread(
                        lambda: supabase.table("topic_anchors")
                            .update({"question_bank": updated})
                            .eq("topic", topic)
                            .eq("language", language)
                            .eq("form_level", form_level)
                            .execute()
                    )
                    _anchor_invalidate(topic, language, form_level)  # bank changed
                    print(f"[Prefetch] Saved to bank for {topic} (now {len(updated)} cached)")
                except Exception as e:
                    print(f"[Prefetch] Bank save skipped (run schema/question_bank.sql first): {e}")

            await asyncio.to_thread(
                lambda: supabase.table("quiz_sessions")
                    .update({"prefetched_draft": draft})
                    .eq("id", session_id)
                    .execute()
            )
            print(f"[Prefetch] Saved for session {session_id}")
        else:
            print(f"[Prefetch] Generator returned empty draft for session {session_id}")
    except Exception as e:
        print(f"[Prefetch] Failed for session {session_id}: {e}")
        log_error(e, context=f"prefetch session={session_id}")


async def _prewarm_topic_anchor(topic: str, subject: str, language: str, form_level: int = 4):
    """Background task: generate+cache the anchor for a topic if not already cached.
    Called when serving Q1/Q2 so that Q3's anchor is ready before the student needs it."""
    print(f"[Prewarm] Checking anchor for {topic} ({language})...")
    try:
        already_cached = await _check_anchor_cache(topic, language, form_level)
        if already_cached:
            print(f"[Prewarm] Already cached: {topic}")
            return
        print(f"[Prewarm] Generating anchor for {topic}...")
        state = AgentState(
            student_id="00000000-0000-0000-0000-000000000001",
            topic=topic,
            subject=subject,
            language=language,
            form_level=form_level,
            is_adaptive=False,
            question_type="mcq",
            context="",
            dskp_criteria="",
            student_history="",
            draft=None,
            student_answer=None,
            is_correct=False,
            partial_credit=None,
            mastery_score=0.0,
            feedback="",
            teacher_action_plan="",
            mnemonic_lyrics=None,
            media_url=None,
            video_broll=None,
            h5p_content=None,
            diagram_svg=None,
            worked_example=None,
            topic_complete=False,
            next_topic=topic,
            error_category=None,
            root_cause=None,
            intervention_plan=None,
            essay_detail=None,
            answered_count=0,
            target_kbat=None,
        )
        state.update(await asyncio.to_thread(retriever_node, state))
        await asyncio.to_thread(studio_node, state)
        print(f"[Prewarm] Anchor generated for {topic}")
    except Exception as e:
        print(f"[Prewarm] Failed for {topic}: {e}")
        log_error(e, context=f"prewarm topic={topic}")


async def _pregen_to_bank(topic: str, subject: str, language: str, student_id: str, question_type: str = "mcq", form_level: int = 4):
    """Generate one generic question via LLM and append it to topic_anchors.question_bank.
    Called when Q1 is first displayed so Q3 is ready before the student needs it.
    Self-throttles: skips if the bank already has 5+ questions."""
    try:
        _prow = await _get_anchor_row(topic, language, form_level)
        existing = (_prow.get("question_bank") or []) if _prow else []
        if len(existing) >= 5:
            print(f"[Pregen] Bank has {len(existing)} questions for {topic} — skipping")
            return

        print(f"[Pregen] Generating bank question for {topic} ({language})...")
        state = AgentState(
            student_id=student_id,
            topic=topic,
            subject=subject,
            language=language,
            form_level=form_level,
            is_adaptive=False,
            question_type=question_type,
            context="",
            dskp_criteria="",
            student_history="",
            draft=None,
            student_answer=None,
            is_correct=False,
            partial_credit=None,
            mastery_score=0.0,
            feedback="",
            teacher_action_plan="",
            mnemonic_lyrics=None,
            media_url=None,
            video_broll=None,
            h5p_content=None,
            diagram_svg=None,
            topic_complete=False,
            next_topic=topic,
            error_category=None,
            root_cause=None,
            intervention_plan=None,
            essay_detail=None,
            answered_count=0,
            target_kbat=None,
        )
        state.update(await asyncio.to_thread(retriever_node, state))
        state.update(await asyncio.to_thread(generator_node, state))

        if state.get("draft") and not _is_fallback_draft(state["draft"]):
            updated = (existing + [state["draft"]])[-10:]
            await asyncio.to_thread(
                lambda: supabase.table("topic_anchors")
                    .update({"question_bank": updated})
                    .eq("topic", topic)
                    .eq("language", language)
                    .eq("form_level", form_level)
                    .execute()
            )
            _anchor_invalidate(topic, language, form_level)  # bank changed
            print(f"[Pregen] Saved to bank for {topic} (now {len(updated)} cached)")
        elif state.get("draft"):
            print(f"[Pregen] Skipped caching fallback draft for {topic}")
        else:
            print(f"[Pregen] Generator returned empty draft for {topic}")
    except Exception as e:
        print(f"[Pregen] Failed for {topic}: {e}")


@app.post("/start_session")
async def start_session(req: StartSessionRequest, background_tasks: BackgroundTasks, request: Request):
    # THE FAILSAFE: Intercept "undefined" and force the valid UUID
    safe_student_id = "00000000-0000-0000-0000-000000000001" if req.student_id == "undefined" else req.student_id
    trace_id = getattr(request.state, "trace_id", str(_uuid.uuid4()))

    print(f"\n[API Hit] Start Session: {req.topic} | Adaptive Mode: {req.is_adaptive}")

    effective_subject = req.subject or req.curriculum  # resolve legacy callers
    effective_language = _effective_language(effective_subject, req.language)

    # Language composition topics (BM karangan / 华文 作文 / English writing) MUST be
    # generated + marked as essays, regardless of the per-subject default type. Force
    # 'essay' so the whole session (generation, session row, evaluation) stays consistent.
    if _language_composition_spec(effective_subject, req.topic, req.question_type):
        req.question_type = "essay"

    # Check for a question pre-generated in the background, and detect whether an
    # active session exists (active session = Q2+; no session = Q1).
    # Must run BEFORE AgentState construction so answered_count/target_kbat are defined.
    # Wrapped defensively: if the prefetched_draft column migration hasn't been run yet,
    # the query raises APIError 42703; fall through to normal pipeline in that case.
    prefetch_res = None
    lesson_data = None
    try:
        _session_cutoff = (datetime.now(timezone.utc) - timedelta(hours=4)).isoformat()
        prefetch_res = (
            supabase.table("quiz_sessions")
            .select("id, prefetched_draft, answered_count")
            .eq("student_id", safe_student_id)
            .eq("topic", req.topic)
            .eq("subject", effective_subject)
            .eq("language", effective_language)
            .eq("question_type", req.question_type)
            # is_adaptive intentionally NOT filtered: anchor sessions (is_adaptive=False)
            # hold prefetches for the next adaptive request — filtering would miss them.
            .eq("status", "active")
            .gte("updated_at", _session_cutoff)  # ignore sessions older than 4 h (stale orphans)
            .order("updated_at", desc=True)
            .limit(1)
            .execute()
        )
    except Exception as _pf_err:
        print(f"[Prefetch] lookup skipped (run migration to enable): {_pf_err}")

    # Load the student's condition-derived accommodation flags + pace profile so the
    # session can adapt (difficulty ramp here; the rest surfaced to the client below).
    _acc_ctx = await asyncio.to_thread(_load_accommodation_context, safe_student_id)
    accommodations = _acc_ctx["accommodations"]
    pace_profile = _acc_ctx["pace_profile"]

    # KBAT sequencing: derive difficulty level from how many questions already answered.
    # Q1 (answered_count=0) stays as anchor/Memahami; Q2+ escalate through the KBAT arc.
    # difficulty_ramp (gentle/normal/fast) modulates how fast the level climbs.
    answered_count = 0
    if prefetch_res and prefetch_res.data:
        answered_count = prefetch_res.data[0].get("answered_count") or 0
    _ramp = pace_profile.get("difficulty_ramp", "normal")
    target_kbat = KBAT_SEQUENCE[_kbat_index(answered_count, _ramp)]
    # Q2+: bypass studio_node (anchor) so generator_node produces a fresh question
    # at the target KBAT level instead of re-serving the same anchor.
    effective_adaptive = req.is_adaptive or (answered_count >= 1)
    print(f"[KBAT] answered_count={answered_count} ramp={_ramp} → target={target_kbat} effective_adaptive={effective_adaptive}")

    state = AgentState(
        student_id=safe_student_id,
        topic=req.topic,
        subject=effective_subject,
        language=effective_language,
        form_level=req.form_level,
        is_adaptive=effective_adaptive,
        question_type=req.question_type,
        context="",
        dskp_criteria="",
        student_history="",
        draft=None,
        student_answer=None,
        is_correct=False,
        partial_credit=None,
        mastery_score=0.0,
        feedback="",
        teacher_action_plan="",
        mnemonic_lyrics=None,
        media_url=None,
        video_broll=None,
        h5p_content=None,
        diagram_svg=None,
        worked_example=None,
        topic_complete=False,
        next_topic=req.topic,
        error_category=None,
        root_cause=None,
        intervention_plan=None,
        essay_detail=None,
        answered_count=answered_count,
        target_kbat=target_kbat,
    )

    existing_session_id: Optional[str] = None  # set in Q2+ path to reuse active session
    if prefetch_res and prefetch_res.data and effective_adaptive:
        # Q2+ path: active session found and we're in adaptive mode.
        active_row = prefetch_res.data[0]
        existing_session_id = active_row["id"]  # preserve so we skip _create_quiz_session
        if active_row.get("prefetched_draft") and not _is_fallback_draft(active_row["prefetched_draft"]):
            # Happy path: background prefetch landed in time — consume and serve.
            state["draft"] = active_row["prefetched_draft"]
            await asyncio.to_thread(
                lambda: supabase.table("quiz_sessions").update({"prefetched_draft": None}).eq("id", active_row["id"]).execute()
            )
            print(f"[Prefetch] Served cached question for {req.topic} — skipped LLM call")
        else:
            # Race miss: prefetch hasn't landed yet — try question_bank directly.
            print(f"[Prefetch] Race miss for {req.topic} — trying bank directly...")
            try:
                _rmrow = await _get_anchor_row(req.topic, effective_language, req.form_level)
                if _rmrow:
                    _full_bank = _rmrow.get("question_bank") or []
                    _qt = req.question_type or "mcq"
                    _typed_bank = [
                        q for q in _full_bank
                        if (q.get("question_type") or "mcq") == _qt
                        and not _is_fallback_draft(q)
                    ]
                    if _typed_bank:
                        state["draft"] = random.choice(_typed_bank)
                        print(f"[Bank] Race recovery: served {_qt} from bank ({len(_typed_bank)} cached)")
            except Exception as _bank_err:
                print(f"[Bank] Race recovery bank read failed: {_bank_err}")
            if not state.get("draft"):
                lesson_data, retriever_result = await asyncio.gather(
                    asyncio.to_thread(get_cached_lesson, req.topic, effective_subject, req.form_level, effective_language),
                    _timed_node(trace_id, retriever_node, state),
                )
                state.update(retriever_result)
                state.update(await _timed_node(trace_id, generator_node, state))
            else:
                lesson_data = await asyncio.to_thread(
                    get_cached_lesson, req.topic, effective_subject, req.form_level, effective_language
                )
    else:
        # No active session = Q1: run full pipeline (retriever + anchor/generator).
        # For non-MCQ types, check the bank first — seeded short_answer/essay questions
        # are stored there. This avoids a full LLM call when a cached question exists.
        if req.question_type not in (None, "mcq") and not effective_adaptive:
            try:
                _q1row = await _get_anchor_row(req.topic, effective_language, req.form_level)
                if _q1row:
                    _q1_full = _q1row.get("question_bank") or []
                    _q1_typed = [q for q in _q1_full if (q.get("question_type") or "mcq") == req.question_type and not _is_fallback_draft(q)]
                    if _q1_typed:
                        state["draft"] = random.choice(_q1_typed)
                        lesson_data = await asyncio.to_thread(
                            get_cached_lesson, req.topic, effective_subject, req.form_level, effective_language
                        )
                        print(f"[Bank] Q1 {req.question_type} served from bank for {req.topic}")
            except Exception:
                pass

        if not state.get("draft"):
            if req.question_type == 'mcq' and not effective_adaptive:
                # Anchor-mode MCQ (Q1 only): check anchor cache + lesson cache in parallel.
                skip_retriever, lesson_data = await asyncio.gather(
                    _check_anchor_cache(req.topic, effective_language, req.form_level),
                    asyncio.to_thread(
                        get_cached_lesson, req.topic, effective_subject, req.form_level, effective_language
                    ),
                )
                if not skip_retriever:
                    state.update(await _timed_node(trace_id, retriever_node, state))
            else:
                # Non-anchor paths: lesson cache fetch + retriever are independent — run in parallel.
                lesson_data, retriever_result = await asyncio.gather(
                    asyncio.to_thread(
                        get_cached_lesson, req.topic, effective_subject, req.form_level, effective_language
                    ),
                    _timed_node(trace_id, retriever_node, state),
                )
                state.update(retriever_result)

            # Only run studio_node (anchor + H5P) on Q1; Q2+ skip to generator_node.
            if req.question_type == 'mcq' and not effective_adaptive:
                state.update(await _timed_node(trace_id, studio_node, state))
            if not state.get('draft'):
                state.update(await _timed_node(trace_id, generator_node, state))

    # lesson_data is set in all branches above except the prefetch-hit path.
    if lesson_data is None:
        lesson_data = await asyncio.to_thread(
            get_cached_lesson, req.topic, effective_subject, req.form_level, effective_language
        )
    lesson_id = lesson_data.get("id") if lesson_data else None
    if not lesson_data:
        background_tasks.add_task(
            get_or_create_lesson, req.topic, effective_subject, req.form_level, effective_language
        )

    if existing_session_id:
        # Q2+: reuse the active session — update current_draft, leave answered_count intact.
        session_id = existing_session_id
        try:
            await asyncio.to_thread(
                lambda: supabase.table("quiz_sessions")
                    .update({"current_draft": state.get("draft")})
                    .eq("id", session_id)
                    .execute()
            )
        except Exception as e:
            print(f"-> Session current_draft update error (non-fatal): {e}")
    else:
        try:
            session_id = _create_quiz_session(
                student_id=safe_student_id,
                topic=req.topic,
                subject=effective_subject,
                language=effective_language,
                question_type=req.question_type,
                is_adaptive=effective_adaptive,
                lesson_id=lesson_id,
                draft=state.get("draft"),
            )
        except Exception as e:
            print(f"-> Session create error (non-fatal): {e}")
            session_id = None

    # Ensure BM and English versions of lesson notes + anchors exist for this topic.
    # get_or_create_lesson and _prewarm_topic_anchor are both no-ops if content already cached.
    _cross_populate_content(background_tasks, req.topic, effective_subject, req.form_level, effective_language)

    # Listening TTS: draft is returned immediately; audio is generated in the background.
    # Frontend should poll GET /listening_audio/{session_id} until audio_url is non-null.
    if req.question_type == 'listening' and session_id:
        draft = state.get("draft") or {}
        passage = draft.get("passage", "")
        if passage and not draft.get("audio_url"):
            background_tasks.add_task(
                _generate_listening_audio,
                session_id=session_id,
                passage=passage,
                topic=req.topic,
                language=effective_language,
            )

    # When Q1 is displayed, kick off two background tasks:
    #   1. Prefetch Q2 from the question bank (fast, no LLM).
    #   2. Pre-generate Q3 via LLM and save it to the bank.
    #      This means the student answering Q1 and Q2 (~1-2 min) covers the
    #      LLM generation time, so Q3 is served instantly from the bank.
    # submit_answer also kicks off a prefetch as a backup refresh.
    if session_id and state.get("draft"):
        background_tasks.add_task(
            _prefetch_next_question,
            session_id=session_id,
            student_id=safe_student_id,
            topic=req.topic,
            subject=effective_subject,
            language=effective_language,
            question_type=req.question_type,
            is_adaptive=effective_adaptive,
            total_answers=answered_count,
            form_level=req.form_level,
        )
        # Only pregen when this is the very first question (no prior active session).
        # For Q2+, the bank already grows via the prefetch save-back logic.
        if not (prefetch_res and prefetch_res.data):
            background_tasks.add_task(
                _pregen_to_bank,
                topic=req.topic,
                subject=effective_subject,
                language=effective_language,
                student_id=safe_student_id,
                question_type=req.question_type,
                form_level=req.form_level,
            )

    draft = state.get("draft") or {}
    # Normalise kbat_level: the LLM sometimes returns English Bloom's names ("Application")
    # instead of the Malaysian KBAT names we use ("Mengaplikasi"). Force it to target_kbat.
    if draft and draft.get('kbat_level') not in KBAT_SEQUENCE:
        draft['kbat_level'] = target_kbat

    # Carry all anchor media forward when studio_node was bypassed (prefetch/bank-hit paths)
    # or when generator_node ran for Q2+ (which never fetches media).
    # One cheap SELECT covers: diagram_svg, h5p_content, audio_url, mnemonic_lyrics, worked_example.
    diagram_svg = state.get("diagram_svg")
    row_interactive = None
    needs_media = (
        not diagram_svg
        or not state.get("h5p_content")
        or not state.get("mnemonic_lyrics")
        or not state.get("video_broll")
    )
    if needs_media and draft:
        try:
            _row = await _get_anchor_row(req.topic, effective_language, req.form_level)
            if _row:
                if not diagram_svg:
                    diagram_svg = _row.get("diagram_svg")
                if not state.get("video_broll"):
                    state["video_broll"] = _row.get("video_broll")
                if not state.get("mnemonic_lyrics"):
                    state["mnemonic_lyrics"] = _row.get("mnemonic_lyrics")
                if not state.get("media_url"):
                    state["media_url"] = _row.get("audio_url")
                if not state.get("worked_example"):
                    state["worked_example"] = _row.get("worked_example")
                # H5P blob has anchor_question baked in — only return it when the
                # served draft IS the anchor question (first 60 chars match).
                if not state.get("h5p_content") and not effective_adaptive:
                    _anch = (_row.get("anchor_question") or {})
                    if _anch.get("question", "")[:60] == draft.get("question", "")[:60]:
                        state["h5p_content"] = _row.get("h5p_content")
                        row_interactive = _row.get("interactive_content")
        except Exception as _me:
            print(f"[Media] Anchor media fetch failed: {_me}")

    # Lean interactive blob: prefer the stored lean format, else convert legacy h5p_content.
    interactive = row_interactive or _h5p_to_lean(state.get("h5p_content"))

    # Current topic mastery so the frontend can seed the live mastery bar without
    # a separate round-trip. Best-effort: never fail the session on a lookup error.
    current_mastery = None
    try:
        _m_res = await asyncio.to_thread(
            lambda: supabase.table("dskp_mastery")
                .select("mastery_level")
                .eq("student_id", safe_student_id)
                .eq("topic", req.topic)
                .execute()
        )
        if _m_res.data:
            current_mastery = _m_res.data[0]["mastery_level"]
    except Exception as _e:
        print(f"[start_session] mastery lookup skipped: {_e}")

    return {
        "topic": req.topic,
        "subject": req.subject,
        "question_type": req.question_type,
        "media_url": state.get("media_url"),
        "video_broll": state.get("video_broll"),
        "mnemonic_lyrics": state.get("mnemonic_lyrics"),
        "h5p_content": state.get("h5p_content"),
        "interactive": interactive,
        "diagram_svg": diagram_svg,
        "worked_example": state.get("worked_example"),
        "question_data": _strip_answer_fields(draft),
        "kbat_level": draft.get("kbat_level") or target_kbat,
        "answered_count": answered_count,
        "mastery_score": current_mastery,
        "session_id": session_id,
        "lesson_id": lesson_id,
        "lesson": _flatten_lesson(lesson_data) if lesson_data else None,
        # Special-needs support: the student's condition-derived flags + pace profile so
        # the client can honour reduce_motion / no_timed_games / time_limits / breaks etc.
        "accommodations": accommodations,
        "pace_profile": pace_profile,
    }

@app.get("/session_challenge/{session_id}")
async def get_session_challenge(session_id: str):
    """Return the correct answer for an active session's current MCQ so the client
    can build an on-demand 'gamify this' challenge (Answer Flappy). The normal
    /start_session payload strips `correct_answer`; this endpoint intentionally
    exposes it, but the game gates are unlabelled as correct/incorrect, so winning
    still requires knowing the answer. Returns null for non-MCQ or if unavailable."""
    try:
        res = await asyncio.to_thread(
            lambda: supabase.table("quiz_sessions")
                .select("current_draft,question_type")
                .eq("id", session_id)
                .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    if not res.data:
        raise HTTPException(status_code=404, detail="session not found")
    row = res.data[0]
    draft = row.get("current_draft") or {}
    qtype = row.get("question_type") or draft.get("question_type") or "mcq"
    if qtype != "mcq":
        return {"correct_answer": None}
    return {"correct_answer": draft.get("correct_answer")}

@app.post("/submit_answer")
async def submit_answer(req: SubmitAnswerRequest, background_tasks: BackgroundTasks, request: Request):
    # THE FAILSAFE: Intercept "undefined" and force the valid UUID
    safe_student_id = "00000000-0000-0000-0000-000000000001" if req.student_id == "undefined" else req.student_id
    trace_id = getattr(request.state, "trace_id", str(_uuid.uuid4()))

    print(f"\n[API Hit] Grading Answer for {req.topic}")

    effective_subject = req.subject or req.curriculum  # resolve legacy callers
    effective_language = _effective_language(effective_subject, req.language)

    # Keep composition topics on the essay path even if the request/session type drifted.
    if _language_composition_spec(effective_subject, req.topic, req.question_type):
        req.question_type = "essay"

    # Load ALL session fields in one query.
    # The session is authoritative for: draft (C4), student_id, question_type,
    # and gamification counters. Fall back to request values when session is absent.
    authoritative_draft = req.draft
    authoritative_student_id = safe_student_id
    authoritative_question_type = req.question_type
    authoritative_is_adaptive = req.is_adaptive
    sess_row = None

    if req.session_id:
        try:
            sess_res = await asyncio.to_thread(
                lambda: supabase.table("quiz_sessions")
                    .select("current_draft,student_id,question_type,is_adaptive,answered_count,wrong_count,streak,score,last_penalty_count")
                    .eq("id", req.session_id)
                    .execute()
            )
            if sess_res.data:
                sess_row = sess_res.data[0]
                if sess_row.get("current_draft"):
                    authoritative_draft = sess_row["current_draft"]
                if sess_row.get("student_id"):
                    authoritative_student_id = sess_row["student_id"]
                if sess_row.get("question_type"):
                    authoritative_question_type = sess_row["question_type"]
                if sess_row.get("is_adaptive") is not None:
                    authoritative_is_adaptive = sess_row["is_adaptive"]
        except Exception as e:
            print(f"-> Session lookup error (falling back to request values): {e}")

    # Composition topics are always marked as essays, even if an older session row
    # (created before this change) still records short_answer.
    if _language_composition_spec(effective_subject, req.topic, authoritative_question_type):
        authoritative_question_type = "essay"

    state = AgentState(
        student_id=authoritative_student_id,
        topic=req.topic,
        subject=effective_subject,
        language=effective_language,
        form_level=4,
        is_adaptive=True,
        question_type=authoritative_question_type,
        context="",
        dskp_criteria="",
        student_history="",
        draft=authoritative_draft,
        student_answer=req.student_answer,
        is_correct=False,
        partial_credit=None,
        mastery_score=0.0,
        feedback="",
        teacher_action_plan="",
        mnemonic_lyrics=None,
        media_url=None,
        video_broll=None,
        h5p_content=None,
        diagram_svg=None,
        worked_example=None,
        topic_complete=False,
        next_topic=req.topic,
        error_category=None,
        root_cause=None,
        intervention_plan=None,
        essay_detail=None,
        answered_count=0,
        target_kbat=None,
    )
    # step_sort: the ordered chunk ids the student dragged into place. Extra
    # key (not in the AgentState TypedDict) read by grade_step_sort; harmless
    # for other question types.
    if req.sequence is not None:
        state["sequence"] = req.sequence

    state.update(await _timed_node(trace_id, evaluator_node, state))
    # A genuine marking failure (unparseable LLM JSON after retry) must not be
    # recorded as a wrong answer or cost the student mastery. Skip the mastery
    # update + session persistence and ask them to resubmit the same question.
    if state.get("eval_failed"):
        return {
            "is_correct": None,
            "eval_failed": True,
            "feedback": state.get("feedback") or "Could not evaluate. Please try again.",
            "essay_detail": None,
            "marks_awarded": None,
            "max_marks": (state.get("draft") or {}).get("max_marks"),
            "session_id": req.session_id,
            "topic_complete": False,
            "next_topic": req.topic,
            "trigger_penalty_game": False,
        }
    state.update(await _timed_node(trace_id, mastery_updater_node, state))

    # Gamification state — computed from session row loaded above
    new_streak = 0
    new_wrong = 0
    new_score = 0
    trigger_penalty_game = False
    points_awarded = 0

    if not req.session_id:
        print("[Gamification] SKIPPED — no session_id in request")
    elif sess_row is None:
        print("[Gamification] SKIPPED — session row not loaded")

    if req.session_id and sess_row is not None:
        try:
            prev_count = sess_row.get("answered_count") or 0
            prev_wrong = sess_row.get("wrong_count") or 0
            prev_streak = sess_row.get("streak") or 0
            prev_score = sess_row.get("score") or 0

            is_correct = state.get("is_correct", False)
            new_streak = (prev_streak + 1) if is_correct else 0
            new_wrong = prev_wrong if is_correct else (prev_wrong + 1)
            points_awarded = (100 + new_streak * 10) if is_correct else 0
            new_score = prev_score + points_awarded

            # Penalty game fires on a wrong answer, BUT with a one-question cooldown:
            # after a game triggers, the student must answer at least one more question
            # before another game can fire (no back-to-back games). last_penalty_count
            # stores the 1-based question number of the last trigger.
            this_qn = prev_count + 1
            last_penalty = sess_row.get("last_penalty_count")
            if last_penalty is None:
                last_penalty = -100
            cooldown_ok = (this_qn - last_penalty) >= 2
            trigger_penalty_game = (not is_correct) and cooldown_ok
            new_last_penalty = this_qn if trigger_penalty_game else last_penalty
            print(f"[Gamification] correct={is_correct} qn={this_qn} last_penalty={last_penalty} cooldown_ok={cooldown_ok} trigger_game={trigger_penalty_game}")

            session_id = req.session_id
            session_payload = {
                "answered_count": prev_count + 1,
                "mastery_score": state.get("mastery_score", 0.0),
                "current_draft": None,
                "status": "complete" if state.get("topic_complete") else "active",
                "wrong_count": new_wrong,
                "streak": new_streak,
                "score": new_score,
                "last_penalty_count": new_last_penalty,
            }
            await asyncio.to_thread(
                lambda: supabase.table("quiz_sessions").update(session_payload).eq("id", session_id).execute()
            )
        except Exception as e:
            print(f"-> Session update error (non-fatal): {e}")

    # Count how many questions this student has answered for this topic.
    # Used to delay adaptive personalisation until question 4 (after 3 answered).
    total_topic_answers = 0
    try:
        _sid = authoritative_student_id
        _topic = req.topic
        cnt = await asyncio.to_thread(
            lambda: supabase.table("event_logs")
                .select("id", count="exact")
                .eq("student_id", _sid)
                .eq("topic", _topic)
                .execute()
        )
        total_topic_answers = cnt.count or 0
    except Exception:
        pass

    # Alert teacher if student mastery is critically low (≤0.3) after a wrong answer
    new_mastery = state.get("mastery_score", 1.0)
    if not state.get("is_correct") and new_mastery <= 0.3:
        short_id = authoritative_student_id[:8].upper()
        error_cat = state.get("error_category") or "unknown error"
        root_cause = state.get("root_cause") or ""
        alert_msg = (
            f"⚠️ *Student Alert*\n"
            f"Student: {short_id}\n"
            f"Subject: {effective_subject} | Topic: {req.topic}\n"
            f"Mastery: {round(new_mastery * 100)}% — needs help\n"
            f"Error: {error_cat}"
            + (f"\nRoot cause: {root_cause}" if root_cause else "")
        )
        background_tasks.add_task(alert_admin, alert_msg)

    # Pre-generate the next question while the student reads feedback.
    # Q1–3: non-personalized fresh question (no student history).
    # Q4+:  fully adaptive (uses student error history for personalisation).
    topic_done = state.get("topic_complete", False)
    if req.session_id and not topic_done:
        background_tasks.add_task(
            _prefetch_next_question,
            session_id=req.session_id,
            student_id=authoritative_student_id,
            topic=req.topic,
            subject=effective_subject,
            language=effective_language,
            question_type=authoritative_question_type,
            is_adaptive=True,
            total_answers=total_topic_answers,
        )

    draft = state.get("draft") or {}
    return {
        "is_correct": state.get("is_correct"),
        "correct_answer": draft.get("correct_answer") or draft.get("answer"),
        "misconception": state.get("error_category"),
        "partial_credit": state.get("partial_credit"),
        "marks_awarded": round((state.get("partial_credit") or 0) * draft.get("max_marks", 1))
                         if authoritative_question_type != "mcq" else None,
        "max_marks": draft.get("max_marks") if authoritative_question_type != "mcq" else None,
        "feedback": state.get("feedback"),
        # Essay-only: strengths, improvements, band, full model answer + "how it
        # should look" outline so the student sees the target format, not just a
        # one-line critique. Absent (None) for MCQ / short-answer.
        "essay_detail": state.get("essay_detail") or None,
        "teacher_action_plan": state.get("teacher_action_plan"),
        "mastery_score": state.get("mastery_score"),
        "topic_complete": state.get("topic_complete"),
        "next_topic": state.get("next_topic"),
        "session_id": req.session_id,
        # Gamification
        "streak": new_streak,
        "wrong_count": new_wrong,
        "score": new_score,
        "points_awarded": points_awarded,
        "trigger_penalty_game": trigger_penalty_game,
    }

# --- G1: Leaderboard ---

@app.get("/leaderboard")
async def get_leaderboard(subject: Optional[str] = None, limit: int = 10):
    """Class leaderboard — top students by cumulative quiz score plus game-win bonus (50 pts/win)."""
    try:
        q = supabase.table("quiz_sessions").select("student_id, score, subject")
        if subject:
            q = q.eq("subject", subject)
        rows = (q.execute().data or [])

        totals: Dict[str, Dict] = {}
        for row in rows:
            sid = row["student_id"]
            if sid not in totals:
                totals[sid] = {"total_score": 0, "quiz_sessions": 0, "game_wins": 0}
            totals[sid]["total_score"] += row.get("score") or 0
            totals[sid]["quiz_sessions"] += 1

        # Bonus points from mini-game wins (table may not exist yet — non-fatal)
        try:
            gres = supabase.table("game_scores").select("student_id").eq("result", "win").execute()
            for grow in (gres.data or []):
                sid = grow["student_id"]
                if sid in totals:
                    totals[sid]["game_wins"] += 1
                    totals[sid]["total_score"] += 50
        except Exception:
            pass

        ranked = sorted(
            [{"student_id": k, **v} for k, v in totals.items()],
            key=lambda x: x["total_score"],
            reverse=True,
        )[:limit]
        for i, entry in enumerate(ranked):
            entry["rank"] = i + 1

        # Attach display names. The service-role key bypasses the profiles RLS
        # policy (profiles_select_own) — the client CANNOT read other students'
        # rows, so names must be resolved here, not on the frontend.
        if ranked:
            ids = list({e["student_id"] for e in ranked})
            try:
                prof = supabase.table("profiles").select("id, full_name").in_("id", ids).execute()
                names = {
                    r["id"]: r["full_name"]
                    for r in (prof.data or [])
                    if (r.get("full_name") or "").strip()
                }
                for e in ranked:
                    e["student_name"] = names.get(e["student_id"])
            except Exception:
                for e in ranked:
                    e["student_name"] = None

        return {"subject": subject, "leaderboard": ranked}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- G2: Penalty game result persistence ---

class PenaltyGameResultRequest(BaseModel):
    student_id: str
    quiz_session_id: Optional[str] = None
    game_type: str   # catch_stars | dino_runner | flappy_bird
    result: str      # win | loss
    duration_ms: Optional[int] = None
    # Assessment-integrated games replay a specific question; on a win we credit
    # partial mastery recovery for that topic. Absent for arcade penalty games.
    topic: Optional[str] = None
    subject: Optional[str] = None

_VALID_GAMES   = {"catch_stars", "dino_runner", "flappy_bird", "sentence_builder", "connector_catch"}
_VALID_RESULTS = {"win", "loss"}
# Half of a full first-try correct (+0.1). Nets a prior wrong (-0.05) back toward
# neutral without ever exceeding a genuine correct answer, so mastery can't be farmed.
_GAME_MASTERY_DELTA = 0.05

@app.post("/penalty_game_result")
async def post_penalty_game_result(req: PenaltyGameResultRequest):
    """Record the outcome of a penalty mini-game and return points awarded."""
    if req.game_type not in _VALID_GAMES:
        raise HTTPException(status_code=422, detail=f"game_type must be one of {_VALID_GAMES}")
    if req.result not in _VALID_RESULTS:
        raise HTTPException(status_code=422, detail="result must be 'win' or 'loss'")

    safe_id = "00000000-0000-0000-0000-000000000001" if req.student_id == "undefined" else req.student_id
    row: Dict = {"student_id": safe_id, "game_type": req.game_type, "result": req.result}
    if req.quiz_session_id:
        row["quiz_session_id"] = req.quiz_session_id
    if req.duration_ms is not None:
        row["duration_ms"] = req.duration_ms

    try:
        supabase.table("game_scores").insert(row).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    pts = 50 if req.result == "win" else 0
    is_win = req.result == "win"

    # Assessment-integrated win → credit partial mastery recovery for the replayed topic.
    mastery_score = None
    mastery_delta = 0.0
    if is_win and req.topic:
        try:
            now = datetime.now()
            rpc_res = supabase.rpc("increment_mastery", {
                "p_student_id": safe_id,
                "p_topic": req.topic,
                "p_subject": req.subject or "",
                "p_delta": _GAME_MASTERY_DELTA,
                "p_last_assessed_at": now.isoformat(),
                "p_next_review_at": (now + timedelta(days=2)).isoformat(),
            }).execute()
            mastery_score = rpc_res.data
            mastery_delta = _GAME_MASTERY_DELTA
            # Trace the recovery so it's distinguishable from a first-try correct.
            supabase.table("event_logs").insert({
                "student_id": safe_id,
                "subject": req.subject or "",
                "topic": req.topic,
                "is_correct": True,
                "diagnostic_tag": "Recovered via game reinforcement",
                "error_category": "None",
            }).execute()
        except Exception as e:
            # Mastery credit is best-effort — never fail the game result on it.
            print(f"[Gamification] mastery recovery credit failed: {e}")

    return {
        "recorded": True,
        "points_awarded": pts,
        "total_score": pts,
        "game_wins": 1 if is_win else 0,
        "mastery_score": mastery_score,
        "mastery_delta": mastery_delta,
        "message": "Great job! +50 leaderboard bonus points!" if pts else "Keep trying — you'll get them next time!",
    }


class WritingGameRequest(BaseModel):
    subject: str
    topic: str
    language: str = "English"


@app.post("/writing_game_challenge")
async def post_writing_game_challenge(req: WritingGameRequest):
    """Generate a writing-native mini-game payload (sentence builder + connector catch).

    Used by the composition penalty games — essays have no correct-letter, so instead of
    the MCQ reaction games we reinforce writing mechanics (word order, cohesive devices).
    """
    effective_language = _effective_language(req.subject, req.language)
    challenge = await asyncio.to_thread(
        generate_writing_challenge, req.subject, req.topic, effective_language
    )
    return challenge


class LessonRequest(BaseModel):
    topic: str
    subject: str
    form_level: int = 4
    language: str = "English"
    force_regenerate: bool = False

class QuizRequest(BaseModel):
    lesson_id: Optional[str] = None
    notes_content: Optional[str] = None
    topic: Optional[str] = None
    num_questions: int = Field(default=5, ge=1, le=20)
    difficulty: str = "medium"
    language: str = "English"
    question_type: str = "mcq"   # "mcq" | "short_answer" | "essay"

@app.post("/generate_lesson")
async def api_generate_lesson(req: LessonRequest):
    if req.force_regenerate:
        lesson = generate_lesson(req.topic, req.subject, req.form_level, req.language)
    else:
        lesson = get_or_create_lesson(req.topic, req.subject, req.form_level, req.language)

    if not lesson:
        raise HTTPException(status_code=503, detail="Lesson generation failed — check LLM API keys and DSKP ingestion.")
    return _flatten_lesson(lesson)

@app.post("/generate_quiz")
async def api_generate_quiz(req: QuizRequest):
    if not req.lesson_id and not req.notes_content:
        raise HTTPException(status_code=400, detail="Provide either lesson_id or notes_content.")

    quiz = generate_quiz(
        lesson_id=req.lesson_id,
        notes_content=req.notes_content,
        topic=req.topic,
        num_questions=req.num_questions,
        difficulty=req.difficulty,
        language=req.language,
        question_type=req.question_type,
    )

    if "error" in quiz:
        raise HTTPException(status_code=503, detail=quiz["error"])
    # C4: strip answer fields — DB retains full questions for server-side grading
    if "questions" in quiz:
        quiz = dict(quiz)
        quiz["questions"] = [_strip_answer_fields(q) for q in quiz.get("questions", [])]
    return quiz

@app.get("/lesson/{lesson_id}")
async def api_get_lesson(lesson_id: str):
    res = supabase.table("generated_lessons").select("*").eq("id", lesson_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Lesson not found.")
    row = res.data[0]
    # Flatten notes_json into the top-level response so frontend can read
    # key_terms, worked_example, mindmap, notes_markdown directly.
    notes_json = row.pop("notes_json", None) or {}
    notes_json.pop("_source_chunks", None)  # strip internal field
    return {**row, **notes_json}

@app.get("/quiz/{quiz_id}")
async def api_get_quiz(quiz_id: str):
    res = supabase.table("quizzes").select("*").eq("id", quiz_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Quiz not found.")
    return res.data[0]

# --- Chat endpoints ---

class ChatRequest(BaseModel):
    student_id: str
    message: str
    lesson_id: Optional[str] = None
    # Question-mode grounding: the question the student is currently looking at.
    session_id: Optional[str] = None
    question: Optional[str] = None
    options: Optional[dict] = None
    correct_answer: Optional[str] = None
    topic: Optional[str] = None
    subject: Optional[str] = None
    passage: Optional[str] = None
    # Client-supplied recent turns for continuity when there's no lesson to persist against.
    history: Optional[list] = None

@app.post("/chat")
async def api_chat(req: ChatRequest):
    safe_student_id = "00000000-0000-0000-0000-000000000001" if req.student_id == "undefined" else req.student_id
    question_context = {
        "question": req.question,
        "options": req.options,
        "correct_answer": req.correct_answer,
        "topic": req.topic,
        "subject": req.subject,
        "passage": req.passage,
    }
    result = lesson_chat(
        safe_student_id,
        req.lesson_id,
        req.message,
        question_context=question_context,
        history=req.history,
        session_id=req.session_id,
    )
    if not result.get("reply"):
        raise HTTPException(status_code=503, detail="Chat agent failed to generate a reply.")
    return result

@app.get("/chat/history/session/{session_id}/{student_id}")
async def api_chat_history_session(session_id: str, student_id: str):
    safe_student_id = "00000000-0000-0000-0000-000000000001" if student_id == "undefined" else student_id
    history = get_chat_history(safe_student_id, session_id=session_id)
    return {"session_id": session_id, "messages": history}

@app.get("/chat/history/{lesson_id}/{student_id}")
async def api_chat_history(lesson_id: str, student_id: str):
    safe_student_id = "00000000-0000-0000-0000-000000000001" if student_id == "undefined" else student_id
    history = get_chat_history(safe_student_id, lesson_id=lesson_id)
    return {"lesson_id": lesson_id, "messages": history}

# --- Session resume endpoints ---

class ResumeSessionRequest(BaseModel):
    session_id: str
    student_id: str

@app.post("/resume_session")
async def resume_session(req: ResumeSessionRequest):
    """
    Return the current unanswered question for a session.
    If the student already submitted the last question, generate a new one.
    """
    safe_student_id = "00000000-0000-0000-0000-000000000001" if req.student_id == "undefined" else req.student_id

    res = supabase.table("quiz_sessions").select("*").eq("id", req.session_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found.")

    session = res.data[0]
    if session["student_id"] != safe_student_id:
        raise HTTPException(status_code=403, detail="Session does not belong to this student.")
    if session["status"] == "complete":
        return {"status": "complete", "message": "This topic is complete. Great work!",
                "session_id": req.session_id, "lesson_id": session.get("lesson_id")}

    # If there is a saved unanswered draft, return it directly
    if session.get("current_draft"):
        return {
            "status": "active",
            "resumed": True,
            "session_id": req.session_id,
            "lesson_id": session.get("lesson_id"),
            "topic": session.get("topic", ""),
            "subject": session.get("subject", ""),
            "question_type": session.get("question_type", "mcq"),
            "answered_count": session.get("answered_count", 0),
            "mastery_score": session.get("mastery_score", 0.0),
            "question_data": _strip_answer_fields(session["current_draft"]),
        }

    # No draft — generate the next question using stored session context
    state = AgentState(
        student_id=safe_student_id,
        topic=session.get("topic", ""),
        subject=session.get("subject", ""),
        language=session.get("language", "English"),
        form_level=session.get("form_level", 4),
        is_adaptive=session.get("is_adaptive", False),
        question_type=session.get("question_type", "mcq"),
        context="",
        dskp_criteria="",
        student_history="",
        draft=None,
        student_answer=None,
        is_correct=False,
        partial_credit=None,
        mastery_score=session.get("mastery_score", 0.0),
        feedback="",
        teacher_action_plan="",
        mnemonic_lyrics=None,
        media_url=None,
        video_broll=None,
        h5p_content=None,
        diagram_svg=None,
        worked_example=None,
        topic_complete=False,
        next_topic=session["topic"],
        error_category=None,
        root_cause=None,
        intervention_plan=None,
        essay_detail=None,
        answered_count=0,
        target_kbat=None,
    )

    state.update(await asyncio.to_thread(retriever_node, state))
    if session["question_type"] == "mcq":
        state.update(await asyncio.to_thread(studio_node, state))
    if not state.get("draft"):
        state.update(await asyncio.to_thread(generator_node, state))

    new_draft = state.get("draft")

    # Persist the new draft back to the session
    try:
        supabase.table("quiz_sessions").update({"current_draft": new_draft})\
            .eq("id", req.session_id).execute()
    except Exception as e:
        print(f"-> Session draft update error (non-fatal): {e}")

    return {
        "status": "active",
        "resumed": False,
        "session_id": req.session_id,
        "lesson_id": session.get("lesson_id"),
        "topic": session["topic"],
        "subject": session["subject"],
        "question_type": session["question_type"],
        "answered_count": session["answered_count"],
        "mastery_score": session["mastery_score"],
        "question_data": _strip_answer_fields(new_draft),
    }

@app.get("/session/{session_id}")
async def get_session(session_id: str):
    """Return session metadata (no question generation)."""
    res = supabase.table("quiz_sessions").select(
        "id, student_id, topic, subject, language, question_type, is_adaptive, "
        "lesson_id, answered_count, mastery_score, status, created_at"
    ).eq("id", session_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found.")
    return res.data[0]


@app.get("/listening_audio/{session_id}")
async def get_listening_audio(session_id: str):
    """Poll for listening question TTS audio. Returns ready=False while generating.
    Frontend should poll every ~2s until ready=True, then play audio_url."""
    res = await asyncio.to_thread(
        lambda: supabase.table("quiz_sessions")
            .select("current_draft")
            .eq("id", session_id)
            .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found.")
    draft = res.data[0].get("current_draft") or {}
    audio_url = draft.get("audio_url")
    return {"session_id": session_id, "audio_url": audio_url, "ready": bool(audio_url)}

class FeedbackRequest(BaseModel):
    student_id: Optional[str] = None
    quiz_id: Optional[str] = None
    lesson_id: Optional[str] = None
    test_score: Optional[float] = None
    suggested_improvements: Optional[str] = None
    raw_payload: Optional[Dict] = None

@app.post("/submit_feedback")
async def submit_feedback(req: FeedbackRequest):
    """Lovable dashboard posts student/teacher feedback here."""
    safe_student_id = None
    if req.student_id:
        safe_student_id = "00000000-0000-0000-0000-000000000001" if req.student_id == "undefined" else req.student_id

    row = {
        "student_id": safe_student_id,
        "quiz_id": req.quiz_id,
        "lesson_id": req.lesson_id,
        "test_score": req.test_score,
        "suggested_improvements": req.suggested_improvements,
        "raw_payload": req.raw_payload or {},
        "status": "pending",
    }

    try:
        res = supabase.table("user_feedback").insert(row).execute()
        feedback_id = res.data[0]["id"] if res.data else None
        return {"status": "queued", "feedback_id": feedback_id}
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.post("/process_feedback")
async def trigger_process_feedback(batch_size: int = 10):
    """Manually trigger one processing cycle (for testing or on-demand runs)."""
    count = process_pending_batch(batch_size=batch_size)
    return {"processed": count}

def _get_flagged_students(threshold: int = 2) -> list:
    """
    Find students who have made the same error_category ≥ threshold times on the
    same topic. These are the students who need direct teacher intervention —
    the AI's hint tier has not resolved their misconception.
    """
    try:
        from collections import defaultdict
        res = supabase.table("event_logs")\
            .select("student_id, subject, topic, error_category, root_cause, created_at")\
            .eq("is_correct", False)\
            .not_.is_("error_category", "null")\
            .neq("error_category", "None")\
            .neq("error_category", "none")\
            .order("created_at", desc=True)\
            .limit(500).execute()

        if not res.data:
            return []

        counts: dict = defaultdict(lambda: {"count": 0, "root_causes": [], "subjects": [], "last_seen": None})
        for row in res.data:
            key = (row["student_id"], row["topic"], row.get("error_category") or "Unknown")
            counts[key]["count"] += 1
            if row.get("root_cause"):
                counts[key]["root_causes"].append(row["root_cause"])
            if row.get("subject") and not counts[key]["subjects"]:
                counts[key]["subjects"].append(row["subject"])
            if counts[key]["last_seen"] is None:
                counts[key]["last_seen"] = row["created_at"]

        flagged_raw = []
        for (student_id, topic, error_category), data in counts.items():
            if data["count"] >= threshold:
                flagged_raw.append({
                    "student_id": student_id,
                    "subject": data["subjects"][0] if data["subjects"] else "",
                    "topic": topic,
                    "error_category": error_category,
                    "wrong_count": data["count"],
                    "root_cause": data["root_causes"][0] if data["root_causes"] else "",
                    "last_seen": data["last_seen"],
                    "intervention_script": "",
                    "suggested_activity": "",
                })

        flagged_raw.sort(key=lambda x: x["wrong_count"], reverse=True)
        flagged_raw = flagged_raw[:20]

        # Batch-fetch names for flagged students
        if flagged_raw:
            unique_ids = list({f["student_id"] for f in flagged_raw})
            try:
                prof_res = supabase.table("profiles")\
                    .select("id, full_name")\
                    .in_("id", unique_ids)\
                    .execute()
                names = {
                    row["id"]: row["full_name"]
                    for row in (prof_res.data or [])
                    if row.get("full_name")
                }
                for f in flagged_raw:
                    f["student_name"] = names.get(f["student_id"]) or None
            except Exception:
                for f in flagged_raw:
                    f["student_name"] = None

        return flagged_raw
    except Exception as e:
        print(f"[teacher_insights] flagged student query failed: {e}")
        return []


def _fallback_intervention(f: dict) -> dict:
    """
    Deterministic teacher note built from the diagnosis we already have
    (error_category + root_cause). Used whenever the LLM batch fails to yield a
    script for a flagged case, so a "Conceptual Gap" card on the dashboard is
    NEVER shown with an empty teacher note (previously a malformed-JSON batch
    blanked out every card at once).
    """
    topic = f.get("topic") or "this topic"
    cause = (f.get("root_cause") or "").strip()
    cause_clause = f" {cause}" if cause else ""
    return {
        "intervention_script": (
            f"This student keeps making the same mistake on '{topic}'.{cause_clause} "
            f"Sit with them, ask them to re-explain the idea in their own words, and "
            f"correct the misunderstanding directly before moving on."
        ),
        "suggested_activity": (
            f"Work through one simpler {topic} example together, then have the student "
            f"attempt a similar one on their own to confirm the concept has stuck."
        ),
    }


def _generate_intervention_scripts(flagged: list) -> list:
    """
    For each flagged student, generate a teacher-facing intervention script in a
    single batched LLM call. This avoids per-student API calls and stays within
    latency budget for the teacher dashboard.

    Parsing is defensive: the LLM occasionally emits malformed JSON (e.g. an
    unescaped quote mid-string). Rather than let one bad character wipe every
    script, we recover the payload where possible and fall back to a
    diagnosis-derived note per case, so the dashboard always shows a real note.
    """
    if not flagged:
        return []
    try:
        cases = "\n".join([
            f"{i+1}. Topic: {f['topic']} | Error type: {f['error_category']} "
            f"(x{f['wrong_count']}) | Diagnosed reason: {f['root_cause'] or 'not specified'}"
            for i, f in enumerate(flagged)
        ])
        prompt = f"""You are an expert Malaysian secondary school teaching assistant (KSSM curriculum).
Each case below is a student who has repeatedly made the same mistake. The AI system has already
attempted to help but the misconception persists. The teacher needs to intervene directly.

For each case, write:
1. A 2-sentence script the teacher can say to the student in class (conversational, supportive tone,
   mix of English and Bahasa Malaysia is fine). Do NOT give away the answer — scaffold understanding.
2. One concrete 5-minute micro-activity the teacher can do (e.g. draw a diagram, ask student to
   re-explain in their own words, work through a simpler analogous example).

Cases:
{cases}

Return ONLY a JSON object:
{{
  "interventions": [
    {{"index": 1, "script": "...", "suggested_activity": "..."}},
    ...
  ]
}}"""

        # 4096 tokens: up to 20 flagged cases × (2-sentence script + activity),
        # often bilingual (BM/EN/ZH) — 2000 truncated the JSON mid-string, which
        # made the whole batch unparseable and blanked every card.
        res = call_llm(prompt, want_json=True, temperature=0.4, max_tokens=4096)

        # Defensive parse: raw JSON → de-fenced/prose-stripped payload → {}.
        # Never lets a single malformed response throw and blank out every case.
        try:
            data = json.loads(res.text)
        except json.JSONDecodeError:
            try:
                data = json.loads(_extract_json_payload(res.text))
            except json.JSONDecodeError as exc:
                print(f"[teacher_insights] intervention JSON unrecoverable: {exc}")
                data = {}
        if isinstance(data, list):
            data = data[0] if data else {}

        # Build the index→script map, skipping any item missing an index/script.
        script_map: dict = {}
        for item in (data.get("interventions", []) if isinstance(data, dict) else []):
            if isinstance(item, dict) and "index" in item:
                script_map[item["index"]] = item

        result = []
        for i, f in enumerate(flagged):
            s = script_map.get(i + 1, {})
            script = (s.get("script") or "").strip()
            activity = (s.get("suggested_activity") or "").strip()
            if not script:
                fb = _fallback_intervention(f)
                script = script or fb["intervention_script"]
                activity = activity or fb["suggested_activity"]
            result.append({**f, "intervention_script": script, "suggested_activity": activity})
        return result
    except Exception as e:
        print(f"[teacher_insights] intervention script generation failed: {e}")
        return [{**f, **_fallback_intervention(f)} for f in flagged]


def _build_student_diagnostics(flagged: list) -> list:
    """
    Aggregate per-(student, topic, error) flagged items into one summary per student.
    Uses the highest-wrong-count topic's intervention script as the student-level one.
    """
    from collections import defaultdict
    by_student: dict = defaultdict(list)
    for item in flagged:
        by_student[item["student_id"]].append(item)

    result = []
    for student_id, items in by_student.items():
        items_sorted = sorted(items, key=lambda x: x["wrong_count"], reverse=True)
        top = items_sorted[0]
        result.append({
            "student_id": student_id,
            "student_name": top.get("student_name"),
            "total_errors": sum(i["wrong_count"] for i in items),
            "topics": [
                {
                    "topic": i["topic"],
                    "subject": i.get("subject", ""),
                    "error_category": i["error_category"],
                    "wrong_count": i["wrong_count"],
                    "root_cause": i.get("root_cause") or "",
                    "intervention_script": i.get("intervention_script") or "",
                    "suggested_activity": i.get("suggested_activity") or "",
                }
                for i in items_sorted
            ],
            "dominant_error": top["error_category"],
            "intervention_script": top.get("intervention_script") or "",
            "suggested_activity": top.get("suggested_activity") or "",
            "last_seen": top.get("last_seen"),
        })

    result.sort(key=lambda x: x["total_errors"], reverse=True)
    return result[:10]


def _build_misconception_clusters(flagged: list) -> list:
    """
    Aggregate flagged students by error_category to show which misconceptions
    are class-wide vs individual. Returns sorted by student count descending.
    """
    from collections import defaultdict
    clusters: dict = defaultdict(lambda: {"error_category": "", "student_count": 0, "topics": set()})
    for f in flagged:
        cat = f["error_category"]
        clusters[cat]["error_category"] = cat
        clusters[cat]["student_count"] += 1
        clusters[cat]["topics"].add(f["topic"])

    result = [
        {
            "error_category": v["error_category"],
            "student_count": v["student_count"],
            "topics_affected": list(v["topics"]),
        }
        for v in clusters.values()
    ]
    result.sort(key=lambda x: x["student_count"], reverse=True)
    return result


def _generate_teacher_narrative(
    class_mastery: list,
    alerts: list,
    active_students: int | None,
    class_average_mastery: int | None,
    weakest_topic: str | None,
    flagged_count: int = 0,
) -> str:
    try:
        mastery_summary = ""
        if class_mastery:
            mastery_summary = "\n".join(
                f"  - {r.get('subject','?')}: {r.get('mastery','?')}%" for r in class_mastery[:10]
            )
        alerts_summary = ""
        if alerts:
            alerts_summary = "\n".join(
                f"  - [{a['topic']}] {a['category']}: {a['observation']}" for a in alerts[:10]
            )
        prompt = f"""You are an AI teaching assistant summarising a class performance report for a Malaysian secondary school teacher.

Class stats:
- Active students: {active_students if active_students is not None else 'unknown'}
- Class average mastery: {class_average_mastery if class_average_mastery is not None else 'unknown'}%
- Weakest topic: {weakest_topic if weakest_topic is not None else 'unknown'}
- Students flagged for repeated misconceptions needing direct teacher attention: {flagged_count}

Recent errors (last 10 wrong answers):
{alerts_summary or '  (none recorded)'}

Student mastery snapshot (up to 10 rows):
{mastery_summary or '  (no data)'}

Write a 3–5 sentence narrative in plain English for the teacher. Cover: overall class health, the most urgent topic to address, any patterns in errors, whether any students need direct 1-on-1 attention, and a concrete recommended action for today's lesson. Be direct and practical — no filler."""

        res = call_llm(prompt, temperature=0.4, max_tokens=300)
        return res.text.strip() if res and res.text else ""
    except Exception as e:
        print(f"[teacher_insights] narrative generation failed: {e}")
        return ""


# ---------------------------------------------------------------------------
# Insights cache — computed on first request, then served from cache for 15
# minutes. No background loop; LLM is only called when someone opens the
# dashboard, not on a fixed schedule.
# ---------------------------------------------------------------------------
import time as _time

_INSIGHTS_CACHE: dict = {"data": None, "cached_at": None}
_INSIGHTS_TTL: int = 900          # seconds (15 min)
_insights_refresh_lock = asyncio.Lock()


async def _compute_insights() -> dict:
    """Build the full teacher_insights payload. Runs in a thread pool for blocking I/O."""
    from collections import defaultdict

    def _fetch_and_build():
        logs_res = supabase.table("event_logs")\
            .select("student_id, topic, subject, is_correct, error_category, root_cause, intervention, created_at")\
            .eq("is_correct", False)\
            .order("created_at", desc=True)\
            .limit(10).execute()

        # Batch-fetch student names for all student_ids in the alerts
        student_names: dict = {}
        if logs_res.data:
            unique_ids = list({log["student_id"] for log in logs_res.data})
            try:
                prof_res = supabase.table("profiles")\
                    .select("id, full_name")\
                    .in_("id", unique_ids)\
                    .execute()
                student_names = {
                    row["id"]: row["full_name"]
                    for row in (prof_res.data or [])
                    if row.get("full_name")
                }
            except Exception:
                pass

        alerts = []
        if logs_res.data:
            for log in logs_res.data:
                sid = log["student_id"]
                alerts.append({
                    "student_id": sid,
                    "student_name": student_names.get(sid) or None,
                    "topic": log["topic"],
                    "subject": log.get("subject") or "",
                    "category": log["error_category"],
                    "observation": log["root_cause"],
                    "action": log["intervention"],
                    "time": log["created_at"],
                })

        weakest_topic = None
        active_students = None
        class_average_mastery = None
        class_mastery = []
        try:
            mastery_res = supabase.table("dskp_mastery")\
                .select("student_id, topic, mastery_level").execute()
            if mastery_res.data:
                active_students = len({r["student_id"] for r in mastery_res.data})
                scores = [r["mastery_level"] for r in mastery_res.data]
                class_average_mastery = round(sum(scores) / len(scores) * 100)

                topic_totals: dict = defaultdict(list)
                for r in mastery_res.data:
                    topic_totals[r["topic"]].append(r["mastery_level"])
                topic_avgs = {t: sum(v) / len(v) for t, v in topic_totals.items()}
                weakest_topic = min(topic_avgs, key=topic_avgs.get)

                class_mastery = [
                    {"subject": topic, "mastery": round(avg * 100)}
                    for topic, avg in sorted(topic_avgs.items())
                ]
        except Exception as e:
            print(f"[teacher_insights] mastery stats failed: {e}")

        flagged_raw = _get_flagged_students(threshold=2)
        flagged_students = _generate_intervention_scripts(flagged_raw)
        misconception_clusters = _build_misconception_clusters(flagged_raw)

        narrative = _generate_teacher_narrative(
            class_mastery=class_mastery,
            alerts=alerts,
            active_students=active_students,
            class_average_mastery=class_average_mastery,
            weakest_topic=weakest_topic,
            flagged_count=len(flagged_students),
        )

        student_diagnostics = _build_student_diagnostics(flagged_students)
        return {
            "class_mastery": class_mastery,
            "recent_alerts": alerts,
            "active_students": active_students,
            "class_average_mastery": class_average_mastery,
            "weakest_topic": weakest_topic,
            "narrative": narrative,
            "flagged_students": flagged_students,
            "misconception_clusters": misconception_clusters,
            "student_diagnostics": student_diagnostics,
        }

    return await asyncio.to_thread(_fetch_and_build)


async def _refresh_insights_cache():
    """Refresh the insights cache under a lock so only one refresh runs at a time."""
    async with _insights_refresh_lock:
        try:
            print("[teacher_insights] refreshing cache...")
            data = await _compute_insights()
            _INSIGHTS_CACHE["data"] = data
            _INSIGHTS_CACHE["cached_at"] = _time.time()
            print("[teacher_insights] cache refreshed")
        except Exception as e:
            print(f"[teacher_insights] background refresh failed: {e}")


@app.get("/teacher_insights")
async def get_teacher_insights(background_tasks: BackgroundTasks, force_refresh: bool = False):
    cached_at = _INSIGHTS_CACHE["cached_at"]
    cache_stale = cached_at is None or (_time.time() - cached_at) > _INSIGHTS_TTL
    has_data = _INSIGHTS_CACHE["data"] is not None

    if force_refresh or cache_stale:
        if not has_data:
            # First ever load: kick off refresh in background and return loading stub
            background_tasks.add_task(_refresh_insights_cache)
        elif force_refresh:
            # Explicit refresh requested: block (user is waiting for fresh data)
            await _refresh_insights_cache()
        else:
            # Stale but has data: serve immediately, refresh behind the scenes
            background_tasks.add_task(_refresh_insights_cache)

    cached_at = _INSIGHTS_CACHE["cached_at"]
    age_seconds = int(_time.time() - cached_at) if cached_at else None
    is_refreshing = (cache_stale and not force_refresh) or (not has_data)
    return {
        **(_INSIGHTS_CACHE["data"] or {}),
        "cached_at": cached_at,
        "cache_age_seconds": age_seconds,
        "refreshing": is_refreshing,
    }


@app.get("/teacher_insights/flagged")
async def get_flagged_students_endpoint(threshold: int = 2):
    """Direct access to flagged students with AI intervention scripts. Lighter call than full /teacher_insights."""
    flagged_raw = _get_flagged_students(threshold=threshold)
    flagged_students = _generate_intervention_scripts(flagged_raw)
    misconception_clusters = _build_misconception_clusters(flagged_raw)
    return {
        "flagged_students": flagged_students,
        "misconception_clusters": misconception_clusters,
        "total_flagged": len(flagged_students),
    }

@app.get("/suggest_topic/{student_id}")
async def suggest_topic(student_id: str, background_tasks: BackgroundTasks = None):
    """
    Returns the best next subject+topic for a student.
    Priority order:
      1. Highest-priority active remediation_plan row (AI-generated, error-informed)
      2. Lowest mastery score among started topics
      3. Random unstarted topic
    """
    safe_id = "00000000-0000-0000-0000-000000000001" if student_id == "undefined" else student_id

    # 1. Check AI remediation plan
    try:
        plan_item = get_top_suggestion(safe_id)
        if plan_item:
            mastery_res = supabase.table("dskp_mastery")\
                .select("mastery_level")\
                .eq("student_id", safe_id)\
                .eq("topic", plan_item["topic"])\
                .execute()
            mastery_score = mastery_res.data[0]["mastery_level"] if mastery_res.data else 0.0
            return {
                "subject": plan_item["subject"],
                "topic": plan_item["topic"],
                "mastery_score": mastery_score,
                "reason": "remediation_plan",
                "priority_score": plan_item.get("priority_score"),
                "why": plan_item.get("reason"),
                "suggested_intervention": plan_item.get("suggested_intervention"),
            }
    except Exception as e:
        print(f"[suggest_topic] remediation plan lookup failed (non-fatal): {e}")

    # 2. Fall back: lowest mastery score
    mastery_res = supabase.table("dskp_mastery")\
        .select("topic, curriculum_tag, mastery_level")\
        .eq("student_id", safe_id)\
        .order("mastery_level", desc=False)\
        .execute()

    started: set[str] = set()
    if mastery_res.data:
        started = {row["topic"] for row in mastery_res.data}
        for row in mastery_res.data:
            if row["mastery_level"] < 0.9:
                return {
                    "subject": row["curriculum_tag"],
                    "topic": row["topic"],
                    "mastery_score": row["mastery_level"],
                    "reason": "lowest_mastery",
                    "priority_score": None,
                    "why": None,
                    "suggested_intervention": None,
                }

    # 3. Random unstarted topic
    all_entries = [
        {"subject": subj, "topic": topic}
        for subj, topics in KSSM_TOPICS.items()
        for topic in topics
        if topic not in started
    ]

    if not all_entries:
        all_entries = [
            {"subject": subj, "topic": topic}
            for subj, topics in KSSM_TOPICS.items()
            for topic in topics
        ]

    pick = random.choice(all_entries)
    return {
        "subject": pick["subject"],
        "topic": pick["topic"],
        "mastery_score": 0.0,
        "reason": "unstarted",
        "priority_score": None,
        "why": None,
        "suggested_intervention": None,
    }


@app.post("/remediation_plan/{student_id}")
async def trigger_remediation_plan(student_id: str, background_tasks: BackgroundTasks):
    """
    Manually trigger remediation plan generation for a student.
    Returns immediately; plan generation runs in the background.
    The updated plan will be reflected on the next /suggest_topic call.
    """
    safe_id = "00000000-0000-0000-0000-000000000001" if student_id == "undefined" else student_id
    background_tasks.add_task(plan_for_student, safe_id, 30)
    return {"status": "queued", "student_id": safe_id}


# ---------------------------------------------------------------------------
# Teacher-assigned tasks
# ---------------------------------------------------------------------------

_TASK_GEN_PROMPT = """You are an expert Malaysian secondary school teacher assistant (KSSM/KSSR).
A student has been struggling with the topic below. Generate a short, personalised task for them.

Student weak topic: {topic} ({subject})
Error patterns: {error_categories}
Root causes diagnosed: {root_causes}
Current mastery: {mastery_pct}%
AI-suggested intervention: {suggested_intervention}

Return ONLY a JSON object:
{{
  "task_type": "quiz" | "lesson" | "practice",
  "instructions": "<2-4 sentence personalised task description written directly to the student — warm, encouraging tone, mix of English and BM is fine. Tell them exactly what to focus on and why.>",
  "teacher_tip": "<1 sentence tip for the teacher on how to follow up>"
}}

Choose task_type:
- "lesson"   if mastery < 30% (student needs to re-learn the concept first)
- "quiz"     if mastery 30–70% (student needs guided practice)
- "practice" if mastery > 70% but error pattern is persistent (student needs targeted drilling)
"""


class GenerateTaskRequest(BaseModel):
    student_id: str
    topic: str
    subject: str


class AssignTaskRequest(BaseModel):
    student_id: str
    subject: str
    topic: str
    task_type: str          # 'quiz' | 'lesson' | 'practice'
    instructions: str
    teacher_note: str = ""
    error_context: list = []
    priority_score: float = 0.5


@app.post("/teacher/generate_task")
async def teacher_generate_task(req: GenerateTaskRequest):
    """
    Given a student + topic, pull their remediation plan data and use the LLM
    to produce a personalised task recommendation.
    """
    safe_id = "00000000-0000-0000-0000-000000000001" if req.student_id == "undefined" else req.student_id

    # Pull remediation plan for this student+topic
    plan_res = supabase.table("remediation_plans")\
        .select("*")\
        .eq("student_id", safe_id)\
        .eq("topic", req.topic)\
        .limit(1).execute()

    plan = plan_res.data[0] if plan_res.data else {}

    # Also pull current mastery
    mastery_res = supabase.table("dskp_mastery")\
        .select("mastery_level")\
        .eq("student_id", safe_id)\
        .eq("topic", req.topic)\
        .limit(1).execute()
    mastery = mastery_res.data[0]["mastery_level"] if mastery_res.data else 0.0

    prompt = _TASK_GEN_PROMPT.format(
        topic=req.topic,
        subject=req.subject,
        error_categories=", ".join(plan.get("error_categories") or []) or "not yet recorded",
        root_causes=", ".join(plan.get("root_causes") or []) or "not yet recorded",
        mastery_pct=round(mastery * 100),
        suggested_intervention=plan.get("suggested_intervention") or "review core concepts",
    )

    try:
        # Offload the blocking LLM call to a thread — otherwise it stalls the
        # single-worker event loop for the whole generation, freezing every
        # other request (e.g. the teacher dashboard's 10s /teacher_insights
        # poll) so the page appears to "not load". Mirrors generate_differentiated_plan.
        resp = await asyncio.to_thread(
            lambda: call_llm(prompt, want_json=True, temperature=0.3, max_tokens=500)
        )
        data = json.loads(resp.text)
        if isinstance(data, list):
            data = data[0]
    except Exception as e:
        return {"error": f"Task generation failed: {e}"}

    return {
        "student_id": safe_id,
        "topic": req.topic,
        "subject": req.subject,
        "task_type": data.get("task_type", "quiz"),
        "instructions": data.get("instructions", ""),
        "teacher_tip": data.get("teacher_tip", ""),
        "error_context": plan.get("error_categories") or [],
        "priority_score": plan.get("priority_score", mastery),
        "current_mastery": round(mastery * 100),
    }


@app.post("/teacher/assign_task")
async def teacher_assign_task(req: AssignTaskRequest):
    """Save an assigned task to the DB. Returns the new task id."""
    safe_id = "00000000-0000-0000-0000-000000000001" if req.student_id == "undefined" else req.student_id

    row = {
        "student_id": safe_id,
        "subject": req.subject,
        "topic": req.topic,
        "task_type": req.task_type,
        "instructions": req.instructions,
        "teacher_note": req.teacher_note,
        "error_context": req.error_context,
        "priority_score": req.priority_score,
        "status": "pending",
    }
    res = supabase.table("assigned_tasks").insert(row).execute()
    task_id = res.data[0]["id"] if res.data else None
    return {"status": "assigned", "task_id": task_id}


class DifferentiatedPlanRequest(BaseModel):
    error_category: str
    topics_affected: list = []
    student_diagnostics: list = []  # list of StudentDiagnostic dicts from teacher_insights


@app.post("/teacher/generate_differentiated_plan")
async def generate_differentiated_plan(req: DifferentiatedPlanRequest):
    """
    One-click differentiated instruction: groups flagged students into
    Support / Core / Extension tiers, generates tier-specific task plans via LLM,
    and bulk-assigns tasks to every student in the cluster.
    """
    error_category = req.error_category
    topics_affected = req.topics_affected
    student_diagnostics = req.student_diagnostics

    # Filter to students relevant to this cluster
    relevant = [
        s for s in student_diagnostics
        if s.get("dominant_error") == error_category
        or any(t.get("error_category") == error_category for t in (s.get("topics") or []))
    ]
    if not relevant:
        relevant = student_diagnostics

    relevant.sort(key=lambda x: x.get("total_errors", 0), reverse=True)
    n = len(relevant)
    third = max(1, n // 3)
    support_students = relevant[:third]
    core_students = relevant[third: third * 2]
    extension_students = relevant[third * 2:]

    topic_str = ", ".join(topics_affected[:3]) if topics_affected else error_category
    top_topic = topics_affected[0] if topics_affected else error_category

    prompt = f"""You are a Malaysian secondary school curriculum expert (KSSM) designing differentiated instruction.

Students share a recurring error: "{error_category}"
Affected topics: {topic_str}

Create differentiated tasks for 3 learning groups. Return ONLY a JSON object (no markdown, no explanation):
{{
  "support": {{
    "activity_suggestion": "One sentence — what this group does together in class (e.g. teacher-led whiteboard session)",
    "task_type": "lesson",
    "instructions": "2-3 sentences — specific task with scaffolding. Mention a concrete strategy.",
    "teacher_tip": "One actionable tip for handling this group."
  }},
  "core": {{
    "activity_suggestion": "One sentence — structured guided activity",
    "task_type": "quiz",
    "instructions": "2-3 sentences — practice with a collaborative element.",
    "teacher_tip": "One actionable tip."
  }},
  "extension": {{
    "activity_suggestion": "One sentence — higher-order / creative challenge",
    "task_type": "practice",
    "instructions": "2-3 sentences — application task that deepens and extends.",
    "teacher_tip": "One actionable tip for stretching this group."
  }}
}}"""

    try:
        resp = await asyncio.to_thread(lambda: call_llm(prompt, want_json=True, temperature=0.4, max_tokens=600))
        plan = json.loads(resp.text)
        if isinstance(plan, list):
            plan = plan[0]
    except Exception as e:
        print(f"[diff_plan] LLM failed: {e}")
        plan = {
            "support": {
                "activity_suggestion": "Teacher-led small group session with step-by-step worked examples",
                "task_type": "lesson",
                "instructions": f"Re-teach {top_topic} using concrete examples with visual aids. Students complete 3 guided questions alongside the teacher before attempting independently.",
                "teacher_tip": "Pause after each example — ask students to predict the next step before showing it.",
            },
            "core": {
                "activity_suggestion": "Structured pair practice — solve then explain to your partner",
                "task_type": "quiz",
                "instructions": f"Complete a 5-question practice set on {top_topic}. After each answer write one sentence justifying your reasoning. Compare answers with your partner.",
                "teacher_tip": "Listen to how students explain — misconceptions are often revealed in verbal reasoning, not just written answers.",
            },
            "extension": {
                "activity_suggestion": "Independent application task followed by a peer teach-back",
                "task_type": "practice",
                "instructions": f"Solve 2 real-world application problems on {top_topic}. Prepare a 2-minute explanation of your solution method to teach a classmate who is still struggling.",
                "teacher_tip": "Challenge them to find an alternative solution method or create their own example problem.",
            },
        }

    groups = []
    assigned_count = 0
    tier_configs = [
        ("support", "Support Group", support_students, 0.9),
        ("core", "Core Group", core_students, 0.65),
        ("extension", "Extension Group", extension_students, 0.4),
    ]

    for tier_key, tier_name, students, priority in tier_configs:
        tier_plan = plan.get(tier_key, {})
        student_ids = [s["student_id"] for s in students if s.get("student_id")]
        subject = (students[0].get("topics") or [{}])[0].get("subject", "") if students else ""

        groups.append({
            "name": tier_name,
            "tier": tier_key,
            "student_ids": student_ids,
            "student_count": len(student_ids),
            "activity_suggestion": tier_plan.get("activity_suggestion", ""),
            "task_type": tier_plan.get("task_type", "practice"),
            "instructions": tier_plan.get("instructions", ""),
            "teacher_tip": tier_plan.get("teacher_tip", ""),
        })

        for sid in student_ids:
            try:
                row = {
                    "student_id": sid,
                    "subject": subject,
                    "topic": top_topic,
                    "task_type": tier_plan.get("task_type", "practice"),
                    "instructions": tier_plan.get("instructions", ""),
                    "teacher_note": f"[{tier_name}] {tier_plan.get('teacher_tip', '')}",
                    "error_context": [error_category],
                    "priority_score": priority,
                    "status": "pending",
                }
                await asyncio.to_thread(
                    lambda r=row: supabase.table("assigned_tasks").insert(r).execute()
                )
                assigned_count += 1
            except Exception as e:
                print(f"[diff_plan] Failed to assign for {sid}: {e}")

    return {
        "error_category": error_category,
        "groups": groups,
        "tasks_assigned": assigned_count,
    }


class TeacherChatRequest(BaseModel):
    message: str
    teacher_id: Optional[str] = None
    thread_id: Optional[str] = None


@app.post("/teacher/chat")
async def teacher_chat(req: TeacherChatRequest):
    """AI controller for the teacher dashboard: one chat message is orchestrated into
    reads (weak topics), generation (slides/questions) and actions (assign tasks).
    Offloaded to a thread — the planner loop makes several blocking LLM/DB calls."""
    if not (req.message or "").strip():
        raise HTTPException(status_code=400, detail="message is required.")
    result = await asyncio.to_thread(
        run_teacher_chat,
        req.message,
        req.teacher_id or "00000000-0000-0000-0000-000000000001",
        req.thread_id or "00000000-0000-0000-0000-000000000001",
    )
    return result


@app.get("/teacher/chat/history")
async def teacher_chat_history(teacher_id: Optional[str] = None, thread_id: Optional[str] = None):
    tid = teacher_id or "00000000-0000-0000-0000-000000000001"
    thr = thread_id or "00000000-0000-0000-0000-000000000001"
    return {"messages": get_teacher_history(tid, thr, limit=50)}


@app.get("/teacher/tasks")
async def teacher_list_tasks(status: Optional[str] = None):
    """List all assigned tasks (teacher view). Filter by status=pending|in_progress|completed."""
    q = supabase.table("assigned_tasks")\
        .select("*")\
        .order("assigned_at", desc=True)
    if status:
        q = q.eq("status", status)
    res = q.limit(200).execute()
    return {"tasks": res.data or []}


@app.get("/student/tasks/{student_id}")
async def student_list_tasks(student_id: str):
    """Return pending + in_progress tasks assigned to this student."""
    safe_id = "00000000-0000-0000-0000-000000000001" if student_id == "undefined" else student_id
    res = supabase.table("assigned_tasks")\
        .select("*")\
        .eq("student_id", safe_id)\
        .in_("status", ["pending", "in_progress"])\
        .order("priority_score", desc=True)\
        .execute()
    return {"student_id": safe_id, "tasks": res.data or []}


@app.post("/student/tasks/{task_id}/start")
async def student_start_task(task_id: str):
    """Mark a task as in_progress when the student opens it."""
    supabase.table("assigned_tasks").update({
        "status": "in_progress",
        "started_at": "now()",
    }).eq("id", task_id).execute()
    return {"status": "in_progress", "task_id": task_id}


@app.post("/student/tasks/{task_id}/complete")
async def student_complete_task(task_id: str, session_id: Optional[str] = None):
    """Mark a task complete. Optionally link the quiz session that fulfilled it."""
    update = {"status": "completed", "completed_at": "now()"}
    if session_id:
        update["session_id"] = session_id
    supabase.table("assigned_tasks").update(update).eq("id", task_id).execute()
    return {"status": "completed", "task_id": task_id}


@app.get("/subjects")
async def get_subjects(form_level: Optional[int] = None):
    """
    Returns subjects with display labels formatted as '{KSSM|KSSR} {Subject} Form/Year {N}'.
    Filters out malformed subject names produced by raw book-title ingestion.
    Pass ?form_level=N to filter by form/year number.
    """
    seen: set = set()
    entries: list = []

    # Seed from static KSSM map — always clean, always first
    forms_to_scan = [form_level] if form_level else sorted(KSSM_TOPICS_BY_FORM.keys())
    for form in forms_to_scan:
        for subj, topics in KSSM_TOPICS_BY_FORM.get(form, {}).items():
            key = ("KSSM", subj, form)
            if key in seen:
                continue
            seen.add(key)
            entries.append({
                "display_label": f"KSSM {subj} Form {form}",
                "name": subj,
                "subject": subj,
                "curriculum": "KSSM",
                "form": form,
                "topics": topics,
                "essay_topics": essay_topics_for(subj, form),
            })

    # Merge DB entries — may include KSSR or forms not in static map
    try:
        res = supabase.table("syllabus_embeddings").select("metadata").execute()
        for row in res.data:
            meta = row.get("metadata") or {}
            subj = (meta.get("subject") or "").strip()
            curriculum = (meta.get("curriculum") or "KSSM").strip().upper()

            # Only allow recognised curricula
            if curriculum not in ("KSSM", "KSSR"):
                continue
            # Filter malformed subjects: file extensions, path chars, blank, or overlong book titles
            if not subj or len(subj) < 2 or len(subj) > 60:
                continue
            if any(c in subj for c in (".", "/", "\\", "\n", "\r")):
                continue

            try:
                form_int = int(meta["form"]) if meta.get("form") is not None else None
            except (ValueError, TypeError):
                form_int = None

            if form_level and form_int != form_level:
                continue

            key = (curriculum, subj, form_int)
            if key in seen:
                continue
            seen.add(key)

            time_word = "Year" if curriculum == "KSSR" else "Form"
            time_part = f" {time_word} {form_int}" if form_int is not None else ""
            display_label = f"{curriculum} {subj}{time_part}"

            topics = (
                KSSM_TOPICS_BY_FORM.get(form_int, {}).get(subj)
                or KSSM_TOPICS.get(subj)
                or ["Core Material"]
            )

            entries.append({
                "display_label": display_label,
                "name": subj,
                "subject": subj,
                "curriculum": curriculum,
                "form": form_int,
                "topics": topics,
                "essay_topics": essay_topics_for(subj, form_int),
            })
    except Exception as e:
        print(f"[subjects] DB lookup failed, static map only: {e}")

    entries.sort(key=lambda e: (e["curriculum"], e["name"], e["form"] or 0))
    return {"form_level": form_level, "subjects": entries}


@app.get("/mastery_map/{student_id}")
async def get_mastery_map(student_id: str):
    """
    Returns per-subject topic mastery for a student.
    Used by the Lovable frontend to render the progress map.
    Topics not yet attempted have mastery_score 0.0 and status 'available'.
    """
    safe_id = "00000000-0000-0000-0000-000000000001" if student_id == "undefined" else student_id

    mastery_res = supabase.table("dskp_mastery")\
        .select("topic, curriculum_tag, mastery_level")\
        .eq("student_id", safe_id)\
        .execute()

    mastery_lookup: dict[str, float] = {}
    if mastery_res.data:
        for row in mastery_res.data:
            mastery_lookup[row["topic"]] = row["mastery_level"]

    mastery_map: dict[str, list] = {}
    for subject, topics in KSSM_TOPICS.items():
        entries = []
        for topic in topics:
            score = mastery_lookup.get(topic, 0.0)
            if score >= 0.9:
                status = "complete"
            elif score > 0.0:
                status = "started"
            else:
                status = "available"
            entries.append({"topic": topic, "mastery_score": round(score, 3), "status": status})
        mastery_map[subject] = entries

    total_topics = sum(len(v) for v in KSSM_TOPICS.values())
    completed = sum(1 for topics in mastery_map.values() for t in topics if t["status"] == "complete")

    return {
        "student_id": safe_id,
        "overall_progress": round(completed / total_topics, 3) if total_topics else 0.0,
        "mastery_map": mastery_map,
    }


def _build_radar(mastery_lookup: dict[str, float]) -> list[dict]:
    """Pre-compute per-subject average mastery for radar chart. Only started subjects."""
    SHORT = {
        "Additional Mathematics": "Add Math",
        "Pendidikan Moral": "P. Moral",
        "Pendidikan Seni Visual": "PSV",
        "Pendidikan Muzik": "P. Muzik",
    }
    radar = []
    for subject, topics in KSSM_TOPICS.items():
        scores = [mastery_lookup.get(t, 0.0) for t in topics]
        avg = sum(scores) / len(scores) if scores else 0.0
        if avg > 0:
            radar.append({"subject": SHORT.get(subject, subject), "mastery": round(avg * 100)})
    radar.sort(key=lambda x: x["mastery"], reverse=True)
    return radar[:8]


@app.get("/student_insights/{student_id}")
async def get_student_insights(student_id: str):
    """Per-student recurring errors for teacher dashboard. Returns top errors by frequency."""
    safe_id = "00000000-0000-0000-0000-000000000001" if student_id == "undefined" else student_id
    try:
        res = supabase.table("event_logs")\
            .select("topic, error_category, root_cause, subject")\
            .eq("student_id", safe_id)\
            .eq("is_correct", False)\
            .not_.is_("error_category", "null")\
            .order("created_at", desc=True)\
            .limit(200).execute()

        counts: dict = {}
        for row in (res.data or []):
            key = f"{row['topic']}::{row.get('error_category', '')}"
            if key not in counts:
                counts[key] = {"topic": row["topic"], "subject": row.get("subject", ""),
                               "error_category": row.get("error_category", ""),
                               "root_cause": row.get("root_cause") or "", "count": 0}
            counts[key]["count"] += 1

        insights = sorted(counts.values(), key=lambda x: x["count"], reverse=True)[:10]
        return {"student_id": safe_id, "insights": insights}
    except Exception as e:
        print(f"[student_insights] error: {e}")
        return {"student_id": safe_id, "insights": []}


@app.get("/student_dashboard/{student_id}")
async def get_student_dashboard(student_id: str):
    """
    Combined mastery radar + recurring errors in one call.
    Runs both DB queries concurrently; returns pre-computed radar and insights.
    """
    safe_id = "00000000-0000-0000-0000-000000000001" if student_id == "undefined" else student_id

    def _fetch_mastery():
        return supabase.table("dskp_mastery")\
            .select("topic, mastery_level")\
            .eq("student_id", safe_id)\
            .execute()

    def _fetch_errors():
        return supabase.table("event_logs")\
            .select("topic, error_category, root_cause, subject")\
            .eq("student_id", safe_id)\
            .eq("is_correct", False)\
            .not_.is_("error_category", "null")\
            .order("created_at", desc=True)\
            .limit(200)\
            .execute()

    loop = asyncio.get_event_loop()
    mastery_res, errors_res = await asyncio.gather(
        loop.run_in_executor(None, _fetch_mastery),
        loop.run_in_executor(None, _fetch_errors),
    )

    # Build mastery lookup and overall progress
    mastery_lookup: dict[str, float] = {}
    for row in (mastery_res.data or []):
        mastery_lookup[row["topic"]] = row["mastery_level"]

    total_topics = sum(len(v) for v in KSSM_TOPICS.values())
    completed = sum(1 for t, s in mastery_lookup.items() if s >= 0.9)
    overall_progress = round(completed / total_topics, 3) if total_topics else 0.0

    # Pre-compute radar (subject averages, started only, top 8)
    radar = _build_radar(mastery_lookup)

    # Aggregate errors
    counts: dict = {}
    for row in (errors_res.data or []):
        key = f"{row['topic']}::{row.get('error_category', '')}"
        if key not in counts:
            counts[key] = {
                "topic": row["topic"],
                "subject": row.get("subject", ""),
                "error_category": row.get("error_category", ""),
                "root_cause": row.get("root_cause") or "",
                "count": 0,
            }
        counts[key]["count"] += 1

    insights = sorted(counts.values(), key=lambda x: x["count"], reverse=True)[:10]

    return {
        "student_id": safe_id,
        "overall_progress": overall_progress,
        "radar": radar,
        "insights": insights,
    }


DIAGNOSTIC_THRESHOLD = 10  # one question per subject, 10 subjects total

# Maps each subject to the SPM-correct question type for the diagnostic.
# Sciences/Sejarah/Geografi → MCQ (Paper 1 format).
# Languages and maths → short_answer (structured sub-parts / show working).
DIAGNOSTIC_QUESTION_TYPE: dict[str, str] = {
    "Physics":                "mcq",
    "Biology":                "mcq",
    "Chemistry":              "mcq",
    "Science":                "mcq",
    "Sejarah":                "mcq",
    "Geografi":               "mcq",
    "Mathematics":            "short_answer",
    "Additional Mathematics": "short_answer",
    "Bahasa Melayu":          "short_answer",
    "Bahasa Inggeris":        "short_answer",
}

# Pool of 3 topics per subject per form level.
# Selection: first unanswered topic from the pool → gives variety on retakes
# without changing the 10-question (one-per-subject) diagnostic structure.
DIAGNOSTIC_TOPIC_POOLS: dict[int, dict[str, list[str]]] = {
    4: {
        "Physics":                ["Force and Motion I", "Force and Pressure", "Electricity"],
        "Biology":                ["Cell Biology and Organisation", "Nutrition", "Respiration"],
        "Chemistry":              ["Matter and Atomic Structure", "Chemical Bonds", "Periodic Table"],
        "Mathematics":            ["Patterns and Sequences", "Coordinate Geometry", "Linear Law"],
        "Additional Mathematics": ["Functions", "Quadratic Functions", "Indices and Logarithms"],
        "Bahasa Melayu":          ["Warisan Bangsa dan Negara", "Kepimpinan dan Patriotisme", "Nilai Murni"],
        "Bahasa Inggeris":        ["Friendships and Relationships", "Vocabulary Building", "Grammar in Context"],
        "Sejarah":                ["Warisan Negara Bangsa", "Kemerdekaan Malaysia", "Pembinaan Negara"],
        "Geografi":               ["Bentuk Muka Bumi", "Hidrosfera", "Atmosfera"],
        "Science":                ["Cell as a Unit of Life", "Body Coordination", "Reproduction"],
    },
    5: {
        "Physics":                ["Electricity", "Electromagnetism", "Nuclear Physics"],
        "Biology":                ["Biodiversity", "Dynamic Ecosystem", "Inheritance"],
        "Chemistry":              ["Rate of Reaction", "Carbon Compounds", "Chemicals for Consumers"],
        "Mathematics":            ["Probability", "Bearing", "Earth as a Sphere"],
        "Additional Mathematics": ["Differentiation", "Integration", "Probability Distributions"],
        "Bahasa Melayu":          ["Kepimpinan dan Patriotisme", "Ekonomi dan Keusahawanan", "Alam Sekitar dan Pembangunan Lestari"],
        "Bahasa Inggeris":        ["Global Issues and Current Affairs", "Literature in English", "Vocabulary Building"],
        "Sejarah":                ["Tamadun Islam", "Nasionalisme", "Malaysia dalam Dunia"],
        "Geografi":               ["Sumber dan Aktiviti Ekonomi", "Pembangunan Sejagat", "Isu Alam Sekitar"],
        "Science":                ["Nutrition", "Biodiversity", "Reproduction"],
    },
}


def _diagnostic_topics_for_student(
    form_level: int,
    answered_pairs: set,
    answered_topics_legacy: set,
) -> tuple:
    """
    Returns (completed, remaining) lists of dicts with keys: subject, topic, question_type.

    For each subject pool, walks topics in order and picks the first unanswered one.
    A subject counts as 'complete' once any topic from its pool has been answered.
    This gives variety on retakes: if topic[0] is answered, topic[1] is used next time.
    """
    pools = DIAGNOSTIC_TOPIC_POOLS.get(form_level, DIAGNOSTIC_TOPIC_POOLS[4])
    completed: list[dict] = []
    remaining: list[dict] = []

    for subject, topic_list in pools.items():
        qt = DIAGNOSTIC_QUESTION_TYPE.get(subject, "mcq")
        answered_in_pool = [
            t for t in topic_list
            if (subject, t) in answered_pairs or t in answered_topics_legacy
        ]
        unanswered_in_pool = [
            t for t in topic_list
            if (subject, t) not in answered_pairs and t not in answered_topics_legacy
        ]

        if answered_in_pool:
            # Subject done — record the first answered topic for display
            completed.append({"subject": subject, "topic": answered_in_pool[0], "question_type": qt})
        elif unanswered_in_pool:
            remaining.append({"subject": subject, "topic": unanswered_in_pool[0], "question_type": qt})
        # If every pool topic is somehow answered, subject is implicitly complete (omitted from remaining)

    return completed, remaining

_STUDENT_COACH_PROMPT = """You are a friendly and encouraging AI study coach for a Malaysian secondary school student.
Based on the student's recent performance data below, write a personalised study report in a warm, motivating tone.
Use simple English. Avoid jargon. Be specific — reference the actual topic names and error types.

Structure your response as JSON with exactly these keys (no markdown, no prose outside the JSON):
{{
  "greeting": "<one encouraging sentence acknowledging their effort>",
  "strengths": ["<topic they're doing well in>", ...],
  "focus_areas": [
    {{
      "topic": "<topic name>",
      "subject": "<subject>",
      "why": "<one sentence why this needs attention, in student-friendly language>",
      "tip": "<2-3 sentence concrete study tip they can act on today>"
    }},
    ...
  ],
  "next_step": "<one clear action they should take right now — e.g. start a practice session on X>"
}}

Rules:
- Include up to 3 topics in focus_areas, ranked by urgency
- strengths should only include topics with mastery_score >= 0.7
- next_step should reference the highest-priority focus area
- Keep the whole response under 400 words

Student performance data:
{data}
"""


def _generate_student_coach_narrative(student_id: str, plan_items: list, mastery_data: list) -> dict:
    """Generate a student-friendly coaching narrative from remediation plan items."""
    if not plan_items:
        return {
            "greeting": "Great effort so far! Keep practising to build your confidence.",
            "strengths": [r["topic"] for r in mastery_data if r.get("mastery_level", 0) >= 0.7][:3],
            "focus_areas": [],
            "next_step": "Start a new practice session to identify areas for improvement.",
        }

    strengths = [r["topic"] for r in mastery_data if r.get("mastery_level", 0) >= 0.7]
    payload = {
        "strengths_raw": strengths,
        "focus_areas_raw": plan_items[:3],
    }

    prompt = _STUDENT_COACH_PROMPT.format(data=json.dumps(payload, indent=2, default=str))
    try:
        resp = _llm_call(
            prompt,
            temperature=0.4,
            max_output_tokens=1024,
        )
        raw = resp.strip()
        if raw.startswith("```"):
            parts = raw.split("```")
            raw = parts[1] if len(parts) > 1 else parts[0]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            parsed = parsed[0]
        return parsed
    except Exception as e:
        print(f"[student_coach] narrative generation failed: {e}")
        return {
            "greeting": "You've been working hard — here's where to focus next.",
            "strengths": strengths[:3],
            "focus_areas": [
                {
                    "topic": item.get("topic", ""),
                    "subject": item.get("subject", ""),
                    "why": item.get("reason", ""),
                    "tip": item.get("suggested_intervention", ""),
                }
                for item in plan_items[:3]
            ],
            "next_step": f"Practise {plan_items[0].get('topic', 'your weakest topic')} next.",
        }


@app.get("/diagnostic_status/{student_id}")
async def get_diagnostic_status(student_id: str):
    """
    Returns how many questions the student has answered and whether the diagnostic
    threshold has been met (enabling the Study Coach report button on the frontend).
    """
    safe_id = "00000000-0000-0000-0000-000000000001" if student_id == "undefined" else student_id

    count_res = supabase.table("event_logs")\
        .select("id", count="exact")\
        .eq("student_id", safe_id)\
        .execute()
    questions_answered = count_res.count or 0

    plan_res = supabase.table("remediation_plans")\
        .select("id", count="exact")\
        .eq("student_id", safe_id)\
        .eq("status", "active")\
        .execute()
    report_available = (plan_res.count or 0) > 0

    return {
        "student_id": safe_id,
        "questions_answered": questions_answered,
        "threshold": DIAGNOSTIC_THRESHOLD,
        "diagnostic_complete": questions_answered >= DIAGNOSTIC_THRESHOLD,
        "report_available": report_available,
    }


@app.get("/diagnostic_progress/{student_id}")
async def get_diagnostic_progress(student_id: str, form_level: int = 4):
    """
    Returns which of the 10 diagnostic subjects have been answered and which is next.
    Uses DIAGNOSTIC_TOPIC_POOLS — picks first unanswered topic per subject pool.
    """
    safe_id = "00000000-0000-0000-0000-000000000001" if student_id == "undefined" else student_id

    try:
        logs_res = supabase.table("event_logs")\
            .select("subject, topic")\
            .eq("student_id", safe_id)\
            .execute()
        rows = logs_res.data or []
        answered_pairs = {(r["subject"], r["topic"]) for r in rows if r.get("subject")}
        answered_topics_legacy = {r["topic"] for r in rows if not r.get("subject")}
    except Exception:
        logs_res = supabase.table("event_logs")\
            .select("topic")\
            .eq("student_id", safe_id)\
            .execute()
        rows = logs_res.data or []
        answered_topics_legacy = {r["topic"] for r in rows}
        answered_pairs = set()

    completed, remaining = _diagnostic_topics_for_student(form_level, answered_pairs, answered_topics_legacy)
    total = len(DIAGNOSTIC_TOPIC_POOLS.get(form_level, DIAGNOSTIC_TOPIC_POOLS[4]))
    next_topic = remaining[0] if remaining else None

    return {
        "student_id": safe_id,
        "form_level": form_level,
        "questions_answered": len(completed),
        "total": total,
        "diagnostic_complete": len(remaining) == 0,
        "completed_topics": completed,
        "next_topic": next_topic,
    }


@app.post("/start_diagnostic_session")
async def start_diagnostic_session(req: DiagnosticSessionRequest, background_tasks: BackgroundTasks):
    """
    Guided diagnostic flow. Auto-selects the next unanswered topic from the pool for each
    subject and returns a question with progress metadata.
    Always uses Anchor Mode (is_adaptive=False) so every student gets a consistent baseline.
    Question type is subject-aware: sciences/history/geo → mcq; languages/maths → short_answer.
    """
    safe_id = "00000000-0000-0000-0000-000000000001" if req.student_id == "undefined" else req.student_id
    total_subjects = len(DIAGNOSTIC_TOPIC_POOLS.get(req.form_level, DIAGNOSTIC_TOPIC_POOLS[4]))

    # Try subject+topic matching first; fall back to topic-only if subject column hasn't been
    # migrated into event_logs yet.
    try:
        logs_res = supabase.table("event_logs")\
            .select("subject, topic")\
            .eq("student_id", safe_id)\
            .execute()
        rows = logs_res.data or []
        answered_pairs = {(r["subject"], r["topic"]) for r in rows if r.get("subject")}
        answered_topics_legacy = {r["topic"] for r in rows if not r.get("subject")}
    except Exception:
        logs_res = supabase.table("event_logs")\
            .select("topic")\
            .eq("student_id", safe_id)\
            .execute()
        rows = logs_res.data or []
        answered_topics_legacy = {r["topic"] for r in rows}
        answered_pairs = set()

    completed, remaining = _diagnostic_topics_for_student(req.form_level, answered_pairs, answered_topics_legacy)
    questions_answered = len(completed)

    if not remaining:
        return {
            "diagnostic_complete": True,
            "questions_answered": questions_answered,
            "total": total_subjects,
            "message": "Diagnostic complete! Tap 'Get My Study Report' to unlock your Study Coach.",
        }

    next_topic = remaining[0]
    question_type = next_topic["question_type"]   # subject-aware, not hardcoded
    effective_language = _effective_language(next_topic["subject"], req.language)

    print(f"[Diagnostic] {next_topic['subject']} / {next_topic['topic']} — question_type={question_type} lang={effective_language}")

    state = AgentState(
        student_id=safe_id,
        topic=next_topic["topic"],
        subject=next_topic["subject"],
        language=effective_language,
        form_level=req.form_level,
        is_adaptive=False,
        question_type=question_type,
        context="",
        dskp_criteria="",
        student_history="",
        draft=None,
        student_answer=None,
        is_correct=False,
        partial_credit=None,
        mastery_score=0.0,
        feedback="",
        teacher_action_plan="",
        mnemonic_lyrics=None,
        media_url=None,
        video_broll=None,
        h5p_content=None,
        diagram_svg=None,
        worked_example=None,
        topic_complete=False,
        next_topic=next_topic["topic"],
        error_category=None,
        root_cause=None,
        intervention_plan=None,
        essay_detail=None,
        answered_count=0,
        target_kbat=None,
    )

    # Check anchor cache + lesson cache in parallel
    skip_retriever, lesson_data = await asyncio.gather(
        _check_anchor_cache(next_topic["topic"], effective_language, req.form_level),
        asyncio.to_thread(
            get_cached_lesson, next_topic["topic"], next_topic["subject"], req.form_level, effective_language
        ),
    )

    if not skip_retriever:
        state.update(await asyncio.to_thread(retriever_node, state))
    state.update(await asyncio.to_thread(studio_node, state))
    if not state.get("draft"):
        print(f"[Diagnostic] studio_node returned no draft for {next_topic['topic']} — falling back to generator")
        state.update(await asyncio.to_thread(generator_node, state))
    if not state.get("draft") or not state["draft"].get("question"):
        log_error(Exception("draft empty after full pipeline"), context=f"diagnostic topic={next_topic['topic']} lang={effective_language}")

    lesson_id = lesson_data.get("id") if lesson_data else None
    if not lesson_data:
        background_tasks.add_task(
            get_or_create_lesson, next_topic["topic"], next_topic["subject"], req.form_level, effective_language
        )

    # Pre-warm anchors for the next 2 upcoming diagnostic topics
    for ahead in remaining[1:3]:
        ahead_lang = _effective_language(ahead["subject"], req.language)
        background_tasks.add_task(
            _prewarm_topic_anchor,
            topic=ahead["topic"],
            subject=ahead["subject"],
            language=ahead_lang,
        )

    try:
        session_id = _create_quiz_session(
            student_id=safe_id,
            topic=next_topic["topic"],
            subject=next_topic["subject"],
            language=effective_language,
            question_type=question_type,
            is_adaptive=False,
            lesson_id=lesson_id,
            draft=state.get("draft"),
        )
    except Exception as e:
        print(f"-> Diagnostic session create error (non-fatal): {e}")
        session_id = None

    return {
        "diagnostic_complete": False,
        "diagnostic_progress": {
            "questions_answered": questions_answered,
            "total": total_subjects,
            "topic_index": questions_answered,
            "completed_subjects": [t["subject"] for t in completed],
        },
        "topic": next_topic["topic"],
        "subject": next_topic["subject"],
        "question_type": question_type,
        "media_url": state.get("media_url"),
        "video_broll": state.get("video_broll"),
        "mnemonic_lyrics": state.get("mnemonic_lyrics"),
        "h5p_content": state.get("h5p_content"),
        "diagram_svg": state.get("diagram_svg"),
        "worked_example": state.get("worked_example"),
        "question_data": _strip_answer_fields(state.get("draft")),
        "session_id": session_id,
        "lesson_id": lesson_id,
        "lesson": _flatten_lesson(lesson_data) if lesson_data else None,
    }


@app.post("/student_coach/{student_id}")
async def generate_student_coach(student_id: str):
    """
    Student-triggered endpoint. Runs the remediation planner and returns a
    personalised coaching report in student-friendly language.
    Only meaningful after DIAGNOSTIC_THRESHOLD questions have been answered.
    """
    safe_id = "00000000-0000-0000-0000-000000000001" if student_id == "undefined" else student_id

    count_res = supabase.table("event_logs")\
        .select("id", count="exact")\
        .eq("student_id", safe_id)\
        .execute()
    questions_answered = count_res.count or 0

    if questions_answered < DIAGNOSTIC_THRESHOLD:
        return {
            "ready": False,
            "questions_answered": questions_answered,
            "threshold": DIAGNOSTIC_THRESHOLD,
            "message": f"Answer {DIAGNOSTIC_THRESHOLD - questions_answered} more question(s) to unlock your Study Coach report.",
        }

    # Run the remediation planner (synchronous — acceptable for student-triggered action)
    plan_items = plan_for_student(safe_id, lookback_days=30)

    mastery_res = supabase.table("dskp_mastery")\
        .select("topic, mastery_level")\
        .eq("student_id", safe_id)\
        .execute()
    mastery_data = mastery_res.data or []

    narrative = _generate_student_coach_narrative(safe_id, plan_items, mastery_data)

    return {
        "ready": True,
        "student_id": safe_id,
        "questions_answered": questions_answered,
        "narrative": narrative,
        "focus_areas": [
            {
                "topic": item.get("topic"),
                "subject": item.get("subject"),
                "priority_score": item.get("priority_score"),
                "reason": item.get("reason"),
                "suggested_intervention": item.get("suggested_intervention"),
            }
            for item in plan_items[:3]
        ],
    }


@app.get("/student_coach/{student_id}")
async def get_student_coach(student_id: str):
    """
    Returns the cached coaching report from the most recent remediation plan run.
    Does not re-run the planner. Use POST /student_coach to regenerate.
    """
    safe_id = "00000000-0000-0000-0000-000000000001" if student_id == "undefined" else student_id

    plan_res = supabase.table("remediation_plans")\
        .select("subject, topic, priority_score, reason, suggested_intervention")\
        .eq("student_id", safe_id)\
        .eq("status", "active")\
        .order("priority_score", desc=True)\
        .limit(3)\
        .execute()

    if not plan_res.data:
        return {"ready": False, "message": "No report yet. Complete the diagnostic and tap 'Get My Study Report'."}

    mastery_res = supabase.table("dskp_mastery")\
        .select("topic, mastery_level")\
        .eq("student_id", safe_id)\
        .execute()
    mastery_data = mastery_res.data or []

    narrative = _generate_student_coach_narrative(safe_id, plan_res.data, mastery_data)

    return {
        "ready": True,
        "student_id": safe_id,
        "narrative": narrative,
        "focus_areas": [
            {
                "topic": item.get("topic"),
                "subject": item.get("subject"),
                "priority_score": item.get("priority_score"),
                "reason": item.get("reason"),
                "suggested_intervention": item.get("suggested_intervention"),
            }
            for item in plan_res.data
        ],
    }


# ---------------------------------------------------------------------------
# WhatsApp command handlers
# ---------------------------------------------------------------------------

def _wa_help() -> str:
    return (
        "📚 *KuasaPrestij Teacher Bot*\n\n"
        "Commands:\n"
        "• *report* — class overview & mastery\n"
        "• *struggling* — students needing help\n"
        "• *leaderboard* — top students\n"
        "• *quiz <Subject> <Topic>* — prewarm a quiz\n"
        "• *lesson <Subject> <Topic>* — fetch/generate lesson\n"
        "• *plan <student-id>* — run remediation plan\n"
        "• *mastery <Subject>* — subject mastery breakdown\n"
        "• *help* — show this menu"
    )


def _wa_report() -> str:
    try:
        res = supabase.table("student_daily_report").select("*").execute()
        rows = res.data or []
        if not rows:
            return "📊 No class data yet."
        avg = round(sum(r.get("mastery_level", 0) for r in rows) / len(rows) * 100)
        active = len({r["student_id"] for r in rows})
        worst = min(rows, key=lambda r: r.get("mastery_level", 1))
        return (
            f"📊 *Class Report*\n"
            f"Active students: {active}\n"
            f"Average mastery: {avg}%\n"
            f"Weakest topic: {worst.get('topic', '?')} ({round(worst.get('mastery_level', 0)*100)}%)\n"
            f"Send *struggling* for flagged students."
        )
    except Exception as e:
        return f"❌ Could not fetch report: {e}"


def _wa_struggling() -> str:
    flagged = _get_flagged_students(threshold=2)
    if not flagged:
        return "✅ No students flagged right now."
    lines = ["⚠️ *Students Needing Help*\n"]
    for f in flagged[:8]:
        short_id = f["student_id"][:8].upper()
        lines.append(
            f"• {short_id} | {f['topic']} | {f['error_category']} ×{f['wrong_count']}"
        )
    if len(flagged) > 8:
        lines.append(f"...and {len(flagged)-8} more.")
    lines.append("\nSend *plan <student-id>* to generate an intervention.")
    return "\n".join(lines)


def _wa_leaderboard() -> str:
    try:
        rows = supabase.table("quiz_sessions").select("student_id, score").execute().data or []
        totals: dict = {}
        for r in rows:
            sid = r["student_id"]
            totals[sid] = totals.get(sid, 0) + (r.get("score") or 0)
        ranked = sorted(totals.items(), key=lambda x: x[1], reverse=True)[:5]
        lines = ["🏆 *Top 5 Students*\n"]
        medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"]
        for i, (sid, score) in enumerate(ranked):
            lines.append(f"{medals[i]} {sid[:8].upper()} — {score} pts")
        return "\n".join(lines)
    except Exception as e:
        return f"❌ Could not fetch leaderboard: {e}"


def _wa_quiz(args: str) -> str:
    parts = args.split(" ", 1)
    subject = parts[0].capitalize() if parts else ""
    topic = parts[1] if len(parts) > 1 else ""
    if not subject or not topic:
        return "Usage: *quiz <Subject> <Topic>*\nExample: quiz Physics Force and Motion I"
    try:
        import asyncio
        asyncio.create_task(_prewarm_topic_anchor(topic, subject, "English"))
        return f"✅ Quiz prewarming for *{subject} — {topic}*. Students can start it shortly."
    except Exception as e:
        return f"❌ Could not prewarm quiz: {e}"


def _wa_lesson(args: str) -> str:
    parts = args.split(" ", 1)
    subject = parts[0].capitalize() if parts else ""
    topic = parts[1] if len(parts) > 1 else ""
    if not subject or not topic:
        return "Usage: *lesson <Subject> <Topic>*\nExample: lesson Biology Cell Division"
    try:
        lesson = get_or_create_lesson(topic, subject, 4, "English")
        if not lesson:
            return f"⏳ Lesson for *{subject} — {topic}* is being generated."
        objectives = lesson.get("learning_objectives", "")[:200]
        return f"📖 *{subject}: {topic}*\n\n{objectives}\n\n(Lesson ready for students)"
    except Exception as e:
        return f"❌ Could not fetch lesson: {e}"


def _wa_plan(student_id_prefix: str, background_tasks: BackgroundTasks) -> str:
    try:
        # Resolve partial ID to a full UUID from dskp_mastery
        res = supabase.table("dskp_mastery").select("student_id").ilike(
            "student_id", f"{student_id_prefix.lower()}%"
        ).limit(1).execute()
        if not res.data:
            return f"❌ No student found starting with *{student_id_prefix}*."
        full_id = res.data[0]["student_id"]
        background_tasks.add_task(plan_for_student, full_id, 30)
        suggestion = get_top_suggestion(full_id)
        if suggestion:
            return (
                f"📋 *Plan for {full_id[:8].upper()}*\n"
                f"Topic: {suggestion.get('topic')}\n"
                f"Subject: {suggestion.get('subject')}\n"
                f"Reason: {suggestion.get('reason', '')}\n"
                f"Action: {suggestion.get('suggested_intervention', '')}"
            )
        return f"⏳ Plan queued for student *{full_id[:8].upper()}*. Check back in a minute."
    except Exception as e:
        return f"❌ Could not run plan: {e}"


def _wa_mastery(subject: str) -> str:
    try:
        res = supabase.table("dskp_mastery")\
            .select("topic, mastery_level")\
            .ilike("curriculum_tag", f"%{subject}%")\
            .order("mastery_level")\
            .limit(10).execute()
        rows = res.data or []
        if not rows:
            return f"No mastery data found for *{subject}*."
        lines = [f"📈 *{subject} Mastery*\n"]
        for r in rows:
            bar = "▓" * int(r["mastery_level"] * 10) + "░" * (10 - int(r["mastery_level"] * 10))
            lines.append(f"{bar} {round(r['mastery_level']*100)}% — {r['topic']}")
        return "\n".join(lines)
    except Exception as e:
        return f"❌ Could not fetch mastery: {e}"


# ---------------------------------------------------------------------------
# Ground-layer monitor — real-time latency + error stats from agent_traces
# ---------------------------------------------------------------------------

async def require_admin(authorization: Optional[str] = Header(default=None)) -> str:
    """
    Gate for /admin/* endpoints. Verifies the caller's Supabase access token and
    confirms the resolved user has role='admin'. Without this the admin API is
    reachable by anyone with the URL — the frontend role check only hides the UI.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    try:
        resp = await asyncio.to_thread(lambda: supabase.auth.get_user(token))
        uid = resp.user.id if resp and resp.user else None
    except Exception:
        uid = None
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    try:
        res = await asyncio.to_thread(
            lambda: supabase.table("profiles").select("role").eq("id", uid).single().execute()
        )
        role = (res.data or {}).get("role")
    except Exception:
        role = None
    if role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return uid


async def require_teacher(authorization: Optional[str] = Header(default=None)) -> str:
    """Validate the caller's Supabase token and confirm role is 'teacher' or 'admin'."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    try:
        resp = await asyncio.to_thread(lambda: supabase.auth.get_user(token))
        uid = resp.user.id if resp and resp.user else None
    except Exception:
        uid = None
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    try:
        res = await asyncio.to_thread(
            lambda: supabase.table("profiles").select("role").eq("id", uid).single().execute()
        )
        role = (res.data or {}).get("role")
    except Exception:
        role = None
    if role not in ("teacher", "admin"):
        raise HTTPException(status_code=403, detail="Teacher access required")
    return uid


async def _teacher_owns_student(teacher_uid: str, student_id: str) -> bool:
    """True if the teacher owns a classroom the student belongs to."""
    try:
        cls = await asyncio.to_thread(
            lambda: supabase.table("classrooms").select("id").eq("teacher_id", teacher_uid).execute()
        )
        cids = [c["id"] for c in (cls.data or [])]
        if not cids:
            return False
        mem = await asyncio.to_thread(
            lambda: supabase.table("classroom_members")
            .select("id").eq("student_id", student_id).in_("classroom_id", cids).limit(1).execute()
        )
        return bool(mem.data)
    except Exception as exc:
        print(f"[accommodations] ownership check failed: {exc}")
        return False


class DeriveAccommodationsRequest(BaseModel):
    student_id: str
    conditions: List[str] = []
    severity: str = "mild"
    notes: Optional[str] = None


@app.post("/derive_accommodations")
async def derive_accommodations(req: DeriveAccommodationsRequest, teacher_uid: str = Depends(require_teacher)):
    """
    Teacher supplies a student's KNOWN condition(s); the system derives an evidence-based
    accommodation + pace profile (deterministic baseline, LLM-refined when notes are given)
    and stores it on the student's profile. The app never infers the condition itself.
    """
    from agents.accommodations import derive_profile

    student_id = "00000000-0000-0000-0000-000000000001" if req.student_id == "undefined" else req.student_id

    # Authorise: admins may set anyone; teachers only their own students.
    is_admin = False
    try:
        r = await asyncio.to_thread(
            lambda: supabase.table("profiles").select("role").eq("id", teacher_uid).single().execute()
        )
        is_admin = (r.data or {}).get("role") == "admin"
    except Exception:
        is_admin = False
    if not is_admin and not await _teacher_owns_student(teacher_uid, student_id):
        raise HTTPException(status_code=403, detail="Not your student")

    derived = await asyncio.to_thread(derive_profile, req.conditions, req.severity, req.notes)

    # Merge into the student's existing preferences jsonb (don't clobber other prefs).
    try:
        cur = await asyncio.to_thread(
            lambda: supabase.table("profiles").select("preferences").eq("id", student_id).single().execute()
        )
        prefs = dict((cur.data or {}).get("preferences") or {})
    except Exception:
        prefs = {}
    prefs["accommodations"] = derived["accommodations"]
    prefs["pace_profile"] = derived["pace_profile"]
    prefs["condition_profile"] = {
        "conditions": req.conditions,
        "severity": req.severity,
        "notes": (req.notes or "").strip(),
        "set_by": teacher_uid,
        "derived_by": derived["derived_by"],
    }
    try:
        await asyncio.to_thread(
            lambda: supabase.table("profiles").update({"preferences": prefs}).eq("id", student_id).execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to save profile: {exc}")

    return {
        "student_id": student_id,
        "accommodations": derived["accommodations"],
        "pace_profile": derived["pace_profile"],
        "rationale": derived["rationale"],
        "derived_by": derived["derived_by"],
    }


@app.get("/admin/monitor")
async def admin_monitor(_admin: str = Depends(require_admin)):
    """
    Returns loading times and error rates for every agent node and HTTP endpoint.
    Covers the last 5 minutes (live view) and last hour (trend).
    Requires the agent_traces table — run schema/agent_traces.sql first.
    """
    from datetime import datetime, timezone, timedelta
    cutoff_1h = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    cutoff_5m = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()

    try:
        res = await asyncio.to_thread(
            lambda: supabase.table("agent_traces")
                .select("node,label,duration_ms,status,created_at")
                .gte("created_at", cutoff_1h)
                .order("created_at", desc=True)
                .limit(2000)
                .execute()
        )
        traces = res.data or []
    except Exception as e:
        return {"error": f"agent_traces table missing — run schema/agent_traces.sql first: {e}"}

    def _pct(values: list) -> dict:
        if not values:
            return {"avg_ms": 0, "p50_ms": 0, "p95_ms": 0}
        s = sorted(values)
        n = len(s)
        return {
            "avg_ms": round(sum(s) / n, 1),
            "p50_ms": round(s[max(0, int(n * 0.50) - 1)], 1),
            "p95_ms": round(s[max(0, int(n * 0.95) - 1)], 1),
        }

    http  = [t for t in traces if t["node"] == "http"]
    nodes = [t for t in traces if t["node"] != "http"]

    recent_http  = [t for t in http  if t["created_at"] >= cutoff_5m]
    recent_nodes = [t for t in nodes if t["created_at"] >= cutoff_5m]

    def _summarise(rows: list) -> dict:
        errors = sum(1 for r in rows if r.get("status") == "error")
        latencies = [r["duration_ms"] for r in rows if r.get("duration_ms") is not None]
        total = len(rows)
        return {
            "requests": total,
            "errors": errors,
            "error_rate_pct": round(errors / max(total, 1) * 100, 1),
            **_pct(latencies),
        }

    # Per-node breakdown
    node_names = sorted({t["node"] for t in nodes})
    node_stats = {}
    for name in node_names:
        subset = [t for t in nodes if t["node"] == name]
        node_stats[name] = _summarise(subset)

    # Slowest single recent span (useful for spotting outliers)
    worst = sorted(
        [t for t in recent_nodes if t.get("duration_ms")],
        key=lambda t: t["duration_ms"],
        reverse=True,
    )[:3]
    slowest = [{"node": t["node"], "label": t["label"], "ms": round(t["duration_ms"], 1)} for t in worst]

    return {
        "last_5min":  _summarise(recent_http),
        "last_hour":  _summarise(http),
        "nodes_last_hour": node_stats,
        "slowest_recent_spans": slowest,
        "total_spans_last_hour": len(traces),
    }


# ---------------------------------------------------------------------------
# Platform insights — aggregated product signals from event_logs + mastery
# ---------------------------------------------------------------------------

@app.get("/admin/insights")
async def admin_insights(days: int = 7, _admin: str = Depends(require_admin)):
    """
    Aggregated platform signals: worst topics, stuck students, seed gaps,
    language barrier patterns, provider errors.
    days: lookback window for event_logs (default 7).
    """
    try:
        result = await asyncio.to_thread(run_insights, supabase, days)
        return result
    except Exception as e:
        log_error(e, context="GET /admin/insights")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/admin/feedback_quality")
async def admin_feedback_quality(_admin: str = Depends(require_admin)):
    """
    Return the most recent Feedback Quality audit (dialogic-move distribution of
    the generated teacher intervention notes). Returns {result: null} if never run.
    """
    try:
        res = await asyncio.to_thread(
            lambda: supabase.table("feedback_quality_audit")
                .select("result, scripts_analyzed, total_acts, created_at")
                .order("created_at", desc=True)
                .limit(1)
                .execute()
        )
        rows = res.data or []
        if not rows:
            return {"result": None, "created_at": None}
        row = rows[0]
        return {"result": row["result"], "created_at": row["created_at"]}
    except Exception as e:
        log_error(e, context="GET /admin/feedback_quality")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/admin/feedback_quality/run")
async def admin_feedback_quality_run(sample_size: int = 120, _admin: str = Depends(require_admin)):
    """
    Run a fresh Feedback Quality audit over recent intervention notes, store it,
    and return it. Batch job (many short LLM classifications) — call on-demand
    from the admin console or a scheduler, never in the answer hot path.
    """
    try:
        def _audit():
            # Corpus = the richer generated intervention scripts (the dialogic
            # artifacts), not the one-line directive in event_logs.intervention.
            flagged = _generate_intervention_scripts(_get_flagged_students(threshold=2))
            corpus = []
            for s in flagged:
                for field in ("intervention_script", "suggested_activity"):
                    text = (s.get(field) or "").strip()
                    if text:
                        corpus.append({
                            "text": text,
                            "topic": s.get("topic", ""),
                            "error_category": s.get("error_category", ""),
                        })
            return run_feedback_quality_audit(corpus, sample_size)

        result = await asyncio.to_thread(_audit)
        created_at = datetime.now(timezone.utc).isoformat()
        await asyncio.to_thread(
            lambda: supabase.table("feedback_quality_audit").insert({
                "result": result,
                "scripts_analyzed": result.get("scripts_analyzed", 0),
                "total_acts": result.get("total_acts", 0),
                "created_at": created_at,
            }).execute()
        )
        return {"result": result, "created_at": created_at}
    except Exception as e:
        log_error(e, context="POST /admin/feedback_quality/run")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/admin/digest")
async def admin_digest(days: int = 7, _admin: str = Depends(require_admin)):
    """
    Runs insights and sends a formatted digest to the Telegram admin chat.
    Safe to call manually or from a cron job:
        curl -X POST http://localhost:8000/admin/digest
    """
    try:
        insights = await asyncio.to_thread(run_insights, supabase, days)
        msg = format_digest(insights)
        sent = await asyncio.to_thread(alert_admin, msg)
        return {
            "status": "sent" if sent else "no_telegram_config",
            "digest_preview": msg[:300],
        }
    except Exception as e:
        log_error(e, context="POST /admin/digest")
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Telegram webhook — Telegram servers POST here for every inbound message
# ---------------------------------------------------------------------------

@app.post("/webhook/telegram")
async def telegram_webhook(
    background_tasks: BackgroundTasks,
    request: Request,
):
    """
    Receives inbound Telegram messages (JSON POST from Telegram servers).
    Register with: GET https://api.telegram.org/bot<TOKEN>/setWebhook?url=<HOST>/webhook/telegram
    """
    try:
        body = await request.json()
    except Exception:
        return {"ok": True}

    message = body.get("message") or body.get("edited_message")
    if not message:
        return {"ok": True}

    chat_id = message["chat"]["id"]
    cmd = (message.get("text") or "").strip()
    cmd_lower = cmd.lower()

    if cmd_lower in ("help", "/help", "?", "menu", "hi", "hello", "/start"):
        reply = _wa_help()
    elif cmd_lower in ("report", "/report", "class", "overview"):
        reply = _wa_report()
    elif cmd_lower in ("struggling", "/struggling", "flagged", "alerts"):
        reply = _wa_struggling()
    elif cmd_lower in ("leaderboard", "/leaderboard"):
        reply = _wa_leaderboard()
    elif cmd_lower.startswith("quiz ") or cmd_lower.startswith("/quiz "):
        reply = _wa_quiz(cmd.split(" ", 1)[1].strip())
    elif cmd_lower.startswith("lesson ") or cmd_lower.startswith("/lesson "):
        reply = _wa_lesson(cmd.split(" ", 1)[1].strip())
    elif cmd_lower.startswith("plan ") or cmd_lower.startswith("/plan "):
        reply = _wa_plan(cmd.split(" ", 1)[1].strip(), background_tasks)
    elif cmd_lower.startswith("mastery ") or cmd_lower.startswith("/mastery "):
        reply = _wa_mastery(cmd.split(" ", 1)[1].strip())
    else:
        reply = "Unknown command. Send /help to see all commands."

    send_telegram(chat_id, reply)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Daily digest scheduler — fires at 08:00 MYT (00:00 UTC) every day
# ---------------------------------------------------------------------------

async def _daily_digest_loop():
    """Background task: send a Telegram digest every day at 08:00 MYT."""
    from datetime import datetime, timezone, timedelta
    import logging
    MYT = timezone(timedelta(hours=8))

    while True:
        now = datetime.now(MYT)
        # Next 08:00 MYT
        target = now.replace(hour=8, minute=0, second=0, microsecond=0)
        if now >= target:
            target += timedelta(days=1)
        sleep_secs = (target - now).total_seconds()
        await asyncio.sleep(sleep_secs)

        try:
            insights = await asyncio.to_thread(run_insights, supabase, 7)
            msg = format_digest(insights)
            await asyncio.to_thread(alert_admin, msg)
            logging.getLogger("kuasaprestij").info("Daily digest sent.")
        except Exception as exc:
            logging.getLogger("kuasaprestij").error(f"Daily digest failed: {exc}")


@app.on_event("startup")
async def _start_digest_scheduler():
    asyncio.create_task(_daily_digest_loop())
