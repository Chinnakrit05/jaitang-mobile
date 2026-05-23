import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { useAuth } from '../../providers/AuthProvider';
import { useActiveLedger } from '../../providers/ActiveLedgerProvider';
import { signOut } from '../../lib/auth';
import {
  useIconStyle,
  useSetIconStyle,
} from '../../components/icons/IconStyleContext';
import {
  ICON_STYLES,
  ICON_STYLE_LABELS,
  type IconStyle,
} from '../../components/icons/icon-names';
import { LOCALES, LOCALE_LABELS, setLocale, type Locale } from '../../lib/i18n';
import { EmojiOrIcon } from '../../components/icons/EmojiOrIcon';

export default function SettingsScreen() {
  const { session } = useAuth();
  const { t, i18n } = useTranslation();
  const iconStyle = useIconStyle();
  const setIconStyle = useSetIconStyle();
  const { ledger } = useActiveLedger();

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView contentContainerStyle={{ padding: 20, gap: 24 }}>
        <View>
          <Text className="text-xs uppercase tracking-wider text-zinc-400">
            Signed in as
          </Text>
          <Text className="text-base font-medium mt-0.5">
            {session?.user.email ?? '—'}
          </Text>
        </View>

        {/* Ledger management */}
        <Section title="สมุดบัญชี">
          <Pressable
            onPress={() => router.push('/(app)/ledgers')}
            className="flex-row items-center gap-3 px-4 py-3 border-b border-zinc-100 active:bg-zinc-50"
          >
            <EmojiOrIcon value={ledger?.icon} fallback="users" size={24} />
            <View className="flex-1">
              <Text className="text-sm font-medium">
                {ledger ? ledger.name : 'จัดการสมุดบัญชี'}
              </Text>
              <Text className="text-xs text-zinc-500 mt-0.5">
                {ledger
                  ? `${ledger.is_personal ? 'ส่วนตัว' : 'แชร์'} · ${ledger.role} · ${ledger.currency}`
                  : 'สลับสมุดที่ใช้งาน · สร้างเล่มใหม่'}
              </Text>
            </View>
            <Text className="text-zinc-400 text-lg">›</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/(app)/onboarding-ledger')}
            className="flex-row items-center gap-3 px-4 py-3 active:bg-zinc-50"
          >
            <View className="w-6 h-6 items-center justify-center">
              <Text className="text-zinc-500 text-lg">＋</Text>
            </View>
            <Text className="text-sm">สร้างสมุดเล่มใหม่</Text>
          </Pressable>
        </Section>

        <Section title="Icon style">
          {ICON_STYLES.map((style) => (
            <Choice
              key={style}
              label={ICON_STYLE_LABELS[style]}
              selected={iconStyle === style}
              onPress={() => setIconStyle(style as IconStyle)}
            />
          ))}
        </Section>

        <Section title="Language">
          {LOCALES.map((loc) => (
            <Choice
              key={loc}
              label={LOCALE_LABELS[loc]}
              selected={i18n.language === loc}
              onPress={() => void setLocale(loc as Locale)}
            />
          ))}
        </Section>

        <Pressable
          onPress={() => signOut()}
          className="self-start px-4 py-2 rounded-lg border border-zinc-200 active:opacity-60"
        >
          <Text className="text-sm">{t('account.signOut', { defaultValue: 'Sign out' })}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View>
      <Text className="text-xs uppercase tracking-wider text-zinc-400 mb-2">
        {title}
      </Text>
      <View className="rounded-2xl border border-zinc-200 overflow-hidden">
        {children}
      </View>
    </View>
  );
}

function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center justify-between px-4 py-3 border-b border-zinc-100 active:bg-zinc-50 ${
        selected ? 'bg-cyan-50' : ''
      }`}
    >
      <Text className="text-sm">{label}</Text>
      {selected ? (
        <Text className="text-cyan-600 text-xs font-semibold">✓</Text>
      ) : null}
    </Pressable>
  );
}
