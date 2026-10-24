#!/usr/bin/env python3
"""
Nightly sync: Supabase REST API → moeagentic / g1_p1 (TCP).
Env vars: SUPABASE_URL, SUPABASE_KEY, MOEAGENTIC_DB_URI
"""
import os, sys, json, time, requests
import psycopg2
from psycopg2.extras import execute_values

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
DB_URI       = os.environ["MOEAGENTIC_DB_URI"]   # postgresql://g1_p1_user:...@34.87.149.51:5433/moeagentic

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Accept": "application/json",
}

SCHEMA = "g1_p1"

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

def fetch_table(table, page_size=1000):
    rows, offset = [], 0
    while True:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/{table}",
            headers=HEADERS,
            params={"select": "*", "limit": page_size, "offset": offset, "order": "id"},
            timeout=60,
        )
        r.raise_for_status()
        batch = r.json()
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
        if offset % 5000 == 0:
            log(f"  {table}: fetched {len(rows)} rows so far...")
    return rows

def connect():
    return psycopg2.connect(DB_URI, connect_timeout=30)

_col_types = {}

def load_col_types(cur, table):
    if table not in _col_types:
        cur.execute("""
            SELECT column_name, udt_name, data_type
            FROM information_schema.columns
            WHERE table_schema = %s AND table_name = %s
        """, (SCHEMA, table))
        _col_types[table] = {r[0]: (r[1], r[2]) for r in cur.fetchall()}
    return _col_types[table]

def serialize(v, udt_name="text", data_type="character varying"):
    if v is None:
        return None
    if data_type == "ARRAY":
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return []
        return v
    if udt_name in ("jsonb", "json"):
        if isinstance(v, (dict, list)):
            return json.dumps(v, ensure_ascii=False)
        if isinstance(v, str):
            try:
                json.loads(v)
                return v
            except Exception:
                return json.dumps(v, ensure_ascii=False)
        return v
    if isinstance(v, dict):
        return json.dumps(v, ensure_ascii=False)
    return v

def upsert_table(cur, table, rows):
    if not rows:
        log(f"  {table}: 0 rows (skip)")
        return
    col_types = load_col_types(cur, table)
    if not col_types:
        log(f"  {table}: not found in {SCHEMA} schema — skipping")
        return
    # Only include columns that exist in the target schema
    cols = [k for k in rows[0].keys() if k in col_types]
    values = []
    for row in rows:
        vals = []
        for c in cols:
            udt, dtype = col_types[c]
            vals.append(serialize(row.get(c), udt, dtype))
        values.append(tuple(vals))

    col_str = ", ".join(f'"{c}"' for c in cols)
    sql = (
        f'INSERT INTO {SCHEMA}."{table}" ({col_str}) VALUES %s '
        f'ON CONFLICT DO NOTHING'
    )
    execute_values(cur, sql, values, page_size=200)
    log(f"  {table}: upserted {len(rows)} rows")

def drop_fk_constraints(cur):
    cur.execute(f"""
        SELECT tc.constraint_name, tc.table_name
        FROM information_schema.table_constraints tc
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = '{SCHEMA}'
    """)
    for constraint_name, table_name in cur.fetchall():
        cur.execute(
            f'ALTER TABLE {SCHEMA}."{table_name}" '
            f'DROP CONSTRAINT IF EXISTS "{constraint_name}" CASCADE'
        )

def restore_profile_fks(cur):
    fks = [
        (f"{SCHEMA}.dskp_mastery", "dskp_mastery_student_id_fkey", "student_id", f"{SCHEMA}.profiles", "id"),
        (f"{SCHEMA}.event_logs",   "event_logs_student_id_fkey",   "student_id", f"{SCHEMA}.profiles", "id"),
        (f"{SCHEMA}.student_coins","student_coins_student_id_fkey","student_id", f"{SCHEMA}.profiles", "id"),
    ]
    for table, name, col, ref_table, ref_col in fks:
        try:
            cur.execute(
                f'ALTER TABLE {table} ADD CONSTRAINT "{name}" '
                f'FOREIGN KEY ({col}) REFERENCES {ref_table}({ref_col})'
            )
        except Exception:
            pass  # already exists or table empty — fine

TABLES = [
    "profiles", "students", "generated_lessons", "classrooms", "quizzes",
    "quiz_sessions", "topic_anchors", "dskp_mastery", "event_logs",
    "media_cache", "student_daily_report", "chat_history", "remediation_plans",
    "game_scores", "user_feedback", "classroom_members", "assignments",
    "assigned_tasks", "agent_traces", "feedback_quality_audit", "app_errors",
    "teacher_chat", "rph_documents", "aita_games", "aita_game_assignments",
    "aita_game_scores", "rph_shares",
    # gamification tables — only synced if they exist in Supabase
    # "student_coins", "coin_transactions", "student_perks", "question_skips",
]

def sync_syllabus_embeddings(cur):
    log("syllabus_embeddings: starting (28K rows)...")
    page_size, offset, total = 500, 0, 0
    while True:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/syllabus_embeddings",
            headers=HEADERS,
            params={"select": "id,content,metadata,source_type,embedding",
                    "limit": page_size, "offset": offset, "order": "id"},
            timeout=120,
        )
        r.raise_for_status()
        batch = r.json()
        if not batch:
            break
        values = []
        for row in batch:
            emb = row.get("embedding")
            # Supabase returns embeddings as a list of floats
            if isinstance(emb, str):
                emb = [float(x) for x in emb.strip("[]").split(",")]
            elif isinstance(emb, list):
                emb = [float(x) for x in emb]
            meta = serialize(row.get("metadata"), "jsonb", "USER-DEFINED")
            values.append((row["id"], row.get("content"), meta,
                           row.get("source_type", "textbook"), emb))
        execute_values(
            cur,
            f'INSERT INTO {SCHEMA}.syllabus_embeddings '
            f'(id,content,metadata,source_type,embedding) VALUES %s '
            f'ON CONFLICT (id) DO UPDATE SET '
            f'content=EXCLUDED.content, metadata=EXCLUDED.metadata, embedding=EXCLUDED.embedding',
            values, page_size=100,
        )
        total += len(batch)
        if total % 2000 == 0:
            log(f"  syllabus_embeddings: {total} rows...")
        if len(batch) < page_size:
            break
        offset += page_size
    log(f"  syllabus_embeddings: done ({total} rows)")

def main():
    log(f"Connecting to moeagentic/{SCHEMA}...")
    conn = connect()
    conn.autocommit = False
    cur = conn.cursor()
    cur.execute(f"SET search_path TO {SCHEMA}")

    # Drop FK constraints so we can upsert in any order
    log("Dropping FK constraints for bulk sync...")
    drop_fk_constraints(cur)
    conn.commit()

    # Sync all regular tables
    log("Syncing tables from Supabase...")
    for table in TABLES:
        try:
            rows = fetch_table(table)
            upsert_table(cur, table, rows)
            conn.commit()
        except Exception as e:
            log(f"  WARNING: {table} failed: {e}")
            conn.rollback()

    # Sync syllabus_embeddings (special: vector → float8[])
    try:
        sync_syllabus_embeddings(cur)
        conn.commit()
    except Exception as e:
        log(f"  WARNING: syllabus_embeddings failed: {e}")
        conn.rollback()

    # Restore FK constraints
    log("Restoring FK constraints...")
    try:
        restore_profile_fks(cur)
        conn.commit()
    except Exception as e:
        log(f"  WARNING: FK restore failed (non-fatal): {e}")
        conn.rollback()

    cur.close()
    conn.close()
    log("Sync complete.")

if __name__ == "__main__":
    main()
