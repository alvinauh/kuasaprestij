import os
import re
import json
import time
import asyncio
import tempfile
from datetime import datetime, timedelta
from functools import lru_cache
from typing import TypedDict, Optional, List
from app import anchor_cache as _ac
from langgraph.graph import StateGraph, END
from supabase import create_client, Client
import edge_tts
from agents.llm_client import call_llm, embed_text
from schemas.assessment import (
    AnchorOutput, MCQQuestion, ShortAnswerQuestion, StepSortQuestion, EssayQuestion,
    MCQFeedback, OpenAnswerEval, EssayEval, WritingGameChallenge, parse_llm_json,
)
from dotenv import load_dotenv
import requests
import uuid
import concurrent.futures


load_dotenv(override=True)

# Initialize Clients
supabase: Client = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))
def _llm_call(prompt: str, role: str = "main", **config_kwargs):
    """Thin wrapper around call_llm that accepts response_mime_type and other legacy kwargs."""
    want_json = config_kwargs.pop("response_mime_type", "") == "application/json"
    temperature = config_kwargs.pop("temperature", 0.7)
    max_tokens = config_kwargs.pop("max_output_tokens", 2048)
    config_kwargs.pop("top_p", None)
    config_kwargs.pop("top_k", None)
    config_kwargs.pop("max_retries", None)
    # Env-gated seeding switch: when SEED_FREE_ONLY is set (only by the offline
    # evidence seed run), skip the paid providers (Gemini/DeepSeek) and use the
    # free chain Cerebras->Groq->OpenRouter. No effect on live serving (unset).
    free_only = os.getenv("SEED_FREE_ONLY", "").lower() in ("1", "true", "yes")
    return call_llm(
        prompt,
        role=role,
        want_json=want_json,
        temperature=temperature,
        max_tokens=max_tokens,
        free_only=free_only,
    )

def _build_h5p_content(video_url: str = "", audio_url: str = "", question_text: str = "", options: list = None,
                        question_timestamp: int = 8, video_duration: int = 0,
                        question_type: str = "mcq") -> dict:
    """Assemble an H5P Interactive Video content blob.
    Correct answers intentionally excluded — checking is done server-side via /submit_answer.
    question_type: 'mcq' renders MultiChoice buttons; 'short_answer'/'essay' renders a text input."""
    pause_at = int(video_duration * 0.7) if video_duration >= 5 else question_timestamp

    if question_type in ("short_answer", "essay") or not options:
        question_interaction = {
            "x": 5, "y": 5, "width": 90, "height": 90,
            "duration": {"from": pause_at, "to": 9999},
            "libraryTitle": "Fill in Blank",
            "action": {
                "library": "H5P.FreeTextQuestion 1.0",
                "params": {"question": f"<p>{question_text}</p>"},
                "subContentId": str(uuid.uuid4()),
                "metadata": {"title": "Quiz Question", "license": "U"},
            },
            "pause": True,
            "displayType": "poster",
            "buttonOnMobile": False,
            "label": (question_text[:47] + "...") if len(question_text) > 50 else question_text,
        }
    else:
        question_interaction = {
            "x": 5, "y": 5, "width": 90, "height": 90,
            "duration": {"from": pause_at, "to": 9999},
            "libraryTitle": "Multiple Choice",
            "action": {
                "library": "H5P.MultiChoice 1.16",
                "params": {
                    "question": f"<p>{question_text}</p>",
                    "answers": [
                        {
                            "text": opt,
                            "correct": False,
                            "tipsAndFeedback": {"tip": "", "chosenFeedback": "", "notChosenFeedback": ""},
                        }
                        for opt in options
                    ],
                    "behaviour": {
                        "enableRetry": False,
                        "enableSolutionsButton": False,
                        "enableCheckButton": True,
                        "type": "auto",
                        "singlePoint": True,
                        "randomAnswers": False,
                        "autoCheck": False,
                        "passPercentage": 100,
                    },
                },
                "subContentId": str(uuid.uuid4()),
                "metadata": {"title": "Quiz Question", "license": "U"},
            },
            "pause": True,
            "displayType": "poster",
            "buttonOnMobile": False,
            "label": (question_text[:47] + "...") if len(question_text) > 50 else question_text,
        }

    interactions = []
    if audio_url:
        interactions.append({
            "x": 0, "y": 80, "width": 100, "height": 20,
            "duration": {"from": 0, "to": pause_at},
            "libraryTitle": "Audio",
            "action": {
                "library": "H5P.Audio 1.5",
                "params": {
                    "files": [{"path": audio_url, "mime": "audio/mpeg"}],
                    "playerMode": "full",
                    "fitToWrapper": True,
                    "controls": False,
                    "autoplay": True,
                },
                "subContentId": str(uuid.uuid4()),
                "metadata": {"title": "Mnemonic Voiceover", "license": "U"},
            },
            "pause": False,
            "displayType": "button",
            "buttonOnMobile": False,
            "label": "Mnemonic Audio",
        })
    interactions.append(question_interaction)

    video_files = [{"path": video_url, "mime": "video/mp4", "copyright": {"license": "U"}}] if video_url else []
    return {
        "interactiveVideo": {
            "video": {
                "startScreenOptions": {"title": "KuasaPrestij", "hideStartTitle": True},
                "textTracks": {"videoTrack": []},
                "files": video_files,
            },
            "assets": {
                "interactions": interactions,
                "bookmarks": [],
                "endscreens": [],
            },
        }
    }

def _pick_h5p_game_type(subject: str, topic: str) -> str:
    """Return the most engaging H5P interaction type for this subject/topic.
    'drag_words' adds a fill-in-the-blank teaching step before the graded MCQ.
    'mcq' keeps the standard single MCQ overlay."""
    subj = (subject or "").strip().lower()
    top = (topic or "").strip().lower()
    lang_subjects = {"bahasa melayu", "bahasa inggeris", "bahasa cina"}
    if subj in lang_subjects:
        return "drag_words"
    vocab_kw = ("vocab", "kosa kata", "terminolog", "definisi", "istilah",
                "词汇", "tatabahasa", "grammar", "imbuhan", "peribahasa")
    if any(kw in top for kw in vocab_kw):
        return "drag_words"
    return "mcq"


def _build_h5p_drag_plus_mcq(video_url: str, audio_url: str,
                               drag_sentence: str, drag_distractors: list,
                               question_text: str, options: list,
                               video_duration: int = 0,
                               audio_end: int = 6, drag_start: int = 6,
                               mcq_start: int = 12) -> dict:
    """Build an H5P Interactive Video blob with a DragText teaching step followed by a graded MCQ.
    Interaction flow: TTS audio (0→drag_start) → DragText (drag_start) → MCQ (mcq_start).
    The drag step is an ungraded learning hook; the MCQ is the question sent to /submit_answer."""
    if video_duration >= 5:
        audio_end = max(1, int(video_duration * 0.35))
        drag_start = audio_end
        mcq_start = max(drag_start + 4, int(video_duration * 0.65))

    lang_hint = drag_sentence[:15] if drag_sentence else ""
    task_desc = "拖动正确的词填入空格。" if any(c > '一' for c in lang_hint) else "Seret perkataan yang betul ke tempat yang kosong."

    interactions = []
    if audio_url:
        interactions.append({
            "x": 0, "y": 80, "width": 100, "height": 20,
            "duration": {"from": 0, "to": audio_end},
            "libraryTitle": "Audio",
            "action": {
                "library": "H5P.Audio 1.5",
                "params": {
                    "files": [{"path": audio_url, "mime": "audio/mpeg"}],
                    "playerMode": "full",
                    "fitToWrapper": True,
                    "controls": False,
                    "autoplay": True,
                },
                "subContentId": str(uuid.uuid4()),
                "metadata": {"title": "Mnemonic Voiceover", "license": "U"},
            },
            "pause": False,
            "displayType": "button",
            "buttonOnMobile": False,
            "label": "Mnemonic Audio",
        })

    drag_video_files = [{"path": video_url, "mime": "video/mp4", "copyright": {"license": "U"}}] if video_url else []
    return {
        "interactiveVideo": {
            "video": {
                "startScreenOptions": {"title": "KuasaPrestij", "hideStartTitle": True},
                "textTracks": {"videoTrack": []},
                "files": drag_video_files,
            },
            "assets": {
                "interactions": interactions + [
                    {
                        "x": 5, "y": 5, "width": 90, "height": 80,
                        "duration": {"from": drag_start, "to": mcq_start - 1},
                        "libraryTitle": "Drag the Words",
                        "action": {
                            "library": "H5P.DragText 1.10",
                            "params": {
                                "taskDescription": f"<p>{task_desc}</p>",
                                "textField": drag_sentence,
                                "distractors": "\n".join(drag_distractors) if drag_distractors else "",
                                "behaviour": {
                                    "instantFeedback": True,
                                    "showSolutionsRequiresInput": True,
                                    "autoCheck": False,
                                    "preventResize": False,
                                },
                                "checkAnswer": "Semak / Check",
                                "tryAgain": "Cuba Lagi / Try Again",
                                "showSolution": "Tunjuk Jawapan",
                            },
                            "subContentId": str(uuid.uuid4()),
                            "metadata": {"title": "Drag the Words", "license": "U"},
                        },
                        "pause": True,
                        "displayType": "poster",
                        "buttonOnMobile": True,
                        "label": "Isi Tempat Kosong",
                    },
                    {
                        "x": 5, "y": 5, "width": 90, "height": 90,
                        "duration": {"from": mcq_start, "to": 9999},
                        "libraryTitle": "Multiple Choice",
                        "action": {
                            "library": "H5P.MultiChoice 1.16",
                            "params": {
                                "question": f"<p>{question_text}</p>",
                                "answers": [
                                    {
                                        "text": opt,
                                        "correct": False,
                                        "tipsAndFeedback": {"tip": "", "chosenFeedback": "", "notChosenFeedback": ""},
                                    }
                                    for opt in options
                                ],
                                "behaviour": {
                                    "enableRetry": False,
                                    "enableSolutionsButton": False,
                                    "enableCheckButton": True,
                                    "type": "auto",
                                    "singlePoint": True,
                                    "randomAnswers": False,
                                    "autoCheck": False,
                                    "passPercentage": 100,
                                },
                            },
                            "subContentId": str(uuid.uuid4()),
                            "metadata": {"title": "Quiz Question", "license": "U"},
                        },
                        "pause": True,
                        "displayType": "poster",
                        "buttonOnMobile": False,
                        "label": (question_text[:47] + "...") if len(question_text) > 50 else question_text,
                    },
                ],
                "bookmarks": [],
                "endscreens": [],
            },
        }
    }


# --- LEAN INTERACTIVE-QUESTION SCHEMA -----------------------------------------
# The frontend never ran a real H5P engine — it hand-parses the blob for ~8 fields.
# This lean schema carries exactly those fields. h5p_content is dual-written during
# the transition; `interactive_content` is the going-forward format.
#   { video_url, audio_url, audio_end_sec, question, options[], mcq_start_sec,
#     drag: { sentence, distractors[], start_sec, end_sec } | null }

_HTML_TAG_RE = re.compile(r"<[^>]+>")

def _strip_html(text: str) -> str:
    return _HTML_TAG_RE.sub("", text or "").strip()

def _build_interactive_blob(video_url: str = "", audio_url: str = "", question_text: str = "",
                            options: list = None, drag_sentence: str = None,
                            drag_distractors: list = None, video_duration: int = 0) -> dict:
    """Assemble the lean interactive blob. Mirrors the timing logic of the H5P builders."""
    options = options or []
    pause_at = int(video_duration * 0.7) if video_duration >= 5 else 8
    blob = {
        "video_url": video_url or "",
        "audio_url": audio_url or "",
        "audio_end_sec": pause_at,
        "question": _strip_html(question_text),
        "options": list(options),
        "mcq_start_sec": pause_at,
        "drag": None,
    }
    if drag_sentence and drag_distractors is not None:
        if video_duration >= 5:
            audio_end = max(1, int(video_duration * 0.35))
            drag_start = audio_end
            mcq_start = max(drag_start + 4, int(video_duration * 0.65))
        else:
            audio_end, drag_start, mcq_start = 6, 6, 12
        blob["audio_end_sec"] = audio_end
        blob["mcq_start_sec"] = mcq_start
        blob["drag"] = {
            "sentence": drag_sentence,
            "distractors": list(drag_distractors),
            "start_sec": drag_start,
            "end_sec": mcq_start - 1,
        }
    return blob

def _h5p_to_lean(h5p: dict) -> Optional[dict]:
    """Convert a legacy H5P blob to the lean schema (backward-compat shim for stored rows)."""
    if not h5p or not isinstance(h5p, dict):
        return None
    iv = h5p.get("interactiveVideo") or {}
    files = ((iv.get("video") or {}).get("files")) or []
    video_url = (files[0] or {}).get("path", "") if files else ""
    interactions = ((iv.get("assets") or {}).get("interactions")) or []

    def _find(lib):
        for i in interactions:
            if ((i.get("action") or {}).get("library") or "").startswith(lib):
                return i
        return None

    audio_i = _find("H5P.Audio")
    drag_i = _find("H5P.DragText")
    mcq_i = _find("H5P.MultiChoice")

    mcq_params = ((mcq_i or {}).get("action") or {}).get("params") or {}
    question = _strip_html(mcq_params.get("question", ""))
    options = [a.get("text", "") for a in (mcq_params.get("answers") or []) if a.get("text")]
    mcq_start = int(((mcq_i or {}).get("duration") or {}).get("from", 8) or 8)

    audio_url = ""
    audio_end = mcq_start
    if audio_i:
        ap = (audio_i.get("action") or {}).get("params") or {}
        af = ap.get("files") or []
        audio_url = (af[0] or {}).get("path", "") if af else ""
        audio_end = int((audio_i.get("duration") or {}).get("to", mcq_start) or mcq_start)

    drag = None
    if drag_i:
        dp = (drag_i.get("action") or {}).get("params") or {}
        distractors = [s.strip() for s in (dp.get("distractors", "") or "").split("\n") if s.strip()]
        drag = {
            "sentence": dp.get("textField", ""),
            "distractors": distractors,
            "start_sec": int((drag_i.get("duration") or {}).get("from", 6) or 6),
            "end_sec": int((drag_i.get("duration") or {}).get("to", mcq_start - 1) or mcq_start - 1),
        }

    return {
        "video_url": video_url,
        "audio_url": audio_url,
        "audio_end_sec": audio_end,
        "question": question,
        "options": options,
        "mcq_start_sec": mcq_start,
        "drag": drag,
    }


