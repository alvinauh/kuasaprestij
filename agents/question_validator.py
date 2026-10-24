"""
Question quality gate.

Why this exists: a 2026-10-23 audit of 33 served MCQs found ~1 in 4 with a real defect — options that
are not sentences, a stem that gives the answer away, "the staff shown" with no staff, a wrong
historical date, contradictory numbers, two defensible answers. Questions are cached forever in
topic_anchors, so one bad generation reaches every student. This module checks a question before it is
cached/served and is also used by scripts/audit_questions.py on the existing cache.

Two layers:
  1. deterministic_issues()  — free, instant, catches structural problems.
  2. llm_review()            — a second model answers the question blind (no key shown) and flags
                               ambiguity, factual errors, missing visuals, contradictions, off-topic.
validate() runs both (the LLM layer only if the cheap checks pass, and only when use_llm=True).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

from pydantic import BaseModel, Field

LETTERS = "ABCD"

# Phrases that point at a visual the learner is never shown (the MCQ has no image/diagram channel
# unless the question carries one).
_MISSING_VISUAL = re.compile(
    r"\b(the (staff|diagram|figure|graph|picture|image|table|map|chart|circuit) (shown|above|below)|"
    r"(shown|given) (in|on) the (diagram|figure|graph|picture|image|staff|map)|"
    r"refer to the (diagram|figure|graph|picture|image)|"
    r"(rajah|gambar|graf|jadual|peta) (di atas|di bawah|berikut)|"
    r"如图|下图|上图|图中|右图|左图)",
    re.IGNORECASE,
)
# The question leans on a source the learner is never shown ("as listed in the textbook", "the curriculum
# framework"): it cannot be answered from the card and tests the document, not the subject.
_EXTERNAL_SOURCE = re.compile(
    r"\b((listed|described|defined|stated|mentioned|given|outlined|explained|provided|discussed)\s+(in|by)\s+the\s+"
    r"(textbook|text book|syllabus|curriculum|dskp|kssm)|"
    r"(according to|based on|as per|refer(ring)? to)\s+the\s+(textbook|text book|syllabus|curriculum( framework)?|dskp|kssm [a-z ]*curriculum)|"
    r"(curriculum|kurikulum)\s+framework|\bthe\s+(pendidikan [a-z]+|kssm)\s+curriculum\b|"
    r"(dalam|menurut|berdasarkan|seperti (yang )?(disenaraikan|dinyatakan) dalam)\s+(buku teks|dskp|kurikulum|sukatan))",
    re.IGNORECASE,
)
# Pinyin never uses circumflex vowels; their presence means the model produced garbage "pinyin".
_BAD_PINYIN = re.compile(r"[âêîôûÂÊÎÔÛ]")
_BARE_LETTER = re.compile(r"^\(?[A-Da-d][).:]?$")
_CJK = re.compile(r"[一-鿿]")

# Subjects whose questions must be in Chinese characters, not romanised.
_CHINESE_SUBJECTS = ("bahasa cina", "kesusasteraan cina", "chinese")


@dataclass
class ValidationResult:
    ok: bool
    issues: List[str] = field(default_factory=list)      # hard failures: do not cache/serve
    warnings: List[str] = field(default_factory=list)    # soft findings: keep, but report
    solved: Optional[str] = None  # letter the reviewer chose, when the LLM layer ran
    explanation: str = ""         # reviewer's student-facing explanation; only set when it agrees with the key
    llm_ran: bool = False

    def __bool__(self) -> bool:  # `if validate(...)` reads naturally
        return self.ok


def normalize(q: Dict[str, Any]) -> Dict[str, Any]:
    """Pull stem / stimulus / options / key index out of the several shapes questions are stored in."""
    qd = q.get("question_data") if isinstance(q.get("question_data"), dict) else {}
    src = {**qd, **{k: v for k, v in q.items() if v not in (None, "")}} if qd else q
    raw_opts = src.get("options") or []
    if isinstance(raw_opts, dict):
        opts = [str(raw_opts.get(L, "")).strip() for L in LETTERS if L in raw_opts]
    else:
        opts = [str(o).strip() for o in raw_opts]
    # Strip a leading "A) " label some generations bake into the option text.
    opts = [re.sub(r"^\(?[A-Da-d][).:]\s+", "", o) for o in opts]
    key = src.get("correct_answer", src.get("correct", src.get("answer")))
    key_idx = _key_index(key, opts)
    return {
        "question": str(src.get("question") or "").strip(),
        "stimulus": str(src.get("stimulus") or "").strip(),
        "options": opts,
        "key_idx": key_idx,
        "key_raw": key,
        "question_type": src.get("question_type") or "mcq",
        "has_visual": bool(q.get("diagram_svg") or src.get("diagram_svg") or src.get("image_url") or src.get("media_url")),
    }


def _key_index(key: Any, opts: List[str]) -> Optional[int]:
    if key is None:
        return None
    k = str(key).strip()
    m = re.match(r"^\(?([A-Da-d])[).:]?$", k)
    if m:
        i = LETTERS.index(m.group(1).upper())
        return i if i < len(opts) else None
    k2 = re.sub(r"^\(?[A-Da-d][).:]\s+", "", k).strip().lower()
    for i, o in enumerate(opts):
        if o.lower() == k2:
            return i
    return None


def deterministic_issues(q: Dict[str, Any], subject: str = "", topic: str = "", language: str = "",
                         has_visual: bool = False) -> List[str]:
    """has_visual: the topic already has a diagram/image shown with the question (topic_anchors.diagram_svg)."""
    n = normalize(q)
    issues: List[str] = []
    if n["question_type"] not in ("mcq", "listening"):
        return issues  # only MCQ-shaped questions are checked here
    stem, stim, opts = n["question"], n["stimulus"], n["options"]

    if len(stem) < 8:
        issues.append("question text missing or too short")
    if len(opts) != 4:
        issues.append(f"expected 4 options, got {len(opts)}")
    if any(not o for o in opts):
        issues.append("empty option")
    if any(_BARE_LETTER.match(o) for o in opts):
        issues.append("option is only a letter")
    if len({o.lower() for o in opts}) != len(opts):
        issues.append("duplicate options")
    if n["key_idx"] is None:
        issues.append("correct answer does not match any option")

    # Answer given away: ONLY the correct option's text (>= 12 chars) appears in the stem/stimulus. A stimulus
    # that lists every candidate ("oxygen, K+, glucose, cholesterol") contains all the options and is fine.
    if n["key_idx"] is not None:
        hay = f"{stim} {stem}".lower()
        present = [i for i, o in enumerate(opts) if len(o) >= 4 and o.lower() in hay]
        if present == [n["key_idx"]] and len(opts[n["key_idx"]]) >= 12:
            issues.append("only the correct option's text appears in the question/stimulus")
        # Shorter restated answers ("a quarter note") are left to the LLM layer (answer_given_away).

    text = f"{stim} {stem}"
    if _EXTERNAL_SOURCE.search(text):
        issues.append("relies on a textbook/curriculum document the learner is not shown")
    if _MISSING_VISUAL.search(text) and not (n["has_visual"] or has_visual):
        issues.append("refers to a diagram/figure/staff that is not provided")

    subj = (subject or "").lower()
    lang = (language or "").lower()
    if any(k in subj for k in _CHINESE_SUBJECTS):
        if _BAD_PINYIN.search(" ".join(opts)):
            issues.append("options contain malformed pinyin")
        # Only when the question is meant to be in Chinese: a Bahasa Cina question may be asked in BM/EN.
        if any(k in lang for k in ("cina", "chinese", "mandarin", "中文", "华")) and opts \
                and not any(_CJK.search(o) for o in opts) and not _CJK.search(stem):
            issues.append("Chinese-language question has no Chinese characters")
    if (topic or "").strip() == "Core Material":
        issues.append("placeholder topic 'Core Material'")
    return issues


class _Review(BaseModel):
    working: str = ""
    my_answer: str = ""
    other_options_defensible: List[str] = Field(default_factory=list)
    factual_errors: List[str] = Field(default_factory=list)
    refers_to_missing_visual: bool = False
    answer_given_away: bool = False
    inconsistent_data: bool = False
    on_topic_for_subject: bool = True
    appropriate_for_form_level: bool = True
    notes: str = ""
    student_explanation: str = ""


_REVIEW_PROMPT = """You are a strict Malaysian KSSM exam moderator. Review ONE multiple-choice question as if you
were about to approve it for a national school bank. Answer it yourself first, WITHOUT assuming any option is right.

