import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLedgers } from '../../lib/queries/ledgers';
import { useActiveLedger } from '../../providers/ActiveLedgerProvider';
import { EmojiOrIcon } from '../../components/icons/EmojiOrIcon';
import { JtIcon } from '../../components/icons/JtIcon';

export default function LedgersScreen() {
  const ledgers = useLedgers();
  const { ledger: active, setActiveLedger } = useActiveLedger();

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="px-5 pt-2 pb-3 border-b border-zinc-100">
        <Text className="text-2xl font-semibold">Ledgers</Text>
        <Text className="text-xs text-zinc-500 mt-0.5">
          Tap to switch the active book
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
        {ledgers.isLoading ? (
          <ActivityIndicator />
        ) : ledgers.error ? (
          <Text className="text-red-600 text-sm">{String(ledgers.error)}</Text>
        ) : (
          (ledgers.data ?? []).map((l) => {
            const isActive = l.id === active?.id;
            return (
              <Pressable
                key={l.id}
                onPress={() => setActiveLedger(l.id)}
                className={`flex-row items-center gap-3 rounded-2xl border p-4 ${
                  isActive ? 'border-cyan-500 bg-cyan-50' : 'border-zinc-200'
                }`}
              >
                <EmojiOrIcon value={l.icon} fallback="users" size={32} />
                <View className="flex-1">
                  <Text className="font-semibold">{l.name}</Text>
                  <Text className="text-xs text-zinc-500">
                    {l.is_personal ? 'Personal' : 'Shared'} · {l.role} ·{' '}
                    {l.currency}
                  </Text>
                </View>
                {isActive && (
                  <JtIcon name="check" size={22} />
                )}
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
