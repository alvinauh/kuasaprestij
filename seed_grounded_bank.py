#!/usr/bin/env python3
"""
Regenerate Q1 (anchor) and Q2-Q3 (question_bank) for every topic_anchor row,
grounded in real DSKP syllabus text from the syllabus_embeddings table.

Does NOT call Gemini. Uses:
  - Supabase text search  → pulls actual DSKP chunks for grounding context
  - Claude CLI subprocess → generates questions from that context
  - Google Cloud TTS      → new voiceover for the anchor
  - Pexels API            → reuses existing video_broll where available

Usage:
    python3 seed_grounded_bank.py --dry-run          # preview plan, no writes
    python3 seed_grounded_bank.py                    # regenerate missing bank only
    python3 seed_grounded_bank.py --force            # overwrite everything
    python3 seed_grounded_bank.py --anchor-only      # only Q1 anchor
    python3 seed_grounded_bank.py --bank-only        # only Q2-Q3 bank
    python3 seed_grounded_bank.py --subject Physics
    python3 seed_grounded_bank.py --topic "Force"
    python3 seed_grounded_bank.py --lang "Bahasa Melayu"
    python3 seed_grounded_bank.py --delay 3          # seconds between calls (default 2)
    python3 seed_grounded_bank.py --bank-size 5      # questions per bank (default 3)
"""

import argparse
import sys
import time
import os
import json
import uuid
import subprocess
import requests
import re

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dotenv import load_dotenv
load_dotenv(override=True)

from supabase import create_client, Client
from google.cloud import texttospeech
from agents.orchestrator import (
    KSSM_TOPICS, KSSM_TOPICS_BY_FORM, _build_h5p_content,
    _pick_h5p_game_type, _build_h5p_drag_plus_mcq,
)

LANGUAGES  = ["English", "Bahasa Melayu"]
supabase: Client = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))

# Map KSSM_TOPICS subject names → subject values stored in syllabus_embeddings metadata.
# Subjects not listed here have no DSKP chunks and will use generic KSSM framing.
SUBJECT_DB_MAP: dict[str, list[str]] = {
    "Bahasa Melayu":         ["Bahasa Melayu"],
    "Sejarah":               ["Sejarah"],
    "Geografi":              ["Geografi"],
    "Mathematics":           ["Mathematics"],
    "Additional Mathematics":["Mathematics", "Additional Mathematics"],
    "Science":               ["Science"],
    "Biology":               ["Biology", "Science"],
    "Chemistry":             ["Chemistry", "Science"],
    "Physics":               ["Physics", "Science"],
    "Bahasa Cina":           ["Bahasa Cina"],
    "Bahasa Inggeris":       ["English", "Bahasa Inggeris"],
    "Pendidikan Moral":      ["Pendidikan Moral"],
    "Pendidikan Islam":      ["Pendidikan Islam"],
    "Prinsip Perakaunan":    ["Prinsip Perakaunan", "Accounting"],
}


# ──────────────────────────────────────────────
# DSKP context retrieval (no Gemini, no embeddings)
# ──────────────────────────────────────────────

def _keywords(topic: str) -> list[str]:
    """Extract meaningful search keywords from a topic name."""
    stop = {"dan", "and", "atau", "or", "the", "of", "in", "for", "di", "ke",
            "pada", "dari", "yang", "ini", "itu", "dengan"}
    words = re.split(r"[\s/,&:]+", topic)
    return [w for w in words if len(w) > 3 and w.lower() not in stop]