def _subject_topic_hint(subject: str, topic: str) -> str:
    """Return SPM paper format guidance per subject/topic so generated questions match real exam structure."""
    subj = (subject or "").strip()
    t = (topic or "").strip()

    # ── BAHASA MELAYU (SPM 1103) ───────────────────────────────────────────────
    if subj == "Bahasa Melayu":
        if "Penulisan Karangan" in t:
            return (
                "FORMAT (SPM 1103 Kertas 1 Bahagian B — Karangan Bebas): "
                "Generate a karangan question. Specify the karangan type (rencana, surat rasmi, artikel, pidato, atau dialog). "
                "Provide a clear tajuk/tema and a bahan rangsangan (stimulus sentence or situation). "
                "Give 3 isi pokok as guiding bullet hints. Minimum 350 patah perkataan. "
                "Question type must be essay. Do NOT generate MCQ options."
            )
        if "Pemahaman dan Rumusan" in t:
            return (
                "FORMAT (SPM 1103 Kertas 2 Bahagian B & C — Pemahaman dan Rumusan): "
                "Generate: (1) a teks (passage) of 150-200 words on the topic, "
                "(2) structured comprehension sub-parts: (a) soalan pemahaman tersurat [3 marks], "
                "(b) soalan pemahaman tersirat [3 marks], (c) soalan rumusan — tulis rumusan "
                "tidak melebihi 80 patah perkataan berdasarkan isi tersurat dan isi tersirat [4 marks]. "
                "Include the teks in the 'illustrative_notes' field for student reference."
            )
        if "KOMSAS" in t:
            genre = t.replace("KOMSAS: ", "")
            return (
                f"FORMAT (SPM 1103 Kertas 2 Bahagian D — KOMSAS {genre}): "
                "Generate a literature analysis question testing one of: "
                "watak dan perwatakan (character), tema dan persoalan (theme), nilai murni (moral values), "
                "latar (setting/time/place), plot/struktur, or gaya bahasa (literary devices/style). "
                f"Frame generically for any {genre} — do NOT invent specific text titles or real character names. "
                "Short-answer: sub-parts (a)[3 marks] + (b)[4 marks]. Essay: 350-word analysis."
            )
        if "Tatabahasa" in t:
            return (
                "FORMAT (SPM 1103 Kertas 2 Bahagian A — Tatabahasa): "
                "Test one grammar/language point per question: imbuhan (affixes), pembinaan ayat (sentence construction), "
                "peribahasa or simpulan bahasa (proverbs/idioms), kata (word classes), or sintaksis (syntax). "
                "Always embed in a sentence context — NEVER test grammar in isolation. "
                "MCQ: student identifies correct form or meaning. 4 options A, B, C, D."
            )

    # ── BAHASA CINA (SPM 华文) ─────────────────────────────────────────────────
    if subj == "Bahasa Cina":
        if any(kw in t for kw in ("Menulis", "Penulisan", "Karangan", "作文")):
            return (
                "FORMAT (SPM 华文 Kertas 1 作文): "
                "Generate a writing prompt with: 题目 (topic title) and 3 提示 (guidance points) in Simplified Chinese. "
                "Minimum 500 Chinese characters. Question type must be essay."
            )
        if any(kw in t for kw in ("Pemahaman", "Membaca", "Teks", "阅读")):
            return (
                "FORMAT (SPM 华文 Kertas 2 阅读理解): "
                "Generate a passage (150-200 Chinese characters) then 2 sub-questions: "
                "(a) factual comprehension question [2 marks], (b) inference or evaluation question [3 marks]."
            )
        if any(kw in t for kw in ("Tatabahasa", "语法")):
            return (
                "FORMAT (SPM 华文 语法): "
                "Test 词汇用法 (vocabulary usage), 句型 (sentence patterns), or 语法规则 (grammar rules). "
                "Provide a sentence context. MCQ with 4 options A, B, C, D."
            )
        if any(kw in t for kw in ("Sastera", "文学")):
            return (
                "FORMAT (SPM 华文 文学): "
                "Generate questions about 散文 (prose), 诗歌 (poetry), or 小说 (fiction) — "
                "theme, imagery, language use, or meaning. Ask for textual evidence."
            )
        if any(kw in t for kw in ("Kosa Kata", "词汇", "Mendengar", "Bertutur")):
            return (
                "FORMAT (SPM 华文 词汇/听说): "
                "Generate a fill-in-the-blank or MCQ testing word meaning or appropriate usage in context. "
                "MCQ with 4 options A, B, C, D."
            )

    # ── BAHASA INGGERIS (SPM 1119) ─────────────────────────────────────────────
    if subj == "Bahasa Inggeris":
        if "Continuous Writing" in t:
            return (
                "FORMAT (SPM 1119 Paper 1 Part 3 — Extended/Continuous Writing): "
                "Set a free composition on a theme. Pick ONE genre (narrative, descriptive, argumentative, or expository) "
                "and give a clear title plus 3 guiding points. Target length ~200-250 words. "
                "Do NOT provide a reading passage or 'Based on the following information' stimulus. Question type must be essay."
            )
        if "Directed Writing" in t:
            return (
                "FORMAT (SPM 1119 Paper 1 Part 2 — Directed/Guided Writing): "
                "Set a task in ONE text type (informal email, formal letter, article, report, speech, or review). "
                "Give the situation and 3 content points the student MUST include. Target length ~125-150 words. "
                "Register and format must match the text type. Do NOT provide a reading-comprehension passage. Question type must be essay."
            )
        if "Literature: Poems" in t:
            return (
                "FORMAT (SPM 1119 Paper 2 Section C — Poems): "
                "Include a short invented 4-6 line poem as stimulus. Generate sub-part questions: "
                "(a) 'What does the poet mean by the phrase \"...\"?' [2 marks], "
                "(b) 'Identify ONE poetic device in the line \"...\" and explain its effect.' [2 marks], "
                "(c) 'What is the main theme of this poem? Support with evidence from the poem.' [4 marks]. "
                "Test: imagery, tone/mood, theme, persona, alliteration, metaphor, simile, personification. "
                "Frame generically — do NOT name real SPM set texts."
            )
        if "Literature: Short Stories" in t:
            return (
                "FORMAT (SPM 1119 Paper 2 Section C — Short Stories): "
                "Generate sub-part questions: "
                "(a) 'Describe ONE character trait of [character]. Give evidence from the story.' [3 marks], "
                "(b) 'What is the theme of this story? Explain with reference to events in the story.' [4 marks]. "
                "Test: character and evidence, theme/message, moral values, conflict, plot. "
                "Frame generically — do NOT invent specific story titles or real character names."
            )
        if "Literature: Drama" in t:
            return (
                "FORMAT (SPM 1119 Paper 2 Section C — Drama): "
                "Generate sub-part questions about: character and motivation, conflict, theme, plot development, or values. "
                "(a) character description with textual evidence [3 marks], "
                "(b) theme or moral value with justification from events [4 marks]. "
                "Frame generically — do NOT invent specific drama titles or character names."
            )
        if "Literature: Novel" in t:
            return (
                "FORMAT (SPM 1119 Paper 2 Section C — Novel): "
                "Generate sub-part questions: "
                "(a) 'Describe the character of ... and his/her role in the story.' [4 marks], "
                "(b) 'What is the moral value shown by this character? Give evidence.' [3 marks]. "
                "Test: character and relationships, plot events, theme, setting, or author's message. "
                "Frame generically — do NOT invent specific novel titles or character names."
            )
        if "Literature" in t:
            return (
                "FORMAT (SPM 1119 Paper 2 Section C — Literature): "
                "Generate sub-part questions about: character, theme, moral values, setting, plot, or literary devices. "
                "Always ask for evidence or justification from the text. Frame generically."
            )
        if "Grammar" in t:
            return (
                "FORMAT (SPM 1119 Paper 2 Section B — Language Awareness): "
                "Test ONE grammar point per question: tenses (simple past, present perfect, past continuous), "
                "subject-verb agreement, prepositions (in/on/at/by), conjunctions (although/however/therefore/unless), "
                "active vs. passive voice, reported speech, modal verbs (must/should/would), or articles (a/an/the). "
                "ALWAYS embed in a sentence context — NEVER test grammar in isolation. "
                "MCQ: student selects the grammatically correct option. "
                "Example stem: 'Ahmad _____ for the bus when it started to rain.' "
                "Options: A) waits  B) waited  C) was waiting  D) has waited"
            )
        if "Vocabulary" in t:
            return (
                "FORMAT (SPM 1119 Paper 2 — Vocabulary in Context): "
                "Test word meaning, synonym, antonym, or best word choice in a sentence. "
                "Underline or highlight the target word in the sentence context. "
                "MCQ: student selects the correct meaning or best substitute. "
                "Example: 'The scientist made a significant discovery.' "
                "What does 'significant' mean? A) small  B) important  C) recent  D) unexpected"
            )
        # Thematic comprehension topics (Friendships, Environment, Health, Technology, Society, etc.)
        return (
            "FORMAT (SPM 1119 Paper 2 Reading Comprehension): "
            "Write a 4-6 sentence reading passage about the topic (news excerpt, opinion piece, or informational text). "
            "Then write ONE comprehension question requiring inference or evaluation — NOT direct lifting. "
            "Examples: 'What can you infer about...', 'Why does the writer suggest...', 'What is the writer's attitude toward...'. "
            "Include the passage in the 'illustrative_notes' field for student reference. "
            "MCQ: 4 options A, B, C, D. Short-answer: sub-parts (a)[2 marks], (b)[3 marks] with textual evidence required."
        )

    # ── SCIENCES (SPM Physics 4531 / Biology 4551 / Chemistry 4541 / Science) ──
    if subj in ("Physics", "Biology", "Chemistry", "Science"):
        return (
            f"FORMAT (SPM {subj} Paper 1 & Paper 2): "
            "For MCQ (Paper 1 Objective): Write a stimulus FIRST — a short scenario, a described diagram "
            "(e.g. 'Diagram 1 shows a spring with a load of 5.0 N attached'), or a data table described in text. "
            "Then write the question stem. Options A, B, C, D must use correct SI units and realistic values. "
            "Distractors must reflect real misconceptions (e.g. unit confusion, sign errors, direction errors). "
            "For short-answer (Paper 2 Section A): Divide into sub-parts (a), (b), (c). "
            "Show marks in square brackets: '(a) [2 marks]'. "
            "Sub-parts progress from recall → application → analysis/evaluation. "
            "Stem must include a described scenario, observation, or experiment result. "
            "For essay (Paper 2 Section B/C): Begin with 'Based on the following information:' and a stimulus. "
            "Ask students to explain/describe/compare/evaluate. "
            "Mark by content points (1-2 marks each) + communication quality."
        )

    # ── MATHEMATICS (SPM 1449) ──────────────────────────────────────────────────
    if subj == "Mathematics":
        return (
            "FORMAT (SPM Mathematics 1449): "
            "For MCQ (Paper 1 Objective): Present a mathematical problem or calculation with given values. "
            "Options A, B, C, D are numerical answers or expressions — one correct, three from typical calculation errors. "
            "For short-answer (Paper 2 Section A): Structured with sub-parts (a)[2 marks], (b)[3 marks] etc. "
            "Students MUST show full working — marks awarded for correct method even if final answer is wrong. "
            "State clearly what is given and what is to be found."
        )

    # ── ADDITIONAL MATHEMATICS (SPM 3472) ──────────────────────────────────────
    if subj == "Additional Mathematics":
        return (
            "FORMAT (SPM Additional Mathematics 3472): "
            "Paper 1 is short-answer only (no options) — students must show all working. "
            "Paper 2 uses structured sub-parts: (a)[3 marks], (b)[3 marks], (c)[4 marks]. "
            "For MCQ mode: options are numerical results or algebraic expressions. "
            "Marking awards method marks (M) for correct working and accuracy marks (A) for correct answer. "
            "Always state the topic domain (e.g. differentiation, integration, probability distribution)."
        )

    # ── HUMANITIES ──────────────────────────────────────────────────────────────
    if subj == "Sejarah":
        return (
            "FORMAT (SPM Sejarah 1249): "
            "For MCQ: include a short stimulus (a historical quote, event description, date, or name) before the question. "
            "Options A, B, C, D should include plausible distractors based on related historical facts. "
            "For short-answer: sub-parts (a)[2 marks] recall, (b)[3 marks] explanation, (c)[5 marks] analysis. "
            "For essay: structured — definisi/pengenalan, huraikan faktor-faktor dengan huraian, buat kesimpulan."
        )

    if subj == "Geografi":
        return (
            "FORMAT (SPM Geografi): "
            "For MCQ: stimulus can be a described map, data table, or geographical observation. "
            "For short-answer: sub-parts (a)(b)(c) with marks in square brackets. "
            "Include data interpretation — ask students to read and explain a described graph, table, or map."
        )

    return ""


