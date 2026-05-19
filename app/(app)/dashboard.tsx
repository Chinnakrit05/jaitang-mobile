import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { useAuth } from '../../providers/AuthProvider';
import { useActiveLedger } from '../../providers/ActiveLedgerProvider';
import { useActiveTrip } from '../../providers/ActiveTripProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { useLocalMonthTransactions } from '../../lib/queries/transactions-local';
import { useCategories } from '../../lib/queries/categories';
import { useTrips } from '../../lib/queries/trips';
import { MONTHLY_BUDGET_PERIOD, useBudgets } from '../../lib/queries/budgets';
import { Donut, type DonutSlice } from '../../components/Donut';
import { Mascot } from '../../components/Mascot';
import { EmojiOrIcon } from '../../components/icons/EmojiOrIcon';
import { SyncStatusBadge } from '../../components/SyncStatusBadge';

/**
 * Dashboard — ported from `ui/Dashboard.html` (v2-playful). Sections,
 * top to bottom:
 *
 *   1. Greeting row with the user's name + a streak chip (streak is
 *      mocked for now; needs a per-user counter on the server).
 *   2. Hero balance card — mascot + month nav + this-month numbers.
 *      Mood line is derived from expense % of a (still-mocked) budget.
 *   3. Trip card — placeholder until the trips table lands.
 *   4. Category breakdown donut + legend, computed from real txs.
 *   5. Recent transactions (last 5).
 *
 * Colors come exclusively from `useTheme().colors` so light / dark /
 * (future) accent + season palettes flow through automatically. The
 * one exception is the donut category palette (pink/purple/yellow/…)
 * which is intentionally fixed — it's semantic per category, not theme.
 */

// Fixed across themes — these are category brand colors, not palette.
const CATEGORY_PALETTE = [
  '#FF7BAC', // pink
  '#A78BFA', // purple
  '#FBBF24', // yellow
  '#FB923C', // orange
  '#60A5FA', // blue
  '#34D399', // green
];

function formatMonth(d: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
  }).format(d);
}

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return '';
  }
}

function formatPct(value: number, total: number) {
  if (total <= 0) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

/**
 * Tween a JS number toward `target` over `duration` ms using an
 * ease-out cubic curve. Lightweight (uses requestAnimationFrame, no
 * native bridge), perfect for rolling balance displays. Re-fires when
 * `target` changes so the number animates to the new value smoothly.
 */
function useCountUp(target: number, duration = 800): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);

  useEffect(() => {
    const from = fromRef.current;
    const start = Date.now();
    let raf: number;
    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = from + (target - from) * eased;
      setValue(current);
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}

/**
 * Subtle floating bounce — translates the wrapped child up a few px
 * and back, forever. Used on the shiba mascot to give it some life
 * without being distracting.
 */
function useFloatingBounce(amplitude = 3, durationMs = 2200) {
  const offset = useSharedValue(0);
  useEffect(() => {
    offset.value = withRepeat(
      withSequence(
        withTiming(-amplitude, {
          duration: durationMs / 2,
          easing: Easing.inOut(Easing.ease),
        }),
        withTiming(0, {
          duration: durationMs / 2,
          easing: Easing.inOut(Easing.ease),
        }),
      ),
      -1,
    );
  }, [amplitude, durationMs, offset]);
  return useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }],
  }));
}

