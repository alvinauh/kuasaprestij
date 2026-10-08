import os, time
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(override=True)
sb = create_client(os.getenv('SUPABASE_URL'), os.getenv('SUPABASE_KEY'))

deleted_total = 0
batch = 0
while True:
    rows = sb.table('syllabus_embeddings').select('id').limit(200).execute()
    if not rows.data:
        break
    ids = [r['id'] for r in rows.data]
    sb.table('syllabus_embeddings').delete().in_('id', ids).execute()
    deleted_total += len(ids)
    batch += 1
    print(f"Batch {batch}: deleted {len(ids)} rows (total {deleted_total})")
    time.sleep(0.3)

print(f"Done. Total deleted: {deleted_total}")
