"""One-time backfill: populate topic_anchors.interactive_content (lean schema) from
the legacy h5p_content blob, so the frontend/API no longer depends on the shim.
Safe to re-run; only fills rows where interactive_content IS NULL and h5p_content exists.
"""
import os
from dotenv import load_dotenv
load_dotenv()
from supabase import create_client
from agents.orchestrator import _h5p_to_lean

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

rows = sb.table("topic_anchors").select("id,h5p_content,interactive_content").execute().data
filled = skipped = empty = 0
for r in rows:
    if r.get("interactive_content"):
        skipped += 1
        continue
    lean = _h5p_to_lean(r.get("h5p_content"))
    if not lean or not lean.get("question"):
        empty += 1
        continue
    sb.table("topic_anchors").update({"interactive_content": lean}).eq("id", r["id"]).execute()
    filled += 1

print(f"rows={len(rows)} filled={filled} already_had={skipped} no_h5p={empty}")
