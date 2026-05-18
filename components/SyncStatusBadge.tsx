import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useSync } from '../providers/SyncProvider';
import { countPendingTransactions } from '../lib/db/transactions';
import { useTheme } from '../providers/ThemeProvider';

/**
 * Tiny status indicator: shows offline / syncing / synced + the count
 * of pending local writes waiting to upload. Tap to force a sync.
 */
export function SyncStatusBadge() {
  const { status, isOnline, syncNow, lastSyncedAt } = useSync();
  const c = useTheme().colors;
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

  const colors = !isOnline
    ? { bg: c.chip, text: c.textSecondary }
    : status === 'syncing'
      ? { bg: c.tripBg, text: c.trip }
      : status === 'error'
        ? { bg: c.expenseBg, text: c.expense }
        : pending > 0
          ? { bg: c.accentSoft, text: c.accent }
          : { bg: c.incomeBg, text: c.income };

  return (
    <Pressable
      onPress={() => syncNow()}
      className="self-start px-2 py-1 rounded-full"
      style={{ backgroundColor: colors.bg }}
    >
      <View>
        <Text
          className="text-[10px] font-medium"
          style={{ color: colors.text }}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
