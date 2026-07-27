#!/usr/bin/env python3
"""
Anchor pre-seeder using the local Claude Code CLI — no external API keys needed.
Picks up from where seed_anchors.py left off (skips already-cached topics).

Usage:
    python3 seed_anchors_claude.py                    # seed everything missing
    python3 seed_anchors_claude.py --dry-run          # print plan only
    python3 seed_anchors_claude.py --delay 2          # pacing between calls
    python3 seed_anchors_claude.py --subject Physics  # one subject only
    python3 seed_anchors_claude.py --lang English     # one language only
"""

import argparse
import sys
import time
import os
import json
import uuid
import subprocess
import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dotenv import load_dotenv
load_dotenv(override=True)

from supabase import create_client, Client
from google.cloud import texttospeech
from agents.orchestrator import KSSM_TOPICS, _build_h5p_content

LANGUAGES = ["English", "Bahasa Melayu"]
supabase: Client = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))


def fetch_cached_pairs():
    """A row counts as cached only if it has both anchor_question AND audio_url.
    Rows that only have question_bank (but no anchor) are treated as missing."""
    res = supabase.table("topic_anchors").select("topic, language, anchor_question, audio_url").execute()
    return {
        (row["topic"], row.get("language", "English"))
        for row in (res.data or [])
        if row.get("anchor_question") and row.get("audio_url")
    }


def call_claude(prompt: str, retries: int = 3) -> dict:
    """Invoke the local claude CLI and parse JSON from its output."""
    for attempt in range(retries):
        try:
            result = subprocess.run(
                ["claude", "-p", "--output-format", "text"],
                input=prompt,
                capture_output=True,
                text=True,
                timeout=120,
            )
            text = result.stdout.strip()
            if not text:
                stderr_snippet = result.stderr.strip()[:300]
                # Likely a session rate-limit; back off longer on successive attempts
                wait = 15 * (attempt + 1)
                raise ValueError(
                    f"Empty stdout (stderr: {stderr_snippet!r}). "
                    f"Waiting {wait}s before retry..."
                )
            # Strip markdown code fences if present
            if "```" in text:
                parts = text.split("```")
                text = parts[1] if len(parts) > 1 else parts[0]
                if text.startswith("json"):
                    text = text[4:]
            json_text = text.strip()
            if not json_text:
                raise ValueError("Code-fence wrapper was empty.")
            return json.loads(json_text)
        except (json.JSONDecodeError, ValueError, subprocess.TimeoutExpired) as e:
            if attempt < retries - 1:
                wait = 15 * (attempt + 1)
                print(f"  -> Retry {attempt + 1}/{retries} (wait {wait}s): {e}")
                time.sleep(wait)
            else:
                raise


def fetch_broll(search_query: str) -> str:
    fallback = "https://cdn.kuasaprestij.tech/assets/fallback_video.mp4"
    try:
        url = (
            f"https://api.pexels.com/videos/search"
            f"?query={requests.utils.quote(search_query)}&orientation=portrait&size=small&per_page=1"
        )
        pex_res = requests.get(
            url, headers={"Authorization": os.getenv("PEXELS_API_KEY")}, timeout=10
        ).json()
        if pex_res.get("videos"):
            files = pex_res["videos"][0]["video_files"]
            chosen = next((f for f in files if f["quality"] == "sd"), files[0])
            print(f"-> B-Roll Found ({chosen.get('quality', '?')}): {chosen['link']}")
            return chosen["link"]
    except Exception as e:
        print(f"Pexels failed: {e}")
    return fallback


def generate_tts(text: str, label: str, language: str) -> str:
    fallback = "https://cdn.kuasaprestij.tech/assets/fallback_beat.mp3"
    lang_lower = language.lower()
    if any(k in lang_lower for k in ("malay", "melayu", "bahasa")):
        lang_code, voice_name = "ms-MY", "ms-MY-Wavenet-B"
    else:
        lang_code, voice_name = "en-US", "en-US-Wavenet-D"
    try:
        cred = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        tts = texttospeech.TextToSpeechClient.from_service_account_file(cred)
        resp = tts.synthesize_speech(
            input=texttospeech.SynthesisInput(text=text),
            voice=texttospeech.VoiceSelectionParams(language_code=lang_code, name=voice_name),
            audio_config=texttospeech.AudioConfig(
                audio_encoding=texttospeech.AudioEncoding.MP3, speaking_rate=1.1
            ),
        )
        fname = f"{label.replace(' ', '_')}_{uuid.uuid4().hex[:6]}.mp3"
        supabase.storage.from_("media_bucket").upload(
            fname, resp.audio_content, {"content-type": "audio/mpeg"}
        )
        url = supabase.storage.from_("media_bucket").get_public_url(fname)
        print(f"-> TTS uploaded: {url}")
        return url
    except Exception as e:
        print(f"TTS failed: {e}")
        return fallback


