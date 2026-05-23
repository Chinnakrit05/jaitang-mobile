import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../../providers/AuthProvider';
import { useActiveLedger } from '../../providers/ActiveLedgerProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { signOut } from '../../lib/auth';
import { JtIcon, type IconName } from '../../components/icons/JtIcon';

/**
 * "More" / เพิ่มเติม tab — central hub for everything that doesn't earn
 * its own slot in the bottom nav. Replaces the old "Profile" tab.
 *
 * Sections:
 *   1. User card — avatar / email / active ledger name (tap → ledgers).
 *   2. ทั่วไป — categories, ledgers, settings.
 *   3. บัญชี — sign out (destructive).
 *
 * Each row routes to an existing screen via expo-router push; only the
 * sign-out is a confirm + RPC.
 */

type RowSpec = {
  icon: IconName;
  label: string;
  hint?: string;
  href?: string;
  onPress?: () => void;
  destructive?: boolean;
};

function ChevronRightIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 6l6 6-6 6"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default function MoreScreen() {
  const { t } = useTranslation();
  const c = useTheme().colors;
  const { session } = useAuth();
  const { ledger } = useActiveLedger();

  function confirmSignOut() {
    Alert.alert(
      t('common.logoutFull'),
      t('more.signOutHint', {
        defaultValue: 'Unsynced local data will stay on this device.',
      }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.logoutFull'),
          style: 'destructive',
          onPress: () => {
            signOut().catch((e) => {
              console.error('signOut failed:', e);
              Alert.alert(
                t('more.signOutFailed', { defaultValue: 'Sign out failed' }),
                String(e?.message ?? e),
              );
            });
          },
        },
      ],
    );
  }

  const general: RowSpec[] = [
    {
      icon: 'accounts',
      label: 'บัญชี / กระเป๋า',
      hint: 'เงินสด, ธนาคาร, อีวอลเล็ต',
      href: '/(app)/accounts',
    },
    {
      icon: 'arrow-left-right',
      label: t('nav.transfers', { defaultValue: 'โอนเงิน' }),
      hint: t('transfers.subtitle', { defaultValue: 'ย้ายเงินระหว่างบัญชี' }),
      href: '/(app)/transfers',
    },
    {
      icon: 'calendar',
      label: t('calendar.title', { defaultValue: 'ปฏิทิน' }),
      hint: t('calendar.subtitle', { defaultValue: 'ดูแผนที่ความเข้มของการใช้จ่ายแต่ละวัน' }),
      href: '/(app)/calendar',
    },
    {
      icon: 'budgets',
      label: t('nav.budgets'),
      hint: t('budgets.subtitle'),
      href: '/(app)/budgets',
    },
    {
      icon: 'categories',
      label: t('nav.categories'),
      hint: t('categories.subtitle'),
      href: '/(app)/categories',
    },

    {
      icon: 'recurring',
      label: t('nav.recurring'),
      hint: t('recurring.subtitle'),
      href: '/(app)/recurring',
    },
    {
      icon: 'trips',
      label: t('nav.trips'),
      hint: t('trips.subtitle'),
      href: '/(app)/trips',
    },
    {
      icon: 'ledgers',
      label: t('nav.ledgers'),
      hint: ledger
        ? t('more.activeLedger', {
            defaultValue: 'Using {name}',
            name: ledger.name,
          })
        : t('ledgers.subtitle'),
      href: '/(app)/ledgers',
    },
    {
      icon: 'settings',
      label: t('nav.settings'),
      hint: t('settings.languageHint'),
      href: '/(app)/settings',
    },
  ];

  const account: RowSpec[] = [
    {
      icon: 'logout',
      label: t('common.logoutFull'),
      onPress: confirmSignOut,
      destructive: true,
    },
  ];

  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: c.bg }}
      edges={['top']}
    >
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 96, gap: 16 }}>
        {/* Header */}
        <Text style={{ color: c.text, fontSize: 22, fontWeight: '700' }}>
          {t('nav.more')}
        </Text>

        {/* User card */}
        <Pressable
          onPress={() => router.push('/(app)/ledgers')}
          className="rounded-2xl p-4 flex-row items-center gap-3"
          style={{ backgroundColor: c.cardElevated }}
        >
          <View
            className="w-12 h-12 rounded-full items-center justify-center"
            style={{ backgroundColor: c.chip }}
          >
            <Text style={{ fontSize: 24 }}>🦊</Text>
          </View>
          <View className="flex-1 min-w-0">
            <Text
              style={{ color: c.text, fontSize: 14, fontWeight: '600' }}
              numberOfLines={1}
            >
              {session?.user.email ?? '—'}
            </Text>
            <Text
              style={{ color: c.textSecondary, fontSize: 11, marginTop: 2 }}
              numberOfLines={1}
            >
              {ledger
                ? `📒 ${ledger.name} · ${ledger.currency}`
                : t('more.noLedger', { defaultValue: 'No ledger yet' })}
            </Text>
          </View>
          <ChevronRightIcon color={c.textMuted} size={18} />
        </Pressable>

        {/* General section */}
        <Section
          title={t('more.generalSection', { defaultValue: 'General' })}
          colors={c}
        >
          {general.map((row, i) => (
            <Row
              key={row.label}
              spec={row}
              colors={c}
              isLast={i === general.length - 1}
            />
          ))}
        </Section>

        {/* Account section */}
        <Section title={t('settings.accountSection')} colors={c}>
          {account.map((row, i) => (
            <Row
              key={row.label}
              spec={row}
              colors={c}
              isLast={i === account.length - 1}
            />
          ))}
        </Section>

        <Text
          style={{
            color: c.textMuted,
            fontSize: 11,
            textAlign: 'center',
            marginTop: 4,
          }}
        >
          Jaitang · made with 🦴
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({
  title,
  colors,
  children,
}: {
  title: string;
  colors: ReturnType<typeof useTheme>['colors'];
  children: React.ReactNode;
}) {
  return (
    <View>
      <Text
        style={{
          color: colors.textSecondary,
          fontSize: 11,
          fontWeight: '600',
          marginBottom: 6,
          marginLeft: 4,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {title}
      </Text>
      <View
        className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: colors.card }}
      >
        {children}
      </View>
    </View>
  );
}

