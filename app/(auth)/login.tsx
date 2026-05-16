import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

/**
 * Placeholder login screen — UI design will land later. Sign-in flow
 * (Google OAuth via Supabase Auth + expo-auth-session) hooks up in a
 * follow-up commit once the env vars + Google client IDs are in place.
 */
export default function LoginScreen() {
  const { t } = useTranslation();
  return (
    <View className="flex-1 items-center justify-center bg-white px-6">
      <Text className="text-2xl font-semibold mb-2">Jaitang</Text>
      <Text className="text-sm text-zinc-500 text-center">
        {t('landing.subtitle', 'สมุดบัญชีในใจ')}
      </Text>
      <Text className="mt-8 text-xs text-zinc-400">
        TODO: Google sign-in button (Supabase Auth + expo-auth-session)
      </Text>
    </View>
  );
}
