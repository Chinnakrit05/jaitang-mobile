import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  SectionList,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { useActiveLedger } from '../../providers/ActiveLedgerProvider';
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

const ACCENT = '#D98556';
const TEXT_PRIMARY = '#3D2A1E';
const TEXT_MUTED = '#8B7563';
const BG_PAGE = '#FFF4E6';
const BG_CHIP = '#FFE4C7';
const BG_CARD = '#FFFFFF';
const INCOME_GREEN = '#0F8A4E';

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

  const [activeFilter, setActiveFilter] = useState<string | null>(null); // category_id or null = all

  const catById = useMemo(
    () => new Map((cats.data ?? []).map((c) => [c.id, c])),
    [cats.data],
  );

  // Top categories *of this month* — feeds the filter chip row. We
  // pick from real data so the chips reflect the user's actual usage
  // rather than every category they ever defined.
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

  // Month totals (income / expense / count) — feeds the summary banner.
  const monthIncome = monthScope
    .filter((t) => t.kind === 'income')
    .reduce((s, t) => s + t.amount, 0);
  const monthExpense = monthScope
    .filter((t) => t.kind === 'expense')
    .reduce((s, t) => s + t.amount, 0);
  const monthCount = monthScope.length;

  // Filtered list + grouping by day. We show all months in the
  // list (not just this month) — chips filter category, not period.
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
        style={{ backgroundColor: BG_PAGE }}
      >
        <ActivityIndicator />
      </SafeAreaView>
    );
  }
  if (txs.error) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center p-4"
        style={{ backgroundColor: BG_PAGE }}
      >
        <Text style={{ color: '#D98556' }}>{String(txs.error)}</Text>
      </SafeAreaView>
    );
  }
  if (!ledger) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: BG_PAGE }}
      >
        <Text style={{ color: TEXT_MUTED }}>ยังไม่มีสมุดบัญชี</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: BG_PAGE }}
      edges={['top']}
    >
      <SectionList
        sections={sections}
        keyExtractor={(t) => t.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingBottom: 96 }}
        ListHeaderComponent={
          <View style={{ padding: 16, gap: 14 }}>
            {/* Header */}
            <View className="flex-row items-center justify-between">
              <Text
                style={{ color: TEXT_PRIMARY, fontSize: 22, fontWeight: '700' }}
              >
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
                  backgroundColor: BG_CARD,
                }}
              >
                <SearchIcon color={TEXT_PRIMARY} size={18} />
              </Pressable>
            </View>

            {/* Summary banner */}
            <View
              className="rounded-2xl p-4 flex-row items-center gap-3"
              style={{ backgroundColor: BG_CARD }}
            >
              <ShibaMascot size={48} />
              <View className="flex-1">
                <Text style={{ color: TEXT_PRIMARY, fontSize: 13 }}>
                  เดือนนี้คุณมีรายการ{' '}
                  <Text style={{ fontWeight: '700' }}>{monthCount}</Text> รายการ
                </Text>
                <View className="flex-row gap-2 mt-1.5">
                  <View
                    className="px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: 'rgba(52, 211, 153, 0.18)' }}
                  >
                    <Text
                      style={{
                        color: INCOME_GREEN,
                        fontSize: 11,
                        fontWeight: '600',
                      }}
                    >
                      +฿{formatTHB(monthIncome)}
                    </Text>
                  </View>
                  <View
                    className="px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: 'rgba(255, 123, 172, 0.18)' }}
                  >
                    <Text
                      style={{ color: ACCENT, fontSize: 11, fontWeight: '600' }}
                    >
                      −฿{formatTHB(monthExpense)}
                    </Text>
                  </View>
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
              />
              {filterChips.map((c) => (
                <Chip
                  key={c.id}
                  label={c.name}
                  icon={c.icon}
                  active={activeFilter === c.id}
                  onPress={() =>
                    setActiveFilter(activeFilter === c.id ? null : c.id)
                  }
                />
              ))}
            </ScrollView>
          </View>
        }
        renderSectionHeader={({ section }) => {
          const sign = section.allExpenses
            ? ''
            : section.net >= 0
              ? '+'
              : '−';
          const color = section.allExpenses
            ? TEXT_PRIMARY
            : section.net >= 0
              ? INCOME_GREEN
              : TEXT_PRIMARY;
          return (
            <View
              className="flex-row items-center justify-between px-4 pt-3 pb-1.5"
            >
              <Text
                style={{ color: TEXT_MUTED, fontSize: 12, fontWeight: '600' }}
              >
                {formatThaiDay(section.title + 'T00:00:00')}
              </Text>
              <Text style={{ color, fontSize: 13, fontWeight: '700' }}>
                {sign}฿{formatTHB(section.net)}
              </Text>
            </View>
          );
        }}
        renderItem={({ item, index, section }) => {
          const cat = item.category_id ? catById.get(item.category_id) : null;
          const isFirst = index === 0;
          const isLast = index === section.data.length - 1;
          return (
            <View className="px-4">
              <Pressable
                onLongPress={() => confirmDelete(item)}
                delayLongPress={350}
                style={{
                  backgroundColor: BG_CARD,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  borderTopLeftRadius: isFirst ? 16 : 0,
                  borderTopRightRadius: isFirst ? 16 : 0,
                  borderBottomLeftRadius: isLast ? 16 : 0,
                  borderBottomRightRadius: isLast ? 16 : 0,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  opacity: item._sync_state !== 'clean' ? 0.7 : 1,
                  borderTopWidth: isFirst ? 0 : 1,
                  borderTopColor: 'rgba(217, 133, 86, 0.08)',
                }}
              >
                <View
                  className="w-10 h-10 rounded-full items-center justify-center"
                  style={{ backgroundColor: BG_PAGE }}
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
                      color: TEXT_PRIMARY,
                      fontSize: 14,
                      fontWeight: '500',
                    }}
                  >
                    {item.note?.trim() || cat?.name || 'รายการ'}
                  </Text>
                  <Text
                    style={{ color: TEXT_MUTED, fontSize: 11, marginTop: 1 }}
                  >
                    {cat?.name ?? (item.kind === 'income' ? 'รายรับ' : 'อื่นๆ')}
                    <Text> · </Text>
                    {formatTime(item.occurred_at)}
                    {item._sync_state !== 'clean' ? (
                      <Text style={{ color: ACCENT }}> · กำลังซิงค์</Text>
                    ) : null}
                  </Text>
                </View>
                <Text
                  style={{
                    color: item.kind === 'income' ? INCOME_GREEN : TEXT_PRIMARY,
                    fontSize: 14,
                    fontWeight: '700',
                  }}
                >
                  {item.kind === 'income' ? '+' : '−'}฿{formatTHB(item.amount)}
                </Text>
              </Pressable>
            </View>
          );
        }}
        SectionSeparatorComponent={() => <View style={{ height: 4 }} />}
        ListEmptyComponent={
          <View className="p-10 items-center">
            <Text style={{ fontSize: 36 }}>🌸</Text>
            <Text
              style={{ color: TEXT_PRIMARY, fontSize: 14, marginTop: 8 }}
            >
              ยังไม่มีรายการ
            </Text>
            <Text
              style={{ color: TEXT_MUTED, fontSize: 12, marginTop: 4 }}
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
}: {
  label: string;
  icon?: string | null;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 999,
        backgroundColor: active ? ACCENT : BG_CHIP,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
      }}
    >
      {icon ? <EmojiOrIcon value={icon} fallback="sparkle" size={14} /> : null}
      <Text
        style={{
          color: active ? '#FFFFFF' : TEXT_PRIMARY,
          fontSize: 12,
          fontWeight: active ? '700' : '600',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
