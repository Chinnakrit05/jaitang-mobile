import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { signInWithEmail, signInWithGoogle } from '../../lib/auth';
import { useTheme } from '../../providers/ThemeProvider';

/**
 * Minimal sign-in screen — Google button + a dev-only email/password
 * form (gated by `__DEV__` so it's stripped from production bundles).
 * Full UI design pending; this exists so the auth flow can be
 * smoke-tested end-to-end.
 */
export default function LoginScreen() {
  const { t } = useTranslation();
  const c = useTheme().colors;
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
    <View
      className="flex-1 items-center justify-center px-6"
      style={{ backgroundColor: c.bg }}
    >
      <Text
        className="text-3xl font-semibold mb-2"
        style={{ color: c.text }}
      >
        Jaitang
      </Text>
      <Text
        className="text-sm text-center mb-10"
        style={{ color: c.textSecondary }}
      >
        {t('landing.subtitle', 'สมุดบัญชีในใจ')}
      </Text>

      <Pressable
        onPress={onSignIn}
        disabled={pending}
        className="w-full max-w-xs px-6 py-3 rounded-xl active:opacity-80"
        style={{ backgroundColor: c.accent }}
      >
        {pending ? (
          <ActivityIndicator color={c.accentText} />
        ) : (
          <Text
            className="text-center font-semibold"
            style={{ color: c.accentText }}
          >
            {t('login.googleButton', 'Continue with Google')}
          </Text>
        )}
      </Pressable>

      {error && (
        <Text
          className="mt-4 text-xs text-center"
          style={{ color: c.expense }}
        >
          {error}
        </Text>
      )}

      {__DEV__ && (
        <View
          className="w-full max-w-xs mt-10 pt-6 border-t"
          style={{ borderTopColor: c.border }}
        >
          <Text
            className="text-[10px] uppercase tracking-wider mb-2 text-center"
            style={{ color: c.textMuted }}
          >
            Dev sign-in
          </Text>
          <TextInput
            value={devEmail}
            onChangeText={setDevEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="email"
            placeholderTextColor={c.textMuted}
            className="px-3 py-2.5 mb-2 rounded-lg border text-sm"
            style={{
              backgroundColor: c.card,
              borderColor: c.border,
              color: c.text,
            }}
          />
          <TextInput
            value={devPassword}
            onChangeText={setDevPassword}
            secureTextEntry
            placeholder="password"
            placeholderTextColor={c.textMuted}
            className="px-3 py-2.5 mb-2 rounded-lg border text-sm"
            style={{
              backgroundColor: c.card,
              borderColor: c.border,
              color: c.text,
            }}
          />
          <Pressable
            onPress={onDevSignIn}
            disabled={pending || !devEmail || !devPassword}
            className="w-full px-4 py-2.5 rounded-lg border active:opacity-60 disabled:opacity-40"
            style={{
              borderColor: c.border,
              backgroundColor: c.card,
            }}
          >
            {pending ? (
              <ActivityIndicator color={c.accent} />
            ) : (
              <Text
                className="text-center text-sm font-medium"
                style={{ color: c.text }}
              >
                Dev sign in
              </Text>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}
