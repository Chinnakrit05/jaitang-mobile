/**
 * Public preview of the dashboard layout — bypasses auth + Supabase so
 * reviewers can see the screen design (and screenshot it) without going
 * through Google login. Delete this file once the design is approved.
 */
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatCurrency } from '../lib/format';
import { EmojiOrIcon } from '../components/icons/EmojiOrIcon';

const MOCK_LEDGER = {
  name: 'ครอบครัวมณีรัตน์',
  icon: 'users',
  is_personal: false,
  role: 'owner' as const,
  currency: 'THB',
};

const MOCK_EMAIL = 'chinnakrit.mek@gmail.com';
const MOCK_INCOME = 38000;
const MOCK_EXPENSE = 22580.5;
const MOCK_NET = MOCK_INCOME - MOCK_EXPENSE;

export default function DashboardPreview() {
  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <View>
          <Text className="text-xs uppercase tracking-wider text-zinc-400">
            Signed in as
          </Text>
          <Text className="text-base font-medium mt-0.5">{MOCK_EMAIL}</Text>
        </View>

        <View className="rounded-2xl border border-zinc-200 p-4">
          <View className="flex-row items-center gap-3 mb-4">
            <EmojiOrIcon value={MOCK_LEDGER.icon} fallback="users" size={32} />
            <View className="flex-1">
              <Text className="font-semibold">{MOCK_LEDGER.name}</Text>
              <Text className="text-xs text-zinc-500">
                {MOCK_LEDGER.is_personal ? 'Personal' : 'Shared'} ·{' '}
                {MOCK_LEDGER.role} · {MOCK_LEDGER.currency}
              </Text>
            </View>
          </View>

          <View className="flex-row gap-3">
            <Stat
              label="This month income"
              value={MOCK_INCOME}
              currency={MOCK_LEDGER.currency}
              tone="income"
            />
            <Stat
              label="This month expense"
              value={MOCK_EXPENSE}
              currency={MOCK_LEDGER.currency}
              tone="expense"
            />
            <Stat
              label="Net"
              value={MOCK_NET}
              currency={MOCK_LEDGER.currency}
            />
          </View>
        </View>

        <Pressable className="self-start px-4 py-2 rounded-lg border border-zinc-200">
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