Subject: {subject}
Topic: {topic}
Level: Form {form}
Question language: {language}

STIMULUS: {stimulus}
QUESTION: {question}
A. {a}
B. {b}
C. {c}
D. {d}

Return ONLY JSON with exactly these keys, in this order:
{{
  "working": "your step-by-step solution: do every calculation explicitly and check it twice before choosing",
  "my_answer": "A|B|C|D",                      // the single best answer, from your own working
  "other_options_defensible": ["B"],            // letters OTHER than my_answer that a knowledgeable student could defend; [] if none
  "factual_errors": ["..."],                    // wrong facts/dates/names/numbers/maths in the stimulus, question or options, OR a real-world scenario that is physically/logically incoherent (e.g. an upward-opening parabola cannot model the height of a thrown ball); [] if none
  "refers_to_missing_visual": false,            // true if it mentions a diagram/staff/graph/figure that is not provided in the text
  "answer_given_away": false,                   // true if the stimulus or stem states the answer outright
  "inconsistent_data": false,                   // true if numbers/conditions in the stimulus contradict each other
  "on_topic_for_subject": true,                 // false if this tests a different subject (e.g. a science question in a language subject, or content far outside the syllabus)
  "appropriate_for_form_level": true,           // false if clearly beyond Form {form} KSSM or trivially below it
  "notes": "one short sentence",
  "student_explanation": "2-4 short lines for a Form {form} student explaining why my_answer is right (one step per line, separated by \\n; plain-text maths like x², √(y - 3), a/b, f⁻¹(x); no LaTeX, no $; never mention option letters A-D, refer to the answer itself); in the question language"
}}
Be conservative: if you are not sure an option is wrong, list it in other_options_defensible."""


def llm_review(
    q: Dict[str, Any],
    subject: str,
    topic: str,
    form_level: int = 4,
    language: str = "English",
    call: Optional[Callable[..., Any]] = None,
) -> Dict[str, Any]:
    """Second-model review. Returns the _Review as a dict; raises if the model can't be parsed."""
    from schemas.assessment import parse_llm_json

    if call is None:
        from agents.llm_client import call_llm as call  # lazy: keeps deterministic use import-light
    n = normalize(q)
    o = (n["options"] + ["", "", "", ""])[:4]
    prompt = _REVIEW_PROMPT.format(
        subject=subject or "unknown", topic=topic or "unknown", form=form_level or 4, language=language or "English",
        stimulus=n["stimulus"] or "(none)", question=n["question"], a=o[0], b=o[1], c=o[2], d=o[3],
    )
    resp = call(prompt, role="main", want_json=True, temperature=0.0, max_tokens=1200)
    return parse_llm_json(str(resp), _Review, context="question_validator")


