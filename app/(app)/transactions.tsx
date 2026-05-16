import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useActiveLedger } from '../../providers/ActiveLedgerProvider';
import { useLocalTransactions } from '../../lib/queries/transactions-local';
import type { LocalTx } from '../../lib/sync/transactions';
import { useCategories } from '../../lib/queries/categories';
import { formatCurrency, formatDate } from '../../lib/format';
import { EmojiOrIcon } from '../../components/icons/EmojiOrIcon';

/**
 * Read-only transaction list for the active ledger. Latest 100 entries,
 * grouped visually by tinted row backgrounds. Quick-add / edit flows
 * land on a separate screen.
 */
export default function TransactionsScreen() {
  const { ledger, loading: ledgerLoading } = useActiveLedger();
  const txs = useLocalTransactions({ ledgerId: ledger?.id, limit: 100 });
  const cats = useCategories(ledger?.id);
  const catById = new Map((cats.data ?? []).map((c) => [c.id, c]));

  if (ledgerLoading || txs.isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </SafeAreaView>
    );
  }
  if (txs.error) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white p-4">
        <Text className="text-red-600">{String(txs.error)}</Text>
      </SafeAreaView>
    );
  }
  if (!ledger) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white">
        <Text className="text-zinc-500">No active ledger.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="px-5 pt-2 pb-3 border-b border-zinc-100">
        <Text className="text-2xl font-semibold">Transactions</Text>
        <Text className="text-xs text-zinc-500 mt-0.5">
          {ledger.name} · latest {txs.data?.length ?? 0}
        </Text>
      </View>
      <FlatList
        data={txs.data ?? []}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => (
          <Row
            tx={item}
            category={item.category_id ? catById.get(item.category_id) ?? null : null}
            currency={ledger.currency}
          />
        )}
        ItemSeparatorComponent={() => (
          <View className="h-px bg-zinc-100 ml-16" />
        )}
        ListEmptyComponent={() => (
          <View className="p-8 items-center">
            <Text className="text-zinc-500">No transactions yet.</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function Row({
  tx,
  category,
  currency,
}: {
  tx: LocalTx;
  category: { name: string; icon: string | null } | null;
  currency: string;
}) {
  const isExpense = tx.kind === 'expense';
  const pending = tx._sync_state !== 'clean';
  return (
    <View
      className={`flex-row items-center gap-3 px-4 py-3 ${
        pending ? 'bg-amber-50' : ''
      }`}
    >
      <EmojiOrIcon value={category?.icon} fallback="sparkle" size={28} />
      <View className="flex-1 min-w-0">
        <Text className="font-medium" numberOfLines={1}>
          {tx.note?.trim() || category?.name || '—'}
        </Text>
        <Text className="text-xs text-zinc-500 mt-0.5">
          {category?.name ?? 'No category'} · {formatDate(tx.occurred_at)}
          {pending ? ' · pending' : ''}
        </Text>
      </View>
      <Text
        className={`text-base font-semibold tabular-nums ${
          isExpense ? 'text-red-600' : 'text-green-600'
        }`}
      >
        {isExpense ? '−' : '+'}
        {formatCurrency(tx.amount, currency)}
      </Text>
    </View>
  );
}
