#!/usr/bin/env python3
"""
Snapshot the question_bank state in topic_anchors. Prints JSON to stdout.
Used before/after the seed run so the summary can reconcile the DB delta
against the log's reported success count (honesty check — never trust the
seeder's ok-counter alone).
"""
import os
import sys
import json
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv
load_dotenv(override=True)
from supabase import create_client

sb = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))

res = sb.table("topic_anchors").select("topic, language, subject, question_bank").execute()
rows = res.data or []

total = 0
by_lang = defaultdict(int)
by_subject = defaultdict(int)
english_total = 0
for r in rows:
    n = len(r.get("question_bank") or [])
    total += n
    lang = r.get("language", "?")
    by_lang[lang] += n
    by_subject[r.get("subject", "?")] += n
    if lang == "English":
        english_total += n

print(json.dumps({
    "total_bank_items": total,
    "english_bank_items": english_total,
    "by_language": dict(by_lang),
    "by_subject": dict(by_subject),
    "topic_anchor_rows": len(rows),
}, indent=2))
