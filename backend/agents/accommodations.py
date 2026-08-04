"""
Condition → accommodation-profile derivation (special-needs support).

A teacher supplies a student's KNOWN condition(s) (never inferred by the app — see
SPECIAL_NEEDS_PLAN.md §8 ethics). This module maps that to an evidence-based
accommodation profile: which comfort/accessibility flags to enable, plus a PACE
profile the assessment engine uses to adapt session length, breaks, difficulty ramp,
time limits and feedback style.

Hybrid design:
  * Deterministic, evidence-based baseline map (CONDITION_BASELINE) — reliable, free,
    transparent. This is a FLOOR.
  * Optional LLM refinement, used only when the teacher adds free-text notes. The LLM
    may enable MORE support or make pace MORE supportive; it may never remove a baseline
    support. Falls back to the deterministic result on any failure.

Evidence anchors are summarised in SPECIAL_NEEDS_RESEARCH.md.
"""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field

from agents.llm_client import call_llm
from schemas.assessment import parse_llm_json

# ── The 10 accommodation flags (must mirror the frontend AccommodationPrefs) ──
ACCOMMODATION_KEYS = [
    "reduce_motion",
    "high_contrast",
    "dyslexia_font",
    "read_aloud",
    "focus_mode",
    "extended_time",
    "no_timed_games",
    "break_reminders",
    "simplified_language",
    "worked_example_first",
]

CONDITION_KEYS = ["adhd", "dyslexia", "autism", "dyscalculia", "anxiety", "low_working_memory", "other"]

CONDITION_LABELS = {
    "adhd": "ADHD",
    "dyslexia": "Dyslexia",
    "autism": "Autism spectrum",
    "dyscalculia": "Dyscalculia",
    "anxiety": "Anxiety",
    "low_working_memory": "Low working memory",
    "other": "Other",
}

_RAMP_ORDER = {"gentle": 0, "normal": 1, "fast": 2}          # lower = gentler = more supportive
_TIME_ORDER = {"off": 0, "extended": 1, "normal": 2}          # lower = more permissive = more supportive

# Neutral defaults for a student with no condition set (matches current app behaviour).
DEFAULT_PACE = {
    "session_length": 10,       # questions before a suggested break
    "break_cadence": 0,         # 0 = no scheduled breaks
    "difficulty_ramp": "normal",
    "time_limits": "normal",
    "feedback_style": "instant",
}


# ── Evidence-based baseline per condition ────────────────────────────────────
# flags: accommodation keys to switch ON. pace: overrides applied to DEFAULT_PACE.
CONDITION_BASELINE: dict[str, dict] = {
    "adhd": {
        # Immediate reward-only feedback is NOT universally best for ADHD; timed/juiced
        # games can distract → pause+explain, no timed games, chunk + breaks.
        "flags": ["reduce_motion", "no_timed_games", "break_reminders", "focus_mode"],
        "pace": {"session_length": 6, "break_cadence": 5, "time_limits": "extended",
                 "feedback_style": "paused_explanation"},
    },
    "dyslexia": {
        "flags": ["dyslexia_font", "read_aloud", "high_contrast", "simplified_language"],
        "pace": {"time_limits": "extended"},
    },
    "autism": {
        # Sensory-load reduction + predictability + literal language.
        "flags": ["reduce_motion", "focus_mode", "read_aloud", "simplified_language"],
        "pace": {"difficulty_ramp": "gentle", "time_limits": "off", "session_length": 8,
                 "feedback_style": "paused_explanation"},
    },
    "dyscalculia": {
        "flags": ["worked_example_first", "extended_time", "simplified_language"],
        "pace": {"difficulty_ramp": "gentle", "time_limits": "extended",
                 "feedback_style": "paused_explanation"},
    },
    "anxiety": {
        # No punishing timers; gentle ramp; growth-oriented paused feedback; breaks.
        "flags": ["no_timed_games", "extended_time", "break_reminders"],
        "pace": {"time_limits": "off", "difficulty_ramp": "gentle", "session_length": 8,
                 "break_cadence": 6, "feedback_style": "paused_explanation"},
    },
    "low_working_memory": {
        "flags": ["worked_example_first", "focus_mode", "extended_time", "simplified_language"],
        "pace": {"session_length": 6, "difficulty_ramp": "gentle", "time_limits": "extended",
                 "feedback_style": "paused_explanation"},
    },
    "other": {"flags": [], "pace": {}},
}