export default function DashboardScreen() {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const { ledger, loading: ledgerLoading } = useActiveLedger();
  const { trip: activeTrip } = useActiveTrip();
  const txs = useLocalMonthTransactions(ledger?.id);
  const cats = useCategories(ledger?.id);
  const trips = useTrips(ledger?.id);
  const budgets = useBudgets(ledger?.id, MONTHLY_BUDGET_PERIOD);
  const c = useTheme().colors;
  const locale = i18n.resolvedLanguage ?? i18n.language;

  // Trip lookup so the recent-tx list can show a per-row trip chip
  // (same pattern as transactions.tsx).
  const tripById = useMemo(
    () => new Map((trips.data ?? []).map((t) => [t.id, t])),
    [trips.data],
  );

  // Tally just this trip's transactions so the card can show the
  // running total. The list is already loaded for the dashboard's other
  // sections, so this is a cheap filter — no extra DB hit.
  const tripStats = useMemo(() => {
    if (!activeTrip) return null;
    const tripTxs = (txs.data ?? []).filter(
      (t) => t.trip_id === activeTrip.id,
    );
    const spent = tripTxs
      .filter((t) => t.kind === 'expense')
      .reduce((s, t) => s + t.amount, 0);
    return { count: tripTxs.length, spent };
  }, [activeTrip, txs.data]);

  const monthIncome = (txs.data ?? [])
    .filter((t) => t.kind === 'income')
    .reduce((s, t) => s + t.amount, 0);
  const monthExpense = (txs.data ?? [])
    .filter((t) => t.kind === 'expense')
    .reduce((s, t) => s + t.amount, 0);
  const monthNet = monthIncome - monthExpense;

  const breakdown = useMemo(() => {
    const byCat = new Map<string | null, number>();
    for (const t of txs.data ?? []) {
      if (t.kind !== 'expense') continue;
      byCat.set(t.category_id, (byCat.get(t.category_id) ?? 0) + t.amount);
    }
    const rows = [...byCat.entries()]
      .map(([cid, value]) => {
        const cat = cats.data?.find((c) => c.id === cid);
        return {
          id: cid,
          name: cat?.name ?? t('common.uncategorized'),
          icon: cat?.icon ?? null,
          value,
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
    const slices: DonutSlice[] = rows.map((r, i) => ({
      value: r.value,
      color: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length],
    }));
    return { rows, slices };
  }, [txs.data, cats.data, t]);

  const recent = useMemo(() => {
    return [...(txs.data ?? [])]
      .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1))
      .slice(0, 5);
  }, [txs.data]);

  const budgetCap =
    (budgets.data ?? []).reduce((s, b) => s + b.amount, 0) || 42000;
  const moodPct = Math.min(100, Math.round((monthExpense / budgetCap) * 100));
  const moodLabel =
    moodPct < 70
      ? t('dashboard.moodHappy')
      : moodPct < 90
        ? t('dashboard.moodWorried')
        : t('dashboard.moodOver');

  const userName =
    (session?.user.user_metadata?.full_name as string | undefined) ??
    session?.user.email?.split('@')[0] ??
    t('dashboard.friendFallback');

  // Animated balance figures — roll up from the previous value rather
  // than snap. Round only at the display step so the count looks smooth.
  const animatedNet = useCountUp(monthNet);
  const animatedIncome = useCountUp(monthIncome);
  const animatedExpense = useCountUp(monthExpense);
  const animatedMoodPct = useCountUp(moodPct);

  const shibaBounce = useFloatingBounce();

  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: c.bg }}
      edges={['top']}
    >
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 96, gap: 16 }}
      >
        {/* 1. Greeting */}
        <Animated.View
          entering={FadeInDown.duration(380).delay(0)}
          className="flex-row items-center justify-between"
        >
          <View className="flex-row items-center gap-3">
            <View
              className="w-11 h-11 rounded-full items-center justify-center"
              style={{ backgroundColor: c.chip }}
            >
              <Text style={{ fontSize: 22 }}>🦊</Text>
            </View>
            <View>
              <Text style={{ color: c.textSecondary, fontSize: 12 }}>
                {t('dashboard.helloShort')}
              </Text>
              <Text
                style={{ color: c.text, fontSize: 16, fontWeight: '600' }}
              >
                {userName}
              </Text>
            </View>
          </View>
          <View
            className="flex-row items-center gap-1 px-3 py-1.5 rounded-full"
            style={{ backgroundColor: c.expenseBg }}
          >
            <Text style={{ fontSize: 13 }}>🔥</Text>
            <Text style={{ color: c.accent, fontSize: 12, fontWeight: '700' }}>
              {t('dashboard.streakDays', { count: 12 })}
            </Text>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(380).delay(60)}>
          <SyncStatusBadge />
        </Animated.View>

        {ledgerLoading ? (
          <ActivityIndicator color={c.accent} />
        ) : !ledger ? (
          <View
            className="rounded-3xl p-6 items-center"
            style={{ backgroundColor: c.cardElevated }}
          >
            <Text style={{ fontSize: 44 }}>📒</Text>
            <Text
              style={{
                color: c.text,
                fontSize: 18,
                fontWeight: '700',
                marginTop: 8,
              }}
            >
              {t('dashboard.noLedgerTitle')}
            </Text>
            <Text
              className="text-center"
              style={{ color: c.textSecondary, fontSize: 13, marginTop: 4 }}
            >
              {t('dashboard.noLedgerHint')}
            </Text>
            <Pressable
              onPress={() => router.push('/(app)/onboarding-ledger')}
              style={{
                marginTop: 16,
                paddingHorizontal: 22,
                paddingVertical: 12,
                borderRadius: 14,
                backgroundColor: c.accent,
                shadowColor: c.accent,
                shadowOpacity: 0.35,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 3 },
                elevation: 4,
              }}
            >
              <Text
                style={{
                  color: c.accentText,
                  fontSize: 14,
                  fontWeight: '700',
                }}
              >
                {t('dashboard.createLedger')}
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* 2. Hero balance card — text on the left, shiba in the
                top-right corner. Mascot floats with a subtle bounce so
                it doesn't feel frozen on screen; balance numbers tween
                in from their previous values. */}
            <Animated.View
              entering={FadeInDown.duration(420).delay(120)}
              className="rounded-3xl p-5 overflow-hidden"
              style={{
                backgroundColor: c.cardElevated,
                position: 'relative',
              }}
            >
              <Animated.View
                style={[{ position: 'absolute', top: 8, right: 8 }, shibaBounce]}
              >
                <Mascot size={76} />
              </Animated.View>

              <Text
                style={{ color: c.textSecondary, fontSize: 12, paddingRight: 80 }}
              >
                {t('dashboard.monthBalance')}
              </Text>
              <Text
                style={{
                  color: c.textSecondary,
                  fontSize: 11,
                  marginTop: 2,
                  paddingRight: 80,
                }}
              >
                ‹ {formatMonth(new Date(), locale)} ›
              </Text>
              <Text
                style={{
                  color: c.text,
                  fontSize: 40,
                  fontWeight: '700',
                  marginTop: 14,
                }}
              >
                ฿ {Math.round(animatedNet).toLocaleString('en-US')}
              </Text>

              <View className="flex-row gap-2 mt-3">
                <View
                  className="flex-row items-center gap-1 px-3 py-1.5 rounded-full"
                  style={{ backgroundColor: c.chip }}
                >
                  <Text style={{ color: c.income, fontSize: 11 }}>▲</Text>
                  <Text
                    style={{ color: c.text, fontSize: 12, fontWeight: '600' }}
                  >
                    {t('common.income')} ฿{Math.round(animatedIncome).toLocaleString('en-US')}
                  </Text>
                </View>
                <View
                  className="flex-row items-center gap-1 px-3 py-1.5 rounded-full"
                  style={{ backgroundColor: c.chip }}
                >
                  <Text style={{ color: c.expense, fontSize: 11 }}>▼</Text>
                  <Text
                    style={{ color: c.text, fontSize: 12, fontWeight: '600' }}
                  >
                    {t('common.expense')} ฿{Math.round(animatedExpense).toLocaleString('en-US')}
                  </Text>
                </View>
              </View>

              {/* Mood + progress — bar fill width tweens with the
                  count-up so it visually tracks the number. */}
              <View
                className="mt-4 px-3 py-2.5 rounded-2xl"
                style={{ backgroundColor: c.chip }}
              >
                <Text style={{ color: c.text, fontSize: 13 }}>
                  {t('dashboard.mascotName')}
                  <Text style={{ color: c.textSecondary, fontSize: 12 }}>
                    {'  '}
                    {moodLabel} · {t('dashboard.budgetPercent', { pct: Math.round(animatedMoodPct) })}
                  </Text>
                </Text>
                <View
                  className="h-1.5 rounded-full mt-2 overflow-hidden"
                  style={{ backgroundColor: c.bg }}
                >
                  <View
                    className="h-1.5 rounded-full"
                    style={{
                      backgroundColor: c.accent,
                      width: `${animatedMoodPct}%`,
                    }}
                  />
                </View>
              </View>
            </Animated.View>

            {/* 3. Trip card — shown only when there's an active trip.
                The tally counts only this-month transactions tagged to
                the trip (cheap filter on the already-loaded txs.data). */}
            {activeTrip && tripStats && (
              <Animated.View entering={FadeInDown.duration(420).delay(200)}>
              <Pressable
                className="rounded-2xl p-4"
                style={{ backgroundColor: c.card }}
                onPress={() => router.push('/(app)/trips')}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-3 flex-1 min-w-0">
                    <View
                      className="w-10 h-10 rounded-full items-center justify-center"
                      style={{
                        backgroundColor:
                          (activeTrip.color ?? c.trip) + '33',
                      }}
                    >
                      <Text style={{ fontSize: 18 }}>
                        {activeTrip.icon ?? '✈️'}
                      </Text>
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text
                        style={{
                          color: c.text,
                          fontSize: 14,
                          fontWeight: '700',
                        }}
                        numberOfLines={1}
                      >
                        {activeTrip.name}
                      </Text>
                      <Text
                        style={{
                          color: c.textSecondary,
                          fontSize: 11,
                          marginTop: 1,
                        }}
                      >
                        🟢 {t('dashboard.activeTripMeta', { count: tripStats.count })}
                      </Text>
                    </View>
                  </View>
                  <View className="items-end">
                    <Text
                      style={{
                        color: c.text,
                        fontSize: 14,
                        fontWeight: '700',
                      }}
                    >
                      ฿
                      {Math.round(tripStats.spent).toLocaleString('en-US')}
                    </Text>
                    <Text
                      style={{ color: c.textSecondary, fontSize: 11 }}
                    >
                      {t('dashboard.tripSpend')}
                    </Text>
                  </View>
                </View>
              </Pressable>
              </Animated.View>
            )}

            {/* 4. Category breakdown */}
            <Animated.View entering={FadeInDown.duration(420).delay(280)}>
              <View className="flex-row items-center justify-between mb-3">
                <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>
                  {t('dashboard.categorySummary')}
                </Text>
                <Pressable onPress={() => router.push('/(app)/insights')}>
                  <Text style={{ color: c.accent, fontSize: 13, fontWeight: '600' }}>
                    {t('nav.insights')} →
                  </Text>
                </Pressable>
              </View>
              <View
                className="rounded-2xl p-4 flex-row items-center gap-4"
                style={{ backgroundColor: c.card }}
              >
                <Donut
                  data={breakdown.slices}
                  trackColor={c.chip}
                  labelColor={c.textMuted}
                  centerColor={c.text}
                  label={t('dashboard.donutSpent')}
                  centerValue={
                    monthExpense
                      ? `฿${Math.round(monthExpense).toLocaleString('en-US')}`
                      : '—'
                  }
                />
                <View className="flex-1 gap-2">
                  {breakdown.rows.length === 0 ? (
                    <Text style={{ color: c.textSecondary, fontSize: 12 }}>
                      {t('dashboard.noExpensePrompt')}
                    </Text>
                  ) : (
                    breakdown.rows.map((r, i) => (
                      <View
                        key={r.id ?? `none-${i}`}
                        className="flex-row items-center gap-2"
                      >
                        <View
                          className="w-2.5 h-2.5 rounded-full"
                          style={{
                            backgroundColor:
                              CATEGORY_PALETTE[i % CATEGORY_PALETTE.length],
                          }}
                        />
                        <EmojiOrIcon value={r.icon} fallback="sparkle" size={14} />
                        <View className="flex-1 min-w-0">
                          <View className="flex-row items-center gap-2">
                            <Text
                              numberOfLines={1}
                              style={{ color: c.text, fontSize: 13, flex: 1 }}
                            >
                              {r.name}
                            </Text>
                            <Text style={{ color: c.textSecondary, fontSize: 11, fontWeight: '700' }}>
                              {formatPct(r.value, monthExpense)}
                            </Text>
                          </View>
                          <View className="flex-row items-center gap-2 mt-1">
                            <View
                              className="h-1 rounded-full flex-1 overflow-hidden"
                              style={{ backgroundColor: c.bg }}
                            >
                              <AnimatedLegendBar
                                color={CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]}
                                pct={
                                  monthExpense > 0
                                    ? Math.round((r.value / monthExpense) * 100)
                                    : 0
                                }
                              />
                            </View>
                            <Text style={{ color: c.textMuted, fontSize: 10 }}>
                              ฿{Math.round(r.value).toLocaleString('en-US')}
                            </Text>
                          </View>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              </View>
            </Animated.View>

            {/* 5. Recent transactions */}
            <Animated.View entering={FadeInDown.duration(420).delay(360)}>
              <View className="flex-row items-center justify-between mb-3">
                <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>
                  {t('dashboard.recent')}
                </Text>
                <Pressable onPress={() => router.push('/(app)/transactions')}>
                  <Text style={{ color: c.accent, fontSize: 13, fontWeight: '600' }}>
                    {t('dashboard.viewAll')}
                  </Text>
                </Pressable>
              </View>
              <View
                className="rounded-2xl overflow-hidden"
                style={{ backgroundColor: c.card }}
              >
                {recent.length === 0 ? (
                  <Text
                    className="p-4 text-center"
                    style={{ color: c.textSecondary, fontSize: 13 }}
                  >
                    {t('dashboard.noMonthTransactions')}
                  </Text>
                ) : (
                  recent.map((t, idx) => {
                    const cat = cats.data?.find((c) => c.id === t.category_id);
                    const tripTag = t.trip_id ? tripById.get(t.trip_id) : null;
                    const sign = t.kind === 'income' ? '+' : '−';
                    const signColor = t.kind === 'income' ? c.income : c.text;
                    return (
                      <View
                        key={t.id}
                        className="flex-row items-center gap-3 px-4 py-3"
                        style={{
                          borderTopWidth: idx === 0 ? 0 : 1,
                          borderTopColor: c.border,
                        }}
                      >
                        <View
                          className="w-10 h-10 rounded-full items-center justify-center"
                          style={{ backgroundColor: c.bg }}
                        >
                          <EmojiOrIcon
                            value={cat?.icon}
                            fallback="sparkle"
                            size={20}
                          />
                        </View>
                        <View className="flex-1">
                          <View className="flex-row items-center gap-2">
                            <Text
                              numberOfLines={1}
                              style={{
                                color: c.text,
                                fontSize: 14,
                                fontWeight: '500',
                                flexShrink: 1,
                              }}
                            >
                              {t.note ?? cat?.name ?? i18n.t('dashboard.genericTransaction')}
                            </Text>
                            {tripTag && (
                              <View
                                style={{
                                  paddingHorizontal: 6,
                                  paddingVertical: 2,
                                  borderRadius: 999,
                                  backgroundColor:
                                    (tripTag.color ?? c.trip) + '22',
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  gap: 3,
                                  flexShrink: 0,
                                }}
                              >
                                <Text style={{ fontSize: 9 }}>
                                  {tripTag.icon ?? '✈️'}
                                </Text>
                                <Text
                                  numberOfLines={1}
                                  style={{
                                    color: tripTag.color ?? c.trip,
                                    fontSize: 9,
                                    fontWeight: '700',
                                    maxWidth: 80,
                                  }}
                                >
                                  {tripTag.name}
                                </Text>
                              </View>
                            )}
                          </View>
                          <Text
                            style={{ color: c.textMuted, fontSize: 11 }}
                            numberOfLines={1}
                          >
                            {cat?.name ?? (t.kind === 'income' ? i18n.t('common.income') : i18n.t('common.uncategorized'))}
                            <Text> · </Text>
                            {formatTime(t.occurred_at)}
                          </Text>
                        </View>
                        <Text
                          style={{
                            color: signColor,
                            fontSize: 14,
                            fontWeight: '600',
                          }}
                        >
                          {sign}
                          <Text style={{ fontSize: 11 }}>
                            {ledger.currency === 'THB' ? '฿' : ledger.currency}
                          </Text>
                          {Math.round(t.amount).toLocaleString('en-US')}
                        </Text>
                      </View>
                    );
                  })
                )}
              </View>
            </Animated.View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function AnimatedLegendBar({ color, pct }: { color: string; pct: number }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(Math.max(0, Math.min(100, pct)), {
      duration: 760,
      easing: Easing.out(Easing.cubic),
    });
  }, [pct, progress]);
  const style = useAnimatedStyle(() => ({
    width: `${progress.value}%`,
  }));
  return (
    <Animated.View
      className="h-1 rounded-full"
      style={[{ backgroundColor: color }, style]}
    />
  );
}