def fetch_dskp_context(subject: str, topic: str, max_chunks: int = 5) -> tuple[str, str]:
    """
    Return (context_text, grounding_source).
    grounding_source is 'dskp_topic_match' | 'dskp_subject_only' | 'generic_fallback'.
    """
    db_subjects = SUBJECT_DB_MAP.get(subject, [])
    keywords    = _keywords(topic)

    # ── Strategy 1: subject filter + topic keyword search ──────────────────
    for db_subj in db_subjects:
        for kw in keywords:
            try:
                res = (
                    supabase.table("syllabus_embeddings")
                    .select("content")
                    .filter("metadata->>subject", "eq", db_subj)
                    .ilike("content", f"%{kw}%")
                    .limit(max_chunks)
                    .execute()
                )
                if res.data and len(res.data) >= 2:
                    chunks = [r["content"] for r in res.data]
                    return "\n\n---\n\n".join(chunks), "dskp_topic_match"
            except Exception:
                pass

    # ── Strategy 2: any chunks for this subject ────────────────────────────
    for db_subj in db_subjects:
        try:
            res = (
                supabase.table("syllabus_embeddings")
                .select("content")
                .filter("metadata->>subject", "eq", db_subj)
                .limit(max_chunks)
                .execute()
            )
            if res.data:
                chunks = [r["content"] for r in res.data]
                return "\n\n---\n\n".join(chunks), "dskp_subject_only"
        except Exception:
            pass

    # ── Strategy 3: keyword search across all subjects ─────────────────────
    for kw in keywords:
        try:
            res = (
                supabase.table("syllabus_embeddings")
                .select("content")
                .ilike("content", f"%{kw}%")
                .limit(max_chunks)
                .execute()
            )
            if res.data and len(res.data) >= 2:
                chunks = [r["content"] for r in res.data]
                return "\n\n---\n\n".join(chunks), "dskp_keyword_fallback"
        except Exception:
            pass

    return (
        f"KSSM {subject} curriculum, topic: {topic}. "
        f"Generate content aligned with the Malaysian secondary school syllabus.",
        "generic_fallback",
    )


# ──────────────────────────────────────────────
# Claude CLI
# ──────────────────────────────────────────────

def call_claude(prompt: str, retries: int = 3) -> dict:
    for attempt in range(retries):
        try:
            result = subprocess.run(
                ["claude", "-p", "--output-format", "text"],
                input=prompt,
                capture_output=True,
                text=True,
                timeout=180,
            )
            text = result.stdout.strip()
            if not text:
                raise ValueError(f"Empty stdout (stderr: {result.stderr.strip()[:200]!r})")
            if "```" in text:
                parts = text.split("```")
                text = parts[1] if len(parts) > 1 else parts[0]
                if text.startswith("json"):
                    text = text[4:]
            return json.loads(text.strip())
        except (json.JSONDecodeError, ValueError, subprocess.TimeoutExpired) as e:
            if attempt < retries - 1:
                wait = 20 * (attempt + 1)
                print(f"  -> Retry {attempt+1}/{retries} in {wait}s: {e}")
                time.sleep(wait)
            else:
                raise


# ──────────────────────────────────────────────
# TTS + B-Roll
# ──────────────────────────────────────────────

def _tts(text: str, label: str, language: str) -> str:
    fallback = "https://cdn.kuasaprestij.tech/assets/fallback_beat.mp3"
    lang_lower = language.lower()
    if any(k in lang_lower for k in ("malay", "melayu", "bahasa melayu")):
        lang_code, voice = "ms-MY", "ms-MY-Wavenet-B"
    elif any(k in lang_lower for k in ("cina", "mandarin", "chinese")):
        lang_code, voice = "cmn-CN", "cmn-CN-Wavenet-A"
    else:
        lang_code, voice = "en-US", "en-US-Wavenet-D"
    try:
        cred = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        tts_client = texttospeech.TextToSpeechClient.from_service_account_file(cred)
        resp = tts_client.synthesize_speech(
            input=texttospeech.SynthesisInput(text=text),
            voice=texttospeech.VoiceSelectionParams(language_code=lang_code, name=voice),
            audio_config=texttospeech.AudioConfig(
                audio_encoding=texttospeech.AudioEncoding.MP3, speaking_rate=1.1
            ),
        )
        fname = f"{label.replace(' ','_')[:40]}_{uuid.uuid4().hex[:6]}.mp3"
        supabase.storage.from_("media_bucket").upload(fname, resp.audio_content, {"content-type": "audio/mpeg"})
        return supabase.storage.from_("media_bucket").get_public_url(fname)
    except Exception as e:
        print(f"  TTS failed: {e}")
        return fallback


def _broll(query: str) -> str:
    fallback = "https://cdn.kuasaprestij.tech/assets/fallback_video.mp4"
    try:
        url = (f"https://api.pexels.com/videos/search"
               f"?query={requests.utils.quote(query)}&orientation=portrait&size=small&per_page=1")
        data = requests.get(url, headers={"Authorization": os.getenv("PEXELS_API_KEY")}, timeout=10).json()
        if data.get("videos"):
            files = data["videos"][0]["video_files"]
            chosen = next((f for f in files if f.get("quality") == "sd"), files[0])
            return chosen["link"]
    except Exception as e:
        print(f"  Pexels failed: {e}")
    return fallback