def split_review_issues(review: Dict[str, Any], key_idx: Optional[int]) -> tuple:
    """(hard, soft). Calibrated on the 2026-10-23 audit of 1,163 cached questions: failing everything the
    reviewer mentioned rejected 40%, mostly ambiguity nits. Hard = a wrong/contradicted key, factual error,
    contradictory data, off-topic/wrong level, answer given away, or 2+ other defensible options.
    Soft = exactly one other defensible option on its own, or a possibly-missing visual (the reviewer cannot
    see the topic diagram that is shown with the question)."""
    hard: List[str] = []
    soft: List[str] = []
    mine = (review.get("my_answer") or "").strip().upper()[:1]
    if key_idx is not None and mine in LETTERS and LETTERS.index(mine) != key_idx:
        hard.append(f"reviewer solved it as {mine}, stored key is {LETTERS[key_idx]}")
    others = review.get("other_options_defensible") or []
    for e in review.get("factual_errors") or []:
        hard.append(f"factual error: {e}")
    if review.get("answer_given_away"):
        hard.append("stem gives the answer away")
    if review.get("inconsistent_data"):
        hard.append("contradictory data in the stimulus")
    if review.get("on_topic_for_subject") is False:
        hard.append("off-topic for the subject")
    if review.get("appropriate_for_form_level") is False:
        hard.append("wrong level for the form")
    if len(others) >= 2:
        hard.append("other options defensible: " + ",".join(others))
    elif others:
        (hard if hard else soft).append("other options defensible: " + ",".join(others))
    if review.get("refers_to_missing_visual"):
        soft.append("may refer to a visual that is not provided")
    return hard, soft