def _language_composition_spec(
    subject: str, topic: str, question_type: str | None = None
) -> dict | None:
    """Detect a *language composition* task (BM karangan / 华文 作文 / English writing).

    Returns a spec dict when the subject+topic is a free/guided composition that must
    be generated by a writing prompt (title/theme + genre + guiding points, NO
    stimulus-explain framing) and marked by a language-weighted rubric. Returns None
    for content essays (Science/Sejarah/etc.) which keep the generic essay prompt.

    Two ways a spec is returned:
      1. Dedicated composition topics (e.g. "Penulisan Karangan", "Continuous
         Writing") — ALWAYS essays regardless of question_type; theme is left free.
      2. A curated essay THEME (see ESSAY_TOPICS) — only when question_type=='essay',
         so these themes stay valid MCQ/short-answer topics too. The chosen theme is
         attached as spec["theme"] and fixes what the composition is about; the rubric
         is the language's flagship essay paper.
    """
    subj = (subject or "").strip()
    t = (topic or "").strip()

    if subj == "Bahasa Melayu" and "Penulisan Karangan" in t:
        return {
            "lang_label": "Bahasa Melayu",
            "paper": "SPM 1103 Kertas 1 Bahagian B — Karangan Respons Terbuka",
            "task_line": (
                "Hasilkan SATU soalan karangan respons terbuka. Nyatakan jenis karangan "
                "(rencana, surat rasmi/tidak rasmi, ceramah/pidato, laporan, cerpen, atau ulasan), "
                "beri tajuk/tema yang jelas, dan sertakan 3 isi pokok sebagai bimbingan (bullet). "
                "JANGAN sertakan bahan rangsangan 'Based on the following information' — ini karangan bebas, bukan tugasan menjelaskan stimulus."
            ),
            "min_length": "sekurang-kurangnya 350 patah perkataan",
            "exemplar_line": "Karangan model lengkap sekurang-kurangnya 350 patah perkataan — pengenalan, 3 perenggan isi dengan huraian dan contoh, dan penutup.",
            "max_marks": 30,
            "bands": [
                {"band": "Cemerlang", "marks_range": "26-30", "descriptors": "Isi relevan, matang dan dihuraikan dengan contoh. Bahasa gramatis, kosa kata luas, ejaan/tanda baca tepat. Pengolahan lancar dan berkesan; format jenis karangan dipatuhi sepenuhnya."},
                {"band": "Baik", "marks_range": "16-25", "descriptors": "Isi relevan dan cukup huraian. Bahasa memuaskan dengan sedikit kesalahan tatabahasa/ejaan. Pengolahan menyakinkan; format sebahagian besar betul."},
                {"band": "Memuaskan", "marks_range": "1-15", "descriptors": "Isi terhad atau kurang huraian. Kesalahan bahasa ketara menjejaskan kelancaran. Pengolahan lemah; format tidak lengkap."},
            ],
        }

    if subj == "Bahasa Cina" and any(kw in t for kw in ("Menulis", "Penulisan", "Karangan", "作文")):
        return {
            "lang_label": "华文 (Simplified Chinese)",
            "paper": "SPM 华文 Kertas 1 命题作文",
            "task_line": (
                "生成一道命题作文题：给出 题目（作文标题）、文体（记叙文/说明文/议论文/应用文），"
                "以及 3 条 写作提示（bullet）。不要使用 'Based on the following information' 这类刺激材料——这是命题作文，不是看材料作答。"
            ),
            "min_length": "不少于 500 个汉字",
            "exemplar_line": "完整的范文，不少于 500 个汉字——开头、三段主体（每段有论述与例子）、结尾。",
            "max_marks": 30,
            "bands": [
                {"band": "优秀", "marks_range": "26-30", "descriptors": "内容切题、充实，论述深入并有例证。语言通顺，词汇丰富，用词与标点准确。结构完整，文体格式规范。"},
                {"band": "良好", "marks_range": "16-25", "descriptors": "内容切题，论述较充分。语言基本通顺，有少量语病或错别字。结构清晰，文体格式大致正确。"},
                {"band": "及格", "marks_range": "1-15", "descriptors": "内容单薄或偏题，论述不足。语病较多，影响表达。结构松散，文体格式不完整。"},
            ],
        }

    if subj == "Bahasa Inggeris" and "Continuous Writing" in t:
        return {
            "lang_label": "English",
            "paper": "SPM 1119 Paper 1 Part 3 — Extended (Continuous) Writing",
            "task_line": (
                "Set ONE extended writing task. Give a clear title/prompt and specify the genre "
                "(narrative, descriptive, argumentative, or expository). Provide 3 guiding points as bullet hints. "
                "Do NOT prepend a 'Based on the following information' stimulus — this is a free composition on a theme, not a stimulus-explain task."
            ),
            "min_length": "at least 200-250 words",
            "exemplar_line": "A full model composition of at least 200 words — engaging introduction, well-developed body paragraphs with detail/examples, and a clear conclusion.",
            "max_marks": 30,
            "bands": [
                {"band": "A", "marks_range": "25-30", "descriptors": "Highly relevant, well-developed ideas with strong detail. Wide range of accurate vocabulary and sentence structures; minimal errors. Coherent, well-organised paragraphing; genre conventions fully observed."},
                {"band": "B", "marks_range": "14-24", "descriptors": "Relevant ideas with adequate development. Generally accurate language with some errors that do not impede meaning. Organised; genre mostly appropriate."},
                {"band": "C", "marks_range": "1-13", "descriptors": "Limited or partly relevant ideas. Frequent language errors affect clarity. Weak organisation; genre conventions largely absent."},
            ],
        }

    if subj == "Bahasa Inggeris" and "Directed Writing" in t:
        return {
            "lang_label": "English",
            "paper": "SPM 1119 Paper 1 Part 2 — Guided (Directed) Writing",
            "task_line": (
                "Set ONE directed writing task in a specified text type (informal email, formal email/letter, article, report, speech, or review). "
                "Give the situation and 3 content points that MUST be addressed. "
                "Do NOT prepend a 'Based on the following information' stimulus — provide the situation and points directly."
            ),
            "min_length": "about 125-150 words",
            "exemplar_line": "A full model response of 125-150 words in the correct text-type format, addressing all 3 given content points with appropriate register and tone.",
            "max_marks": 20,
            "bands": [
                {"band": "A", "marks_range": "16-20", "descriptors": "All content points addressed and developed. Correct format and register for the text type. Accurate language with wide range; coherent and well-linked."},
                {"band": "B", "marks_range": "9-15", "descriptors": "Most content points addressed. Format and register largely appropriate. Generally accurate language with some errors."},
                {"band": "C", "marks_range": "1-8", "descriptors": "Few content points addressed. Weak or wrong format/register. Frequent errors affect clarity."},
            ],
        }

    # Curated essay theme → resolve to this language's flagship composition rubric,
    # fixing the theme. Gated on question_type so these themes remain valid for
    # MCQ/short-answer selection (they overlap with content topics).
    if question_type == "essay" and _is_curated_essay_theme(subj, t):
        flagship = {
            "Bahasa Melayu": "Penulisan Karangan",
            "Bahasa Inggeris": "Continuous Writing",
            "Bahasa Cina": "作文",
        }.get(subj)
        if flagship:
            spec = _language_composition_spec(subj, flagship)
            if spec:
                spec = dict(spec)
                spec["theme"] = t
                return spec

    return None


def generate_writing_challenge(subject: str, topic: str, language: str) -> dict:
    """Generate a writing-native mini-game payload for the composition penalty games.

    Produces (1) a well-formed model sentence tokenised for the Sentence Builder game and
    (2) a connector-cloze item for the Connector Catch game — both in the subject's language,
    themed on the topic. Falls back to a safe generic payload if the LLM is cooling/errs.
    """
    lang = language or "English"
    lang_instruction = _lang_config(lang)["instruction"]
    prompt = f"""
You are creating a short WRITING practice mini-game for a Form 4/5 student ({subject} — {topic}).
CRITICAL LANGUAGE INSTRUCTION: {lang_instruction}

Produce TWO items, both themed on the topic and at KSSM Form 4/5 level:
1. sentence: ONE well-formed, natural sentence (8-14 words) the student will rebuild from scrambled words.
   Also give "tokens": that exact sentence split into its words IN CORRECT ORDER (punctuation attached to its word).
2. connector: a sentence split around a missing cohesive connector — give "before" (text before the blank),
   "after" (text after the blank), "answer" (the ONE correct connector, e.g. however / therefore / because /
   although / so), and "distractors" (3 WRONG but plausible connectors). Keep before/after natural on their own.

Return ONLY a JSON object:
{{
    "sentence": "the full correct sentence",
    "tokens": ["word1", "word2", "word3"],
    "connector": {{
        "before": "text before the blank",
        "after": "text after the blank",
        "answer": "correct connector",
        "distractors": ["wrong1", "wrong2", "wrong3"]
    }}
}}
"""
    try:
        res = _llm_call(prompt, response_mime_type="application/json", temperature=0.8)
        data = parse_llm_json(res.text, WritingGameChallenge, "generate_writing_challenge")
        # If the model didn't tokenise, derive tokens from the sentence.
        if data.get("sentence") and not data.get("tokens"):
            data["tokens"] = data["sentence"].split()
        # Guard: a builder needs >= 3 tokens and a connector needs an answer.
        if len(data.get("tokens", [])) >= 3 or (data.get("connector") or {}).get("answer"):
            data["subject"] = subject
            data["topic"] = topic
            data["language"] = lang
            return data
    except Exception as e:
        print(f"-> LLM Error in generate_writing_challenge: {e}")

    # Safe generic fallback (English) so the game always has something to play.
    return {
        "sentence": "Good writing needs clear ideas and correct grammar.",
        "tokens": ["Good", "writing", "needs", "clear", "ideas", "and", "correct", "grammar."],
        "connector": {
            "before": "She revised every night,",
            "after": "she scored well in the exam.",
            "answer": "so",
            "distractors": ["but", "although", "because"],
        },
        "subject": subject,
        "topic": topic,
        "language": lang,
    }


def _lang_config(language: str) -> dict:
    """Map a language label to LLM instruction text and TTS voice config."""
    lang_lower = language.lower()
    if any(kw in lang_lower for kw in ("malay", "melayu", "bahasa melayu", "bm")):
        return {
            "instruction": "Write entirely in Bahasa Melayu. You may borrow a few English science/math terms where natural, but all prose must be predominantly in Bahasa Melayu.",
            "tts_code": "ms-MY",
            "tts_voice": "ms-MY-Wavenet-B",
        }
    if any(kw in lang_lower for kw in ("cina", "mandarin", "chinese", "mandarin chinese", "中文")):
        return {
            "instruction": "Write entirely in Mandarin Chinese (Simplified Characters, 普通话). All text including questions, options, and notes must be in Chinese.",
            "tts_code": "cmn-CN",
            "tts_voice": "cmn-CN-Wavenet-A",
        }
    # Default: English
    return {
        "instruction": "Write entirely in English.",
        "tts_code": "en-US",
        "tts_voice": "en-US-Wavenet-D",
    }


_TTS_VOICE_MAP = {
    "bahasa melayu": "ms-MY-YasminNeural",
    "melayu":        "ms-MY-YasminNeural",
    "malay":         "ms-MY-YasminNeural",
    "bm":            "ms-MY-YasminNeural",
    "english":       "en-US-JennyNeural",
    "en":            "en-US-JennyNeural",
    "bahasa cina":   "zh-CN-XiaoxiaoNeural",
    "mandarin":      "zh-CN-XiaoxiaoNeural",
    "chinese":       "zh-CN-XiaoxiaoNeural",
    "cina":          "zh-CN-XiaoxiaoNeural",
}

def _generate_tts_audio(text: str, label: str, language: str = "English", speaking_rate: float = 1.0) -> str:
    """Generate TTS via edge-tts (free, no API key), upload to Supabase Storage.
    Returns public URL or "" on failure."""
    if not text:
        return ""
    lang_lower = language.lower()
    voice = next((v for k, v in _TTS_VOICE_MAP.items() if k in lang_lower), "en-US-JennyNeural")
    try:
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
            tmp_path = tmp.name
        asyncio.run(edge_tts.Communicate(text, voice=voice).save(tmp_path))
        safe_label = re.sub(r'[^a-zA-Z0-9_-]', '_', label)[:60]
        lang_code = lang_lower[:2]
        storage_path = f"tts/{safe_label}_{lang_code}.mp3"
        with open(tmp_path, "rb") as f:
            audio_data = f.read()
        os.unlink(tmp_path)
        supabase.storage.from_("media_bucket").upload(
            storage_path, audio_data,
            {"content-type": "audio/mpeg", "upsert": "true"},
        )
        return supabase.storage.from_("media_bucket").get_public_url(storage_path)
    except Exception as e:
        print(f"TTS generation failed ({language}): {e}")
        return ""


_MY_FALLBACK_QUERIES = [
    "Malaysia classroom students",
    "Kuala Lumpur school",
    "Malaysian students studying",
]

_SUBJECT_DIAGRAM_HINTS = {
    "Physics":                "circuit, ray, force, or wave diagram",
    "Biology":                "labelled cell, organ, or life-cycle diagram",
    "Chemistry":              "molecular structure or reaction pathway",
    "Additional Mathematics": "graph or geometric construction with axes and key points",
    "Mathematics":            "graph, geometric shape, or worked example with numbers",
    "Science":                "labelled apparatus or process diagram",
    "Sejarah":                "timeline or cause-effect flow",
    "Geografi":               "cross-section, map feature, or water-cycle diagram",
    "Bahasa Melayu":          "text-structure scaffold or KOMSAS element map",
    "Bahasa Inggeris":        "genre-structure scaffold or vocabulary web",
    "Pendidikan Moral":       "concept map linking the value to real-life contexts",
    "Prinsip Perakaunan":     "T-account or accounting equation diagram",
}

def _generate_diagram_svg(subject: str, topic: str, form_level: int = 4) -> str:
    """Generate and return an SVG diagram for a topic. Returns '' on failure.
    Called once per new topic in studio_node; result cached in topic_anchors.diagram_svg."""
    hint = _SUBJECT_DIAGRAM_HINTS.get(subject, "key concept or process diagram")
    prompt = f"""Draw a simple educational SVG diagram for Malaysian SPM students.

Subject: {subject} (Form {form_level})
Topic: {topic}
Style: {hint}

Rules:
- viewBox="0 0 520 360", white background
- At most 4 colours: #1e3a5f #e8f4fd #2d6a4f #e63946
- Font: Arial, 12-14px labels
- Keep it simple — 5-10 elements maximum
- Output ONLY the SVG, starting with <svg and ending with </svg>"""
    try:
        res = _llm_call(prompt, max_tokens=2048)
        raw = res.text.strip() if res and res.text else ""
        if not raw:
            return ""
        import re as _re
        match = _re.search(r'(<svg[\s\S]*?</svg>)', raw, _re.IGNORECASE)
        if match:
            return match.group(1)
        # LLM truncated — patch missing closing tag
        start = _re.search(r'(<svg[\s\S]+)', raw, _re.IGNORECASE)
        if start:
            return start.group(1).strip() + "\n</svg>"
        return ""
    except Exception as e:
        print(f"-> Diagram SVG generation failed (non-fatal): {e}")
        return ""


def _fetch_pexels_video(search_query: str, raw_query: str = "") -> tuple:
    """Fetch B-Roll from Pexels. Returns (video_url, video_duration).
    Uses a 5s timeout and skips fallback retries — on any miss the CDN fallback
    is returned immediately so TTS generation isn't blocked by Pexels latency."""
    video_url = "https://cdn.kuasaprestij.tech/assets/fallback_video.mp4"
    video_duration = 0
    headers = {"Authorization": os.getenv("PEXELS_API_KEY")}
    try:
        pexels_url = f"https://api.pexels.com/videos/search?query={search_query}&orientation=portrait&size=small&per_page=1"
        pex_res = requests.get(pexels_url, headers=headers, timeout=5).json()
        if pex_res.get("videos"):
            pex_video = pex_res["videos"][0]
            # Prefer sd over hd — smaller files load faster in the H5P player.
            sd_file = next((f for f in pex_video["video_files"] if f["quality"] == "sd"), None)
            chosen = sd_file or pex_video["video_files"][0]
            video_url = chosen["link"]
            video_duration = int(pex_video.get("duration", 0))
            print(f"-> B-Roll Found ({chosen.get('quality', '?')}): {video_url} ({video_duration}s)")
        else:
            print(f"-> B-Roll: no results for '{search_query}', using CDN fallback")
    except Exception as e:
        print(f"Pexels fetch failed (using CDN fallback): {e}")
    return video_url, video_duration


