// useOnlineSync.ts — online/offline state + auto-flush of the answer queue
//
// Mount this once at the app root. Any component can call it to read
// isOnline / pendingCount / syncing without needing a context.

import { useState, useEffect, useCallback, useRef } from 'react';
import { flushQueue, getPendingCount, QUEUE_CHANGED_EVENT } from '@/lib/syncQueue';

export interface OnlineSyncState {
  isOnline: boolean | null;  // null = not yet hydrated
  pendingCount: number;
  syncing: boolean;
  manualSync: () => Promise<void>;
}

export function useOnlineSync(): OnlineSyncState {
  // null = not yet hydrated (SSR). Badge renders nothing until useEffect fires.
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refreshCount = useCallback(async () => {
    if (typeof indexedDB === 'undefined') return;
    setPendingCount(await getPendingCount());
  }, []);

  // Stable callback (ref, not state) so the listeners effect below runs once and
  // a queue that keeps failing isn't retried on every re-render.
  const syncingRef = useRef(false);
  const sync = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      await flushQueue((remaining) => setPendingCount(remaining));
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      await refreshCount();
    }
  }, [refreshCount]);

  useEffect(() => {
    // Seed real online state and count after hydration (never runs on server)
    setIsOnline(navigator.onLine);
    void refreshCount();
    // Opened with answers left from an offline session: send them now.
    if (navigator.onLine) void getPendingCount().then((n) => { if (n > 0) void sync(); });

    let jitterTimer: ReturnType<typeof setTimeout> | undefined;
    function handleOnline() {
      setIsOnline(true);
      // A whole class reconnecting at once shouldn't hit the API in the same second.
      clearTimeout(jitterTimer);
      jitterTimer = setTimeout(() => void sync(), Math.random() * 8000);
    }
    function handleOffline() {
      setIsOnline(false);
      void refreshCount();
    }
    function handleVisible() {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void getPendingCount().then((n) => { if (n > 0) void sync(); });
      }
    }
    const handleQueueChanged = () => void refreshCount();
    // Wi-Fi without internet never fires 'offline'/'online', so also retry every
    // 30 s while answers are waiting (a failed try costs one quick request).
    const retryTimer = setInterval(() => {
      void getPendingCount().then((n) => { if (n > 0) void sync(); });
    }, 30_000);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisible);
    window.addEventListener(QUEUE_CHANGED_EVENT, handleQueueChanged);
    return () => {
      clearTimeout(jitterTimer);
      clearInterval(retryTimer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisible);
      window.removeEventListener(QUEUE_CHANGED_EVENT, handleQueueChanged);
    };
  }, [sync, refreshCount]);

  // Re-check count after a sync completes
  useEffect(() => {
    if (!syncing) void refreshCount();
  }, [syncing, refreshCount]);

  return { isOnline, pendingCount, syncing, manualSync: sync };
}