def review_issues(review: Dict[str, Any], key_idx: Optional[int]) -> List[str]:
    """Hard + soft findings in one list (for inspection)."""
    hard, soft = split_review_issues(review, key_idx)
    return hard + soft


def validate(
    q: Dict[str, Any],
    subject: str = "",
    topic: str = "",
    form_level: int = 4,
    language: str = "English",
    use_llm: bool = True,
    call: Optional[Callable[..., Any]] = None,
    has_visual: bool = False,
) -> ValidationResult:
    issues = deterministic_issues(q, subject, topic, language, has_visual=has_visual)
    if issues or not use_llm:
        return ValidationResult(ok=not issues, issues=issues)
    n = normalize(q)
    if n["question_type"] not in ("mcq", "listening"):
        return ValidationResult(ok=True)
    try:
        rev = llm_review(q, subject, topic, form_level, language, call=call)
    except Exception as e:  # reviewer unavailable: don't block serving, but say so
        return ValidationResult(ok=True, issues=[f"review skipped: {type(e).__name__}"], llm_ran=False)
    hard, soft = split_review_issues(rev, n["key_idx"])
    solved = (rev.get("my_answer") or "")[:1].upper()
    agrees = n["key_idx"] is not None and solved in LETTERS and LETTERS.index(solved) == n["key_idx"]
    return ValidationResult(ok=not hard, issues=hard, warnings=soft, solved=solved, llm_ran=True,
                            explanation=(rev.get("student_explanation") or "").strip() if agrees else "")


# ---------------------------------------------------------------------------------------------------
# Option order. The generators put the correct answer first: in the 2026-10-23 cache 57% of keys were A
# and 3% D, so always tapping A scored 57%. Shuffle once per question (deterministic, flagged).
# ---------------------------------------------------------------------------------------------------
_LABEL = re.compile(r"^\s*\(?[A-Da-d][).:]{1,2}\s+")
# Options whose meaning depends on their position ("Both A and B", "All of the above") must keep their order.
_POSITIONAL = re.compile(
    r"((all|none|both|neither|any) of (the )?(above|these|them)|\b[A-D]\s*(and|&|dan|,)\s*[A-D]\b|"
    r"semua (di atas|jawapan|yang di atas)|tiada (satu )?(daripada|di atas|jawapan)|kedua-dua|"
    r"以上(都|皆|全|均)|都(对|是|正确)|皆(对|是))",
    re.IGNORECASE,
)


def strip_label(text: Any) -> str:
    return _LABEL.sub("", str(text)).strip()