# --- 1. THE PROGRESSION MAP ---
# Maps each topic to the recommended next topic in the same subject strand.
CURRICULUM_MAP = {
    # Physics (Fizik)
    "Force & Motion": "Kinematics",
    "Kinematics": "Electromagnetism",
    "Electromagnetism": "Heat",
    "Heat": "Light & Optics",
    "Light & Optics": "Waves",
    "Waves": "Nuclear Physics",
    # Biology (Biologi)
    "Cell Structure & Function": "Cell Division",
    "Cell Division": "Respiration",
    "Respiration": "Nutrition & Digestion",
    "Nutrition & Digestion": "Coordination & Response",
    "Coordination & Response": "Reproduction",
    "Reproduction": "Inheritance & Variation",
    # Chemistry (Kimia)
    "Matter & Properties": "Atomic Structure",
    "Atomic Structure": "Chemical Formulae & Equations",
    "Chemical Formulae & Equations": "Periodic Table",
    "Periodic Table": "Chemical Bonds",
    "Chemical Bonds": "Electrochemistry",
    "Electrochemistry": "Rates of Reaction",
    # History (Sejarah)
    "Warisan Negara Bangsa": "Kebangkitan Nasionalisme",
    "Kebangkitan Nasionalisme": "Gerakan Nasionalisme di Asia Tenggara",
    "Gerakan Nasionalisme di Asia Tenggara": "Nasionalisme di Malaysia",
    "Nasionalisme di Malaysia": "Malaysia Merdeka",
    "Malaysia Merdeka": "Pembangunan Negara Bangsa",
    # Geography (Geografi)
    "Bentuk Muka Bumi": "Cuaca & Iklim",
    "Cuaca & Iklim": "Penduduk",
    "Penduduk": "Petempatan",
    "Petempatan": "Sumber & Aktiviti Ekonomi",
    # Moral (Pendidikan Moral)
    "Nilai Kemanusiaan": "Hak Asasi Manusia",
    "Hak Asasi Manusia": "Demokrasi & Keadilan",
    # Business (Prinsip Perakaunan)
    "Asas Perniagaan": "Pengurusan Sumber Manusia",
    "Pengurusan Sumber Manusia": "Perakaunan Asas",
    "Perakaunan Asas": "Penyata Kewangan",
    "Penyata Kewangan": "Analisis Nisbah",
    "Analisis Nisbah": "Kawalan Dalaman",
    # Mathematics
    "Algebra": "Linear Equations",
    "Linear Equations": "Quadratic Equations",
    "Quadratic Equations": "Indices & Logarithms",
    "Indices & Logarithms": "Coordinate Geometry",
    "Coordinate Geometry": "Geometry",
    "Geometry": "Trigonometry",
    "Trigonometry": "Matrices",
    "Matrices": "Differentiation",
    "Differentiation": "Statistics & Probability",
    # Geography (Geografi) — fill remaining chain
    "Sumber & Aktiviti Ekonomi": "Pembangunan Wilayah",
    "Pembangunan Wilayah": "Alam Sekitar & Kelestarian",
    # Moral (Pendidikan Moral) — fill remaining chain
    "Demokrasi & Keadilan": "Tanggungjawab Sosial",
    "Tanggungjawab Sosial": "Patriotisme",
    "Patriotisme": "Integriti",
    "Integriti": "Kesejahteraan Keluarga",
    # History (Sejarah) — fill remaining chain
    "Pembangunan Negara Bangsa": "Tamadun Awal Dunia",
    "Tamadun Awal Dunia": "Tamadun Islam",
    "Tamadun Islam": "Kesultanan Melayu Melaka",
    "Kesultanan Melayu Melaka": "Perkembangan di Eropah",
    # Biology — fill remaining chain
    "Inheritance & Variation": "Ecosystem",
    "Ecosystem": "Biotechnology",
    "Biotechnology": "Transport in Plants & Animals",
    # Chemistry — fill remaining chain
    "Rates of Reaction": "Acids, Bases & Salts",
    "Acids, Bases & Salts": "Carbon Compounds",
    "Carbon Compounds": "Polymers",
    # Physics — fill remaining chain
    "Nuclear Physics": "Pressure",
    "Pressure": "Electricity",
    "Electricity": "Magnetism",
}

# KSSM topics split by form level. Used by /subjects?form_level= filter.
KSSM_TOPICS_BY_FORM: dict[int, dict[str, list[str]]] = {
    4: {
        # --- Sciences ---
        "Physics": [
            "Measurement", "Force and Motion I", "Gravitation",
            "Heat", "Waves", "Light and Optics", "Force and Motion II",
        ],
        "Biology": [
            "Introduction to Biology", "Cell Biology and Organisation",
            "Movement of Substances across a Plasma Membrane",
            "Chemical Composition in a Cell", "Metabolism and Enzymes",
            "Cell Division", "Cellular Respiration",
            "Respiratory System in Humans and Animals",
            "Nutrition and Human Digestive System",
            "Transport in Humans and Animals", "Immunity in Humans",
            "Coordination and Response in Humans",
            "Homeostasis and Human Urinary System",
            "Support and Movement in Humans and Animals",
            "Sexual Reproduction in Humans and Animals",
        ],
        "Chemistry": [
            "Introduction to Chemistry", "Matter and Atomic Structure",
            "The Mole Concept, Chemical Formula and Equation",
            "The Periodic Table of Elements", "Chemical Bond",
            "Acid, Base and Salt",
        ],
        "Science": [
            "Introduction to Science", "Cell as a Unit of Life",
            "Matter", "Forces and Motion", "Biodiversity",
            "Microorganisms and Their Effects",
        ],
        "Additional Mathematics": [
            "Functions", "Quadratic Functions", "Systems of Equations",
            "Indices and Logarithms", "Progressions", "Linear Law",
            "Coordinate Geometry", "Vectors",
        ],
        # --- Languages ---
        "Bahasa Melayu": [
            "Sejarah dan Warisan", "Jati Diri, Patriotisme dan Kewarganegaraan",
            "Ekonomi, Keusahawanan dan Pengurusan Kewangan", "Sains, Teknologi dan Inovasi",
            "Kesihatan dan Kebersihan",
            "KOMSAS: Cerpen", "KOMSAS: Novel", "KOMSAS: Prosa Tradisional",
            "KOMSAS: Puisi Tradisional", "KOMSAS: Puisi Moden", "KOMSAS: Drama",
            "Tatabahasa dan Peribahasa", "Penulisan Karangan", "Pemahaman dan Rumusan",
        ],
        "Bahasa Inggeris": [
            "Friendships and Relationships", "Environment and Nature",
            "People and Work", "Health and Wellness",
            "Technology and Innovation", "Arts and Culture",
            "Consumerism and Financial Awareness",
            "Literature: Poems", "Literature: Short Stories",
            "Literature: Drama", "Literature: Novel",
            "Grammar in Context", "Vocabulary Building",
            "Continuous Writing", "Directed Writing",
        ],
        "Bahasa Cina": [
            "Mendengar & Bertutur", "Membaca Teks", "Penulisan Karangan",
            "Tatabahasa Cina", "Kosa Kata", "Pemahaman Teks", "Sastera Cina",
        ],
        # --- Humanities ---
        "Sejarah": [
            "Warisan Negara Bangsa", "Kebangkitan Nasionalisme",
            "Gerakan Nasionalisme di Asia Tenggara",
            "Nasionalisme di Malaysia", "Malaysia Merdeka",
        ],
        "Geografi": [
            "Bentuk Muka Bumi", "Cuaca dan Iklim", "Penduduk", "Petempatan",
        ],
        "Pendidikan Moral": [
            "Nilai Kemanusiaan", "Hak Asasi Manusia",
            "Demokrasi dan Keadilan", "Tanggungjawab Sosial",
        ],
        # --- Mathematics ---
        "Mathematics": [
            "Patterns and Sequences", "Number Bases",
            "Logical Reasoning", "Operations on Sets",
            "Linear Inequalities", "Graphs of Motion",
        ],
        # --- Commerce ---
        "Prinsip Perakaunan": [
            "Asas Perniagaan", "Pengurusan Sumber Manusia", "Perakaunan Asas",
        ],
        # --- Arts ---
        "Pendidikan Muzik": ["Teori Muzik", "Notasi Muzik", "Ensembel"],
        "Pendidikan Seni Visual": ["Asas Seni Reka", "Seni Halus", "Kraf Tradisional"],
    },
    5: {
        # --- Sciences ---
        "Physics": [
            "Pressure", "Electricity", "Electromagnetism",
            "Electronics", "Nuclear Physics", "Quantum Physics",
        ],
        "Biology": [
            "Organisation of Plant Tissues and Growth",
            "Nutrition in Plants", "Transport in Plants",
            "Responses in Plants", "Sexual Reproduction in Plants",
            "Biodiversity", "Ecosystem", "Environmental Sustainability",
            "Inheritance", "Variation", "Genetic Engineering and Biotechnology",
        ],
        "Chemistry": [
            "Rate of Reaction", "Redox Equilibrium", "Carbon Compound",
            "Thermochemistry", "Polymer Chemistry",
            "Manufactured Substances in Industry",
            "Consumer and Industrial Chemistry",
        ],
        "Science": [
            "Nutrition", "Reproduction", "Energy", "Ecosystem",
            "Technology in Society", "Stars and Galaxies",
        ],
        "Additional Mathematics": [
            "Differentiation", "Integration",
            "Permutations and Combinations",
            "Probability Distributions", "Trigonometric Functions",
        ],
        # --- Languages ---
        "Bahasa Melayu": [
            "Alam Sekitar dan Teknologi Hijau", "Jati Diri, Patriotisme dan Kewarganegaraan",
            "Pendidikan dan Ilmu", "Kebudayaan, Kesenian dan Estetika",
            "Kesihatan dan Kebersihan",
            "KOMSAS: Cerpen", "KOMSAS: Novel", "KOMSAS: Prosa Tradisional",
            "KOMSAS: Puisi Tradisional", "KOMSAS: Puisi Moden", "KOMSAS: Drama",
            "Tatabahasa dan Peribahasa", "Penulisan Karangan", "Pemahaman dan Rumusan",
        ],
        "Bahasa Inggeris": [
            "Society and Community", "Global Issues and Current Affairs",
            "Science and Technology", "Travel and Adventure",
            "Media and Communication",
            "Literature: Poems",
            "Grammar in Context", "Vocabulary Building",
        ],
        "Bahasa Cina": [
            "Kosa Kata Lanjutan", "Pemahaman Teks Lanjutan", "Penulisan Karangan Lanjutan",
            "Sastera Cina", "Tatabahasa Lanjutan", "Mendengar & Bertutur",
        ],
        # --- Humanities ---
        "Sejarah": [
            "Pembangunan Negara Bangsa", "Tamadun Awal Dunia",
            "Tamadun Islam", "Kesultanan Melayu Melaka", "Perkembangan di Eropah",
        ],
        "Geografi": [
            "Sumber dan Aktiviti Ekonomi", "Pembangunan Wilayah",
            "Alam Sekitar dan Kelestarian",
        ],
        "Pendidikan Moral": [
            "Patriotisme", "Integriti", "Kesejahteraan Keluarga",
        ],
        # --- Mathematics ---
        "Mathematics": [
            "Gradient and Area under a Graph",
            "Probability", "Trigonometry",
            "Angles of Elevation and Depression",
            "Lines and Planes in 3D", "Plans and Elevations",
        ],
        # --- Commerce ---
        "Prinsip Perakaunan": [
            "Penyata Kewangan", "Analisis Nisbah", "Kawalan Dalaman",
        ],
        # --- Arts ---
        "Pendidikan Muzik": ["Apresiasi Muzik", "Irama dan Melodi", "Nyanyian"],
        "Pendidikan Seni Visual": ["Reka Bentuk", "Apresiasi Seni", "Seni Digital"],
    },
}

# Union of both forms — used by mastery_map, suggest_topic, seed_anchors (unchanged callers).
KSSM_TOPICS: dict[str, list[str]] = {}
for _form_topics in KSSM_TOPICS_BY_FORM.values():
    for _subj, _topics in _form_topics.items():
        _seen = KSSM_TOPICS.setdefault(_subj, [])
        for _t in _topics:
            if _t not in _seen:
                _seen.append(_t)


# ── Curated ESSAY / composition themes ────────────────────────────────────────
# The general KSSM topic lists (grammar, comprehension, KOMSAS/literature, etc.)
# are NOT suitable as essay prompts. For the three language subjects we keep a
# SEPARATE, curated set of writing themes — derived from the KSSM textbook
# thematic units + common SPM karangan/作文 subjects. These are shown only when
# the student picks the "essay" question type; each becomes the FIXED theme of
# the generated composition (rubric = each language's flagship essay paper).
ESSAY_TOPICS_BY_FORM: dict[int, dict[str, list[str]]] = {
    4: {
        "Bahasa Melayu": [
            "Sejarah dan Warisan Negara",
            "Jati Diri, Patriotisme dan Perpaduan",
            "Ekonomi, Keusahawanan dan Pengurusan Kewangan",
            "Sains, Teknologi dan Inovasi",
            "Kesihatan dan Gaya Hidup Sihat",
            "Alam Sekitar dan Kelestarian",
            "Media Sosial dan Masyarakat",
        ],
        "Bahasa Inggeris": [
            "Friendships and Relationships",
            "Environment and Nature",
            "People and Work",
            "Health and Wellness",
            "Technology and Innovation",
            "Arts and Culture",
            "Consumerism and Financial Awareness",
        ],
        "Bahasa Cina": [
            "环境保护",
            "科技与生活",
            "校园生活",
            "亲情与友情",
            "健康的生活方式",
        ],
    },
    5: {
        "Bahasa Melayu": [
            "Alam Sekitar dan Teknologi Hijau",
            "Pendidikan dan Ilmu Pengetahuan",
            "Kebudayaan, Kesenian dan Warisan",
            "Belia dan Pembangunan Negara",
            "Perpaduan dan Keharmonian Masyarakat",
            "Cabaran Globalisasi",
        ],
        "Bahasa Inggeris": [
            "Society and Community",
            "Global Issues and Current Affairs",
            "Science and Technology",
            "Travel and Adventure",
            "Media and Communication",
        ],
        "Bahasa Cina": [
            "社会现象",
            "传统文化",
            "理想与人生",
            "全球化的挑战",
            "媒体与沟通",
        ],
    },
}

