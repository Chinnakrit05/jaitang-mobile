import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useActiveLedger } from '../../providers/ActiveLedgerProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { useLocalTransactions } from '../../lib/queries/transactions-local';
import { useCategories } from '../../lib/queries/categories';
import { Donut, type DonutSlice } from '../../components/Donut';
import { ShibaMascot } from '../../components/ShibaMascot';
import { EmojiOrIcon } from '../../components/icons/EmojiOrIcon';

/**
 * Insights / รายงาน — port of `ui/Insights.html` (v2-playful).
 *
 * Sections top-to-bottom:
 *   1. Header — title + current period label (Buddhist year)
 *   2. Shiba comparison banner — % delta vs the previous period of the
 *      same kind (week vs week, month vs month, year vs year).
 *   3. Spend card — period toggle (สัปดาห์/เดือน/ปี) + big donut +
 *      top-4 category list.
 *   4. Streak banner — 12-day streak chip (still mocked; no streaks
 *      table on the server yet — same caveat as on the dashboard).
 *   5. Weekday bar chart — sum of expenses per weekday across the
 *      active period + a sentence calling out the heaviest day.
 *
 * All numbers below the comparison banner are computed from real local
 * transactions; the chart bars are pure RN <View>s with computed
 * `width` so we don't need another SVG dep.
 */

type Period = 'week' | 'month' | 'year';

const PERIOD_LABELS: Record<Period, string> = {
  week: 'สัปดาห์',
  month: 'เดือน',
  year: 'ปี',
};

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน',
  'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม',
  'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

// Weekday labels in Mon-first order, matching the mockup.
const WEEKDAY_LABELS = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];
const WEEKDAY_FULL_NAMES = [
  'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี',
  'วันศุกร์', 'วันเสาร์', 'วันอาทิตย์',
];

// Donut category palette — fixed across themes (semantic per category).
const CATEGORY_PALETTE = [
  '#FF7BAC', // pink
  '#A78BFA', // purple
  '#FBBF24', // yellow
  '#FB923C', // orange
  '#60A5FA', // blue
  '#34D399', // green
];

// Convert Sun=0..Sat=6 to Mon=0..Sun=6 to match the mockup's column order.
function mondayFirst(day: number): number {
  return (day + 6) % 7;
}

function getPeriodRange(period: Period): {
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
  label: string;
} {
  const now = new Date();
  if (period === 'week') {
    const offset = mondayFirst(now.getDay());
    const monday = new Date(now);
    monday.setDate(now.getDate() - offset);
    monday.setHours(0, 0, 0, 0);
    const nextMonday = new Date(monday);
    nextMonday.setDate(monday.getDate() + 7);
    const prevMonday = new Date(monday);
    prevMonday.setDate(monday.getDate() - 7);
    return {
      from: monday,
      to: nextMonday,
      prevFrom: prevMonday,
      prevTo: monday,
      label: `สัปดาห์นี้`,
    };
  }
  if (period === 'month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const prevFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return {
      from,
      to,
      prevFrom,
      prevTo: from,
      label: `${THAI_MONTHS[now.getMonth()]} ${now.getFullYear() + 543}`,
    };
  }
  // year
  const from = new Date(now.getFullYear(), 0, 1);
  const to = new Date(now.getFullYear() + 1, 0, 1);
  const prevFrom = new Date(now.getFullYear() - 1, 0, 1);
  return {
    from,
    to,
    prevFrom,
    prevTo: from,
    label: `ปี ${now.getFullYear() + 543}`,
  };
}

function formatTHB(n: number) {
  return Math.round(Math.abs(n)).toLocaleString('en-US');
}