# ── Pydantic models (also used to validate LLM refinement output) ─────────────
class AccommodationFlags(BaseModel):
    reduce_motion: bool = False
    high_contrast: bool = False
    dyslexia_font: bool = False
    read_aloud: bool = False
    focus_mode: bool = False
    extended_time: bool = False
    no_timed_games: bool = False
    break_reminders: bool = False
    simplified_language: bool = False
    worked_example_first: bool = False


class PaceProfile(BaseModel):
    session_length: int = 10
    break_cadence: int = 0
    difficulty_ramp: str = "normal"
    time_limits: str = "normal"
    feedback_style: str = "instant"


class DerivedProfile(BaseModel):
    accommodations: AccommodationFlags = Field(default_factory=AccommodationFlags)
    pace_profile: PaceProfile = Field(default_factory=PaceProfile)
    rationale: str = ""


def _blank_flags() -> dict[str, bool]:
    return {k: False for k in ACCOMMODATION_KEYS}


def _more_supportive_pace(a: dict, b: dict) -> dict:
    """Combine two pace overrides, always choosing the MORE supportive value."""
    out = dict(a)
    for k, v in b.items():
        if k not in out:
            out[k] = v
            continue
        if k == "session_length":
            out[k] = min(out[k], v)                                   # shorter = more supportive
        elif k == "break_cadence":
            # smallest POSITIVE cadence = most frequent breaks; 0 means "none set"
            cands = [x for x in (out[k], v) if x and x > 0]
            out[k] = min(cands) if cands else 0
        elif k == "difficulty_ramp":
            out[k] = out[k] if _RAMP_ORDER[out[k]] <= _RAMP_ORDER[v] else v
        elif k == "time_limits":
            out[k] = out[k] if _TIME_ORDER[out[k]] <= _TIME_ORDER[v] else v
        elif k == "feedback_style":
            out[k] = "paused_explanation" if "paused_explanation" in (out[k], v) else "instant"
    return out


def _apply_severity(pace: dict, severity: str) -> dict:
    """Scale pace by severity: more severe → shorter sessions, gentler ramp, tighter breaks."""
    pace = dict(pace)
    if severity == "moderate":
        pace["session_length"] = max(4, pace["session_length"] - 1)
    elif severity == "significant":
        pace["session_length"] = max(3, pace["session_length"] - 2)
        pace["difficulty_ramp"] = "gentle"
        if pace.get("break_cadence", 0) > 0:
            pace["break_cadence"] = max(3, pace["break_cadence"] - 1)
        if _TIME_ORDER[pace["time_limits"]] > _TIME_ORDER["extended"]:
            pace["time_limits"] = "extended"
    return pace


def _deterministic(conditions: list[str], severity: str) -> DerivedProfile:
    flags = _blank_flags()
    pace = dict(DEFAULT_PACE)
    used = []
    for c in conditions:
        base = CONDITION_BASELINE.get(c)
        if not base:
            continue
        used.append(CONDITION_LABELS.get(c, c))
        for f in base["flags"]:
            flags[f] = True
        pace = _more_supportive_pace(pace, base["pace"])
    pace = _apply_severity(pace, severity)

    on = [k for k, v in flags.items() if v]
    if used:
        rationale = (
            f"Set from condition(s): {', '.join(used)}"
            + (f" ({severity})" if severity and severity != "mild" else "")
            + f". Enabled supports: {', '.join(on) if on else 'none'}. "
            f"Pace: {pace['session_length']} questions/block, "
            f"{'breaks every ' + str(pace['break_cadence']) if pace['break_cadence'] else 'no scheduled breaks'}, "
            f"{pace['difficulty_ramp']} difficulty ramp, {pace['time_limits']} time limits, "
            f"{pace['feedback_style'].replace('_', ' ')} feedback."
        )
    else:
        rationale = "No recognised condition set — using standard pace and no accommodations."

    return DerivedProfile(
        accommodations=AccommodationFlags(**flags),
        pace_profile=PaceProfile(**pace),
        rationale=rationale,
    )


