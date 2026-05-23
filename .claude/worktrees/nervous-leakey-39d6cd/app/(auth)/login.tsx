import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { signInWithEmail, signInWithGoogle } from '../../lib/auth';

/**
 * Minimal sign-in screen — Google button + a dev-only email/password
 * form (gated by `__DEV__` so it's stripped from production bundles).
 * Full UI design pending; this exists so the auth flow can be
 * smoke-tested end-to-end.
 */
export default function LoginScreen() {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dev-only fields. Prefilled from env vars when present so a tap on
  // "Dev sign in" is a one-step bypass of the Google OAuth round-trip.
  const [devEmail, setDevEmail] = useState(
    process.env.EXPO_PUBLIC_DEV_EMAIL ?? '',
  );
  const [devPassword, setDevPassword] = useState(
    process.env.EXPO_PUBLIC_DEV_PASSWORD ?? '',
  );

  async function onSignIn() {
    setError(null);
    setPending(true);
    try {
      const result = await signInWithGoogle();
      if (!result.ok) {
        // User dismissed the browser, denied permissions, or the
        // callback didn't contain tokens. Either way: user-recoverable.
        setError(t('common.cancelled', 'Cancelled'));
      }
      // On success, AuthProvider picks up the new session via
      // onAuthStateChange and the root index redirects us out of (auth).
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed');
    } finally {
      setPending(false);
    }
  }

  async function onDevSignIn() {
    setError(null);
    setPending(true);
    try {
      await signInWithEmail(devEmail.trim(), devPassword);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Dev sign-in failed');
    } finally {
      setPending(false);
    }
  }

  return (
    <View className="flex-1 items-center justify-center bg-white px-6">
      <Text className="text-3xl font-semibold mb-2">Jaitang</Text>
      <Text className="text-sm text-zinc-500 text-center mb-10">
        {t('landing.subtitle', 'สมุดบัญชีในใจ')}
      </Text>

      <Pressable
        onPress={onSignIn}
        disabled={pending}
        className="w-full max-w-xs px-6 py-3 rounded-xl bg-zinc-900 active:opacity-80"
      >
        {pending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-white text-center font-semibold">
            {t('login.googleButton', 'Continue with Google')}
          </Text>
        )}
      </Pressable>

      {error && (
        <Text className="mt-4 text-xs text-red-600 text-center">{error}</Text>
      )}

      {__DEV__ && (
        <View className="w-full max-w-xs mt-10 pt-6 border-t border-zinc-200">
          <Text className="text-[10px] uppercase tracking-wider text-zinc-400 mb-2 text-center">
            Dev sign-in
          </Text>
          <TextInput
            value={devEmail}
            onChangeText={setDevEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="email"
            className="px-3 py-2.5 mb-2 rounded-lg border border-zinc-200 bg-zinc-50 text-sm"
          />
          <TextInput
            value={devPassword}
            onChangeText={setDevPassword}
            secureTextEntry
            placeholder="password"
            className="px-3 py-2.5 mb-2 rounded-lg border border-zinc-200 bg-zinc-50 text-sm"
          />
          <Pressable
            onPress={onDevSignIn}
            disabled={pending || !devEmail || !devPassword}
            className="w-full px-4 py-2.5 rounded-lg border border-zinc-300 active:opacity-60 disabled:opacity-40"
          >
            {pending ? (
              <ActivityIndicator />
            ) : (
              <Text className="text-center text-sm font-medium text-zinc-700">
                Dev sign in
              </Text>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}