# Union across forms — form-agnostic membership check used by the composition spec.
ESSAY_TOPICS: dict[str, list[str]] = {}
for _form_topics in ESSAY_TOPICS_BY_FORM.values():
    for _subj, _topics in _form_topics.items():
        _seen = ESSAY_TOPICS.setdefault(_subj, [])
        for _t in _topics:
            if _t not in _seen:
                _seen.append(_t)


def essay_topics_for(subject: str, form_level: Optional[int] = None) -> list[str]:
    """Curated essay themes for a language subject (empty for non-language subjects).

    Pass a form level to scope to that form; omit for the union across forms.
    """
    subj = (subject or "").strip()
    if form_level in ESSAY_TOPICS_BY_FORM:
        return list(ESSAY_TOPICS_BY_FORM[form_level].get(subj, []))
    return list(ESSAY_TOPICS.get(subj, []))


def _is_curated_essay_theme(subject: str, topic: str) -> bool:
    """True when topic is one of the curated (separate) essay themes for subject."""
    return (topic or "").strip() in ESSAY_TOPICS.get((subject or "").strip(), [])


def _get_dynamic_subjects(form_level: Optional[int] = None) -> dict[str, list[str]]:
    """
    Returns KSSM subjects with their topics.
    If form_level is 4 or 5, returns only that form's topics.
    Merges with any extra subjects found in syllabus_embeddings.
    """
    if form_level in KSSM_TOPICS_BY_FORM:
        result = dict(KSSM_TOPICS_BY_FORM[form_level])
    else:
        result = dict(KSSM_TOPICS)
    try:
        res = supabase.table("syllabus_embeddings").select("metadata").execute()
        for row in res.data:
            meta = row.get("metadata") or {}
            subj = (meta.get("subject") or "").strip()
            if form_level:
                row_form = meta.get("form")
                try:
                    if row_form and int(row_form) != form_level:
                        continue
                except (ValueError, TypeError):
                    pass
            if subj and subj not in result:
                result[subj] = ["Core Material"]
    except Exception as e:
        print(f"[subjects] DB lookup failed, using static map: {e}")
    return result

# --- 2. ENHANCED STATE ---
class AgentState(TypedDict):
    student_id: str
    topic: str
    subject: str          # KSSM subject name, e.g. "Physics", "Biology"
    language: str
    form_level: int       # KSSM form number (4 or 5); used to disambiguate same-name topics
    is_adaptive: bool
    question_type: str          # "mcq" | "short_answer" | "essay" | "listening"
    context: str               # textbook prose chunks
    dskp_criteria: str         # DSKP performance standards / assessment scope
    student_history: str
    draft: Optional[dict]
    student_answer: Optional[str]
    is_correct: bool
    partial_credit: Optional[float]   # 0.0–1.0 for open questions
    mastery_score: float
    feedback: str
    teacher_action_plan: str
    mnemonic_lyrics: Optional[str]
    media_url: Optional[str]
    video_broll: Optional[str]
    h5p_content: Optional[dict]
    diagram_svg: Optional[str]
    worked_example: Optional[str]
    topic_complete: bool
    next_topic: str
    error_category: Optional[str]
    root_cause: Optional[str]
    intervention_plan: Optional[str]
    # Essay-only: structured student-facing detail (strengths, improvements, band,
    # the full model answer, and a "how it should look" outline). None for MCQ.
    essay_detail: Optional[dict]
    answered_count: int          # questions answered so far in this session (0 = Q1)
    target_kbat: Optional[str]   # KBAT level the generator should target (injected by main.py)

# --- RETRIEVER NODE HELPERS (run in parallel) ---
# Success-only cache: failures are NOT stored so the next call retries the real vector search.
# (lru_cache would permanently cache a timeout fallback, poisoning every subsequent request.)
_syllabus_context_cache: dict = {}

def _fetch_syllabus_contexts(subject: str, topic: str) -> tuple:
    """Embed the topic query, run pgvector similarity search, then split results by source_type.
    Returns (textbook_context, dskp_criteria) as separate strings.
    Only caches successful DB results — failures fall through so the next call retries."""
    cache_key = (subject, topic)
    if cache_key in _syllabus_context_cache:
        return _syllabus_context_cache[cache_key]

    fallback_textbook = f"Ensure the question is specifically about KSSM {subject} — {topic}."
    fallback_dskp = ""
    try:
        query_vector = embed_text(f"KSSM {subject} Subject Topic: {topic}")
        # Run RPC in a thread with a hard 6-second timeout so a slow/missing HNSW index
        # doesn't block the whole request. Falls through to fallback on timeout.
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as _ex:
            _fut = _ex.submit(
                lambda: supabase.rpc(
                    'match_syllabus_embeddings',
                    {'query_embedding': query_vector, 'match_threshold': 0.5, 'match_count': 8},
                ).execute()
            )
            try:
                syllabus_res = _fut.result(timeout=6)
            except concurrent.futures.TimeoutError:
                print("-> Vector search timed out (6s). Using fallback context.")
                return fallback_textbook, fallback_dskp

        if not syllabus_res.data:
            print("-> No vector matches above threshold. Using fallback.")
            return fallback_textbook, fallback_dskp

        textbook_chunks = []
        dskp_chunks = []
        for chunk in syllabus_res.data:
            meta = chunk.get('metadata') or {}
            source = meta.get('source_type', '')
            if source == 'dskp_matrix':
                dskp_chunks.append(chunk['content'])
            else:
                textbook_chunks.append(chunk['content'])

        print(f"-> Retrieved {len(textbook_chunks)} textbook chunk(s), {len(dskp_chunks)} DSKP chunk(s)")
        textbook_str = "\n\n".join(textbook_chunks[:3]) if textbook_chunks else fallback_textbook
        dskp_str = "\n\n".join(dskp_chunks[:2]) if dskp_chunks else fallback_dskp
        result = (textbook_str, dskp_str)
        _syllabus_context_cache[cache_key] = result  # only cache on success
        return result
    except Exception as e:
        print(f"Database vector retrieve error: {e}")
        return fallback_textbook, fallback_dskp  # NOT cached — next request retries


def _fetch_student_history(student_id: str, topic: str) -> str:
    """Fetch last 5 event_log entries for the student+topic, returning a rich error profile."""
    try:
        past_logs = supabase.table("event_logs")\
            .select("diagnostic_tag, error_category, root_cause, is_correct")\
            .eq("student_id", student_id)\
            .eq("topic", topic)\
            .order("created_at", desc=True)\
            .limit(5)\
            .execute()
        if not past_logs.data:
            return "The student has no recorded history in this topic yet."

        lines = []
        for log in past_logs.data:
            tag = log.get('diagnostic_tag') or ''
            category = log.get('error_category') or ''
            cause = log.get('root_cause') or ''
            correct = log.get('is_correct', True)
            if not correct and (tag or category or cause):
                entry = f"- [{category}] {cause}" if category else f"- {tag}"
                if entry.strip() not in ("- ", "- None"):
                    lines.append(entry)

        if lines:
            return "Student error profile for this topic:\n" + "\n".join(lines)
    except Exception as e:
        print(f"Student history fetch error: {e}")
    return "The student has no recorded weaknesses in this topic yet."


# --- RETRIEVER NODE ---
def retriever_node(state: AgentState):
    print(f"--- RETRIEVING SYLLABUS & STUDENT HISTORY in parallel: {state['topic']} ---")

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        future_contexts = executor.submit(_fetch_syllabus_contexts, state['subject'], state['topic'])
        future_history = executor.submit(_fetch_student_history, state['student_id'], state['topic'])
        textbook_context, dskp_criteria = future_contexts.result()
        history_text = future_history.result()

    return {"context": textbook_context, "dskp_criteria": dskp_criteria, "student_history": history_text}

# --- STUDIO (BANK) NODE ---
def studio_node(state: AgentState):
    if state.get('is_adaptive', False):
        return {}

    lang = state.get('language', 'English')
    print(f"--- STUDIO BANK: Fetching Anchor Hook for {state['topic']} ({lang}) ---")

    row = _ac.fetch_sync(supabase, state['topic'], lang, state.get('form_level', 4))
    if row:
        draft = row['anchor_question'] or {}

        # anchor_question is null — row exists only from question_bank seeding.
        # Fall back to a cached bank question so we never trigger an LLM call for Q1.
        if not draft or not draft.get('question'):
            bank = row.get('question_bank') or []
            if bank:
                import random as _random
                draft = _random.choice(bank)
                print(f"-> anchor_question empty; serving from question_bank ({len(bank)} cached)")
                return {"draft": draft, "mnemonic_lyrics": None, "media_url": None, "video_broll": None, "h5p_content": None, "diagram_svg": row.get("diagram_svg"), "worked_example": row.get("worked_example")}
            # No bank either — fall through to full anchor generation below.
            print("-> anchor_question and question_bank both empty; generating new anchor...")
        else:
            print("-> Found existing Anchor in Bank! Loading instantly.")
            # Normalize old cached anchors: "answer" → "correct_answer", add question_type
            if 'correct_answer' not in draft and 'answer' in draft:
                draft['correct_answer'] = draft.pop('answer')
            draft.setdefault('question_type', 'mcq')
            draft.setdefault('kbat_level', 'Memahami')
            draft.setdefault('illustrative_notes', '')
            draft.setdefault('distractor_rationale', {})
            draft.setdefault('source_excerpt', '')

            # When a diagram exists, skip B-Roll entirely — frontend uses SVG as background.
            if row.get('diagram_svg'):
                video_url = ""
            else:
                video_url = row.get('video_broll') or "https://cdn.kuasaprestij.tech/assets/fallback_video.mp4"
            audio_url = row.get('audio_url') or ""
            h5p_content = _build_h5p_content(
                video_url=video_url,
                audio_url=audio_url,
                question_text=draft.get('question', ''),
                options=draft.get('options', []),
                question_type=draft.get('question_type', 'mcq'),
            )

            return {
                "draft": draft,
                "mnemonic_lyrics": row['mnemonic_lyrics'],
                "media_url": None,
                "video_broll": video_url,
                "h5p_content": h5p_content,
                "diagram_svg": row.get("diagram_svg"),
                "worked_example": row.get("worked_example"),
            }

    # Skip anchor generation when vector retrieval failed — the one-line fallback
    # context ("Ensure the question is specifically about...") has no real DSKP content
    # for the LLM to source from, so it always fails anchor_question validation.
    # Fall through to generator_node which produces a valid question without textbook grounding.
    context = state.get('context', '')
    if not context or context.startswith('Ensure the question is specifically'):
        print(f"-> No DSKP context (vector retrieval failed) — skipping anchor generation, falling to generator_node")
        return {}

    print(f"-> Generating new Mnemonic Lyrics & Directing B-Roll ({lang})...")

    lc = _lang_config(lang)
    lang_instruction = lc["instruction"]
    topic_hint = _subject_topic_hint(state.get('subject', ''), state.get('topic', ''))
    topic_hint_block = f"\n{topic_hint}" if topic_hint else ""

    lang_lower = lang.lower()
    if any(kw in lang_lower for kw in ("malay", "melayu", "bahasa melayu", "bm")):
        lyrics_style = "Write entirely in Bahasa Melayu. You may borrow a few English science/math terms where natural, but the rap must be predominantly in Bahasa Melayu."
    elif any(kw in lang_lower for kw in ("cina", "mandarin", "chinese", "中文")):
        lyrics_style = "Write entirely in Mandarin Chinese (Simplified, 普通话). The rap must be in Chinese characters with natural rhythm."
    else:
        lyrics_style = "Write entirely in English. You may use Malaysian SPM subject terminology where appropriate, but all lyrics must be in English."

    game_type = _pick_h5p_game_type(state.get('subject', ''), state['topic'])
    drag_task_block = ""
    if game_type == "drag_words":
        drag_task_block = f"""
    TASK 4 (Interactive Drag Game): Write a 1-2 sentence fill-in-the-blank exercise about the same concept.
    Mark exactly 2-4 key terms with *asterisks* (e.g. "Fotosintesis berlaku di dalam *kloroplas* yang mengandungi *klorofil*.").
    Also provide 2-3 distractor words that sound similar but do not belong in any blank.
    CRITICAL LANGUAGE INSTRUCTION: {lang_instruction}
    Add these two fields to the root JSON object:
      "drag_sentence": "sentence with *key_terms* wrapped in asterisks"
      "drag_distractors": ["wrong_word1", "wrong_word2"]
    """

    dskp_block = ""
    if state.get('dskp_criteria'):
        dskp_block = f"""
    DSKP ASSESSMENT STANDARD (use ONLY to determine the cognitive level / Bloom's verb for kbat_level — do NOT use this as question content):
    {state['dskp_criteria']}
"""

    prompt = f"""
    TEXTBOOK CONTENT (primary source — the question must test facts, terms, and concepts from this text):
    {state['context']}
{dskp_block}
    TASK 1: Write a short, highly rhythmic 4-line spoken-word rap to help students memorize the core concept from the textbook content above.
    CRITICAL STYLE INSTRUCTION: {lyrics_style}
    TASK 2: Create ONE core diagnostic multiple-choice question grounded strictly in the TEXTBOOK CONTENT above.
    SPM PAPER 1 FORMAT: The question stem may include a short stimulus (a described scenario, diagram, or data observation). Provide exactly 4 options — one correct answer and three plausible distractors based on real student misconceptions. For science/maths: use correct SI units and realistic values. Options must be parallel in structure and similar in length.
    The question must be answerable using only the textbook content — do not introduce information from the DSKP standard.
    {"Use the DSKP ASSESSMENT STANDARD above to set the appropriate cognitive level (kbat_level) and Bloom's verb only." if state.get('dskp_criteria') else ""}
    CRITICAL LANGUAGE INSTRUCTION: {lang_instruction}{topic_hint_block}
    TASK 3: Act as a Video Director. Provide a 2-3 word English search query to find background B-Roll footage representing this concept.
    {drag_task_block}
    Return ONLY a JSON object with this exact structure:
    {{
        "mnemonic_lyrics": "The 4 line rap...",
        "b_roll_search_query": "2-3 word english search term",
        "anchor_question": {{
            "source_excerpt": "Copy the exact sentence or phrase from TEXTBOOK CONTENT that this question directly tests.",
            "question_type": "mcq",
            "kbat_level": "string",
            "illustrative_notes": "2-3 sentences (in the same language as the question) on what the student needs to know to answer this question. Focus on prerequisite knowledge and key facts — do NOT reveal the answer.",
            "stimulus": "A 1-2 sentence scenario, described diagram, or data observation that gives context for the question. Empty string if not needed.",
            "question": "The question stem only — do NOT include the stimulus here. Ask what the student must determine or identify.",
            "options": ["option A text", "option B text", "option C text", "option D text"],
            "correct_answer": "the exact string of the correct option",
            "distractor_rationale": {{
                "option text": "A 2-sentence explanation (in the same language as the question) of the specific error."
            }}
        }}
    }}
    """

    try:
        res = _llm_call(prompt, response_mime_type="application/json")
    except Exception as e:
        print(f"-> LLM Error (studio_node): {e}")
        return {}

    try:
        # 1. Parse + validate (list-unwrap guard + Pydantic schema — TAR §5.1 extension)
        data = parse_llm_json(res.text, AnchorOutput, "studio_node")

        lyrics = data.get('mnemonic_lyrics', '')

        # 3. Generate TTS + diagram SVG in parallel (Pexels only as fallback if no diagram)
        raw_query = data.get("b_roll_search_query", "").strip()
        search_query = raw_query if raw_query else _MY_FALLBACK_QUERIES[0]
        subject = state.get('subject', '')
        topic = state['topic']
        form_level = state.get('form_level', 4)
        print("-> Generating TTS audio + diagram SVG in parallel...")
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            fut_audio = executor.submit(_generate_tts_audio, lyrics, topic, lang)
            fut_diagram = executor.submit(_generate_diagram_svg, subject, topic, form_level)
            audio_url = fut_audio.result()
            diagram_svg = fut_diagram.result()
        print(f"-> TTS audio: {'OK' if audio_url else 'skipped'} | Diagram SVG: {'OK' if diagram_svg else 'failed'}")

        # Use diagram as background; only fetch Pexels if diagram generation failed.
        if diagram_svg:
            video_url, video_duration = "", 0
        else:
            print("-> Diagram failed — falling back to Pexels B-Roll...")
            video_url, video_duration = _fetch_pexels_video(search_query, raw_query)

        anchor_question = data.get('anchor_question', {})
        drag_sentence = data.get('drag_sentence', '').strip()
        drag_distractors = data.get('drag_distractors', [])
        _use_drag = game_type == "drag_words" and drag_sentence and anchor_question.get('options')
        if _use_drag:
            print(f"-> Building DragText+MCQ H5P for {topic}")
            h5p_content = _build_h5p_drag_plus_mcq(
                video_url=video_url,
                audio_url=audio_url,
                drag_sentence=drag_sentence,
                drag_distractors=drag_distractors,
                question_text=anchor_question.get('question', ''),
                options=anchor_question.get('options', []),
                video_duration=video_duration,
            )
        else:
            h5p_content = _build_h5p_content(
                video_url=video_url,
                audio_url=audio_url,
                question_text=anchor_question.get('question', ''),
                options=anchor_question.get('options', []),
                video_duration=video_duration,
                question_type=anchor_question.get('question_type', 'mcq'),
            )

        # Lean interactive blob (going-forward format; h5p_content dual-written for rollback)
        interactive_content = _build_interactive_blob(
            video_url=video_url,
            audio_url=audio_url,
            question_text=anchor_question.get('question', ''),
            options=anchor_question.get('options', []),
            drag_sentence=drag_sentence if _use_drag else None,
            drag_distractors=drag_distractors if _use_drag else None,
            video_duration=video_duration,
        )

        # 5. Save to bank keyed by (topic, language)
        upsert_data = {
            "subject": state['subject'],
            "topic": topic,
            "language": lang,
            "form_level": form_level,
            "mnemonic_lyrics": lyrics,
            "anchor_question": anchor_question,
            "video_broll": video_url,
            "h5p_content": h5p_content,
            "interactive_content": interactive_content,
        }
        if audio_url:
            upsert_data["audio_url"] = audio_url
        if diagram_svg:
            upsert_data["diagram_svg"] = diagram_svg
        supabase.table("topic_anchors").upsert(upsert_data, on_conflict="topic,language,form_level").execute()

        return {
            "draft": anchor_question,
            "mnemonic_lyrics": lyrics,
            "media_url": None,
            "video_broll": video_url,
            "h5p_content": h5p_content,
            "diagram_svg": diagram_svg or None,
            "worked_example": None,  # seeded separately by seed_worked_examples.py
        }

    except Exception as e:
        print(f"Failed to generate anchor: {e}")
        return {}