def _merge_llm(base: DerivedProfile, llm: dict) -> DerivedProfile:
    """Apply LLM refinement over the deterministic baseline. Baseline is a FLOOR."""
    llm_flags = (llm.get("accommodations") or {})
    flags = base.accommodations.model_dump()
    for k in ACCOMMODATION_KEYS:
        # LLM may turn a flag ON; never OFF (baseline support is a floor)
        if bool(llm_flags.get(k)):
            flags[k] = True

    llm_pace = (llm.get("pace_profile") or {})
    pace = _more_supportive_pace(base.pace_profile.model_dump(),
                                 {k: v for k, v in llm_pace.items() if v is not None})

    rationale = (llm.get("rationale") or "").strip() or base.rationale
    return DerivedProfile(
        accommodations=AccommodationFlags(**flags),
        pace_profile=PaceProfile(**pace),
        rationale=rationale,
    )


def _refine_prompt(conditions: list[str], severity: str, notes: str, base: DerivedProfile) -> str:
    labels = ", ".join(CONDITION_LABELS.get(c, c) for c in conditions) or "none"
    return f"""You configure evidence-based learning accommodations for a Malaysian secondary
student (KSSM). A teacher has provided the student's KNOWN condition(s) and a note. Refine the
support profile. Return JSON only.

Condition(s): {labels}
Severity: {severity or 'mild'}
Teacher note: "{notes}"

A deterministic evidence-based baseline is ALREADY set (this is a FLOOR — you may turn MORE
supports ON or make pace MORE supportive, but you must NOT turn any baseline support OFF):
{base.model_dump()}

Accommodation flags (all booleans): {', '.join(ACCOMMODATION_KEYS)}
Pace fields:
  session_length: int (questions before a break; smaller = shorter blocks)
  break_cadence: int (suggest a break every N questions; 0 = none)
  difficulty_ramp: "gentle" | "normal" | "fast"
  time_limits: "off" | "extended" | "normal"
  feedback_style: "instant" | "paused_explanation"

Use the teacher note to adjust (e.g. "strong reader" → you need not force read_aloud; "freezes
under time pressure" → time_limits off + no_timed_games + gentle ramp). Keep changes minimal and
justified. Return EXACTLY:
{{"accommodations": {{...all 10 booleans...}}, "pace_profile": {{...5 fields...}}, "rationale": "1-2 sentence teacher-facing explanation"}}"""


def derive_profile(conditions: list[str], severity: str = "mild",
                   notes: Optional[str] = None) -> dict:
    """
    Derive an accommodation + pace profile from teacher-supplied condition(s).
    Deterministic baseline, refined by the LLM only when notes are present.
    Never raises — returns a plain dict {accommodations, pace_profile, rationale, derived_by}.
    """
    conditions = [c for c in (conditions or []) if c in CONDITION_KEYS]
    severity = severity if severity in ("mild", "moderate", "significant") else "mild"
    base = _deterministic(conditions, severity)
    derived_by = "rules"

    notes = (notes or "").strip()
    if notes and conditions:
        try:
            resp = call_llm(_refine_prompt(conditions, severity, notes, base),
                            role="main", want_json=True, temperature=0.3,
                            max_tokens=1024, free_only=True)
            parsed = parse_llm_json(resp.text, DerivedProfile, context="derive_accommodations")
            if parsed:
                base = _merge_llm(base, parsed)
                derived_by = "ai"
        except Exception as exc:   # noqa: BLE001 — refinement is best-effort
            print(f"[accommodations] LLM refinement failed, using deterministic: {exc}")

    out = base.model_dump()
    out["derived_by"] = derived_by
    return out
