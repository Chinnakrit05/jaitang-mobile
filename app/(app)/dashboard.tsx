import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../providers/AuthProvider';
import { useActiveLedger } from '../../providers/ActiveLedgerProvider';
import { signOut } from '../../lib/auth';
import { useMonthTransactions } from '../../lib/queries/transactions';
import { formatCurrency } from '../../lib/format';
import { EmojiOrIcon } from '../../components/icons/EmojiOrIcon';

/**
 * Placeholder dashboard — proves Supabase RLS + active-ledger selection
 * end-to-end. UI design will replace this entirely; for now it shows the
 * signed-in email, the active ledger, this-month totals, and a sign-out
 * button.
 */
export default function DashboardScreen() {
  const { session } = useAuth();
  const { ledger, loading: ledgerLoading } = useActiveLedger();
  const txs = useMonthTransactions(ledger?.id);

  const monthIncome = (txs.data ?? [])
    .filter((t) => t.kind === 'income')
    .reduce((s, t) => s + t.amount, 0);
  const monthExpense = (txs.data ?? [])
    .filter((t) => t.kind === 'expense')
    .reduce((s, t) => s + t.amount, 0);
  const monthNet = monthIncome - monthExpense;

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <View>
          <Text className="text-xs uppercase tracking-wider text-zinc-400">
            Signed in as
          </Text>
          <Text className="text-base font-medium mt-0.5">
            {session?.user.email ?? '—'}
          </Text>
        </View>

        {ledgerLoading ? (
          <ActivityIndicator />
        ) : ledger ? (
          <View className="rounded-2xl border border-zinc-200 p-4">
            <View className="flex-row items-center gap-3 mb-4">
              <EmojiOrIcon value={ledger.icon} fallback="users" size={32} />
              <View className="flex-1">
                <Text className="font-semibold">{ledger.name}</Text>
                <Text className="text-xs text-zinc-500">
                  {ledger.is_personal ? 'Personal' : 'Shared'} · {ledger.role} ·{' '}
                  {ledger.currency}
                </Text>
              </View>
            </View>

            {txs.isLoading ? (
              <ActivityIndicator />
            ) : txs.error ? (
              <Text className="text-red-600 text-sm">{String(txs.error)}</Text>
            ) : (
              <View className="flex-row gap-3">
                <Stat
                  label="This month income"
                  value={monthIncome}
                  currency={ledger.currency}
                  tone="income"
                />
                <Stat
                  label="This month expense"
                  value={monthExpense}
                  currency={ledger.currency}
                  tone="expense"
                />
                <Stat
                  label="Net"
                  value={monthNet}
                  currency={ledger.currency}
                />
              </View>
            )}
          </View>
        ) : (
          <Text className="text-sm text-zinc-500">
            No ledgers — sign in to the web app first to create one.
          </Text>
        )}

        <Pressable
          onPress={() => signOut()}
          className="self-start px-4 py-2 rounded-lg border border-zinc-200 active:opacity-60"
        >
          <Text className="text-sm">Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({
  label,
  value,
  currency,
  tone,
}: {
  label: string;
  value: number;
  currency: string;
  tone?: 'income' | 'expense';
}) {
  const color =
    tone === 'income'
      ? 'text-green-600'
      : tone === 'expense'
        ? 'text-red-600'
        : 'text-zinc-900';
  return (
    <View className="flex-1">
      <Text className="text-[10px] uppercase tracking-wider text-zinc-400">
        {label}
      </Text>
      <Text className={`text-base font-semibold tabular-nums mt-1 ${color}`}>
        {formatCurrency(value, currency)}
      </Text>
    </View>
  );
}
