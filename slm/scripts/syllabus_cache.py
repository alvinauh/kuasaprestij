"""Download syllabus_embeddings text (no vectors) to data/syllabus/chunks.jsonl and report coverage.

Curriculum text only (DSKP + textbooks); read-only Supabase use. Normalises the inconsistent metadata
into subject / form / kind so fact cards can be built per topic.
"""
import json
import os
import re
import sys
from collections import Counter
from pathlib import Path

import requests

OUT = Path("data/syllabus/chunks.jsonl")

# filename/subject fragments -> canonical subject (matches topic_anchors.subject where possible)
SUBJECT_PATTERNS = [
    (r"add(itional)?[ _-]?math|matematik[ _-]?tambahan", "Additional Mathematics"),
    (r"physics|fizik", "Physics"), (r"chemistry|kimia", "Chemistry"), (r"biology|biologi", "Biology"),
    (r"additional[ _-]?science|sains[ _-]?tambahan", "Additional Science"),
    (r"sains[ _-]?komputer|computer", "Computer Science"),
    (r"math|matematik", "Mathematics"), (r"science|sains", "Science"),
    (r"sejarah|history", "History"), (r"geograf", "Geography"),
    (r"moral", "Moral Education"), (r"seni[ _-]?visual|visual[ _-]?art", "Visual Arts"),
    (r"muzik|music", "Music"), (r"jasmani|kesihatan|physical", "Physical and Health Education"),
    (r"kesusasteraan[ _-]?inggeris|english[ _-]?lit", "English Literature"),
    (r"kesusasteraan[ _-]?cina", "Chinese Literature"),
    (r"inggeris|english", "English"), (r"cina|chinese|华", "Bahasa Cina"),
    (r"melayu|malay", "Bahasa Melayu"), (r"iban", "Bahasa Iban"),
    (r"perniagaan|business", "Business"), (r"ekonomi|economic", "Economics"),
    (r"pendidikan[ _-]?islam|islam", "Islamic Education"),
]


def canon_subject(*texts):
    t = " ".join(str(x) for x in texts if x).lower()
    for pat, name in SUBJECT_PATTERNS:
        if re.search(pat, t):
            return name
    return None


def canon_form(meta, content):
    f = meta.get("form") or meta.get("form_level")
    if isinstance(f, int) or (isinstance(f, str) and f.isdigit()):
        return int(f)
    m = re.search(r"(?:form|tingkatan|ting|中)\s*([1-5])", f"{meta.get('subject', '')} {content[:200]}", re.I)
    return int(m.group(1)) if m else None


def main():
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        sys.exit("Set SUPABASE_URL and SUPABASE_SERVICE_KEY")
    h = {"apikey": key, "Authorization": f"Bearer {key}"}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    rows, page = [], 1000
    while True:
        r = requests.get(f"{url}/rest/v1/syllabus_embeddings", timeout=120,
                         headers={**h, "Range": f"{len(rows)}-{len(rows) + page - 1}"},
                         params={"select": "id,source_type,metadata,content", "order": "id"})
        r.raise_for_status()
        batch = r.json()
        rows += batch
        print(f"\r{len(rows)} rows", end="", flush=True)
        if len(batch) < page:
            break
    print()
    cov, kinds = Counter(), Counter()
    with open(OUT, "w", encoding="utf-8") as f:
        for x in rows:
            meta = x.get("metadata") or {}
            content = x.get("content") or ""
            kind = meta.get("source_type") or x.get("source_type") or "unknown"
            subj = canon_subject(meta.get("subject"), meta.get("topic"), content[:150])
            form = canon_form(meta, content)
            rec = {"id": x["id"], "kind": kind, "subject": subj, "form": form, "topic": meta.get("topic"),
                   "page": meta.get("page"), "source": meta.get("subject"), "content": content}
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
            cov[(subj, form)] += 1
            kinds[kind] += 1
    print("kinds:", dict(kinds))
    print(f"{'subject':32s} " + " ".join(f"F{i:<5d}" for i in range(1, 6)) + " none")
    for s in sorted({s for s, _ in cov}, key=lambda s: s or "~"):
        print(f"{str(s):32s} " + " ".join(f"{cov.get((s, i), 0):<6d}" for i in range(1, 6)) + f" {cov.get((s, None), 0)}")


if __name__ == "__main__":
    main()
