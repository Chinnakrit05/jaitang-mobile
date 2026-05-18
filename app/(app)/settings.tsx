import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { useAuth } from '../../providers/AuthProvider';
import { useActiveLedger } from '../../providers/ActiveLedgerProvider';
import { useTheme } from '../../providers/ThemeProvider';
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
import {
  LOCALES,
  LOCALE_LABELS,
  currentLocale,
  setLocale,
  type Locale,
} from '../../lib/i18n';
import { JtIcon, type IconName } from '../../components/icons/JtIcon';

type Colors = ReturnType<typeof useTheme>['colors'];

export default function SettingsScreen() {
  const { session } = useAuth();
  const { t } = useTranslation();
  const iconStyle = useIconStyle();
  const setIconStyle = useSetIconStyle();
  const { ledger } = useActiveLedger();
  const { mode, setMode, oled, setOled, isDark } = useTheme();
  const c = useTheme().colors;
  const locale = currentLocale();

  const ledgerMeta = ledger
    ? `${ledger.is_personal ? t('ledgers.personal') : t('ledgers.shared')} · ${ledger.role} · ${ledger.currency}`
    : t('ledgers.subtitle');

  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: c.bg }}
      edges={['top']}
    >
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 96, gap: 16 }}>
        <View className="flex-row items-center justify-between">
          <View>
            <Text style={{ color: c.text, fontSize: 24, fontWeight: '800' }}>
              {t('settings.title')}
            </Text>
            <Text style={{ color: c.textSecondary, fontSize: 13, marginTop: 3 }}>
              {t('settings.subtitle')}
            </Text>
          </View>
          <View
            className="w-11 h-11 rounded-full items-center justify-center"
            style={{ backgroundColor: c.cardElevated }}
          >
            <JtIcon name="settings" size={24} />
          </View>
        </View>

        <View
          className="rounded-3xl p-4 flex-row items-center gap-3"
          style={{ backgroundColor: c.cardElevated }}
        >
          <View
            className="w-14 h-14 rounded-full items-center justify-center"
            style={{ backgroundColor: c.chip }}
          >
            <Text style={{ fontSize: 26 }}>🦊</Text>
          </View>
          <View className="flex-1 min-w-0">
            <Text style={{ color: c.textSecondary, fontSize: 11, fontWeight: '700' }}>
              {t('settings.accountSection')}
            </Text>
            <Text
              numberOfLines={1}
              style={{ color: c.text, fontSize: 15, fontWeight: '700', marginTop: 3 }}
            >
              {session?.user.email ?? '—'}
            </Text>
            <Text
              numberOfLines={1}
              style={{ color: c.textSecondary, fontSize: 12, marginTop: 2 }}
            >
              {ledger ? `${ledger.name} · ${ledger.currency}` : t('dashboard.noLedgerTitle')}
            </Text>
          </View>
        </View>

        <Section title={t('nav.ledgers')} icon="ledgers" colors={c}>
          <SettingRow
            icon="books"
            title={ledger ? ledger.name : t('nav.ledgers')}
            subtitle={ledgerMeta}
            colors={c}
            onPress={() => router.push('/(app)/ledgers')}
          />
          <SettingRow
            icon="plus-fab"
            title={t('ledgers.createNew')}
            subtitle={t('onboarding.subtitle')}
            colors={c}
            onPress={() => router.push('/(app)/onboarding-ledger')}
          />
        </Section>

        <Section title={t('settings.themeSection')} icon="sun" colors={c}>
          <View className="p-3">
            <Text style={{ color: c.text, fontSize: 13, fontWeight: '700', marginBottom: 10 }}>
              {t('theme.modeTitle')}
            </Text>
            <ChoiceGrid columns={3}>
              {(['light', 'dark', 'system'] as const).map((m) => (
                <ChoicePill
                  key={m}
                  label={t(`theme.mode.${m}`)}
                  selected={mode === m}
                  colors={c}
                  onPress={() => setMode(m)}
                />
              ))}
            </ChoiceGrid>
          </View>

          {isDark && (
            <View className="px-3 pb-3">
              <Text style={{ color: c.text, fontSize: 13, fontWeight: '700', marginBottom: 10 }}>
                {t('theme.oledTitle')}
              </Text>
              <ChoiceGrid columns={2}>
                <ChoicePill
                  label={t('common.close')}
                  selected={!oled}
                  colors={c}
                  onPress={() => setOled(false)}
                />
                <ChoicePill
                  label="OLED"
                  selected={oled}
                  colors={c}
                  onPress={() => setOled(true)}
                />
              </ChoiceGrid>
              <Text style={{ color: c.textMuted, fontSize: 11, marginTop: 8 }}>
                {t('theme.oledHint')}
              </Text>
            </View>
          )}
        </Section>

        <Section title={t('settings.languageSection')} icon="globe" colors={c}>
          <View className="p-3">
            <ChoiceGrid columns={2}>
              {LOCALES.map((loc) => (
                <ChoicePill
                  key={loc}
                  label={LOCALE_LABELS[loc]}
                  selected={locale === loc}
                  colors={c}
                  onPress={() => void setLocale(loc as Locale)}
                />
              ))}
            </ChoiceGrid>
          </View>
        </Section>

        <Section title={t('theme.iconStyleTitle')} icon="sparkles" colors={c}>
          <View className="p-3 gap-2">
            {ICON_STYLES.map((style) => (
              <Pressable
                key={style}
                onPress={() => setIconStyle(style as IconStyle)}
                className="flex-row items-center gap-3 rounded-2xl p-3"
                style={{
                  backgroundColor: iconStyle === style ? c.accentSoft : c.bg,
                  borderWidth: 1,
                  borderColor: iconStyle === style ? c.accent : c.border,
                }}
              >
                <View
                  className="w-10 h-10 rounded-full items-center justify-center"
                  style={{ backgroundColor: c.card }}
                >
                  <JtIcon name="sparkle" size={22} styleOverride={style as IconStyle} />
                </View>
                <Text
                  style={{
                    color: c.text,
                    fontSize: 14,
                    fontWeight: iconStyle === style ? '800' : '600',
                    flex: 1,
                  }}
                >
                  {ICON_STYLE_LABELS[style]}
                </Text>
                {iconStyle === style ? <Text style={{ color: c.accent, fontWeight: '900' }}>✓</Text> : null}
              </Pressable>
            ))}
          </View>
        </Section>

        <Pressable
          onPress={() => signOut()}
          className="rounded-2xl p-4 flex-row items-center gap-3"
          style={{ backgroundColor: c.card }}
        >
          <View
            className="w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: c.expenseBg }}
          >
            <JtIcon name="logout" size={20} />
          </View>
          <Text style={{ color: c.expense, fontSize: 14, fontWeight: '800', flex: 1 }}>
            {t('common.logoutFull')}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({
  title,
  icon,
  colors,
  children,
}: {
  title: string;
  icon: IconName;
  colors: Colors;
  children: React.ReactNode;
}) {
  return (
    <View>
      <View className="flex-row items-center gap-2 mb-2 px-1">
        <JtIcon name={icon} size={16} />
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 11,
            fontWeight: '800',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          {title}
        </Text>
      </View>
      <View
        className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: colors.card }}
      >
        {children}
      </View>
    </View>
  );
}

