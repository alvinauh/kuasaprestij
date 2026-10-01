// offlineDb.ts — IndexedDB wrapper for Skor offline mode (Phase 2)
//
// DB: skor-offline  v1
//   sync_queue  — answer payloads waiting to reach the server
//   anchor_cache — question bank per topic (populated in Phase 3)

const DB_NAME = 'skor-offline';
const DB_VERSION = 1;

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
    };
    req.onsuccess = () => { _db = req.result; resolve(req.result); };
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
