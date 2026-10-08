// offlineDb.ts — IndexedDB wrapper for Skor offline mode (Phase 2)
//
// DB: skor-offline  v2
//   sync_queue     — answer payloads waiting to reach the server
//   anchor_cache   — last question seen online per topic
//   pack_questions — downloaded question bank (offlinePacks.ts), one row per MCQ
//   kv             — small offline state: pack info, subject list, profile

const DB_NAME = 'skor-offline';
const DB_VERSION = 2;

export interface SyncQueueItem {
  id: string;
  student_id: string;
  session_id?: string;
  topic: string;
  subject: string;
  curriculum: string;
  language: string;
  student_answer: string;
  draft: Record<string, unknown>;
  question_type: string;
  timestamp: number;
  attempts: number;
}

export interface PackQuestion {
  id: string;            // `${topic_anchors.id}#${index}`
  subject: string;
  subject_key: string;   // normalised: "Biologi" and "Biology" share a key
  topic: string;
  language: string;
  language_key: string;  // "en" | "ms" | "zh" | raw lower-case
  form_level: number | null;
  draft: Record<string, unknown>;   // full question incl. correct_answer
  mnemonic_lyrics?: string | null;
  worked_example?: string | null;
}

export interface AnchorCacheItem {
  key: string;          // `${topic}||${subject}||${language}`
  topic: string;
  subject: string;
  language: string;
  question_data: Record<string, unknown>;
  mnemonic_lyrics?: string;
  cached_at: number;
}

let _db: IDBDatabase | null = null;

function openDb(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('sync_queue')) {
        const sq = db.createObjectStore('sync_queue', { keyPath: 'id' });
        sq.createIndex('timestamp', 'timestamp');
      }
      if (!db.objectStoreNames.contains('anchor_cache')) {
        const ac = db.createObjectStore('anchor_cache', { keyPath: 'key' });
        ac.createIndex('topic', 'topic');
      }
      if (!db.objectStoreNames.contains('pack_questions')) {
        const pq = db.createObjectStore('pack_questions', { keyPath: 'id' });
        pq.createIndex('subject_lang', ['subject_key', 'language_key']);
      }
      if (!db.objectStoreNames.contains('kv')) {
        db.createObjectStore('kv', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => {
      _db = req.result;
      // Let a newer tab upgrade the schema instead of blocking on this connection.
      _db.onversionchange = () => { _db?.close(); _db = null; };
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });
}

function tx(
  db: IDBDatabase,
  stores: string | string[],
  mode: IDBTransactionMode,
): IDBTransaction {
  return db.transaction(stores, mode);
}

function run<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

// ── sync_queue ────────────────────────────────────────────────────────────────

export async function addSyncItem(item: SyncQueueItem): Promise<void> {
  const db = await openDb();
  await run(tx(db, 'sync_queue', 'readwrite').objectStore('sync_queue').add(item));
}

export async function getAllSyncItems(): Promise<SyncQueueItem[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx(db, 'sync_queue', 'readonly').objectStore('sync_queue');
    const idx = store.index('timestamp');
    const req = idx.getAll();
    req.onsuccess = () => resolve(req.result as SyncQueueItem[]);
    req.onerror = () => reject(req.error);
  });
}

export async function removeSyncItem(id: string): Promise<void> {
  const db = await openDb();
  await run(tx(db, 'sync_queue', 'readwrite').objectStore('sync_queue').delete(id));
}

export async function updateSyncItem(item: SyncQueueItem): Promise<void> {
  const db = await openDb();
  await run(tx(db, 'sync_queue', 'readwrite').objectStore('sync_queue').put(item));
}

export async function countSyncItems(): Promise<number> {
  const db = await openDb();
  return run<number>(tx(db, 'sync_queue', 'readonly').objectStore('sync_queue').count());
}

// ── anchor_cache ──────────────────────────────────────────────────────────────

export function anchorKey(topic: string, subject: string, language: string): string {
  return `${topic}||${subject}||${language}`;
}

export async function putAnchorItem(item: AnchorCacheItem): Promise<void> {
  const db = await openDb();
  await run(tx(db, 'anchor_cache', 'readwrite').objectStore('anchor_cache').put(item));
}

export async function getAnchorItem(
  topic: string, subject: string, language: string,
): Promise<AnchorCacheItem | undefined> {
  const db = await openDb();
  return run(
    tx(db, 'anchor_cache', 'readonly')
      .objectStore('anchor_cache')
      .get(anchorKey(topic, subject, language))
  );
}

// ── pack_questions ────────────────────────────────────────────────────────────

/** Replace the whole downloaded bank in one transaction. */
export async function replacePackQuestions(items: PackQuestion[]): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = tx(db, 'pack_questions', 'readwrite');
    const store = t.objectStore('pack_questions');
    store.clear();
    for (const it of items) store.put(it);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function getPackQuestions(subjectKey: string, languageKey: string): Promise<PackQuestion[]> {
  const db = await openDb();
  return run(
    tx(db, 'pack_questions', 'readonly')
      .objectStore('pack_questions')
      .index('subject_lang')
      .getAll([subjectKey, languageKey]) as IDBRequest<PackQuestion[]>,
  );
}

export async function getAllPackQuestions(): Promise<PackQuestion[]> {
  const db = await openDb();
  return run(tx(db, 'pack_questions', 'readonly').objectStore('pack_questions').getAll() as IDBRequest<PackQuestion[]>);
}

// ── kv ────────────────────────────────────────────────────────────────────────

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  const row = await run(tx(db, 'kv', 'readonly').objectStore('kv').get(key)) as { key: string; value: T } | undefined;
  return row?.value;
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  const db = await openDb();
  await run(tx(db, 'kv', 'readwrite').objectStore('kv').put({ key, value }));
}
