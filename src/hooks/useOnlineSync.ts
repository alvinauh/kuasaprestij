// useOnlineSync.ts — online/offline state + auto-flush of the answer queue
//
// Mount this once at the app root. Any component can call it to read
// isOnline / pendingCount / syncing without needing a context.

import { useState, useEffect, useCallback } from 'react';
import { flushQueue, getPendingCount } from '@/lib/syncQueue';

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

  const sync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      await flushQueue((remaining) => setPendingCount(remaining));
    } finally {
      setSyncing(false);
      await refreshCount();
    }
  }, [syncing, refreshCount]);

  useEffect(() => {
    // Seed real online state and count after hydration (never runs on server)
    setIsOnline(navigator.onLine);
    void refreshCount();

    function handleOnline() {
      setIsOnline(true);
      void sync();
    }
    function handleOffline() {
      setIsOnline(false);
      void refreshCount();
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [sync, refreshCount]);

  // Re-check count after a sync completes
  useEffect(() => {
    if (!syncing) void refreshCount();
  }, [syncing, refreshCount]);

  return { isOnline, pendingCount, syncing, manualSync: sync };
}