# ──────────────────────────────────────────────
# Prompt builders
# ──────────────────────────────────────────────

def _lang_style(lang: str) -> str:
    l = lang.lower()
    if any(k in l for k in ("malay", "melayu")):
        return "Write entirely in Bahasa Melayu. You may borrow English science/math terms where natural."
    if any(k in l for k in ("cina", "mandarin", "chinese")):
        return "Write entirely in Simplified Mandarin Chinese (普通话). All text in Chinese characters."
    return ("Mix Bahasa Melayu and English naturally in the rap. "
            "All question text in English. Modern, catchy TikTok educational style.")


def _anchor_prompt(subject: str, topic: str, lang: str, context: str) -> str:
    lang_style = _lang_style(lang)
    game_type  = _pick_h5p_game_type(subject, topic)

    drag_task = ""
    if game_type == "drag_words":
        drag_task = f"""
TASK 4 (Drag Game — language topic): Write a 1-2 sentence fill-in-the-blank exercise grounded in the DSKP excerpt above.
Mark exactly 2-4 key terms with *asterisks* (e.g. "Fotosintesis berlaku di dalam *kloroplas* yang mengandungi *klorofil*.").
Provide 2 distractor words. Write in {lang}.
Add to JSON:
  "drag_sentence": "sentence with *key terms* wrapped"
  "drag_distractors": ["wrong1", "wrong2"]
"""

    return f"""You are a KSSM Malaysian secondary school curriculum expert creating content for Form 4 and Form 5 students.

DSKP SYLLABUS EXCERPT (use this as your grounding source):
\"\"\"
{context}
\"\"\"

Subject: {subject}
Topic: {topic}
Output language: {lang}

TASK 1: Write a short, highly rhythmic 4-line spoken-word rap grounded in the DSKP excerpt above.
Style: {lang_style}

TASK 2: Create ONE diagnostic MCQ grounded in the DSKP excerpt. All text in {lang}.

TASK 3: Provide a 2-3 word English search query for background B-Roll footage.
{drag_task}
Reply with ONLY a valid JSON object — no markdown, no code fences, no explanation:
{{
    "mnemonic_lyrics": "4-line rap here",
    "b_roll_search_query": "2-3 word english term",
    "anchor_question": {{
        "kbat_level": "Memahami|Mengaplikasi|Menganalisis",
        "illustrative_notes": "2-3 sentences in {lang} — prerequisite knowledge only, do NOT reveal the answer",
        "question": "MCQ question text in {lang}",
        "options": ["A", "B", "C", "D"],
        "correct_answer": "exact string matching one option",
        "distractor_rationale": {{
            "wrong option text": "2-sentence explanation in {lang} of the misconception"
        }}
    }}
}}"""


def _bank_prompt(subject: str, topic: str, lang: str, context: str,
                 count: int, existing_questions: list[str]) -> str:
    avoid = "\n".join(f"  - {q}" for q in existing_questions) if existing_questions else "  (none)"
    return f"""You are a KSSM Malaysian secondary school curriculum expert creating content for Form 4 and Form 5 students.

DSKP SYLLABUS EXCERPT (use this as your grounding source):
\"\"\"
{context}
\"\"\"

Subject: {subject}
Topic: {topic}
Output language: {lang}

Generate exactly {count} UNIQUE MCQ questions grounded in the DSKP excerpt above.
Do NOT repeat these existing questions:
{avoid}

Each question must:
- Be in {lang}
- Test a DIFFERENT aspect of the topic than the others
- Have 4 options with exactly one correct answer
- Include illustrative_notes (2-3 sentences of prerequisite knowledge — do NOT reveal the answer)
- Include distractor_rationale for each wrong option

Reply with ONLY a valid JSON array — no markdown, no code fences:
[
  {{
    "kbat_level": "Memahami|Mengaplikasi|Menganalisis",
    "question_type": "mcq",
    "illustrative_notes": "...",
    "question": "...",
    "options": ["A", "B", "C", "D"],
    "correct_answer": "exact string",
    "distractor_rationale": {{"wrong option": "2-sentence explanation"}}
  }}
]"""


