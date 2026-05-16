import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useSync } from '../providers/SyncProvider';
import { countPendingTransactions } from '../lib/db/transactions';

/**
 * Tiny status indicator: shows offline / syncing / synced + the count
 * of pending local writes waiting to upload. Tap to force a sync.
 */
export function SyncStatusBadge() {
  const { status, isOnline, syncNow, lastSyncedAt } = useSync();
  const [pending, setPending] = useState(0);

  // Refresh the pending count whenever a sync just finished — that's
  // when the queue depth most likely changed.
  useEffect(() => {
    countPendingTransactions().then(setPending).catch(() => {});
  }, [status, lastSyncedAt]);

  const label = !isOnline
    ? 'Offline'
    : status === 'syncing'
      ? 'Syncing…'
      : status === 'error'
        ? 'Sync error'
        : pending > 0
          ? `${pending} pending`
          : 'Synced';

  const color = !isOnline
    ? 'bg-zinc-200 text-zinc-600'
    : status === 'syncing'
      ? 'bg-cyan-100 text-cyan-700'
      : status === 'error'
        ? 'bg-red-100 text-red-700'
        : pending > 0
          ? 'bg-amber-100 text-amber-700'
          : 'bg-green-100 text-green-700';

  return (
    <Pressable
      onPress={() => syncNow()}
      className={`self-start px-2 py-1 rounded-full ${color.split(' ')[0]}`}
    >
      <View>
        <Text className={`text-[10px] font-medium ${color.split(' ')[1]}`}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