def shuffle_options(q: Dict[str, Any], seed: Optional[str] = None) -> bool:
    """Reorder an MCQ's options in place (and make the key text-based). Returns True if it changed order.

    - correct_answer becomes the option TEXT (answers are matched by text); a letter key is resolved first.
    - distractor_rationale keys that are letters are re-keyed to the option text.
    - baked-in labels ("A) x = 2") are stripped, otherwise a shuffled list would read "B) … A) …".
    - flagged `options_shuffled` so it is idempotent; positional options ("all of the above") are left as is.
    The order is deterministic per question (seeded by its text), so every student sees the same order.
    """
    import random

    if not isinstance(q, dict) or q.get("options_shuffled"):
        return False
    if (q.get("question_type") or "mcq") not in ("mcq", "listening"):
        return False
    raw = q.get("options")
    if not isinstance(raw, list) or len(raw) != 4 or not q.get("question"):
        return False
    clean = [strip_label(o) for o in raw]
    key = _key_index(q.get("correct_answer"), clean)
    if key is None or any(not c for c in clean) or len({c.lower() for c in clean}) != 4:
        return False
    if any(_POSITIONAL.search(c) for c in clean):
        q["options_shuffled"] = True  # considered; order is meaningful
        q["options"] = clean
        q["correct_answer"] = clean[key]
        return False
    perm = list(range(4))
    random.Random(seed or str(q["question"])).shuffle(perm)
    new = [clean[i] for i in perm]
    rationale = q.get("distractor_rationale")
    if isinstance(rationale, dict) and rationale:
        fixed: Dict[str, Any] = {}
        for k, v in rationale.items():
            kk = str(k).strip()
            if len(kk) == 1 and kk.upper() in LETTERS:
                kk = clean[LETTERS.index(kk.upper())]
            else:
                kk = strip_label(kk)
            fixed[kk] = v
        q["distractor_rationale"] = fixed
    q["options"] = new
    q["correct_answer"] = clean[key]
    q["options_shuffled"] = True
    return new != clean


def drop_bad_object_lesson(draft: Dict[str, Any]) -> bool:
    """Remove an object_lesson that would render as junk (a dict/list printed as text, a placeholder like
    'Malaysian_Student'). A missing hook is fine — studio_node's lazy backfill regenerates it for the subjects
    that get hooks; a broken one is shown to students as raw text. Returns True if it dropped one."""
    if not isinstance(draft, dict):
        return False
    ol = draft.get("object_lesson")
    if ol is None or ol == "":
        return False
    text = ol if isinstance(ol, str) else str(ol)
    if not isinstance(ol, str) or text.lstrip()[:1] in "{[" or len(text.strip()) < 40:
        draft["object_lesson"] = ""
        draft.pop("object_lesson_v", None)
        return True
    return False


def gate(draft: Dict[str, Any], subject: str, topic: str, form_level: int = 4, language: str = "English",
         has_visual: bool = False) -> bool:
    """True if `draft` is safe to cache permanently. Used at every topic_anchors write.

    QUESTION_GATE=0 turns the gate off; QUESTION_GATE_LLM=0 keeps only the free structural checks.
    A reviewer outage never blocks (validate() returns ok with a 'review skipped' note).
    """
    import os

    if os.getenv("QUESTION_GATE", "1") == "0":
        return True
    drop_bad_object_lesson(draft)
    res = validate(draft, subject, topic, form_level, language,
                   use_llm=os.getenv("QUESTION_GATE_LLM", "1") != "0", has_visual=has_visual)
    if not res.ok:
        print(f"[QualityGate] rejected {subject}/{topic}: {'; '.join(res.issues)[:300]}")
        return False
    # Store the reviewer's explanation with the question so a wrong answer can be explained instantly,
    # with no LLM call on the student's request (see evaluator_node, MCQ branch).
    if res.explanation and isinstance(draft, dict):
        draft["why_correct"] = res.explanation
    shuffle_options(draft)  # never cache the generator's "correct answer first" order
    return True