# --- GENERATOR NODE (Adaptive Loop) ---
_KBAT_BLOOM = {
    "Memahami":     "C2 Understanding — explain, summarise, classify, compare",
    "Mengaplikasi": "C3 Applying — use a concept in a new situation, solve, calculate",
    "Menganalisis": "C4 Analysing — break down, distinguish cause/effect, examine relationships",
    "Menilai":      "C5 Evaluating — judge, justify, critique, weigh evidence",
    "Mencipta":     "C6 Creating — design, propose, construct, synthesise",
}

def generator_node(state: AgentState):
    q_type = state.get('question_type', 'mcq')
    print(f"--- GENERATING ADAPTIVE {q_type.upper()} IN {state['language'].upper()} ---")

    context = state['context']
    dskp_criteria = state.get('dskp_criteria', '')
    history = state.get('student_history', 'No prior history.')
    lang = state['language']
    lang_instruction = _lang_config(lang)["instruction"]
    topic_hint = _subject_topic_hint(state.get('subject', ''), state.get('topic', ''))
    topic_hint_block = f"\n{topic_hint}" if topic_hint else ""

    target_kbat = state.get('target_kbat') or ''
    if target_kbat:
        bloom_desc = _KBAT_BLOOM.get(target_kbat, target_kbat)
        kbat_instruction = (
            f"\nKBAT LEVEL REQUIREMENT: You MUST set kbat_level to \"{target_kbat}\" in your JSON. "
            f"Generate a question at Bloom's level {bloom_desc}. "
            f"The question must require the student to demonstrate this level — NOT just recall a definition."
        )
        print(f"-> KBAT target: {target_kbat}")
    else:
        kbat_instruction = ""

    dskp_section = f"""
DSKP ASSESSMENT STANDARD (use ONLY to set the cognitive level / Bloom's verb — do NOT use this text as question content; all question content must come from the TEXTBOOK CONTENT):
{dskp_criteria}
""" if dskp_criteria else ""

    if q_type == 'listening':
        prompt = f"""
TEXTBOOK CONTENT (primary source — passage and question must use vocabulary and concepts from this text only):
{context}
{dskp_section}
STUDENT PROFILE: {history}

TASK: Create a listening comprehension task for Form 4/5 students grounded in the textbook content above.
SPM 1119 LISTENING FORMAT: The passage is a natural 4-6 sentence dialogue or monologue (radio excerpt, conversation, or announcement). The comprehension question must require inference or evaluation — NOT word-for-word retrieval from the passage. Vocabulary and ideas must match KSSM Form 4/5 level.
The passage and question must stay within the vocabulary and concepts present in the TEXTBOOK CONTENT above.
CRITICAL LANGUAGE INSTRUCTION: {lang_instruction}{topic_hint_block}{kbat_instruction}

The passage should be a natural 4-6 sentence dialogue or monologue about {state['topic']}.

Return ONLY a JSON object:
{{
    "source_excerpt": "Copy the exact sentence or phrase from TEXTBOOK CONTENT that the passage is based on.",
    "question_type": "listening",
    "kbat_level": "string",
    "illustrative_notes": "2-3 sentences on what the student needs to know to follow this listening passage and answer the question. Focus on key vocabulary or context — do NOT reveal the answer.",
    "passage": "The full listening script — 4-6 natural sentences as a dialogue or short monologue.",
    "question": "One comprehension question about the passage",
    "options": ["option A text", "option B text", "option C text", "option D text"],
    "correct_answer": "the exact string of the correct option",
    "distractor_rationale": {{
        "option text": "Why a student might wrongly pick this."
    }}
}}
"""

    elif q_type == 'short_answer':
        prompt = f"""
TEXTBOOK CONTENT (primary source — question and model answer must be grounded in this text):
{context}
{dskp_section}
STUDENT PROFILE: {history}

TASK: Create ONE high-quality structured short-answer question for Form 4/5 students grounded strictly in the TEXTBOOK CONTENT above.
SPM PAPER 2 STRUCTURED FORMAT: Divide into 2-3 sub-parts labeled (a), (b), (c). Show marks in square brackets after each label e.g. "(a) [2 marks]". Sub-parts must progress from knowledge/recall → application → analysis. The stem may include a described scenario, experiment observation, or diagram description. The sum of marks across all sub-parts must equal max_marks.
The question must be answerable from the textbook content — do not introduce facts absent from it.
CRITICAL LANGUAGE INSTRUCTION: {lang_instruction}{topic_hint_block}{kbat_instruction}

Return ONLY a JSON object:
{{
    "source_excerpt": "Copy the exact sentence or phrase from TEXTBOOK CONTENT that this question directly tests.",
    "question_type": "short_answer",
    "kbat_level": "string",
    "illustrative_notes": "2-3 sentences on what the student needs to know to answer this question. Focus on prerequisite knowledge and key facts — do NOT reveal the answer.",
    "question": "The scenario/stem text only (do NOT include sub-part labels here)",
    "sub_parts": [
        {{"label": "(a)", "question": "sub-question text", "marks": 2, "sample_answer": "model answer for part (a)"}},
        {{"label": "(b)", "question": "sub-question text", "marks": 2, "sample_answer": "model answer for part (b)"}}
    ],
    "sample_answer": "Full combined model answer covering all sub-parts",
    "key_concepts": ["concept1", "concept2", "concept3"],
    "marking_rubric": "Per sub-part: (a) marks for ..., (b) marks for ...",
    "max_marks": 4
}}
"""
    elif q_type == 'step_sort':
        prompt = f"""
TEXTBOOK CONTENT (primary source — the problem and its worked solution must be grounded in this text):
{context}
{dskp_section}
STUDENT PROFILE: {history}

TASK: Create ONE Mathematics / Additional Mathematics problem for Form 4/5 students whose FULL worked solution is broken into ordered steps — the student will drag the steps into the correct order.
SPM WORKING FORMAT: Decompose the solution the way an SPM marking scheme does — each step is one line of working carrying a mark. Use mark_type "M" for method steps (setting up, choosing the technique), "A" for accuracy steps (a correct value/result), "B" for an independent result. The sum of step marks must equal max_marks.
Then invent 2-4 DISTRACTOR steps: plausible-but-wrong working lines that a real Form 4/5 student would produce from a common KSSM misconception (sign error, forgetting a term differentiates to 0, dropping a root, wrong formula). Each distractor must name the exact misconception.
Write expressions in plain KaTeX-compatible notation (e.g. "dy/dx = 3x^2 - 4", "x = \\\\pm\\\\sqrt{{4/3}}").
CRITICAL LANGUAGE INSTRUCTION: {lang_instruction}{topic_hint_block}{kbat_instruction}

Return ONLY a JSON object:
{{
    "source_excerpt": "Copy the exact sentence/formula from TEXTBOOK CONTENT this problem tests.",
    "question_type": "step_sort",
    "kbat_level": "string",
    "illustrative_notes": "2-3 sentences on the prerequisite technique — do NOT reveal the step order.",
    "stimulus": "Any given data/diagram description, or empty string.",
    "question": "The problem statement the student must solve.",
    "solution_steps": [
        {{"id": "s1", "order": 1, "description": "what this step does", "expression": "the math line", "marks": 1, "mark_type": "M"}},
        {{"id": "s2", "order": 2, "description": "...", "expression": "...", "marks": 1, "mark_type": "M"}},
        {{"id": "s3", "order": 3, "description": "...", "expression": "...", "marks": 1, "mark_type": "A"}},
        {{"id": "s4", "order": 4, "description": "...", "expression": "...", "marks": 1, "mark_type": "A"}}
    ],
    "distractor_steps": [
        {{"id": "d1", "expression": "a wrong working line", "misconception": "the specific error this represents", "error_category": "Conceptual Gap"}},
        {{"id": "d2", "expression": "another wrong line", "misconception": "...", "error_category": "Careless Error"}}
    ],
    "final_answer": "the final result, e.g. x = 1.155",
    "prefilled_step_ids": [],
    "max_marks": 4
}}
"""
    elif q_type == 'essay' and (comp := _language_composition_spec(state.get('subject', ''), state.get('topic', ''), 'essay')):
        # ── Language composition (BM karangan / 华文 作文 / English writing) ──
        # A free/guided composition on a title+genre+guiding points — NOT a
        # stimulus-explain content essay. Marked by a language-weighted rubric.
        bands_json = json.dumps(comp["bands"], ensure_ascii=False)
        _theme = comp.get("theme")
        theme_directive = (
            f"\nFIXED THEME: The composition MUST be on the theme \"{_theme}\". "
            f"Build the title, genre choice and the 3 guiding points around this theme."
        ) if _theme else ""
        prompt = f"""
REFERENCE THEME/CONTENT (use only to pick a relevant, level-appropriate topic — do NOT ask the student to summarise or explain this text):
{context}
{dskp_section}
STUDENT PROFILE: {history}

TASK: Create ONE language composition ({comp['paper']}) for Form 4/5 students.
{comp['task_line']}{theme_directive}
The composition must require the student to WRITE ({comp['min_length']}) — it is NOT a comprehension or explain-the-stimulus task.
CRITICAL LANGUAGE INSTRUCTION: {lang_instruction}{topic_hint_block}{kbat_instruction}

Return ONLY a JSON object:
{{
    "source_excerpt": "",
    "question_type": "essay",
    "kbat_level": "string",
    "illustrative_notes": "2-3 sentences guiding the student on how to plan this composition (genre conventions, structure, register) — do NOT write the composition for them.",
    "stimulus": "",
    "question": "The full writing task: title/theme + genre + the 3 guiding points as bullet lines + the required length in brackets.",
    "model_answer": "{comp['exemplar_line']}",
    "marking_rubric_bands": {bands_json},
    "max_marks": {comp['max_marks']},
    "themes": ["theme1", "theme2"]
}}
"""
    elif q_type == 'essay':
        prompt = f"""
TEXTBOOK CONTENT (primary source — essay question and model answer must draw from this text):
{context}
{dskp_section}
STUDENT PROFILE: {history}

TASK: Create ONE structured essay question for Form 4/5 students grounded strictly in the TEXTBOOK CONTENT above.
SPM PAPER 2 ESSAY FORMAT: Begin with a stimulus — 'Based on the following information:' followed by a 2-4 sentence scenario, observation, or data description. Then state the task clearly (e.g. 'Explain...', 'Discuss...', 'Compare and contrast...'). Marking is split: content marks (correct points and explanations, 1-2 marks each) and communication marks (language clarity, structure, coherence).
The question must be answerable from the textbook content — do not introduce facts absent from it.
CRITICAL LANGUAGE INSTRUCTION: {lang_instruction}{topic_hint_block}{kbat_instruction}

Return ONLY a JSON object:
{{
    "source_excerpt": "Copy the exact sentence or phrase from TEXTBOOK CONTENT that anchors this essay question.",
    "question_type": "essay",
    "kbat_level": "string",
    "illustrative_notes": "2-3 sentences on what the student needs to know to answer this question. Focus on prerequisite knowledge and key facts — do NOT reveal the answer.",
    "stimulus": "Based on the following information: [2-4 sentence scenario or data description drawn from the topic]",
    "question": "The essay task instruction only (e.g. 'Explain the process of photosynthesis and its importance to plants. [10 marks]')",
    "model_answer": "A full model answer of 150-200 words — clear introduction, content points each explained in 1-2 sentences, brief conclusion",
    "marking_rubric_bands": [
        {{"band": "A", "marks_range": "8-10", "descriptors": "Strong content with accurate, well-explained points. Clear structure with introduction, body, and conclusion. Fluent language with minimal errors."}},
        {{"band": "B", "marks_range": "5-7",  "descriptors": "Adequate content with mostly correct explanations. Generally organised. Some language errors but meaning is clear."}},
        {{"band": "C", "marks_range": "1-4",  "descriptors": "Limited content with partial or vague explanations. Weak structure. Frequent language errors may affect clarity."}}
    ],
    "max_marks": 10,
    "themes": ["theme1", "theme2"]
}}
"""
    else:
        prompt = f"""
TEXTBOOK CONTENT (primary source — the question must test facts, terms, and concepts explicitly from this text):
{context}
{dskp_section}
STUDENT PROFILE: {history}

TASK: Create ONE high-quality, UNIQUE multiple-choice question for Form 4/5 students grounded strictly in the TEXTBOOK CONTENT above.
SPM PAPER 1 OBJECTIVE FORMAT: The question may include a short stimulus (a described scenario, diagram, observation, or data) before the question stem. Provide exactly 4 options — one correct answer, three plausible distractors based on real student misconceptions. For science/maths: correct SI units and realistic values required. Options must be parallel in grammatical structure and similar in length. Do NOT make the correct answer obviously longer or different in style.
The question must be answerable from the textbook content — do not introduce facts absent from it.
CRITICAL: Do NOT use standard, overused examples. Test deep conceptual understanding.
CRITICAL LANGUAGE INSTRUCTION: {lang_instruction}{topic_hint_block}{kbat_instruction}

Return ONLY a JSON object:
{{
    "source_excerpt": "Copy the exact sentence or phrase from TEXTBOOK CONTENT that this question directly tests.",
    "question_type": "mcq",
    "kbat_level": "string",
    "illustrative_notes": "2-3 sentences on what the student needs to know to answer this question. Focus on prerequisite knowledge and key facts — do NOT reveal the answer.",
    "stimulus": "A 1-2 sentence scenario, described diagram, or data observation that gives context for the question. Empty string if not needed.",
    "question": "The question stem only — do NOT repeat the stimulus here. Ask what the student must determine or identify.",
    "options": ["option A text", "option B text", "option C text", "option D text"],
    "correct_answer": "the exact string of the correct option (must match one of the options exactly)",
    "distractor_rationale": {{
        "option text": "A 2-sentence explanation of the specific misconception that leads a student to this wrong answer."
    }}
}}
"""

    fallbacks = {
        'listening': {
            "question_type": "listening", "kbat_level": "Memahami",
            "illustrative_notes": "",
            "passage": "",
            "question": "API Rate Limit Hit. Please try again in 1 minute.",
            "options": ["A", "B", "C", "D"], "correct_answer": "A",
            "distractor_rationale": {"A": "System error fallback."},
            "audio_url": "https://cdn.kuasaprestij.tech/assets/fallback_beat.mp3",
        },
        'short_answer': {
            "question_type": "short_answer", "kbat_level": "Memahami",
            "illustrative_notes": "",
            "question": "API Rate Limit Hit. Please try again in 1 minute.",
            "sample_answer": "", "key_concepts": [], "marking_rubric": "", "max_marks": 4,
        },
        'step_sort': {
            "question_type": "step_sort", "kbat_level": "Memahami",
            "illustrative_notes": "",
            "question": "API Rate Limit Hit. Please try again in 1 minute.",
            "solution_steps": [], "distractor_steps": [], "final_answer": "",
            "prefilled_step_ids": [], "max_marks": 4,
        },
        'essay': {
            "question_type": "essay", "kbat_level": "Memahami",
            "illustrative_notes": "",
            "question": "API Rate Limit Hit. Please try again in 1 minute.",
            "model_answer": "", "marking_rubric_bands": [], "max_marks": 10, "themes": [],
        },
        'mcq': {
            "question_type": "mcq", "kbat_level": "Memahami",
            "illustrative_notes": "",
            "question": "API Rate Limit Hit. Please try again in 1 minute.",
            "options": ["A", "B", "C", "D"], "correct_answer": "A",
            "distractor_rationale": {"A": "System error fallback."},
        },
    }

    _GEN_SCHEMAS = {
        'mcq': MCQQuestion, 'listening': MCQQuestion,
        'short_answer': ShortAnswerQuestion, 'step_sort': StepSortQuestion,
        'essay': EssayQuestion,
    }

    # Essay/short-answer JSON (stimulus + long model_answer + multi-band rubric) far
    # exceeds the 2048 default and was being TRUNCATED mid-string → "Unterminated
    # string" parse failures → empty draft → the question never loaded. Give the
    # longer question types enough completion budget to finish valid JSON.
    _GEN_MAX_TOKENS = {'essay': 4096, 'short_answer': 3072, 'step_sort': 3072, 'mcq': 2048, 'listening': 2048}

    try:
        res = _llm_call(prompt, response_mime_type="application/json", temperature=0.7,
                        max_output_tokens=_GEN_MAX_TOKENS.get(q_type, 2048))
        # list-unwrap guard + Pydantic validation (TAR §5.1 extension)
        data = parse_llm_json(res.text, _GEN_SCHEMAS.get(q_type, MCQQuestion),
                              f"generator_node:{q_type}")
        # NOTE: TTS for listening passages is generated asynchronously by the API layer
        # so the draft is returned immediately without blocking on audio upload.
        return {"draft": data}
    except Exception as e:
        print(f"-> LLM Error in Generator: {e}")
        return {"draft": fallbacks.get(q_type, fallbacks['mcq'])}

