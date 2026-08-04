"""
Shared in-memory cache for topic_anchors rows.
Keyed by (topic, language, form_level). TTL = 5 minutes.
Importable by both main.py (async paths) and orchestrator.py (sync/thread paths).
"""
import time
from supabase import create_client
import os

_cache: dict = {}
TTL = 300  # seconds


def _key(topic: str, language: str, form_level: int) -> tuple:
    return (topic, language, form_level)


def get(topic: str, language: str, form_level: int):
    entry = _cache.get(_key(topic, language, form_level))
    if entry and (time.time() - entry[1]) < TTL:
        return entry[0]
    return None


def put(topic: str, language: str, form_level: int, row):
    _cache[_key(topic, language, form_level)] = (row, time.time())


def invalidate(topic: str, language: str, form_level: int):
    _cache.pop(_key(topic, language, form_level), None)


def fetch_sync(supabase_client, topic: str, language: str, form_level: int):
    """Fetch from cache or Supabase synchronously (for use inside threads)."""
    row = get(topic, language, form_level)
    if row is not None:
        return row
    try:
        res = supabase_client.table("topic_anchors")\
            .select("*")\
            .eq("topic", topic)\
            .eq("language", language)\
            .eq("form_level", form_level)\
            .limit(1).execute()
        row = res.data[0] if res.data else None
        put(topic, language, form_level, row)
        return row
    except Exception as e:
        print(f"[AnchorCache] sync fetch failed for {topic}/{language}: {e}")
        return None