function SettingRow({
  icon,
  title,
  subtitle,
  colors,
  onPress,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  colors: Colors;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 px-4 py-3.5"
      style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
    >
      <View
        className="w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: colors.chip }}
      >
        <JtIcon name={icon} size={20} />
      </View>
      <View className="flex-1 min-w-0">
        <Text numberOfLines={1} style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>
          {title}
        </Text>
        <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
          {subtitle}
        </Text>
      </View>
      <Text style={{ color: colors.textMuted, fontSize: 22 }}>›</Text>
    </Pressable>
  );
}

function ChoiceGrid({
  columns,
  children,
}: {
  columns: 2 | 3;
  children: React.ReactNode;
}) {
  return (
    <View className="flex-row flex-wrap" style={{ marginHorizontal: -4 }}>
      {Array.isArray(children)
        ? children.map((child, idx) => (
            <View key={idx} style={{ width: `${100 / columns}%`, padding: 4 }}>
              {child}
            </View>
          ))
        : children}
    </View>
  );
}

function ChoicePill({
  label,
  selected,
  colors,
  onPress,
}: {
  label: string;
  selected: boolean;
  colors: Colors;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="rounded-2xl px-3 py-3 items-center justify-center"
      style={{
        minHeight: 48,
        backgroundColor: selected ? colors.accent : colors.bg,
        borderWidth: 1,
        borderColor: selected ? colors.accent : colors.border,
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          color: selected ? colors.accentText : colors.text,
          fontSize: 13,
          fontWeight: selected ? '800' : '600',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
