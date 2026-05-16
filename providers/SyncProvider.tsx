import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from './AuthProvider';
import { useLedgers } from '../lib/queries/ledgers';
import { isOnlineNow, useNetworkStatus } from '../lib/network';
import { syncTransactions } from '../lib/sync/transactions';

type SyncStatus = 'idle' | 'syncing' | 'error';

type SyncCtx = {
  status: SyncStatus;
  lastSyncedAt: Date | null;
  isOnline: boolean;
  syncNow: () => Promise<void>;
};

const Ctx = createContext<SyncCtx>({
  status: 'idle',
  lastSyncedAt: null,
  isOnline: true,
  syncNow: async () => {},
});

const POLL_INTERVAL_MS = 30_000;

/**
 * Drives the offline sync loop. Once the user is signed in and the
 * ledgers list is available, schedules a sync every 30s; also fires
 * immediately on app boot and whenever network reachability flips
 * from offline → online so a freshly-reconnected device catches up
 * without waiting out the timer.
 *
 * Currently covers `transactions` only. Adding tables means importing
 * their `sync*()` and chaining the calls in `runOnce`.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const ledgers = useLedgers();
  const { isOnline } = useNetworkStatus();
  const qc = useQueryClient();
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const inflight = useRef(false);
  const wasOffline = useRef(false);

  const ledgerIds = (ledgers.data ?? []).map((l) => l.id);

  async function runOnce() {
    if (inflight.current) return;
    if (!session || ledgerIds.length === 0) return;
    if (!(await isOnlineNow())) return;
    inflight.current = true;
    setStatus('syncing');
    try {
      const result = await syncTransactions({ ledgerIds });
      setLastSyncedAt(new Date());
      setStatus('idle');
      // Bump cached local-DB queries when the store actually changed so
      // screens re-read the freshly-merged rows.
      if (result.pulled > 0 || result.pushed > 0) {
        qc.invalidateQueries({ queryKey: ['local-tx'] });
      }
    } catch {
      setStatus('error');
    } finally {
      inflight.current = false;
    }
  }

  // Boot + poll.
  useEffect(() => {
    if (!session || ledgerIds.length === 0) return;
    runOnce();
    const t = setInterval(runOnce, POLL_INTERVAL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, ledgerIds.join(',')]);

  // Resume sync the moment the device comes back online.
  useEffect(() => {
    if (isOnline && wasOffline.current) {
      wasOffline.current = false;
      runOnce();
    } else if (!isOnline) {
      wasOffline.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  return (
    <Ctx.Provider
      value={{ status, lastSyncedAt, isOnline, syncNow: runOnce }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useSync() {
  return useContext(Ctx);
}
