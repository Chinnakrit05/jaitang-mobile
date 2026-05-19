import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Animated, {
  FadeInDown,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useActiveLedger } from '../../providers/ActiveLedgerProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { useLocalTransactions } from '../../lib/queries/transactions-local';
import { useCategories } from '../../lib/queries/categories';
import { MONTHLY_BUDGET_PERIOD, monthKey, useBudgets, useCategorySpend } from '../../lib/queries/budgets';
import { Donut, type DonutSlice } from '../../components/Donut';
import { Mascot } from '../../components/Mascot';
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
 * transactions; the chart bars are animated RN views, so we don't need
 * another chart dependency.
 */

type Period = 'week' | 'month' | 'year';

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

function getPeriodRange(period: Period, locale: string): {
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
      label: `${new Intl.DateTimeFormat(locale, {
        month: 'short',
        day: 'numeric',
      }).format(monday)} - ${new Intl.DateTimeFormat(locale, {
        month: 'short',
        day: 'numeric',
      }).format(new Date(nextMonday.getTime() - 1))}`,
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
      label: new Intl.DateTimeFormat(locale, {
        month: 'long',
        year: 'numeric',
      }).format(now),
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
    label: new Intl.DateTimeFormat(locale, { year: 'numeric' }).format(now),
  };
}

function formatTHB(n: number) {
  return Math.round(Math.abs(n)).toLocaleString('en-US');
}

