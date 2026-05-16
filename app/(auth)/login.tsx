import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { signInWithGoogle } from '../../lib/auth';

/**
 * Minimal sign-in screen — single Google button. Full UI design pending;
 * this exists so the auth flow can be smoke-tested end-to-end.
 */
export default function LoginScreen() {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    </View>
  );
}