def generate_anchor(subject: str, topic: str, lang: str) -> bool:
    lyrics_style = (
        "Write entirely in Bahasa Melayu. Borrow English science/math terms where natural."
        if lang.lower() in ("bahasa melayu", "malay", "melayu", "bm")
        else "Mix Bahasa Melayu and English naturally (e.g. 'Velocity goes up, pecutan bertambah...'). Modern, catchy TikTok educational style."
    )

    prompt = f"""You are an expert KSSM Malaysian secondary school curriculum content creator for Form 4 and Form 5 students.

Subject: {subject}
Topic: {topic}
Output language: {lang}

TASK 1: Write a short, highly rhythmic 4-line spoken-word rap to help students memorize the core concept of this topic.
Style instruction: {lyrics_style}

TASK 2: Create ONE diagnostic multiple-choice question (MCQ). ALL question text, options, and rationale must be written in {lang}.

TASK 3: Provide a 2-3 word English search query to find B-Roll footage that visually represents this topic.

Reply with ONLY a valid JSON object — no markdown, no explanation, no code fences:
{{
    "mnemonic_lyrics": "4-line rap here",
    "b_roll_search_query": "2-3 word english term",
    "anchor_question": {{
        "kbat_level": "Memahami|Mengaplikasi|Menganalisis",
        "illustrative_notes": "2-3 sentences in {lang} covering prerequisite knowledge. Do NOT reveal the answer.",
        "question": "MCQ question text in {lang}",
        "options": ["option A", "option B", "option C", "option D"],
        "correct_answer": "exact string matching one of the options above",
        "distractor_rationale": {{
            "wrong option text": "2-sentence explanation in {lang} of the misconception that causes students to pick this wrong option"
        }}
    }}
}}"""

    try:
        data = call_claude(prompt)
    except Exception as e:
        print(f"  ✗ Claude CLI error: {e}")
        return False

    if not data.get("anchor_question"):
        print("  ✗ Missing anchor_question in response")
        return False

    lyrics = data.get("mnemonic_lyrics", "")
    video_url = fetch_broll(data.get("b_roll_search_query", f"{topic} education"))

    print("-> Generating Voiceover with Google Cloud TTS...")
    audio_url = generate_tts(lyrics, topic, lang)

    anchor_question = data.get("anchor_question", {})
    h5p = _build_h5p_content(
        video_url=video_url,
        audio_url=audio_url,
        question_text=anchor_question.get("question", ""),
        options=anchor_question.get("options", []),
    )

    supabase.table("topic_anchors").upsert({
        "subject": subject,
        "topic": topic,
        "language": lang,
        "mnemonic_lyrics": lyrics,
        "anchor_question": anchor_question,
        "audio_url": audio_url,
        "video_broll": video_url,
        "h5p_content": h5p,
    }, on_conflict="topic,language").execute()

    return True


def main():
    parser = argparse.ArgumentParser(description="Pre-seed topic_anchors using Claude Code CLI.")
    parser.add_argument("--dry-run", action="store_true", help="Print plan without generating.")
    parser.add_argument("--delay", type=float, default=2.0,
                        help="Seconds between calls (default 2.0).")
    parser.add_argument("--subject", default=None,
                        help="Seed only this subject (e.g. 'Physics').")
    parser.add_argument("--lang", default=None,
                        help="Seed only this language (e.g. 'English').")
    args = parser.parse_args()

    langs = [args.lang] if args.lang else LANGUAGES

    if args.subject:
        if args.subject not in KSSM_TOPICS:
            print(f"Unknown subject '{args.subject}'. Available: {', '.join(KSSM_TOPICS)}")
            sys.exit(1)
        subjects = {args.subject: KSSM_TOPICS[args.subject]}
    else:
        subjects = KSSM_TOPICS

    print("Fetching existing topic_anchors...")
    cached = fetch_cached_pairs()
    print(f"  {len(cached)} anchor(s) already cached.\n")

    work = [
        (subj, topic, lang)
        for subj, topics in subjects.items()
        for topic in topics
        for lang in langs
        if (topic, lang) not in cached
    ]
    total = len(work)
    already_done = sum(
        1 for subj, topics in subjects.items()
        for topic in topics
        for lang in langs
        if (topic, lang) in cached
    )

    est_min = total * (args.delay + 8) / 60
    print(f"Plan: {total} to generate, {already_done} already cached, ~{est_min:.0f} min estimated.\n")

    if not work:
        print("Nothing to do — all anchors already cached.")
        return

    if args.dry_run:
        for s, t, l in work:
            print(f"  [DRY] {s} / {t} / {l}")
        return

    ok = fail = 0
    for i, (subj, topic, lang) in enumerate(work, 1):
        print(f"[{i}/{total}] {subj} — {topic} ({lang})")
        try:
            if generate_anchor(subj, topic, lang):
                print("  ✓ cached")
                ok += 1
            else:
                fail += 1
        except Exception as e:
            print(f"  ✗ error: {e}")
            fail += 1
        if i < total:
            time.sleep(args.delay)

    print(f"\nFinished. {ok} seeded, {fail} failed (re-run to retry failures).")


if __name__ == "__main__":
    main()