function formatPct(value: number, total: number) {
  if (total <= 0) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

export default function InsightsScreen() {
  const { t, i18n } = useTranslation();
  const c = useTheme().colors;
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const { ledger, loading: ledgerLoading } = useActiveLedger();
  // 2000 row limit covers a year of pretty heavy logging — bigger than
  // the dashboard's 500 because year view needs the full slice.
  const txs = useLocalTransactions({ ledgerId: ledger?.id, limit: 2000 });
  const cats = useCategories(ledger?.id);
  const [period, setPeriod] = useState<Period>('month');

  const range = useMemo(() => getPeriodRange(period, locale), [period, locale]);
  const budgetPeriod = monthKey(range.from);
  const budgets = useBudgets(ledger?.id, MONTHLY_BUDGET_PERIOD);
  const budgetSpend = useCategorySpend(ledger?.id, budgetPeriod);
  const periodLabels: Record<Period, string> = {
    week: t('navbarStat.periods.week'),
    month: t('navbarStat.periods.month'),
    year: t('navbarStat.periods.year'),
  };
  const weekdayLabels = useMemo(() => {
    const monday = new Date(2024, 0, 1);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d);
    });
  }, [locale]);
  const weekdayFullNames = useMemo(() => {
    const monday = new Date(2024, 0, 1);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(d);
    });
  }, [locale]);

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
          name: cat?.name ?? t('common.uncategorized'),
          icon: cat?.icon ?? null,
          value,
          pct: 0,
        };
      })
      .sort((a, b) => b.value - a.value);
    rows.forEach((row) => {
      row.pct = periodExpense > 0 ? Math.round((row.value / periodExpense) * 100) : 0;
    });
    const slices: DonutSlice[] = rows.map((r, i) => ({
      value: r.value,
      color: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length],
    }));
    return { rows, slices };
  }, [periodTxs, catById, periodExpense, t]);

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
  const heaviestDay = weekdayFullNames[heaviestIdx];
  const hasAnyData = periodExpense > 0;
  const topCategory = breakdown.rows[0] ?? null;
  const budgetHighlights = useMemo(() => {
    return (budgets.data ?? [])
      .map((budget) => {
        const cat = catById.get(budget.category_id);
        const spent = budgetSpend.data?.get(budget.category_id) ?? 0;
        const pct = budget.amount > 0 ? Math.round((spent / budget.amount) * 100) : 0;
        return { budget, cat, spent, pct };
      })
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 3);
  }, [budgets.data, budgetSpend.data, catById]);

  const comparisonText =
    pctChange === null
      ? t('insights.noBaseline', { defaultValue: 'No previous period yet — start tracking!' })
      : pctChange < 0
        ? t('insights.spendingDown', { defaultValue: 'Spending is down {pct}% from last period 🎉', pct: Math.abs(pctChange) })
        : pctChange > 0
          ? t('insights.spendingUp', { defaultValue: 'Spending is up {pct}% from last period 💸', pct: pctChange })
          : t('insights.spendingFlat', { defaultValue: 'Spending is about the same as last period' });
  const comparisonCheer =
    pctChange === null
      ? ''
      : pctChange < 0
        ? t('insights.cheerDown', { defaultValue: 'Nice work!' })
        : pctChange > 0
          ? t('insights.cheerUp', { defaultValue: 'Careful — check which categories moved up' })
          : t('insights.cheerFlat', { defaultValue: 'Keep it steady' });

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
        <Text style={{ color: c.textSecondary }}>{t('dashboard.noLedgerTitle')}</Text>
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
            {t('insights.title')}
          </Text>
          <Text style={{ color: c.textSecondary, fontSize: 13, marginTop: 2 }}>
            {range.label}
          </Text>
        </View>

        {/* 2. Comparison banner */}
        <Animated.View
          entering={FadeInDown.duration(420).delay(80)}
          className="rounded-2xl p-4 flex-row items-center gap-3"
          style={{ backgroundColor: c.cardElevated }}
        >
          <Mascot size={64} />
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
        </Animated.View>

        {/* 3. Spend card */}
        <Animated.View
          entering={FadeInDown.duration(420).delay(140)}
          className="rounded-2xl p-4"
          style={{ backgroundColor: c.card }}
        >
          {/* Header row: title + period toggle */}
          <View className="flex-row items-center justify-between mb-3">
            <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }}>
              {t('insights.expenseLabel')}
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
                      {periodLabels[p]}
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
              label={t('dashboard.donutSpent')}
              centerValue={hasAnyData ? `฿${formatTHB(periodExpense)}` : '—'}
            />
          </View>

          {topCategory ? (
            <View
              className="rounded-2xl px-3 py-2.5 flex-row items-center justify-between"
              style={{ backgroundColor: c.bg }}
            >
              <Text style={{ color: c.textSecondary, fontSize: 12 }}>
                {t('insights.topCategory', { defaultValue: 'Top category' })}
              </Text>
              <Text
                numberOfLines={1}
                style={{ color: c.text, fontSize: 12, fontWeight: '700', maxWidth: '62%' }}
              >
                {topCategory.name} · {formatPct(topCategory.value, periodExpense)}
              </Text>
            </View>
          ) : null}

          {/* Top-4 categories grid (2 cols × 2 rows) */}
          {breakdown.rows.length === 0 ? (
            <Text
              className="text-center mt-3"
              style={{ color: c.textSecondary, fontSize: 13 }}
            >
              {t('insights.noPeriodExpense', { defaultValue: 'No expenses in this period' })}
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
                        ฿{formatTHB(r.value)} · {formatPct(r.value, periodExpense)}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </Animated.View>

        {/* 4. Payment-method split — cash vs transfer of this period's
            expenses. Hidden entirely when there's nothing spent yet so
            the screen doesn't look like it has a broken card. */}
        {paymentSplit.total > 0 && (
          <View>
            <View className="flex-row items-center justify-between mb-3">
              <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }}>
                {t('dashboard.paymentMethodTitle')}
              </Text>
              {paymentSplit.unknown > 0 && (
                <Text style={{ color: c.textMuted, fontSize: 11 }}>
                  {t('dashboard.paymentMethodUnspecified')} ฿{formatTHB(paymentSplit.unknown)}
                </Text>
              )}
            </View>
            <Animated.View
              entering={FadeInDown.duration(420).delay(220)}
              className="flex-row gap-3"
            >
              <PaymentMethodCard
                colors={c}
                emoji="💵"
                label={t('quick.cash')}
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
                label={t('quick.transfer')}
                amount={paymentSplit.transfer}
                pct={
                  paymentSplit.total > 0
                    ? Math.round(
                        (paymentSplit.transfer / paymentSplit.total) * 100,
                      )
                    : 0
                }
              />
            </Animated.View>
          </View>
        )}

        {period === 'month' && budgetHighlights.length > 0 && (
          <Animated.View
            entering={FadeInDown.duration(420).delay(260)}
            className="rounded-2xl p-4"
            style={{ backgroundColor: c.card, gap: 10 }}
          >
            <View className="flex-row items-center justify-between">
              <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }}>
                {t('budgets.title')}
              </Text>
              <Text style={{ color: c.textSecondary, fontSize: 11 }}>
                {new Intl.DateTimeFormat(locale, { month: 'short' }).format(range.from)}
              </Text>
            </View>
            {budgetHighlights.map(({ budget, cat, spent, pct }) => {
              const barColor =
                pct >= 100 ? c.expense : pct >= 80 ? c.accent : c.income;
              return (
                <View key={budget.id} style={{ gap: 5 }}>
                  <View className="flex-row items-center gap-2">
                    <EmojiOrIcon value={cat?.icon} fallback="sparkle" size={16} />
                    <Text
                      numberOfLines={1}
                      style={{ color: c.text, fontSize: 12, fontWeight: '700', flex: 1 }}
                    >
                      {cat?.name ?? t('common.uncategorized')}
                    </Text>
                    <Text style={{ color: barColor, fontSize: 11, fontWeight: '800' }}>
                      {pct}%
                    </Text>
                  </View>
                  <View className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: c.bg }}>
                    <View
                      className="h-1.5 rounded-full"
                      style={{
                        width: `${Math.min(100, pct)}%`,
                        backgroundColor: barColor,
                      }}
                    />
                  </View>
                  <Text style={{ color: c.textMuted, fontSize: 10 }}>
                    ฿{formatTHB(spent)} / ฿{formatTHB(budget.amount)}
                  </Text>
                </View>
              );
            })}
          </Animated.View>
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
              {t('insights.streakTitle', { defaultValue: 'Logging streak' })}
            </Text>
            <Text
              style={{ color: c.text, fontSize: 16, fontWeight: '700' }}
            >
              {t('insights.streakDays', { defaultValue: '{count} days in a row!', count: 12 })}
            </Text>
          </View>
          <View className="items-end">
            <Text style={{ color: c.textSecondary, fontSize: 11 }}>
              {t('insights.daysToGoal', { defaultValue: '{count} days left', count: 18 })}
            </Text>
            <Text style={{ color: c.accent, fontSize: 12, fontWeight: '700' }}>
              {t('insights.monthGoal', { defaultValue: 'Full month 🏆' })}
            </Text>
          </View>
        </View>

        {/* 5. Weekday usage chart */}
        <Animated.View
          entering={FadeInDown.duration(420).delay(300)}
          className="rounded-2xl p-4"
          style={{ backgroundColor: c.card }}
        >
          <Text
            style={{
              color: c.text,
              fontSize: 15,
              fontWeight: '600',
              marginBottom: 12,
            }}
          >
            {t('insights.weekdayHeading', { defaultValue: 'Heaviest spending days' })}
          </Text>
          <View
            className="flex-row items-end justify-around"
            style={{ height: 100, gap: 6 }}
          >
            {weekdayLabels.map((label, i) => {
              const value = weekdayTotals[i];
              const heightPx = Math.max(4, (value / maxWeekday) * 80);
              const isHeaviest = hasAnyData && i === heaviestIdx;
              return (
                <View key={label} className="items-center flex-1">
                  <View
                    className="flex-1 justify-end items-center w-full"
                  >
                    <AnimatedWeekdayBar
                      color={isHeaviest ? c.accent : c.chip}
                      height={heightPx}
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
                  <Text
                    numberOfLines={1}
                    style={{
                      color: isHeaviest ? c.text : c.textMuted,
                      fontSize: 9,
                      fontWeight: isHeaviest ? '700' : '500',
                      marginTop: 2,
                    }}
                  >
                    ฿{formatTHB(value)}
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
              {t('insights.heaviestDay', { defaultValue: '{day} is the heaviest ', day: heaviestDay })}
              {heaviestIdx === 4 ? '🍻' : heaviestIdx >= 5 ? '🛍' : '☕'}
            </Text>
          ) : (
            <Text
              className="text-center mt-3"
              style={{ color: c.textSecondary, fontSize: 12 }}
            >
              {t('transactions.emptyTitle')}
            </Text>
          )}
        </Animated.View>
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
  const { t } = useTranslation();
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
        <AnimatedProgressBar color={colors.accent} pct={pct} />
      </View>
      <Text style={{ color: colors.textMuted, fontSize: 11 }}>
        {t('insights.shareOfExpense', { defaultValue: '{pct}% of spending', pct })}
      </Text>
    </View>
  );
}

function AnimatedProgressBar({ color, pct }: { color: string; pct: number }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(Math.max(0, Math.min(100, pct)), {
      duration: 700,
      easing: Easing.out(Easing.cubic),
    });
  }, [pct, progress]);
  const style = useAnimatedStyle(() => ({
    width: `${progress.value}%`,
  }));
  return (
    <Animated.View
      className="h-1.5 rounded-full"
      style={[{ backgroundColor: color }, style]}
    />
  );
}

function AnimatedWeekdayBar({ color, height }: { color: string; height: number }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(height, {
      duration: 680,
      easing: Easing.out(Easing.cubic),
    });
  }, [height, progress]);
  const style = useAnimatedStyle(() => ({
    height: progress.value,
  }));
  return (
    <Animated.View
      style={[
        {
          width: '70%',
          backgroundColor: color,
          borderRadius: 8,
        },
        style,
      ]}
    />
  );
}