export default function InsightsScreen() {
  const c = useTheme().colors;
  const { ledger, loading: ledgerLoading } = useActiveLedger();
  // 2000 row limit covers a year of pretty heavy logging — bigger than
  // the dashboard's 500 because year view needs the full slice.
  const txs = useLocalTransactions({ ledgerId: ledger?.id, limit: 2000 });
  const cats = useCategories(ledger?.id);
  const [period, setPeriod] = useState<Period>('month');

  const range = useMemo(() => getPeriodRange(period), [period]);

  const periodTxs = useMemo(() => {
    const fromIso = range.from.toISOString();
    const toIso = range.to.toISOString();
    return (txs.data ?? []).filter(
      (t) => t.occurred_at >= fromIso && t.occurred_at < toIso,
    );
  }, [txs.data, range.from, range.to]);

  const prevTxs = useMemo(() => {
    const fromIso = range.prevFrom.toISOString();
    const toIso = range.prevTo.toISOString();
    return (txs.data ?? []).filter(
      (t) => t.occurred_at >= fromIso && t.occurred_at < toIso,
    );
  }, [txs.data, range.prevFrom, range.prevTo]);

  const periodExpense = periodTxs
    .filter((t) => t.kind === 'expense')
    .reduce((s, t) => s + t.amount, 0);
  const prevExpense = prevTxs
    .filter((t) => t.kind === 'expense')
    .reduce((s, t) => s + t.amount, 0);

  // Split expense by payment method — feeds the "ช่องทางการจ่าย" card.
  // Older rows can have `payment_method = null` (legacy data before the
  // quick-add screen forced a choice); we surface that bucket separately
  // as "ไม่ระบุ" so the numbers reconcile back to periodExpense.
  const paymentSplit = useMemo(() => {
    let cash = 0;
    let transfer = 0;
    let unknown = 0;
    for (const t of periodTxs) {
      if (t.kind !== 'expense') continue;
      if (t.payment_method === 'cash') cash += t.amount;
      else if (t.payment_method === 'transfer') transfer += t.amount;
      else unknown += t.amount;
    }
    const total = cash + transfer + unknown;
    return { cash, transfer, unknown, total };
  }, [periodTxs]);

  const pctChange =
    prevExpense > 0
      ? Math.round(((periodExpense - prevExpense) / prevExpense) * 100)
      : null;

  const catById = useMemo(
    () => new Map((cats.data ?? []).map((cat) => [cat.id, cat])),
    [cats.data],
  );

  // Group expenses by category for the donut + top list.
  const breakdown = useMemo(() => {
    const byCat = new Map<string | null, number>();
    for (const t of periodTxs) {
      if (t.kind !== 'expense') continue;
      byCat.set(t.category_id, (byCat.get(t.category_id) ?? 0) + t.amount);
    }
    const rows = [...byCat.entries()]
      .map(([cid, value]) => {
        const cat = catById.get(cid ?? '');
        return {
          id: cid,
          name: cat?.name ?? 'อื่นๆ',
          icon: cat?.icon ?? null,
          value,
        };
      })
      .sort((a, b) => b.value - a.value);
    const slices: DonutSlice[] = rows.map((r, i) => ({
      value: r.value,
      color: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length],
    }));
    return { rows, slices };
  }, [periodTxs, catById]);

  // Sum expenses per weekday (Mon=0..Sun=6).
  const weekdayTotals = useMemo(() => {
    const totals = new Array(7).fill(0) as number[];
    for (const t of periodTxs) {
      if (t.kind !== 'expense') continue;
      const idx = mondayFirst(new Date(t.occurred_at).getDay());
      totals[idx] += t.amount;
    }
    return totals;
  }, [periodTxs]);

  const maxWeekday = Math.max(...weekdayTotals, 1);
  const heaviestIdx = weekdayTotals.reduce(
    (best, v, i) => (v > weekdayTotals[best] ? i : best),
    0,
  );
  const heaviestDay = WEEKDAY_FULL_NAMES[heaviestIdx];
  const hasAnyData = periodExpense > 0;

  const comparisonText =
    pctChange === null
      ? 'ยังไม่มีข้อมูลเดือนก่อนเทียบ — เริ่มจดเลย!'
      : pctChange < 0
        ? `เดือนนี้ใช้น้อยลง ${Math.abs(pctChange)}% จากเดือนที่แล้ว 🎉`
        : pctChange > 0
          ? `เดือนนี้ใช้มากขึ้น ${pctChange}% จากเดือนที่แล้ว 💸`
          : 'เดือนนี้ใช้พอ ๆ กับเดือนที่แล้ว';
  const comparisonCheer =
    pctChange === null
      ? ''
      : pctChange < 0
        ? 'เก่งมากเลย!'
        : pctChange > 0
          ? 'ระวังนิดนะ ดูหมวดไหนเพิ่มเยอะ'
          : 'รักษาระดับนี้ไว้';

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
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 96, gap: 14 }}
      >
        {/* 1. Header */}
        <View>
          <Text style={{ color: c.text, fontSize: 22, fontWeight: '700' }}>
            รายงานเดือนนี้
          </Text>
          <Text style={{ color: c.textSecondary, fontSize: 13, marginTop: 2 }}>
            {range.label}
          </Text>
        </View>

        {/* 2. Comparison banner */}
        <View
          className="rounded-2xl p-4 flex-row items-center gap-3"
          style={{ backgroundColor: c.cardElevated }}
        >
          <ShibaMascot size={64} />
          <View className="flex-1">
            <Text style={{ color: c.text, fontSize: 13, lineHeight: 19 }}>
              {comparisonText}
            </Text>
            {comparisonCheer ? (
              <Text
                style={{
                  color: c.textSecondary,
                  fontSize: 12,
                  marginTop: 2,
                  fontStyle: 'italic',
                }}
              >
                {comparisonCheer}
              </Text>
            ) : null}
          </View>
        </View>

        {/* 3. Spend card */}
        <View className="rounded-2xl p-4" style={{ backgroundColor: c.card }}>
          {/* Header row: title + period toggle */}
          <View className="flex-row items-center justify-between mb-3">
            <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }}>
              จ่ายไปทั้งหมด
            </Text>
            <View
              className="flex-row p-1 rounded-xl"
              style={{ backgroundColor: c.chip }}
            >
              {(['week', 'month', 'year'] as const).map((p) => {
                const active = period === p;
                return (
                  <Pressable
                    key={p}
                    onPress={() => setPeriod(p)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 5,
                      borderRadius: 8,
                      backgroundColor: active ? c.card : 'transparent',
                    }}
                  >
                    <Text
                      style={{
                        color: active ? c.text : c.textSecondary,
                        fontSize: 11,
                        fontWeight: active ? '700' : '500',
                      }}
                    >
                      {PERIOD_LABELS[p]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Donut */}
          <View className="items-center my-2">
            <Donut
              data={breakdown.slices}
              size={150}
              strokeWidth={20}
              trackColor={c.chip}
              labelColor={c.textMuted}
              centerColor={c.text}
              label="จ่ายไป"
              centerValue={hasAnyData ? `฿${formatTHB(periodExpense)}` : '—'}
            />
          </View>

          {/* Top-4 categories grid (2 cols × 2 rows) */}
          {breakdown.rows.length === 0 ? (
            <Text
              className="text-center mt-3"
              style={{ color: c.textSecondary, fontSize: 13 }}
            >
              ยังไม่มีรายจ่ายในช่วงนี้
            </Text>
          ) : (
            <View
              className="flex-row flex-wrap mt-3"
              style={{ marginHorizontal: -4 }}
            >
              {breakdown.rows.slice(0, 4).map((r, i) => (
                <View
                  key={r.id ?? `none-${i}`}
                  style={{ width: '50%', padding: 4 }}
                >
                  <View
                    className="flex-row items-center gap-2 p-2.5 rounded-xl"
                    style={{ backgroundColor: c.bg }}
                  >
                    <View
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor:
                          CATEGORY_PALETTE[i % CATEGORY_PALETTE.length] + '33',
                      }}
                    >
                      <EmojiOrIcon
                        value={r.icon}
                        fallback="sparkle"
                        size={16}
                      />
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text
                        numberOfLines={1}
                        style={{
                          color: c.text,
                          fontSize: 12,
                          fontWeight: '600',
                        }}
                      >
                        {r.name}
                      </Text>
                      <Text
                        style={{
                          color: c.textSecondary,
                          fontSize: 11,
                          fontWeight: '500',
                        }}
                      >
                        ฿{formatTHB(r.value)}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* 4. Payment-method split — cash vs transfer of this period's
            expenses. Hidden entirely when there's nothing spent yet so
            the screen doesn't look like it has a broken card. */}
        {paymentSplit.total > 0 && (
          <View>
            <View className="flex-row items-center justify-between mb-3">
              <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }}>
                ช่องทางการจ่าย
              </Text>
              {paymentSplit.unknown > 0 && (
                <Text style={{ color: c.textMuted, fontSize: 11 }}>
                  ไม่ระบุ ฿{formatTHB(paymentSplit.unknown)}
                </Text>
              )}
            </View>
            <View className="flex-row gap-3">
              <PaymentMethodCard
                colors={c}
                emoji="💵"
                label="เงินสด"
                amount={paymentSplit.cash}
                pct={
                  paymentSplit.total > 0
                    ? Math.round((paymentSplit.cash / paymentSplit.total) * 100)
                    : 0
                }
              />
              <PaymentMethodCard
                colors={c}
                emoji="🏦"
                label="โอน"
                amount={paymentSplit.transfer}
                pct={
                  paymentSplit.total > 0
                    ? Math.round(
                        (paymentSplit.transfer / paymentSplit.total) * 100,
                      )
                    : 0
                }
              />
            </View>
          </View>
        )}

        {/* 5. Streak banner — still mocked at 12 days */}
        <View
          className="rounded-2xl p-4 flex-row items-center gap-3"
          style={{ backgroundColor: c.card }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: c.expenseBg,
            }}
          >
            <Text style={{ fontSize: 22 }}>🔥</Text>
          </View>
          <View className="flex-1">
            <Text style={{ color: c.textSecondary, fontSize: 11 }}>
              บันทึกต่อเนื่อง
            </Text>
            <Text
              style={{ color: c.text, fontSize: 16, fontWeight: '700' }}
            >
              12 วันติด!
            </Text>
          </View>
          <View className="items-end">
            <Text style={{ color: c.textSecondary, fontSize: 11 }}>
              อีก 18 วัน
            </Text>
            <Text style={{ color: c.accent, fontSize: 12, fontWeight: '700' }}>
              ครบเดือน 🏆
            </Text>
          </View>
        </View>

        {/* 5. Weekday usage chart */}
        <View className="rounded-2xl p-4" style={{ backgroundColor: c.card }}>
          <Text
            style={{
              color: c.text,
              fontSize: 15,
              fontWeight: '600',
              marginBottom: 12,
            }}
          >
            วันไหนใช้เยอะ
          </Text>
          <View
            className="flex-row items-end justify-around"
            style={{ height: 100, gap: 6 }}
          >
            {WEEKDAY_LABELS.map((label, i) => {
              const value = weekdayTotals[i];
              const heightPx = Math.max(4, (value / maxWeekday) * 80);
              const isHeaviest = hasAnyData && i === heaviestIdx;
              return (
                <View key={label} className="items-center flex-1">
                  <View
                    className="flex-1 justify-end items-center w-full"
                  >
                    <View
                      style={{
                        width: '70%',
                        height: heightPx,
                        backgroundColor: isHeaviest ? c.accent : c.chip,
                        borderRadius: 8,
                      }}
                    />
                  </View>
                  <Text
                    style={{
                      color: isHeaviest ? c.accent : c.textMuted,
                      fontSize: 11,
                      fontWeight: isHeaviest ? '700' : '500',
                      marginTop: 6,
                    }}
                  >
                    {label}
                  </Text>
                </View>
              );
            })}
          </View>
          {hasAnyData ? (
            <Text
              className="text-center mt-3"
              style={{ color: c.text, fontSize: 13, fontWeight: '500' }}
            >
              {heaviestDay}ใช้มากที่สุด{' '}
              {heaviestIdx === 4 ? '🍻' : heaviestIdx >= 5 ? '🛍' : '☕'}
            </Text>
          ) : (
            <Text
              className="text-center mt-3"
              style={{ color: c.textSecondary, fontSize: 12 }}
            >
              ยังไม่มีรายการในช่วงนี้
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Compact card for the "ช่องทางการจ่าย" section — one per method.
 * Renders icon + label, the absolute amount, and a small hairline bar
 * that visualizes the share of total expense for the period.
 */
function PaymentMethodCard({
  colors,
  emoji,
  label,
  amount,
  pct,
}: {
  colors: ReturnType<typeof useTheme>['colors'];
  emoji: string;
  label: string;
  amount: number;
  pct: number;
}) {
  return (
    <View
      className="flex-1 rounded-2xl p-4"
      style={{ backgroundColor: colors.card, gap: 8 }}
    >
      <View className="flex-row items-center gap-2">
        <Text style={{ fontSize: 22 }}>{emoji}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '600' }}>
          {label}
        </Text>
      </View>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>
        ฿{formatTHB(amount)}
      </Text>
      <View
        className="h-1.5 rounded-full"
        style={{ backgroundColor: colors.bg, overflow: 'hidden' }}
      >
        <View
          className="h-1.5 rounded-full"
          style={{
            backgroundColor: colors.accent,
            width: `${pct}%`,
          }}
        />
      </View>
      <Text style={{ color: colors.textMuted, fontSize: 11 }}>
        {pct}% ของยอดจ่าย
      </Text>
    </View>
  );
}
