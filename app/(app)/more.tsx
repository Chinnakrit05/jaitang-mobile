import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';

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
  const c = useTheme().colors;
  const { session } = useAuth();
  const { ledger } = useActiveLedger();

  function confirmSignOut() {
    Alert.alert('ออกจากระบบ?', 'ข้อมูลที่ยังไม่ sync จะคงอยู่ในเครื่อง', [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'ออกจากระบบ',
        style: 'destructive',
        onPress: () => {
          signOut().catch((e) => {
            console.error('signOut failed:', e);
            Alert.alert('ออกไม่สำเร็จ', String(e?.message ?? e));
          });
        },
      },
    ]);
  }

  const general: RowSpec[] = [
    {
      icon: 'categories',
      label: 'หมวดหมู่',
      hint: 'จัดการหมวดรายรับ / รายจ่าย',
      href: '/(app)/categories',
    },
    {
      icon: 'recurring',
      label: 'รายการประจำ',
      hint: 'บิล / subscription ที่เกิดซ้ำ',
      href: '/(app)/recurring',
    },
    {
      icon: 'ledgers',
      label: 'สมุดบัญชี',
      hint: ledger ? `กำลังใช้ ${ledger.name}` : 'สลับ / สร้างสมุดใหม่',
      href: '/(app)/ledgers',
    },
    {
      icon: 'settings',
      label: 'ตั้งค่า',
      hint: 'ธีม · ภาษา · สไตล์ไอคอน',
      href: '/(app)/settings',
    },
  ];

  const account: RowSpec[] = [
    {
      icon: 'logout',
      label: 'ออกจากระบบ',
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
          เพิ่มเติม
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
              {ledger ? `📒 ${ledger.name} · ${ledger.currency}` : 'ยังไม่มีสมุด'}
            </Text>
          </View>
          <ChevronRightIcon color={c.textMuted} size={18} />
        </Pressable>

        {/* General section */}
        <Section title="ทั่วไป" colors={c}>
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
        <Section title="บัญชี" colors={c}>
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
