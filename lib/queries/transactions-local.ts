import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import {
  createLocalTransaction,
  deleteLocalTransaction,
  listLocalTransactions,
  type NewTxInput,
} from '../db/transactions';
import { useAuth } from '../../providers/AuthProvider';
import { useSync } from '../../providers/SyncProvider';
import type { LocalTx } from '../sync/transactions';

/**
 * React Query hooks that read from the local SQLite store. The same
 * `useTransactions` shape the Supabase-backed version exposed, but the
 * data is always available offline; the sync engine keeps the rows
 * fresh in the background.
 *
 * Invalidation: SyncProvider calls `queryClient.invalidateQueries(['local-tx'])`
 * after each successful pass so a remote write made on another device
 * shows up automatically.
 */

const QK = ['local-tx'] as const;

export function useLocalTransactions(opts: {
  ledgerId: string | undefined;
  limit?: number;
}) {
  return useQuery<LocalTx[]>({
    queryKey: [...QK, opts.ledgerId, opts.limit ?? 100],
    queryFn: () => listLocalTransactions({ ledgerId: opts.ledgerId!, limit: opts.limit }),
    enabled: !!opts.ledgerId,
  });
}

export function useLocalMonthTransactions(ledgerId: string | undefined) {
  const all = useLocalTransactions({ ledgerId, limit: 500 });
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  const data = (all.data ?? []).filter(
    (t) => t.occurred_at >= from && t.occurred_at < to,
  );
  return { ...all, data };
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  const { syncNow } = useSync();
  return useMutation({
    mutationFn: async (id: string) => {
      await deleteLocalTransaction(id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      void syncNow();
    },
  });
}

export function useCreateTransaction() {
  const qc = useQueryClient();
  const { session } = useAuth();
  const { syncNow } = useSync();
  return useMutation({
    mutationFn: async (input: Omit<NewTxInput, 'user_id'>) => {
      const userId = session?.user.id;
      if (!userId) throw new Error('Not signed in');
      const id = await createLocalTransaction({ ...input, user_id: userId });
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      // Fire-and-forget push so the new row uploads ASAP if we're online
      // — no need to wait for the next 30 s tick.
      void syncNow();
    },
  });
}
