#!/usr/bin/env python3
"""
Migration: Supabase REST API → Cloud SQL (via unix socket).
Runs inside a Cloud Run Job with --set-cloudsql-instances set.
Env vars: SUPABASE_URL, SUPABASE_KEY, CLOUDSQL_PASSWORD, CLOUDSQL_DB
"""
import os, sys, json, time, requests
import psycopg2
from psycopg2.extras import execute_values

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
CLOUDSQL_DB  = os.environ.get("CLOUDSQL_DB", "kuasaprestij")
CLOUDSQL_PASS = os.environ["CLOUDSQL_PASSWORD"]
INSTANCE = "prestij-alvin-spmexamsupport:asia-southeast1:kuasaprestij-dr"
SOCKET_DIR = f"/cloudsql/{INSTANCE}"

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Accept": "application/json",
    "Prefer": "count=exact",
}

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

def fetch_table(table, page_size=1000):
    """Paginate through a Supabase table via REST API."""
    rows = []
    offset = 0
    while True:
        url = f"{SUPABASE_URL}/rest/v1/{table}"
        params = {"select": "*", "limit": page_size, "offset": offset, "order": "id"}
        r = requests.get(url, headers=HEADERS, params=params, timeout=60)
        r.raise_for_status()
        batch = r.json()
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
        log(f"  {table}: fetched {len(rows)} rows...")
    return rows

def connect_cloudsql():
    return psycopg2.connect(
        host=SOCKET_DIR,
        user="postgres",
        password=CLOUDSQL_PASS,
        dbname=CLOUDSQL_DB,
        connect_timeout=30,
    )

def apply_schema(cur):
    log("Applying schema...")
    with open("/app/schema.sql") as f:
        schema_sql = f.read()
    cur.execute(schema_sql)
    log("Schema applied.")

_col_types = {}  # {table: {col: udt_name}}

def load_col_types(cur, table):
    if table not in _col_types:
        cur.execute("""
            SELECT column_name, udt_name, data_type
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = %s
        """, (table,))
        _col_types[table] = {r[0]: (r[1], r[2]) for r in cur.fetchall()}
    return _col_types[table]

def serialize(v, udt_name="text", data_type="character varying"):
    if v is None:
        return None
    # PostgreSQL array column — psycopg2 sends Python list natively
    if data_type == "ARRAY":
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return []
        return v  # already a list from REST API
    # jsonb/json column
    if udt_name in ("jsonb", "json"):
        if isinstance(v, (dict, list)):
            return json.dumps(v, ensure_ascii=False)
        if isinstance(v, str):
            # Validate: if it's already valid JSON, pass as-is
            try:
                json.loads(v)
                return v
            except Exception:
                # Plain string stored as jsonb → wrap as JSON string
                return json.dumps(v, ensure_ascii=False)
        return v
    # Default: dicts → JSON string (shouldn't happen for non-jsonb but safe)
    if isinstance(v, dict):
        return json.dumps(v, ensure_ascii=False)
    return v

def upsert_table(cur, table, rows, pk_cols, skip_cols=None):
    if not rows:
        log(f"  {table}: 0 rows (skip)")
        return
    skip_cols = skip_cols or set()
    col_types = load_col_types(cur, table)
    cols = [k for k in rows[0].keys() if k not in skip_cols]
    values = []
    for row in rows:
        vals = []
        for c in cols:
            udt, dtype = col_types.get(c, ("text", "character varying"))
            vals.append(serialize(row.get(c), udt, dtype))
        values.append(tuple(vals))

    conflict = ", ".join(pk_cols)
    update_cols = [c for c in cols if c not in pk_cols]
    if update_cols:
        update_clause = ", ".join(f"{c} = EXCLUDED.{c}" for c in update_cols)
        on_conflict = f"ON CONFLICT ({conflict}) DO UPDATE SET {update_clause}"
    else:
        on_conflict = f"ON CONFLICT ({conflict}) DO NOTHING"

    col_str = ", ".join(f'"{c}"' for c in cols)
    sql = f'INSERT INTO public."{table}" ({col_str}) VALUES %s {on_conflict}'
    execute_values(cur, sql, values, page_size=200)
    log(f"  {table}: upserted {len(rows)} rows")

