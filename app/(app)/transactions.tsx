import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { useActiveLedger } from '../../providers/ActiveLedgerProvider';
import { useTheme } from '../../providers/ThemeProvider';
import {
  useDeleteTransaction,
  useLocalTransactions,
} from '../../lib/queries/transactions-local';
import type { LocalTx } from '../../lib/sync/transactions';
import { useCategories } from '../../lib/queries/categories';
import { EmojiOrIcon } from '../../components/icons/EmojiOrIcon';
import { ShibaMascot } from '../../components/ShibaMascot';

/**
 * Transactions list — port of `ui/Transaction List.html` (v2-playful).
 *
 * Layout: header → summary banner (shiba + month tally + income/expense
 * pills) → horizontally scrolling category filter chips → date-grouped
 * sections with per-day totals.
 *
 * Day totals follow the mockup's rule: if every row on the day is an
 * expense, render the absolute total in dark; otherwise render a signed
 * net (`+` for positive in green, `−` for negative in dark).
 *
 * Long-press a row to delete — the only edit affordance until a real
 * edit screen lands.
 *
 * Colors come from `useTheme()` so the screen tracks light / dark / OLED
 * automatically. Constants are computed inside the component because
 * `useTheme()` is a hook — they can't sit at module scope anymore.
 */

const THAI_MONTH_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

function formatThaiDay(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')} ${THAI_MONTH_SHORT[d.getMonth()]}`;
}

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return '';
  }
}

function formatTHB(n: number) {
  return Math.round(Math.abs(n)).toLocaleString('en-US');
}

// Tiny chip label for the row's payment-method tag. Returns null when
// the row didn't capture one (legacy data) so we skip the separator dot.
function paymentLabel(method: 'cash' | 'transfer' | null): string | null {
  if (method === 'cash') return '💵 เงินสด';
  if (method === 'transfer') return '🏦 โอน';
  return null;
}

// Pastel tints for the round category icon. Each category id hashes to
// a stable index so the same category always picks the same color. The
// rgba alpha matches the mockup's "soft chip" feel — vivid enough to
// distinguish at a glance, gentle enough not to compete with the row's
// text. Income kind always lands on green so salary / refund rows pop
// out from regular expenses.
const ICON_TINTS = [
  'rgba(255, 123, 172, 0.20)',  // pink
  'rgba(251, 191, 36, 0.20)',   // yellow
  'rgba(167, 139, 250, 0.20)',  // lavender
  'rgba(96, 165, 250, 0.20)',   // sky
  'rgba(251, 146, 60, 0.20)',   // orange
];
const ICON_TINT_INCOME = 'rgba(52, 211, 153, 0.22)'; // mint green
const ICON_TINT_NEUTRAL = 'rgba(61, 42, 30, 0.06)';   // for uncategorized

function categoryTint(
  categoryId: string | null,
  kind: 'income' | 'expense',
): string {
  if (kind === 'income') return ICON_TINT_INCOME;
  if (!categoryId) return ICON_TINT_NEUTRAL;
  let hash = 0;
  for (let i = 0; i < categoryId.length; i++) {
    hash = (hash + categoryId.charCodeAt(i)) >>> 0;
  }
  return ICON_TINTS[hash % ICON_TINTS.length];
}

function SearchIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={6.5} stroke={color} strokeWidth={1.7} />
      <Path
        d="M21 21l-5-5"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export default function TransactionsScreen() {
  const { ledger, loading: ledgerLoading } = useActiveLedger();
  const txs = useLocalTransactions({ ledgerId: ledger?.id, limit: 500 });
  const cats = useCategories(ledger?.id);
  const del = useDeleteTransaction();
  const c = useTheme().colors;

  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const catById = useMemo(
    () => new Map((cats.data ?? []).map((c) => [c.id, c])),
    [cats.data],
  );

  const monthScope = useMemo(() => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
    return (txs.data ?? []).filter(
      (t) => t.occurred_at >= from && t.occurred_at < to,
    );
  }, [txs.data]);

  const filterChips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of monthScope) {
      if (!t.category_id) continue;
      counts.set(t.category_id, (counts.get(t.category_id) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cid]) => {
        const c = catById.get(cid);
        return c ? { id: c.id, name: c.name, icon: c.icon } : null;
      })
      .filter((c): c is { id: string; name: string; icon: string | null } => !!c);
  }, [monthScope, catById]);

  const monthIncome = monthScope
    .filter((t) => t.kind === 'income')
    .reduce((s, t) => s + t.amount, 0);
  const monthExpense = monthScope
    .filter((t) => t.kind === 'expense')
    .reduce((s, t) => s + t.amount, 0);
  const monthCount = monthScope.length;

  const sections = useMemo(() => {
    const filtered = activeFilter
      ? (txs.data ?? []).filter((t) => t.category_id === activeFilter)
      : (txs.data ?? []);

    const byDay = new Map<string, LocalTx[]>();
    for (const t of filtered) {
      const day = t.occurred_at.slice(0, 10);
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day)!.push(t);
    }
    return [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([day, items]) => {
        const allExpenses = items.every((t) => t.kind === 'expense');
        const net = items.reduce(
          (s, t) => s + (t.kind === 'income' ? t.amount : -t.amount),
          0,
        );
        return {
          title: day,
          data: items,
          allExpenses,
          net,
        };
      });
  }, [txs.data, activeFilter]);

  function confirmDelete(tx: LocalTx) {
    Alert.alert(
      'ลบรายการนี้?',
      tx.note?.trim() || catById.get(tx.category_id ?? '')?.name || 'รายการนี้',
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'ลบ',
          style: 'destructive',
          onPress: () => del.mutate(tx.id),
        },
      ],
    );
  }

  if (ledgerLoading || txs.isLoading) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: c.bg }}
      >
        <ActivityIndicator color={c.accent} />
      </SafeAreaView>
    );
  }
  if (txs.error) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center p-4"
        style={{ backgroundColor: c.bg }}
      >
        <Text style={{ color: c.expense }}>{String(txs.error)}</Text>
      </SafeAreaView>
    );
  }
  if (!ledger) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: c.bg }}
      >
        <Text style={{ color: c.textSecondary }}>ยังไม่มีสมุดบัญชี</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: c.bg }}
      edges={['top']}
    >
      <FlatList
        data={sections}
        keyExtractor={(section) => section.title}
        contentContainerStyle={{ paddingBottom: 96 }}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListHeaderComponent={
          <View style={{ padding: 16, gap: 14 }}>
            {/* Header */}
            <View className="flex-row items-center justify-between">
              <Text style={{ color: c.text, fontSize: 22, fontWeight: '700' }}>
                รายการของฉัน
              </Text>
              <Pressable
                onPress={() => {
                  /* TODO: search */
                }}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: c.card,
                }}
              >
                <SearchIcon color={c.text} size={18} />
              </Pressable>
            </View>

            {/* Summary banner — shiba avatar (in soft peach circle) +
                count text + plain colored amounts (no pill bg). */}
            <View
              className="rounded-2xl p-4 flex-row items-center gap-3"
              style={{ backgroundColor: c.card }}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  backgroundColor: c.cardElevated,
                }}
              >
                <ShibaMascot size={48} />
              </View>
              <View className="flex-1">
                <Text style={{ color: c.text, fontSize: 13 }}>
                  เดือนนี้คุณมีรายการ{' '}
                  <Text style={{ fontWeight: '700' }}>{monthCount}</Text> รายการ
                </Text>
                <View className="flex-row gap-3 mt-1">
                  <Text
                    style={{ color: c.income, fontSize: 13, fontWeight: '700' }}
                  >
                    +฿{formatTHB(monthIncome)}
                  </Text>
                  <Text
                    style={{ color: c.text, fontSize: 13, fontWeight: '700' }}
                  >
                    −฿{formatTHB(monthExpense)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Filter chips — horizontal scroll */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingRight: 4 }}
            >
              <Chip
                label="ทั้งหมด"
                active={activeFilter === null}
                onPress={() => setActiveFilter(null)}
                colors={c}
              />
              {filterChips.map((cat) => (
                <Chip
                  key={cat.id}
                  label={cat.name}
                  icon={cat.icon}
                  active={activeFilter === cat.id}
                  onPress={() =>
                    setActiveFilter(activeFilter === cat.id ? null : cat.id)
                  }
                  colors={c}
                />
              ))}
            </ScrollView>
          </View>
        }
        renderItem={({ item: section }) => {
          // Each "item" of this FlatList is a whole date section. The
          // date header + every transaction row of that day live inside
          // a SINGLE white card so the corners + hairlines stay tight —
          // SectionList's renderSectionHeader was leaving a stray gap
          // between header and the first item that no amount of padding
          // could close.
          const sign = section.allExpenses
            ? ''
            : section.net >= 0
              ? '+'
              : '−';
          const totalColor = section.allExpenses
            ? c.text
            : section.net >= 0
              ? c.income
              : c.text;
          return (
            <View className="px-4">
              <View
                style={{
                  backgroundColor: c.card,
                  borderRadius: 18,
                  overflow: 'hidden',
                }}
              >
                {/* Date header row */}
                <View
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{ color: c.text, fontSize: 13, fontWeight: '700' }}
                  >
                    {formatThaiDay(section.title + 'T00:00:00')}
                  </Text>
                  <Text
                    style={{
                      color: totalColor,
                      fontSize: 13,
                      fontWeight: '700',
                    }}
                  >
                    {sign}฿{formatTHB(section.net)}
                  </Text>
                </View>

                {/* Transaction rows */}
                {section.data.map((item) => {
                  const cat = item.category_id
                    ? catById.get(item.category_id)
                    : null;
                  return (
                    <Pressable
                      key={item.id}
                      onLongPress={() => confirmDelete(item)}
                      delayLongPress={350}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        opacity: item._sync_state !== 'clean' ? 0.7 : 1,
                        borderTopWidth: 1,
                        borderTopColor: c.border,
                      }}
                    >
                      <View
                        className="w-10 h-10 rounded-full items-center justify-center"
                        style={{
                          backgroundColor: categoryTint(
                            item.category_id,
                            item.kind,
                          ),
                        }}
                      >
                        <EmojiOrIcon
                          value={cat?.icon}
                          fallback="sparkle"
                          size={20}
                        />
                      </View>
                      <View className="flex-1 min-w-0">
                        <Text
                          numberOfLines={1}
                          style={{
                            color: c.text,
                            fontSize: 14,
                            fontWeight: '500',
                          }}
                        >
                          {item.note?.trim() || cat?.name || 'รายการ'}
                        </Text>
                        <Text
                          style={{
                            color: c.textMuted,
                            fontSize: 11,
                            marginTop: 1,
                          }}
                        >
                          {cat?.name ??
                            (item.kind === 'income' ? 'รายรับ' : 'อื่นๆ')}
                          {paymentLabel(item.payment_method) ? (
                            <Text>
                              <Text> · </Text>
                              {paymentLabel(item.payment_method)}
                            </Text>
                          ) : null}
                          <Text> · </Text>
                          {formatTime(item.occurred_at)}
                          {item._sync_state !== 'clean' ? (
                            <Text style={{ color: c.accent }}>
                              {' · กำลังซิงค์'}
                            </Text>
                          ) : null}
                        </Text>
                      </View>
                      <Text
                        style={{
                          color: item.kind === 'income' ? c.income : c.text,
                          fontSize: 14,
                          fontWeight: '700',
                        }}
                      >
                        {item.kind === 'income' ? '+' : '−'}฿
                        {formatTHB(item.amount)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View className="p-10 items-center">
            <Text style={{ fontSize: 36 }}>🌸</Text>
            <Text style={{ color: c.text, fontSize: 14, marginTop: 8 }}>
              ยังไม่มีรายการ
            </Text>
            <Text
              style={{ color: c.textSecondary, fontSize: 12, marginTop: 4 }}
            >
              {activeFilter
                ? 'หมวดนี้ยังไม่มีรายการ — ลองเลือก "ทั้งหมด"'
                : 'กดปุ่ม + เพื่อเพิ่มรายการแรก'}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function Chip({
  label,
  icon,
  active,
  onPress,
  colors,
}: {
  label: string;
  icon?: string | null;
  active: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  // Filter chips have their own active style — dark brown fill, white
  // text — instead of the theme's accent orange. The mockup uses this
  // to keep the filter row distinct from the rest of the CTA orange.
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: active ? colors.text : colors.card,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
      }}
    >
      {icon ? <EmojiOrIcon value={icon} fallback="sparkle" size={14} /> : null}
      <Text
        style={{
          color: active ? '#FFFFFF' : colors.text,
          fontSize: 12,
          fontWeight: active ? '700' : '600',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