# --- DETERMINISTIC STEP-SORT GRADER (no LLM — see StepSortQuestion) ---
def _lis_ids(ordered_indices):
    """Longest strictly-increasing subsequence over (index, id) pairs.
    Returns the set of ids kept — i.e. the steps the student placed in
    correct relative order. O(n log n) patience sorting with backpointers."""
    if not ordered_indices:
        return set()
    import bisect
    tails, tails_pos, prev = [], [], [-1] * len(ordered_indices)
    for i, (idx, _id) in enumerate(ordered_indices):
        pos = bisect.bisect_left([ordered_indices[p][0] for p in tails_pos], idx)
        if pos == len(tails_pos):
            prev[i] = tails_pos[-1] if tails_pos else -1
            tails_pos.append(i)
        else:
            prev[i] = tails_pos[pos - 1] if pos > 0 else -1
            tails_pos[pos] = i
    kept, k = set(), tails_pos[-1]
    while k != -1:
        kept.add(ordered_indices[k][1])
        k = prev[k]
    return kept


def grade_step_sort(draft: dict, state: dict) -> dict:
    """Grade a drag-and-drop working-order question deterministically.

    Method marks accrue for correct steps placed in correct relative order
    (longest-increasing-subsequence). Picking a distractor scores nothing for
    it and surfaces its authored misconception as the root cause. Prefilled
    (scaffolding) steps are given, so they're excluded from the mark pool."""
    steps = draft.get('solution_steps', []) or []
    distractors = {d.get('id'): d for d in (draft.get('distractor_steps', []) or [])}
    prefilled = set(draft.get('prefilled_step_ids', []) or [])
    lang = state.get('language', 'English')

    canonical = sorted(steps, key=lambda s: s.get('order', 0))
    order_of = {s.get('id'): s.get('order', 0) for s in canonical}
    marks_of = {s.get('id'): int(s.get('marks', 1)) for s in canonical}
    gradable = [s for s in canonical if s.get('id') not in prefilled]
    max_gradable = sum(int(s.get('marks', 1)) for s in gradable) or int(draft.get('max_marks', 4))

    # Student's submitted sequence: prefer explicit list in state, else parse
    # student_answer as a JSON array of chunk ids.
    seq = state.get('sequence')
    if not isinstance(seq, list):
        try:
            seq = json.loads(str(state.get('student_answer', '') or '[]'))
        except (ValueError, TypeError):
            seq = []
    seq = [str(x) for x in seq if isinstance(seq, list)]

    picked_distractors = [distractors[i] for i in seq if i in distractors]
    # Correct, gradable ids the student placed, in submission order → LIS on canonical order.
    placed_correct = [i for i in seq if i in order_of and i not in prefilled]
    awarded_ids = _lis_ids([(order_of[i], i) for i in placed_correct])

    earned = sum(marks_of.get(i, 0) for i in awarded_ids)
    partial = round(earned / max_gradable, 3) if max_gradable else 0.0
    is_correct = partial >= 0.6 and not picked_distractors

    # First canonical step the student did NOT get right → divergence point.
    first_bad = next((s for s in gradable if s.get('id') not in awarded_ids), None)

    def _line(s):
        d, e = s.get('description', ''), s.get('expression', '')
        return f"{d}: {e}" if d and e else (e or d)

    worked = "  ".join(f"{n}) {_line(s)}" for n, s in enumerate(canonical, 1))
    is_bm = str(lang).lower() in ('malay', 'bahasa melayu', 'bm', 'bahasa')

    if is_correct and earned == max_gradable and not picked_distractors:
        student_msg = ("Cemerlang! Susunan kerja anda betul sepenuhnya." if is_bm
                       else "Excellent! Your working is in the correct order from start to finish.")
        error_type = root_cause = intervention = None
    elif picked_distractors:
        d0 = picked_distractors[0]
        error_type = d0.get('error_category', 'Conceptual Gap')
        root_cause = d0.get('misconception', 'Included an incorrect step.')
        intervention = f"Reteach why '{d0.get('expression', '')}' is not a valid step; contrast with the correct method."
        student_msg = (f"Salah satu langkah yang anda pilih tidak sah. Susunan yang betul: {worked}" if is_bm
                       else f"One step you picked isn't valid — {root_cause} Correct order: {worked}")
    else:
        error_type = "Method Sequencing"
        bad_txt = _line(first_bad) if first_bad else ""
        root_cause = f"Working diverged at the step '{bad_txt}' — correct method not sequenced fully."
        intervention = "Drill the canonical solution order for this problem type; emphasise which step must come first."
        student_msg = (f"Anda mendapat {earned}/{max_gradable} markah kaedah. Susunan yang betul: {worked}" if is_bm
                       else f"You earned {earned}/{max_gradable} method marks. Here's the correct order: {worked}")

    teacher_msg = (f"[step_sort {earned}/{max_gradable}] "
                   + (f"Distractor picked: {picked_distractors[0].get('misconception','')}. " if picked_distractors else "")
                   + (root_cause or "Full method sequenced correctly.")
                   + (f" -> Action: {intervention}" if intervention else ""))

    return {
        "is_correct": is_correct,
        "partial_credit": partial,
        "feedback": student_msg,
        "teacher_action_plan": teacher_msg,
        "error_category": error_type,
        "root_cause": root_cause,
        "intervention_plan": intervention,
        "step_breakdown": [
            {"id": s.get('id'), "awarded": marks_of.get(s.get('id'), 0) if s.get('id') in awarded_ids
             else (marks_of.get(s.get('id'), 0) if s.get('id') in prefilled else 0),
             "prefilled": s.get('id') in prefilled}
            for s in canonical
        ],
    }