# Tables in dependency order (parents before children)
TABLES = [
    # table_name, pk_cols, fetch_order_col, skip_cols
    ("profiles",            ["id"],         None,   set()),
    ("students",            ["id"],         None,   set()),
    ("generated_lessons",   ["id"],         None,   set()),
    ("classrooms",          ["id"],         None,   set()),
    ("quizzes",             ["id"],         None,   set()),
    ("quiz_sessions",       ["id"],         None,   set()),
    ("topic_anchors",       ["id"],         None,   set()),
    ("dskp_mastery",        ["id"],         None,   set()),
    ("event_logs",          ["id"],         None,   set()),
    ("media_cache",         ["id"],         None,   set()),
    ("student_daily_report",["id"],         None,   set()),
    ("chat_history",        ["id"],         None,   set()),
    ("remediation_plans",   ["id"],         None,   set()),
    ("game_scores",         ["id"],         None,   set()),
    ("user_feedback",       ["id"],         None,   set()),
    ("classroom_members",   ["id"],         None,   set()),
    ("assignments",         ["id"],         None,   set()),
    ("assigned_tasks",      ["id"],         None,   set()),
    ("agent_traces",        ["id"],         None,   set()),
    ("feedback_quality_audit",["id"],       None,   set()),
    ("app_errors",          ["id"],         None,   set()),
    ("teacher_chat",        ["id"],         None,   set()),
    ("rph_documents",       ["id"],         None,   set()),
    ("aita_games",          ["id"],         None,   set()),
    ("aita_game_assignments",["id"],        None,   set()),
    ("aita_game_scores",    ["id"],         None,   set()),
    ("rph_shares",          ["id"],         None,   set()),
]

def migrate_syllabus_embeddings(cur):
    """syllabus_embeddings has 28K rows — paginate carefully."""
    table = "syllabus_embeddings"
    log(f"  {table}: starting (28K rows, may take a few minutes)...")
    page_size = 500
    offset = 0
    total = 0
    while True:
        url = f"{SUPABASE_URL}/rest/v1/{table}"
        params = {"select": "id,content,metadata,source_type,embedding",
                  "limit": page_size, "offset": offset, "order": "id"}
        r = requests.get(url, headers=HEADERS, params=params, timeout=120)
        r.raise_for_status()
        batch = r.json()
        if not batch:
            break
        # embedding comes as "[0.1,0.2,...]" string — pass through as-is
        cols = ["id", "content", "metadata", "source_type", "embedding"]
        values = []
        for row in batch:
            emb = row.get("embedding")
            meta = serialize(row.get("metadata"), "jsonb", "USER-DEFINED")
            values.append((row["id"], row.get("content"), meta, row.get("source_type","textbook"), emb))
        execute_values(
            cur,
            'INSERT INTO public.syllabus_embeddings (id,content,metadata,source_type,embedding) '
            'VALUES %s ON CONFLICT (id) DO NOTHING',
            values, page_size=100
        )
        total += len(batch)
        log(f"  {table}: {total} rows inserted...")
        if len(batch) < page_size:
            break
        offset += page_size
    log(f"  {table}: done ({total} rows)")

def main():
    log("Connecting to Cloud SQL...")
    conn = connect_cloudsql()
    conn.autocommit = False
    cur = conn.cursor()

    # Apply schema
    apply_schema(cur)
    conn.commit()

    # Drop FK constraints temporarily to allow bulk import in any order
    cur.execute("""
        DO $$ DECLARE r RECORD;
        BEGIN
          FOR r IN SELECT tc.constraint_name, tc.table_name
                   FROM information_schema.table_constraints tc
                   WHERE tc.constraint_type = 'FOREIGN KEY'
                   AND tc.table_schema = 'public'
          LOOP
            EXECUTE 'ALTER TABLE public.' || quote_ident(r.table_name)
                 || ' DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name) || ' CASCADE';
          END LOOP;
        END $$;
    """)

    # auth.users stub — insert placeholder for FK constraint
    log("Seeding auth.users stubs from profiles data...")
    try:
        profiles_url = f"{SUPABASE_URL}/rest/v1/profiles"
        r = requests.get(profiles_url, headers={**HEADERS, "Prefer": ""},
                         params={"select": "id"}, timeout=30)
        r.raise_for_status()
        profile_ids = [(p["id"],) for p in r.json()]
        if profile_ids:
            execute_values(cur,
                "INSERT INTO auth.users (id) VALUES %s ON CONFLICT (id) DO NOTHING",
                profile_ids)
            conn.commit()
            log(f"  Seeded {len(profile_ids)} auth.users stubs")
    except Exception as e:
        log(f"  Warning: could not seed auth stubs: {e}")
        conn.rollback()

    # Sync each table
    log("Syncing tables from Supabase REST API...")
    for (table, pk_cols, _, skip_cols) in TABLES:
        try:
            rows = fetch_table(table)
            upsert_table(cur, table, rows, pk_cols, skip_cols)
            conn.commit()
        except Exception as e:
            log(f"  WARNING: {table} failed: {e}")
            conn.rollback()

    # syllabus_embeddings — separate paginated handler
    try:
        migrate_syllabus_embeddings(cur)
        conn.commit()
    except Exception as e:
        log(f"  WARNING: syllabus_embeddings failed: {e}")
        conn.rollback()

    cur.close()
    conn.close()
    log("Migration complete.")

if __name__ == "__main__":
    main()