# ──────────────────────────────────────────────
# Main generation logic
# ──────────────────────────────────────────────

def load_existing_rows() -> dict[tuple[str, str, int], dict]:
    """Return {(topic, language, form_level): row} for all existing topic_anchors."""
    res = supabase.table("topic_anchors").select(
        "id, topic, language, form_level, subject, anchor_question, question_bank, audio_url, video_broll, mnemonic_lyrics"
    ).execute()
    return {(r["topic"], r.get("language","English"), r.get("form_level", 4)): r for r in (res.data or [])}


def seed_anchor(subject: str, topic: str, lang: str, form_level: int,
                context: str, grounding: str,
                existing_row: dict | None, dry_run: bool) -> bool:
    print(f"  [ANCHOR] grounding={grounding}")
    if dry_run:
        print(f"  [DRY] would generate anchor for {topic} ({lang})")
        return True

    prompt = _anchor_prompt(subject, topic, lang, context)
    try:
        data = call_claude(prompt)
    except Exception as e:
        print(f"  ✗ Claude error: {e}")
        return False

    aq = data.get("anchor_question")
    if not aq or not aq.get("question"):
        print("  ✗ Missing anchor_question in response")
        return False

    lyrics    = data.get("mnemonic_lyrics", "")
    video_url = (existing_row or {}).get("video_broll") or _broll(data.get("b_roll_search_query", f"{topic} education"))
    audio_url = _tts(lyrics, topic, lang)

    game_type = _pick_h5p_game_type(subject, topic)
    drag_sentence   = data.get("drag_sentence", "").strip()
    drag_distractors = data.get("drag_distractors", [])

    if game_type == "drag_words" and drag_sentence and aq.get("options"):
        h5p = _build_h5p_drag_plus_mcq(
            video_url=video_url, audio_url=audio_url,
            drag_sentence=drag_sentence, drag_distractors=drag_distractors,
            question_text=aq.get("question", ""), options=aq.get("options", []),
        )
    else:
        h5p = _build_h5p_content(
            video_url=video_url, audio_url=audio_url,
            question_text=aq.get("question", ""), options=aq.get("options", []),
        )

    supabase.table("topic_anchors").upsert({
        "subject": subject, "topic": topic, "language": lang, "form_level": form_level,
        "mnemonic_lyrics": lyrics,
        "anchor_question": aq,
        "audio_url": audio_url,
        "video_broll": video_url,
        "h5p_content": h5p,
    }, on_conflict="topic,language,form_level").execute()

    print(f"  ✓ anchor saved (grounded: {grounding})")
    return True


def seed_bank(subject: str, topic: str, lang: str, form_level: int,
              context: str, grounding: str,
              existing_row: dict | None, bank_size: int, dry_run: bool) -> bool:
    existing_bank = (existing_row or {}).get("question_bank") or []
    existing_qs   = [q.get("question","") for q in existing_bank]
    existing_anchor_q = ((existing_row or {}).get("anchor_question") or {}).get("question","")
    avoid = ([existing_anchor_q] if existing_anchor_q else []) + existing_qs

    print(f"  [BANK]   grounding={grounding}, need={bank_size} questions")
    if dry_run:
        print(f"  [DRY] would generate {bank_size} bank questions for {topic} ({lang})")
        return True

    prompt = _bank_prompt(subject, topic, lang, context, bank_size, avoid)
    try:
        data = call_claude(prompt)
    except Exception as e:
        print(f"  ✗ Claude error: {e}")
        return False

    if isinstance(data, dict):
        data = [data]
    if not isinstance(data, list) or not data:
        print("  ✗ Expected JSON array from Claude")
        return False

    # Merge with existing, keep up to bank_size, deduplicate by question text
    seen = {q.get("question","") for q in existing_bank}
    new_qs = []
    for q in data:
        if q.get("question") and q["question"] not in seen:
            q.setdefault("question_type", "mcq")
            new_qs.append(q)
            seen.add(q["question"])

    merged = (existing_bank + new_qs)[-bank_size:]

    row_id = (existing_row or {}).get("id")
    if row_id:
        supabase.table("topic_anchors").update({"question_bank": merged}).eq("id", row_id).execute()
    else:
        supabase.table("topic_anchors").upsert({
            "subject": subject, "topic": topic, "language": lang, "form_level": form_level,
            "question_bank": merged,
        }, on_conflict="topic,language,form_level").execute()

    print(f"  ✓ bank saved ({len(merged)} questions, grounded: {grounding})")
    return True


