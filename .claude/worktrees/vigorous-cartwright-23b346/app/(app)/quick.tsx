import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { useActiveLedger } from '../../providers/ActiveLedgerProvider';
import { useCategories } from '../../lib/queries/categories';
import { useCreateTransaction } from '../../lib/queries/transactions-local';
import { EmojiOrIcon } from '../../components/icons/EmojiOrIcon';
import { sortCategoriesByHierarchy } from '../../lib/categories-helpers';

/**
 * Minimal quick-add screen. Big amount input + kind toggle + category
 * chip picker + note. Writes to the local DB immediately (works
 * offline); SyncProvider uploads it on the next pass.
 *
 * Layout is intentionally bare — design comes later. The form fields
 * cover the same shape as the web app's quick-add server action so
 * the AI parser / category suggestion can be ported on top later.
 */
export default function QuickAddScreen() {
  const { ledger } = useActiveLedger();
  const cats = useCategories(ledger?.id);
  const create = useCreateTransaction();

  const [kind, setKind] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visibleCats = sortCategoriesByHierarchy(
    (cats.data ?? []).filter((c) => c.kind === kind),
  );

  function reset() {
    setAmount('');
    setNote('');
    setCategoryId(null);
    setError(null);
  }

  async function save() {
    setError(null);
    const value = Number(amount.replace(/,/g, ''));
    if (!ledger) {
      setError('No active ledger');
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter an amount');
      return;
    }
    try {
      await create.mutateAsync({
        ledger_id: ledger.id,
        kind,
        amount: value,
        note: note.trim() || null,
        category_id: categoryId,
        occurred_at: new Date().toISOString(),
      });
      reset();
      router.replace('/(app)/transactions');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <Text className="text-2xl font-semibold">Quick add</Text>

        <View className="flex-row gap-2">
          <Pressable
            onPress={() => setKind('expense')}
            className={`flex-1 py-2 rounded-lg border ${
              kind === 'expense'
                ? 'border-red-500 bg-red-50'
                : 'border-zinc-200'
            }`}
          >
            <Text className="text-center font-medium">Expense</Text>
          </Pressable>
          <Pressable
            onPress={() => setKind('income')}
            className={`flex-1 py-2 rounded-lg border ${
              kind === 'income'
                ? 'border-green-500 bg-green-50'
                : 'border-zinc-200'
            }`}
          >
            <Text className="text-center font-medium">Income</Text>
          </Pressable>
        </View>

        <View>
          <Text className="text-xs uppercase tracking-wider text-zinc-400 mb-1">
            Amount ({ledger?.currency ?? 'THB'})
          </Text>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0.00"
            className="text-3xl font-semibold tabular-nums px-3 py-3 rounded-xl border border-zinc-200 bg-zinc-50"
          />
        </View>

        <View>
          <Text className="text-xs uppercase tracking-wider text-zinc-400 mb-2">
            Category
          </Text>
          {cats.isLoading ? (
            <ActivityIndicator />
          ) : (
            <View className="flex-row flex-wrap gap-2">
              {visibleCats.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => setCategoryId(c.id === categoryId ? null : c.id)}
                  className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border ${
                    categoryId === c.id
                      ? 'border-cyan-500 bg-cyan-50'
                      : 'border-zinc-200'
                  }`}
                >
                  <EmojiOrIcon value={c.icon} fallback="sparkle" size={16} />
                  <Text className="text-sm">
                    {c.parent_id ? '↳ ' : ''}
                    {c.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <View>
          <Text className="text-xs uppercase tracking-wider text-zinc-400 mb-1">
            Note (optional)
          </Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="e.g. กาแฟตอนเช้า"
            className="px-3 py-2.5 rounded-xl border border-zinc-200 bg-zinc-50"
          />
        </View>

        {error && (
          <Text className="text-sm text-red-600">{error}</Text>
        )}

        <Pressable
          onPress={save}
          disabled={create.isPending}
          className="px-4 py-3 rounded-xl bg-zinc-900 active:opacity-80"
        >
          {create.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white text-center font-semibold">Save</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
