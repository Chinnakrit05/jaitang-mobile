import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../providers/AuthProvider';
import { signOut } from '../../lib/auth';
import { useLedgers } from '../../lib/queries/ledgers';
import { EmojiOrIcon } from '../../components/icons/EmojiOrIcon';

/**
 * Placeholder dashboard — proves end-to-end that the session is real
 * and Supabase RLS is happy. UI design will replace this entirely; for
 * now it just shows the signed-in email + the user's ledgers + a sign
 * out button.
 */
export default function DashboardScreen() {
  const { session } = useAuth();
  const ledgers = useLedgers();

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

        <View>
          <Text className="text-xs uppercase tracking-wider text-zinc-400 mb-2">
            Your ledgers
          </Text>
          {ledgers.isLoading ? (
            <ActivityIndicator />
          ) : ledgers.error ? (
            <Text className="text-red-600 text-sm">{String(ledgers.error)}</Text>
          ) : (
            <View className="gap-2">
              {(ledgers.data ?? []).map((l) => (
                <View
                  key={l.id}
                  className="flex-row items-center gap-3 rounded-xl border border-zinc-200 p-3"
                >
                  <EmojiOrIcon value={l.icon} fallback="users" size={28} />
                  <View className="flex-1">
                    <Text className="font-medium">{l.name}</Text>
                    <Text className="text-xs text-zinc-500">
                      {l.is_personal ? 'Personal' : 'Shared'} · {l.role} ·{' '}
                      {l.currency}
                    </Text>
                  </View>
                </View>
              ))}
              {(ledgers.data ?? []).length === 0 && (
                <Text className="text-sm text-zinc-500">
                  No ledgers found. (Sign in to the web app first to create one.)
                </Text>
              )}
            </View>
          )}
        </View>

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