# ──────────────────────────────────────────────
# Entry point
# ──────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Regenerate Q1/Q2-Q3 grounded in DSKP — no Gemini.")
    parser.add_argument("--dry-run",     action="store_true", help="Preview plan, no writes.")
    parser.add_argument("--force",       action="store_true", help="Overwrite all existing questions.")
    parser.add_argument("--anchor-only", action="store_true", help="Only regenerate Q1 anchor.")
    parser.add_argument("--bank-only",   action="store_true", help="Only regenerate Q2-Q3 bank.")
    parser.add_argument("--subject",     default=None, help="Seed one subject only.")
    parser.add_argument("--topic",       default=None, help="Seed one topic only (substring match).")
    parser.add_argument("--lang",        default=None, help="Seed one language only.")
    parser.add_argument("--delay",       type=float, default=2.0, help="Seconds between calls.")
    parser.add_argument("--bank-size",   type=int,   default=3,   help="Questions per bank (default 3).")
    args = parser.parse_args()

    do_anchor = not args.bank_only
    do_bank   = not args.anchor_only

    langs = [args.lang] if args.lang else LANGUAGES

    if args.subject:
        if args.subject not in KSSM_TOPICS:
            print(f"Unknown subject '{args.subject}'. Known: {', '.join(sorted(KSSM_TOPICS))}")
            sys.exit(1)

    print("Loading existing topic_anchors...")
    existing = load_existing_rows()
    print(f"  {len(existing)} existing rows loaded.\n")

    # Build work list — iterate by form so form_level is known for each topic
    work = []
    for form_level, form_topics in KSSM_TOPICS_BY_FORM.items():
        for subj, topics in form_topics.items():
            if args.subject and args.subject != subj:
                continue
            for topic in topics:
                if args.topic and args.topic.lower() not in topic.lower():
                    continue
                for lang in langs:
                    key = (topic, lang, form_level)
                    row = existing.get(key)
                    needs_anchor = do_anchor and (args.force or not (row and row.get("anchor_question") and row.get("audio_url")))
                    needs_bank   = do_bank   and (args.force or not (row and row.get("question_bank") and len(row.get("question_bank") or []) >= args.bank_size))
                    if needs_anchor or needs_bank:
                        work.append((subj, topic, lang, form_level, needs_anchor, needs_bank))

    total = len(work)
    print(f"Plan: {total} topic/language pairs to process.\n")
    if not total:
        print("Nothing to do — all entries already meet the criteria. Use --force to overwrite.")
        return

    ok = fail = 0
    grounding_stats: dict[str, int] = {}

    for i, (subj, topic, lang, form_level, needs_anchor, needs_bank) in enumerate(work, 1):
        label = f"[{i}/{total}] {subj} F{form_level} — {topic} ({lang})"
        print(label)

        context, grounding = fetch_dskp_context(subj, topic)
        grounding_stats[grounding] = grounding_stats.get(grounding, 0) + 1

        row = existing.get((topic, lang, form_level))
        success = True

        if needs_anchor:
            success = seed_anchor(subj, topic, lang, form_level, context, grounding, row, args.dry_run) and success
            if not args.dry_run and success:
                time.sleep(args.delay)

        if needs_bank and success:
            success = seed_bank(subj, topic, lang, form_level, context, grounding, row, args.bank_size, args.dry_run) and success
            if not args.dry_run:
                time.sleep(args.delay)

        if success:
            ok += 1
        else:
            fail += 1

        if i < total:
            time.sleep(args.delay)

    print(f"\n{'='*50}")
    print(f"Finished. {ok} succeeded, {fail} failed.")
    print(f"\nGrounding sources used:")
    for src, count in sorted(grounding_stats.items(), key=lambda x: -x[1]):
        marker = "✓ DSKP" if "dskp" in src else "⚠ fallback"
        print(f"  {marker}  {src}: {count}")
    if grounding_stats.get("generic_fallback", 0) > 0:
        print("\n⚠  Some topics had no DSKP content in the DB.")
        print("   Run 'python ingest.py' with the Physics/Chemistry/Biology PDF syllabi")
        print("   then re-run this script with --force to upgrade those questions.")


if __name__ == "__main__":
    main()