function Row({
  spec,
  colors,
  isLast,
}: {
  spec: RowSpec;
  colors: ReturnType<typeof useTheme>['colors'];
  isLast: boolean;
}) {
  function handlePress() {
    if (spec.onPress) spec.onPress();
    else if (spec.href) router.push(spec.href as never);
  }
  const textColor = spec.destructive ? colors.expense : colors.text;
  return (
    <Pressable
      onPress={handlePress}
      className="flex-row items-center gap-3 px-4 py-3.5"
      style={{
        // Hairline between rows but not after the last — using
        // borderBottom keeps the first row clean without needing an
        // extra "isFirst" prop.
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: colors.border,
      }}
    >
      <View
        className="w-9 h-9 rounded-full items-center justify-center"
        style={{
          backgroundColor: spec.destructive ? colors.expenseBg : colors.chip,
        }}
      >
        <JtIcon name={spec.icon} size={18} />
      </View>
      <View className="flex-1 min-w-0">
        <Text style={{ color: textColor, fontSize: 14, fontWeight: '500' }}>
          {spec.label}
        </Text>
        {spec.hint ? (
          <Text
            style={{ color: colors.textSecondary, fontSize: 11, marginTop: 1 }}
            numberOfLines={1}
          >
            {spec.hint}
          </Text>
        ) : null}
      </View>
      {!spec.destructive && (
        <ChevronRightIcon color={colors.textMuted} size={16} />
      )}
    </Pressable>
  );
}
