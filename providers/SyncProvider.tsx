import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from './AuthProvider';
import { isOnlineNow, useNetworkStatus } from '../lib/network';
import { syncTransactions } from '../lib/sync/transactions';
import { pullLedgers } from '../lib/sync/ledgers';
import { pullCategories } from '../lib/sync/categories';
import { pullAccounts } from '../lib/sync/accounts';
import { pullRecurring } from '../lib/sync/recurring';
import { listLocalLedgers } from '../lib/db/ledgers';

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
 * Drives the offline sync loop. Pulls ledgers first (uses the session
 * directly — no local-data dependency to bootstrap from), then derives
 * the user's ledger ids from the freshly-updated local mirror to fan
 * out into categories / accounts / transactions.
 *
 * Schedule: fires immediately on sign-in, every 30 s after that, and
 * again the moment network reachability flips from offline → online.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const { isOnline } = useNetworkStatus();
  const qc = useQueryClient();
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const inflight = useRef(false);
  const wasOffline = useRef(false);

  async function runOnce() {
    if (inflight.current) return;
    if (!session) return;
    if (!(await isOnlineNow())) return;
    inflight.current = true;
    setStatus('syncing');
    try {
      // 1. Ledgers first — no local-data dependency, drives everything else.
      const ledgerResult = await pullLedgers();

      // 2. Derive ledger ids from the local mirror that was just refreshed.
      const localLedgers = await listLocalLedgers();
      const ledgerIds = localLedgers.map((l) => l.id);

      // 3. Per-ledger pulls (categories + accounts + recurring in
      // parallel — all small, all read-only mirrors).
      const [catResult, accResult, recResult] = await Promise.all([
        pullCategories({ ledgerIds }),
        pullAccounts({ ledgerIds }),
        pullRecurring({ ledgerIds }),
      ]);

      // 4. Transactions last (push-then-pull, may take longer).
      const txResult = await syncTransactions({ ledgerIds });

      setLastSyncedAt(new Date());
      setStatus('idle');

      // Bump caches that actually saw work. Each hook lives behind its
      // own query key so consumers only re-render when their table moved.
      if (ledgerResult.pulled > 0) qc.invalidateQueries({ queryKey: ['local-ledgers'] });
      if (catResult.pulled > 0) qc.invalidateQueries({ queryKey: ['local-categories'] });
      if (accResult.pulled > 0) qc.invalidateQueries({ queryKey: ['local-accounts'] });
      if (recResult.pulled > 0) qc.invalidateQueries({ queryKey: ['local-recurring'] });
      if (txResult.pulled > 0 || txResult.pushed > 0) {
        qc.invalidateQueries({ queryKey: ['local-tx'] });
      }
    } catch {
      setStatus('error');
    } finally {
      inflight.current = false;
    }
  }

  // Boot + poll. Re-runs when the user signs in/out.
  useEffect(() => {
    if (!session) return;
    runOnce();
    const t = setInterval(runOnce, POLL_INTERVAL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

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