# --- EVALUATOR NODE ---
def evaluator_node(state: AgentState):
    q_type = state.get('question_type', 'mcq')
    print(f"--- AI TUTOR: EVALUATING {q_type.upper()} IN {state['language'].upper()} ---")

    # M1: guard against missing draft (e.g. after an LLM error in studio_node)
    draft = state.get('draft') or {}
    if not draft:
        return {
            "is_correct": False,
            "partial_credit": 0.0,
            "feedback": "Question data missing — please start a new session.",
            "teacher_action_plan": "Session state lost (rate limit). Regenerate question.",
            "error_category": None,
            "root_cause": "Missing draft",
            "intervention_plan": None,
        }

    # ── Step-sort (drag-and-drop working): deterministic grade, no LLM call ──
    if q_type == 'step_sort':
        return grade_step_sort(draft, state)

    student_ans = str(state.get('student_answer', '')).strip()
    lang = state['language']
    lang_instruction = _lang_config(lang)["instruction"]

    # ── MCQ / Listening: exact string match ──────────────────────────────────
    if q_type in ('mcq', 'listening'):
        correct_ans = str(draft.get('correct_answer', '')).strip().lower()
        is_correct = student_ans.lower() == correct_ans

        if is_correct:
            student_msg = "Spot on! Keep up the momentum!" if lang.lower() == 'english' else "Tepat sekali! Teruskan usaha!"
            teacher_msg = "Student demonstrated mastery." if lang.lower() == 'english' else "Pelajar menunjukkan penguasaan."
            error_type = root_cause = intervention = None
        else:
            rationale_hint = draft.get('distractor_rationale', {}).get(student_ans, "They made a calculation mistake.")
            feedback_prompt = f"""
Question: {draft.get('question')}
Correct Answer: {correct_ans}
Student's Wrong Answer: <student_input>{student_ans}</student_input>
Teacher's Note: {rationale_hint}

CRITICAL INSTRUCTION: {lang_instruction}

Analyze the student's error. Categorize it and provide actionable steps.
Return ONLY a JSON object:
{{
    "student_feedback": "A supportive, 2-sentence explanation to the student focusing on atomic action.",
    "teacher_insight": {{
        "error_category": "Conceptual Gap" OR "Careless Error" OR "Language Barrier",
        "root_cause_analysis": "1 sentence explaining WHY they picked the wrong answer based on the distractor.",
        "actionable_intervention": "A specific 1-sentence instruction for the teacher."
    }}
}}
"""
            try:
                res = _llm_call(feedback_prompt, role="light", response_mime_type="application/json")
                feedback_data = parse_llm_json(res.text, MCQFeedback, "evaluator_node:mcq_feedback")
                student_msg = feedback_data.get("student_feedback", "Check your calculations.")
                ti = feedback_data.get("teacher_insight", {})
                error_type = ti.get("error_category", "Unknown")
                root_cause = ti.get("root_cause_analysis", "Review required.")
                intervention = ti.get("actionable_intervention", "Check student understanding.")
                teacher_msg = f"[{error_type}] {root_cause} -> Action: {intervention}"
            except Exception as e:
                print(f"-> LLM Error in Evaluator (MCQ): {e}")
                student_msg = "Check your calculations!"
                teacher_msg = "Review this question."
                error_type = root_cause = "Parsing Error"
                intervention = "Review logs manually"

        return {
            "is_correct": is_correct,
            "partial_credit": 1.0 if is_correct else 0.0,
            "feedback": student_msg,
            "teacher_action_plan": teacher_msg,
            "error_category": error_type,
            "root_cause": root_cause,
            "intervention_plan": intervention,
        }

    # ── Short Answer: AI rubric evaluation ───────────────────────────────────
    if q_type == 'short_answer':
        eval_prompt = f"""
You are a KSSM exam marker. Evaluate this student's short answer.

Question: {draft.get('question')}
Sample Answer: {draft.get('sample_answer')}
Key Concepts Required: {json.dumps(draft.get('key_concepts', []))}
Marking Rubric: {draft.get('marking_rubric')}
Max Marks: {draft.get('max_marks', 4)}

Student's Answer: <student_input>{student_ans}</student_input>

CRITICAL INSTRUCTION: {lang_instruction}

Return ONLY a JSON object:
{{
    "marks_awarded": <integer 0 to max_marks>,
    "partial_credit": <float 0.0 to 1.0>,
    "student_feedback": "2-sentence supportive feedback highlighting what was right and what to improve.",
    "concepts_addressed": ["list of key concepts the student mentioned"],
    "concepts_missing": ["list of key concepts the student missed"],
    "teacher_insight": {{
        "error_category": "Conceptual Gap" OR "Incomplete Answer" OR "Language Barrier",
        "root_cause_analysis": "1 sentence",
        "actionable_intervention": "1 sentence for the teacher"
    }}
}}
"""
        try:
            res = _llm_call(eval_prompt, response_mime_type="application/json")
            eval_data = parse_llm_json(res.text, OpenAnswerEval, "evaluator_node:short_answer")
            partial = float(eval_data.get("partial_credit", 0.0))
            marks = int(eval_data.get("marks_awarded", 0))
            is_correct = partial >= 0.6
            student_msg = eval_data.get("student_feedback", "Good attempt. Review the key concepts.")
            ti = eval_data.get("teacher_insight", {})
            error_type = ti.get("error_category", "Incomplete Answer")
            root_cause = ti.get("root_cause_analysis", "")
            intervention = ti.get("actionable_intervention", "")
            teacher_msg = f"[{error_type}] {marks}/{draft.get('max_marks', 4)} marks. {root_cause} -> Action: {intervention}"
        except Exception as e:
            print(f"-> LLM Error in Evaluator (short_answer): {e}")
            partial, marks, is_correct = 0.0, 0, False
            student_msg = "Could not evaluate. Please try again."
            teacher_msg = error_type = root_cause = intervention = "Evaluation error"

        return {
            "is_correct": is_correct,
            "partial_credit": partial,
            "feedback": student_msg,
            "teacher_action_plan": teacher_msg,
            "error_category": error_type,
            "root_cause": root_cause,
            "intervention_plan": intervention,
        }

    # ── Essay: AI band-rubric evaluation ─────────────────────────────────────
    _comp = _language_composition_spec(state.get('subject', ''), state.get('topic', ''), state.get('question_type'))
    if _comp:
        # Language composition — weight bahasa (mechanics) as heavily as isi (content),
        # and give writing-specific feedback (genre, register, paragraphing, cohesion).
        bands_str = json.dumps(draft.get('marking_rubric_bands', _comp['bands']), ensure_ascii=False)
        band_labels = " OR ".join(f'"{b["band"]}"' for b in _comp['bands'])
        eval_prompt = f"""
You are an SPM language-paper marker evaluating a written composition ({_comp['paper']}).
Weight the marks across THREE equal dimensions: ISI/CONTENT (relevance and development of ideas),
BAHASA/LANGUAGE (grammar, spelling, vocabulary range, sentence variety), and PENGOLAHAN/ORGANISATION
(structure, paragraphing, cohesion, genre conventions and register). Penalise responses far below the
required length ({_comp['min_length']}).

Task: {draft.get('question')}
Model Composition: {draft.get('model_answer')}
Marking Rubric Bands: {bands_str}
Max Marks: {draft.get('max_marks', _comp['max_marks'])}

Student's Composition: <student_input>{student_ans}</student_input>

CRITICAL INSTRUCTION: {lang_instruction}

Return ONLY a JSON object:
{{
    "marks_awarded": <integer 0 to max_marks>,
    "partial_credit": <float 0.0 to 1.0>,
    "band_awarded": {band_labels},
    "student_feedback": "3-sentence feedback covering BOTH content and language — cite one concrete grammar/vocabulary/structure fix.",
    "strengths": ["what the student did well (content and/or language)"],
    "improvements": ["specific writing improvements: e.g. paragraphing, register, tense accuracy, cohesion"],
    "model_structure": "A worked outline showing how this composition SHOULD be built, in the student's answer language. Use labelled sections with a newline between each — e.g. 'Introduction: ...\\nBody 1: ...\\nBody 2: ...\\nConclusion: ...' — and under each label give one concrete sentence the student could actually write for THIS task. Match the genre and register ({_comp['paper']}).",
    "teacher_insight": {{
        "error_category": "Content Weakness" OR "Language Accuracy" OR "Organisation/Register" OR "Below Length Requirement",
        "root_cause_analysis": "1 sentence",
        "actionable_intervention": "1 sentence for the teacher"
    }}
}}
"""
    else:
        eval_prompt = f"""
You are a KSSM exam marker evaluating an essay response.

Question: {draft.get('question')}
Model Answer: {draft.get('model_answer')}
Marking Rubric Bands: {json.dumps(draft.get('marking_rubric_bands', []))}
Max Marks: {draft.get('max_marks', 10)}

Student's Answer: <student_input>{student_ans}</student_input>

CRITICAL INSTRUCTION: {lang_instruction}

Return ONLY a JSON object:
{{
    "marks_awarded": <integer 0 to max_marks>,
    "partial_credit": <float 0.0 to 1.0>,
    "band_awarded": "A" OR "B" OR "C",
    "student_feedback": "3-sentence constructive feedback with specific strengths and improvement areas.",
    "strengths": ["what the student did well"],
    "improvements": ["specific areas to improve"],
    "model_structure": "A worked outline showing how this essay SHOULD be structured, in the student's answer language. Use labelled sections with a newline between each — 'Introduction: ...\\nBody 1: ...\\nBody 2: ...\\nConclusion: ...' — and under each label give one concrete sentence the student could actually write for THIS question, grounded in the model answer.",
    "teacher_insight": {{
        "error_category": "Conceptual Gap" OR "Structural Issue" OR "Language Barrier" OR "Insufficient Depth",
        "root_cause_analysis": "1 sentence",
        "actionable_intervention": "1 sentence for the teacher"
    }}
}}
"""
    essay_detail: dict = {}
    eval_failed = False
    try:
        # Essay marking produces long JSON — short feedback PLUS a full model answer
        # and a "how it should look" outline. Give it headroom (4096) so the model
        # structure never truncates mid-sentence, and never fabricate a grade on
        # timeout: the provider chain fails over rather than returning a partial mark.
        res = _llm_call(eval_prompt, response_mime_type="application/json",
                        max_output_tokens=4096)
        eval_data = parse_llm_json(res.text, EssayEval, "evaluator_node:essay")
        # Never fabricate a grade from an unparseable response. When marking JSON
        # is fenced/truncated/malformed, parse_llm_json returns an empty dict —
        # accepting it silently emits a bogus 0/30 with no feedback. Retry once,
        # then fail loudly so the except-branch surfaces a retry, not a fake mark.
        if not eval_data.get("student_feedback") and not eval_data.get("marks_awarded"):
            res = _llm_call(eval_prompt, response_mime_type="application/json",
                            max_output_tokens=4096)
            eval_data = parse_llm_json(res.text, EssayEval, "evaluator_node:essay:retry")
            if not eval_data.get("student_feedback") and not eval_data.get("marks_awarded"):
                raise ValueError("essay marking returned unparseable JSON after retry")
        partial = float(eval_data.get("partial_credit", 0.0))
        marks = int(eval_data.get("marks_awarded", 0))
        is_correct = partial >= 0.6
        student_msg = eval_data.get("student_feedback", "Good attempt. Review the model answer.")
        ti = eval_data.get("teacher_insight", {})
        error_type = ti.get("error_category", "Insufficient Depth")
        root_cause = ti.get("root_cause_analysis", "")
        intervention = ti.get("actionable_intervention", "")
        band = eval_data.get("band_awarded", "C")
        teacher_msg = f"[{error_type}] Band {band} — {marks}/{draft.get('max_marks', 10)} marks. {root_cause} -> Action: {intervention}"
        # Surface the full model answer + outline so the student sees the FORMAT to
        # aim for, not just a one-line critique. model_answer comes from the question
        # draft; model_structure is the marker's worked outline for this task.
        essay_detail = {
            "band": band,
            "strengths": eval_data.get("strengths", []),
            "improvements": eval_data.get("improvements", []),
            "model_answer": draft.get("model_answer", ""),
            "model_structure": eval_data.get("model_structure", ""),
        }
    except Exception as e:
        print(f"-> LLM Error in Evaluator (essay): {e}")
        partial, marks, is_correct = 0.0, 0, False
        student_msg = "Could not evaluate. Please try again."
        teacher_msg = error_type = root_cause = intervention = "Evaluation error"
        # Signal a genuine marking failure (not a low mark) so the endpoint can
        # ask the student to resubmit WITHOUT recording a wrong answer or a
        # mastery penalty — a system error must never cost the student a grade.
        eval_failed = True

    return {
        "is_correct": is_correct,
        "partial_credit": partial,
        "feedback": student_msg,
        "teacher_action_plan": teacher_msg,
        "error_category": error_type,
        "root_cause": root_cause,
        "intervention_plan": intervention,
        "essay_detail": essay_detail,
        "eval_failed": eval_failed,
    }

# --- MASTERY UPDATER NODE (The Progression Loop) ---
def mastery_updater_node(state: AgentState):
    print("--- UPDATING MASTERY & CHECKING STREAK ---")
    draft = state.get('draft', {}) 
    
    q_type = state.get('question_type', 'mcq')
    partial = state.get('partial_credit', 1.0 if state['is_correct'] else 0.0)
    if q_type == 'mcq':
        adjustment = 0.1 if state['is_correct'] else -0.05
    else:
        # Scale positive reward by how much of the question the student got right
        adjustment = (0.1 * partial) if state['is_correct'] else -0.05
    next_review = datetime.now() + timedelta(days=3 if state['is_correct'] else 1)

    # dskp_mastery.student_id / event_logs.student_id FK now reference profiles(id)
    # (see schema/fk_repoint_to_profiles.sql, applied 2026-07-10) — no students-row
    # ensure needed; every real user already has a profile.

    # Atomic increment via stored function — avoids TOCTOU race under concurrent submits
    rpc_res = supabase.rpc("increment_mastery", {
        "p_student_id": state['student_id'],
        "p_topic": state['topic'],
        "p_subject": state['subject'],
        "p_delta": adjustment,
        "p_last_assessed_at": datetime.now().isoformat(),
        "p_next_review_at": next_review.isoformat(),
    }).execute()
    new_mastery = rpc_res.data if rpc_res.data is not None else max(0.0, min(1.0, adjustment))

    # Always record the marker's action plan (band + marks + intervention) so the
    # teacher sees essay feedback even on a PASS — not just "Mastery demonstrated".
    log_text = state.get('teacher_action_plan') or ("Mastery demonstrated." if state['is_correct'] else "Needs review.")
    
    supabase.table("event_logs").insert({
        "student_id": state['student_id'],
        "subject": state.get('subject', ''),
        "topic": state['topic'],
        "kbat_level": draft.get('kbat_level', 'Unknown'),
        "is_correct": state['is_correct'],
        "diagnostic_tag": log_text,
        "error_category": state.get('error_category', 'None'),
        "root_cause": state.get('root_cause', ''),
        "intervention": state.get('intervention_plan', '')
    }).execute()

    today_start = datetime.now().replace(hour=0, minute=0, second=0).isoformat()
    streak_res = supabase.table("event_logs").select("id", count="exact")\
        .eq("student_id", state['student_id'])\
        .eq("topic", state['topic'])\
        .gte("created_at", today_start).execute()
    
    questions_done_today = streak_res.count if streak_res.count else 0
    print(f"-> Topic progress today: {questions_done_today}/10")

    if questions_done_today >= 10 or new_mastery >= 0.9:
        topic_complete = True
        next_topic = CURRICULUM_MAP.get(state['topic'], state['topic'])
    else:
        topic_complete = False
        next_topic = state['topic']

    return {
        "mastery_score": new_mastery, 
        "topic_complete": topic_complete,
        "next_topic": next_topic
    }

# --- BUILD THE GRAPH ---
builder = StateGraph(AgentState)
builder.add_node("retriever", retriever_node)
builder.add_node("studio", studio_node) 
builder.add_node("generator", generator_node)
builder.add_node("evaluator", evaluator_node)
builder.add_node("updater", mastery_updater_node)

builder.set_entry_point("retriever")
kuasa_engine = builder.compile()