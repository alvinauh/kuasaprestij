// syncQueue.ts — offline answer queue for Skor (Phase 2)
//
// When a student submits an answer with no internet, we store the full payload
// here. On reconnect, flushQueue() drains the queue sequentially — oldest first.
// Server wins all conflicts (mastery is computed server-side).

import {
  addSyncItem,
  getAllSyncItems,
  removeSyncItem,
  updateSyncItem,
  countSyncItems,
  type SyncQueueItem,
} from './offlineDb';
import { BASE_URL } from '@/services/api';

const MAX_ATTEMPTS = 5;

function uuid(): string {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export interface EnqueueParams {
  student_id: string;
  session_id?: string;
  topic: string;
  subject: string;
  curriculum: string;
  language: string;
  student_answer: string;
  draft: Record<string, unknown>;
  question_type: string;
}

export async function enqueueAnswer(params: EnqueueParams): Promise<void> {
  if (typeof indexedDB === 'undefined') return; // SSR guard
  const item: SyncQueueItem = {
    id: uuid(),
    ...params,
    timestamp: Date.now(),
    attempts: 0,
  };
  await addSyncItem(item);
  console.log(`[SyncQueue] queued answer for ${params.topic} (${params.question_type})`);
}

export async function getPendingCount(): Promise<number> {
  if (typeof indexedDB === 'undefined') return 0;
  return countSyncItems();
}

export type FlushResult = { synced: number; failed: number };

// Drain the queue. Called automatically by useOnlineSync on reconnect.
// Each item is POSTed to /submit_answer; success deletes it, permanent failure
// (non-network error after MAX_ATTEMPTS) also deletes it to avoid blocking the queue.
export async function flushQueue(
  onProgress?: (pending: number) => void,
): Promise<FlushResult> {
  if (typeof indexedDB === 'undefined') return { synced: 0, failed: 0 };
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { synced: 0, failed: 0 };

  const items = await getAllSyncItems();
  if (!items.length) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const payload = {
        student_id: item.student_id,
        topic: item.topic,
        subject: item.subject,
        curriculum: item.curriculum,
        student_answer: item.student_answer,
        draft: item.draft,
        language: item.language,
        ...(item.session_id ? { session_id: item.session_id } : {}),
      };
      const res = await fetch(`${BASE_URL}/submit_answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        await removeSyncItem(item.id);
        synced++;
        console.log(`[SyncQueue] synced ${item.id} (${item.topic})`);
      } else if (res.status >= 400 && res.status < 500) {
        // Client error — not retryable; drop it
        await removeSyncItem(item.id);
        failed++;
        console.warn(`[SyncQueue] dropped ${item.id}: server returned ${res.status}`);
      } else {
        // Server error — increment attempts, keep for retry
        const updated = { ...item, attempts: item.attempts + 1 };
        if (updated.attempts >= MAX_ATTEMPTS) {
          await removeSyncItem(item.id);
          failed++;
          console.warn(`[SyncQueue] dropped ${item.id} after ${MAX_ATTEMPTS} attempts`);
        } else {
          await updateSyncItem(updated);
        }
      }
    } catch {
      // Network error mid-flush — stop and retry next reconnect
      break;
    }
    onProgress?.(await getPendingCount());
  }

  console.log(`[SyncQueue] flush complete — synced: ${synced}, failed: ${failed}`);
  return { synced, failed };
}
