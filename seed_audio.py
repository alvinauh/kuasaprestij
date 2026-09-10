"""
seed_audio.py — Generate TTS audio for topic_anchors rows with missing audio_url.

Uses edge-tts (free, no API key) with language-appropriate neural voices,
uploads MP3s to Supabase Storage media_bucket, writes URL back to topic_anchors.

Usage:
    python seed_audio.py              # only rows with null audio_url
    python seed_audio.py --force      # regenerate all rows
    python seed_audio.py --subject Physics
    python seed_audio.py --dry-run
"""

import os, sys, re, asyncio, tempfile
from datetime import datetime
import edge_tts
from supabase import create_client
from dotenv import load_dotenv

load_dotenv(override=True)

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]

VOICE_MAP = {
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


def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def pick_voice(language: str) -> str:
    lang_lower = (language or "").lower()
    return next((v for k, v in VOICE_MAP.items() if k in lang_lower), "en-US-JennyNeural")


async def _generate(text: str, voice: str, tmp_path: str):
    await edge_tts.Communicate(text, voice=voice).save(tmp_path)


def generate_and_upload(supabase, row_id: str, topic: str, language: str, lyrics: str) -> str:
    """Generate TTS MP3, upload to media_bucket, return public URL."""
    voice = pick_voice(language)
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        asyncio.run(_generate(lyrics, voice, tmp_path))
        safe_label = re.sub(r'[^a-zA-Z0-9_-]', '_', topic)[:60]
        lang_code = (language or "en").lower()[:2]
        storage_path = f"tts/{safe_label}_{lang_code}.mp3"
        with open(tmp_path, "rb") as f:
            audio_data = f.read()
        supabase.storage.from_("media_bucket").upload(
            storage_path, audio_data,
            {"content-type": "audio/mpeg", "upsert": "true"},
        )
        return supabase.storage.from_("media_bucket").get_public_url(storage_path)
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


def main():
    force          = "--force"   in sys.argv
    dry_run        = "--dry-run" in sys.argv
    subject_filter = None
    if "--subject" in sys.argv:
        idx = sys.argv.index("--subject")
        if idx + 1 < len(sys.argv):
            subject_filter = sys.argv[idx + 1]

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    query = supabase.table("topic_anchors").select(
        "id,subject,topic,language,mnemonic_lyrics,audio_url"
    )
    if subject_filter:
        query = query.eq("subject", subject_filter)
    if not force:
        query = query.is_("audio_url", "null")
    rows = query.execute().data or []

    # Also pick up rows with empty-string audio_url
    if not force:
        all_rows = supabase.table("topic_anchors").select(
            "id,subject,topic,language,mnemonic_lyrics,audio_url"
        ).eq("audio_url", "").execute().data or []
        seen_ids = {r["id"] for r in rows}
        rows += [r for r in all_rows if r["id"] not in seen_ids]

    if not rows:
        log("Nothing to do — all rows have audio_url. Use --force to regenerate.")
        return

    total = len(rows)
    log(f"Seeding {total} audio file(s)" + (f" [{subject_filter}]" if subject_filter else "") + (" [DRY RUN]" if dry_run else ""))

    ok = fail = skip = 0
    for i, row in enumerate(rows, 1):
        subject  = row.get("subject", "")
        topic    = row.get("topic", "")
        language = row.get("language", "English")
        lyrics   = (row.get("mnemonic_lyrics") or "").strip()
        log(f"[{i}/{total}] {subject} / {topic} / {language}")

        if not lyrics:
            log("  SKIP — no mnemonic_lyrics to speak")
            skip += 1
            continue

        voice = pick_voice(language)
        log(f"  Voice: {voice}")

        if dry_run:
            log(f"  [DRY RUN] would generate {len(lyrics)} chars with {voice}")
            continue

        try:
            url = generate_and_upload(supabase, row["id"], topic, language, lyrics)
            supabase.table("topic_anchors").update({"audio_url": url}).eq("id", row["id"]).execute()
            log(f"  OK → {url[:70]}")
            ok += 1
        except Exception as e:
            log(f"  FAIL: {e}")
            fail += 1

    log(f"Done. {ok} OK, {fail} failed, {skip} skipped (no lyrics) out of {total}.")


if __name__ == "__main__":
    main()
