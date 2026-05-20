import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { useActiveLedger } from '../../providers/ActiveLedgerProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { useLocalRangeTransactions } from '../../lib/queries/transactions-local';
import { useCategories } from '../../lib/queries/categories';
import { EmojiOrIcon } from '../../components/icons/EmojiOrIcon';
import { Mascot } from '../../components/Mascot';
import type { LocalTx } from '../../lib/sync/transactions';

// Heatmap colors are derived dynamically from theme accent:
// Level 0: no spending (neutral card)
// Level 1: <= 25% of max spending (accent at 0.15 opacity)
// Level 2: <= 50% of max spending (accent at 0.35 opacity)
// Level 3: <= 75% of max spending (accent at 0.65 opacity)
// Level 4: <= 100% of max spending (accent at 1.0 opacity)

function ChevronLeftIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15 6l-6 6 6 6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ChevronRightIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 6l6 6-6 6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function PlusIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 5v14M5 12h14"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return '';
  }
}

export default function CalendarScreen() {
  const { t, i18n } = useTranslation();
  const c = useTheme().colors;
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const { ledger, loading: ledgerLoading } = useActiveLedger();

  // Current year & month state
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-indexed (1-12)

  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Categories lookup
  const cats = useCategories(ledger?.id);

  // Timezone-aware range strings (Bangkok +07:00)
  const { startDate, endDate } = useMemo(() => {
    const startStr = `${year}-${String(month).padStart(2, '0')}-01T00:00:00+07:00`;
    let nextYear = year;
    let nextMonth = month + 1;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear = year + 1;
    }
    const endStr = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00+07:00`;
    return {
      startDate: new Date(startStr).toISOString(),
      endDate: new Date(endStr).toISOString(),
    };
  }, [year, month]);

  // Fetch local transactions in this range
  const txs = useLocalRangeTransactions({
    ledgerId: ledger?.id,
    startDate,
    endDate,
  });

  // Convert UTC ISO to Bangkok YYYY-MM-DD
  const toBangkokDateString = (occurredAtStr: string): string => {
    try {
      const utcTime = new Date(occurredAtStr).getTime();
      if (isNaN(utcTime)) return '';
      const bangkokTime = utcTime + 7 * 60 * 60 * 1000;
      return new Date(bangkokTime).toISOString().slice(0, 10);
    } catch {
      return '';
    }
  };

  // Group transactions by day and calculate totals
  const dailyStats = useMemo(() => {
    const stats: Record<string, { income: number; expense: number; txs: LocalTx[] }> = {};
    for (const tx of txs.data ?? []) {
      const bkkDate = toBangkokDateString(tx.occurred_at);
      if (!bkkDate) continue;
      if (!stats[bkkDate]) {
        stats[bkkDate] = { income: 0, expense: 0, txs: [] };
      }
      stats[bkkDate].txs.push(tx);
      if (tx.kind === 'income') {
        stats[bkkDate].income += tx.amount;
      } else {
        stats[bkkDate].expense += tx.amount;
      }
    }
    return stats;
  }, [txs.data]);

  // Max daily expense for heatmap scaling
  const maxDailyExpense = useMemo(() => {
    let max = 0;
    for (const bkkDate in dailyStats) {
      const parts = bkkDate.split('-');
      if (Number(parts[0]) === year && Number(parts[1]) === month) {
        max = Math.max(max, dailyStats[bkkDate].expense);
      }
    }
    return max;
  }, [dailyStats, year, month]);

  // Month details (1st day index and total days)
  const { totalDays, paddingDays } = useMemo(() => {
    const total = new Date(year, month, 0).getDate();
    const firstDay = new Date(year, month - 1, 1);
    const padding = (firstDay.getDay() + 6) % 7; // Mon is 0
    return { totalDays: total, paddingDays: padding };
  }, [year, month]);

  // Today in Bangkok timezone
  const todayBkk = useMemo(() => {
    return toBangkokDateString(new Date().toISOString());
  }, []);

  // Initialize selected date
  useEffect(() => {
    const todayParts = todayBkk.split('-');
    if (Number(todayParts[0]) === year && Number(todayParts[1]) === month) {
      setSelectedDate(todayBkk);
    } else {
      setSelectedDate(`${year}-${String(month).padStart(2, '0')}-01`);
    }
  }, [year, month, todayBkk]);

  // Generate 42 cells grid
  const cells = useMemo(() => {
    const arr = [];
    // Previous month blanks
    for (let i = 0; i < paddingDays; i++) {
      arr.push({ isPadding: true, key: `prev-${i}` });
    }
    // Active days
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      arr.push({ isPadding: false, day: d, dateStr, key: dateStr });
    }
    // Next month padding to keep 6 rows completely stable
    const remaining = 42 - arr.length;
    for (let i = 0; i < remaining; i++) {
      arr.push({ isPadding: true, key: `next-${i}` });
    }
    return arr;
  }, [year, month, paddingDays, totalDays]);

  // Summaries
  const { totalIncome, totalExpense, activeDaysCount } = useMemo(() => {
    let inc = 0;
    let exp = 0;
    let active = 0;
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayData = dailyStats[dateStr];
      if (dayData) {
        inc += dayData.income;
        exp += dayData.expense;
        if (dayData.txs.length > 0) active++;
      }
    }
    return { totalIncome: inc, totalExpense: exp, activeDaysCount: active };
  }, [dailyStats, totalDays, year, month]);

  const avgExpense = totalDays > 0 ? totalExpense / totalDays : 0;

  // Navigate months
  function prevMonth() {
    if (month === 1) {
      setYear(year - 1);
      setMonth(12);
    } else {
      setMonth(month - 1);
    }
  }

  function nextMonth() {
    if (month === 12) {
      setYear(year + 1);
      setMonth(1);
    } else {
      setMonth(month + 1);
    }
  }

  // Active month text
  const monthText = useMemo(() => {
    const d = new Date(year, month - 1, 1);
    return new Intl.DateTimeFormat(locale, {
      month: 'long',
      year: 'numeric',
    }).format(d);
  }, [year, month, locale]);

  if (ledgerLoading) {
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
        className="flex-1 items-center justify-center px-6"
        style={{ backgroundColor: c.bg }}
      >
        <Text style={{ color: c.textSecondary, textAlign: 'center' }}>
          {t('dashboard.noLedgerTitle')}
        </Text>
      </SafeAreaView>
    );
  }

  const selectedDateData = selectedDate ? dailyStats[selectedDate] : null;
  const selectedTxs = selectedDateData?.txs ?? [];

  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: c.bg }}
      edges={['top']}
    >
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-2">
        <Pressable
          onPress={() => router.back()}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: c.card,
          }}
        >
          <ChevronLeftIcon color={c.text} size={20} />
        </Pressable>
        <Text style={{ color: c.text, fontSize: 18, fontWeight: '700' }}>
          {t('calendar.title')}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 64, gap: 14 }}>
        {/* Navigation & Month Selector */}
        <View
          className="mx-4 rounded-2xl p-4 flex-row items-center justify-between"
          style={{ backgroundColor: c.card }}
        >
          <Pressable
            onPress={prevMonth}
            className="w-10 h-10 items-center justify-center rounded-full"
            style={{ backgroundColor: c.bg }}
          >
            <ChevronLeftIcon color={c.text} size={18} />
          </Pressable>
          <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>
            {monthText}
          </Text>
          <Pressable
            onPress={nextMonth}
            className="w-10 h-10 items-center justify-center rounded-full"
            style={{ backgroundColor: c.bg }}
          >
            <ChevronRightIcon color={c.text} size={18} />
          </Pressable>
        </View>

        {/* Stats summaries */}
        <View className="px-4 flex-row flex-wrap" style={{ marginHorizontal: -4, gap: 8 }}>
          <View className="flex-row flex-1 gap-2">
            <StatCard
              title={t('calendar.statIncome')}
              value={`฿${Math.round(totalIncome).toLocaleString()}`}
              color={c.income}
              bg={c.incomeBg}
            />
            <StatCard
              title={t('calendar.statExpense')}
              value={`฿${Math.round(totalExpense).toLocaleString()}`}
              color={c.expense}
              bg={c.expenseBg}
            />
          </View>
          <View className="flex-row flex-1 gap-2">
            <StatCard
              title={t('calendar.statAvg')}
              value={`฿${Math.round(avgExpense).toLocaleString()}`}
              color={c.text}
              bg={c.card}
            />
            <StatCard
              title={t('calendar.statActiveDays')}
              value={t('calendar.statActiveDaysValue', {
                active: activeDaysCount,
                total: totalDays,
              })}
              color={c.accent}
              bg={c.chip}
            />
          </View>
        </View>

        {/* Calendar Grid Card */}
        <View
          className="mx-4 rounded-3xl p-4"
          style={{ backgroundColor: c.card, gap: 12 }}
        >
          {/* Weekday Row Header */}
          <View className="flex-row justify-between">
            {['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((day) => (
              <View key={day} style={{ width: '13.5%', alignItems: 'center' }}>
                <Text style={{ color: c.textSecondary, fontSize: 11, fontWeight: '600' }}>
                  {t(`calendar.dow.${day}`)}
                </Text>
              </View>
            ))}
          </View>

          {/* Calendar Grid Cells */}
          {txs.isLoading ? (
            <View className="py-24 items-center justify-center">
              <ActivityIndicator color={c.accent} />
            </View>
          ) : (
            <View className="flex-row flex-wrap gap-y-2 justify-between">
              {cells.map((cell, idx) => {
                if (cell.isPadding) {
                  return (
                    <View
                      key={cell.key}
                      style={{
                        width: '13.5%',
                        aspectRatio: 1,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: 0.1,
                      }}
                    >
                      <View
                        className="w-10 h-10 rounded-xl"
                        style={{ backgroundColor: c.bg }}
                      />
                    </View>
                  );
                }

                const dateStr = cell.dateStr!;
                const isSelected = selectedDate === dateStr;
                const isToday = todayBkk === dateStr;
                const stats = dailyStats[dateStr];
                const dayExpense = stats?.expense ?? 0;
                const hasIncome = (stats?.income ?? 0) > 0;

                // Level determination
                let level = 0;
                if (dayExpense > 0) {
                  if (maxDailyExpense === 0 || dayExpense <= 0.25 * maxDailyExpense) {
                    level = 1;
                  } else if (dayExpense <= 0.5 * maxDailyExpense) {
                    level = 2;
                  } else if (dayExpense <= 0.75 * maxDailyExpense) {
                    level = 3;
                  } else {
                    level = 4;
                  }
                }

                // Heatmap color logic
                let cellBg = c.cardElevated;
                let textCol = c.text;
                let levelBorderCol = 'transparent';

                if (level === 1) cellBg = `${c.accent}26`; // 15% opacity
                else if (level === 2) cellBg = `${c.accent}59`; // 35% opacity
                else if (level === 3) cellBg = `${c.accent}A6`; // 65% opacity
                else if (level === 4) {
                  cellBg = c.accent;
                  textCol = c.accentText ?? '#FFFFFF';
                }

                return (
                  <Animated.View
                    key={cell.key}
                    entering={FadeInDown.duration(260).delay(idx * 8)}
                    style={{ width: '13.5%', aspectRatio: 1 }}
                  >
                    <Pressable
                      onPress={() => setSelectedDate(dateStr)}
                      className="w-10 h-10 rounded-xl items-center justify-between py-1 relative overflow-hidden"
                      style={{
                        backgroundColor: cellBg,
                        borderWidth: isSelected ? 2 : isToday ? 1.5 : 0,
                        borderColor: isSelected ? c.text : isToday ? c.textMuted : levelBorderCol,
                      }}
                    >
                      <Text
                        style={{
                          color: textCol,
                          fontSize: 13,
                          fontWeight: isSelected || isToday ? '700' : '500',
                          marginTop: 1,
                        }}
                      >
                        {cell.day}
                      </Text>

                      {/* Income green dot indicator */}
                      {hasIncome && (
                        <View
                          className="w-1.5 h-1.5 rounded-full absolute bottom-1.5"
                          style={{
                            backgroundColor: level === 4 ? '#FFFFFF' : c.income,
                          }}
                        />
                      )}
                    </Pressable>
                  </Animated.View>
                );
              })}
            </View>
          )}

          {/* Legend */}
          <View className="mt-2 pt-3 border-t flex-row items-center justify-between" style={{ borderColor: c.border }}>
            {/* Heatmap level labels */}
            <View className="flex-row items-center gap-1.5">
              <Text style={{ color: c.textMuted, fontSize: 10 }}>
                {t('calendar.legendLess')}
              </Text>
              <View className="flex-row gap-1">
                <View className="w-4 h-4 rounded" style={{ backgroundColor: c.cardElevated, borderWidth: 1, borderColor: c.border }} />
                <View className="w-4 h-4 rounded" style={{ backgroundColor: `${c.accent}26` }} />
                <View className="w-4 h-4 rounded" style={{ backgroundColor: `${c.accent}59` }} />
                <View className="w-4 h-4 rounded" style={{ backgroundColor: `${c.accent}A6` }} />
                <View className="w-4 h-4 rounded" style={{ backgroundColor: c.accent }} />
              </View>
              <Text style={{ color: c.textMuted, fontSize: 10 }}>
                {t('calendar.legendMore')}
              </Text>
            </View>

            {/* Income Key */}
            <View className="flex-row items-center gap-1.5">
              <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.income }} />
              <Text style={{ color: c.textMuted, fontSize: 10 }}>
                {t('calendar.legendIncome')}
              </Text>
            </View>
          </View>
        </View>

        {/* Selected date transactions details */}
        {selectedDate && (
          <View
            className="mx-4 rounded-3xl p-4"
            style={{ backgroundColor: c.card, gap: 12 }}
          >
            {/* Details Header */}
            <View className="flex-row items-center justify-between">
              <View>
                <Text style={{ color: c.text, fontSize: 15, fontWeight: '700' }}>
                  {(() => {
                    const parts = selectedDate.split('-');
                    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                    return new Intl.DateTimeFormat(locale, {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    }).format(d);
                  })()}
                </Text>
                <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 1 }}>
                  {t('calendar.dayTxHeading', { count: selectedTxs.length })}
                </Text>
              </View>

              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/(app)/quick',
                    params: { date: selectedDate },
                  })
                }
                className="w-9 h-9 rounded-full items-center justify-center"
                style={{ backgroundColor: c.chip }}
              >
                <PlusIcon color={c.text} size={16} />
              </Pressable>
            </View>

            {/* Transactions list */}
            {selectedTxs.length === 0 ? (
              <View className="py-8 items-center justify-center gap-3">
                <View style={{ width: 72, height: 72 }}>
                  <Mascot size={72} />
                </View>
                <View className="items-center">
                  <Text style={{ color: c.text, fontSize: 13, fontWeight: '600' }}>
                    {t('calendar.dayEmpty')}
                  </Text>
                  <Text style={{ color: c.textSecondary, fontSize: 11, marginTop: 2, textAlign: 'center' }}>
                    🐾 Clean day! Shiba says well done! 🦴
                  </Text>
                </View>

                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: '/(app)/quick',
                      params: { date: selectedDate },
                    })
                  }
                  className="px-5 py-2.5 rounded-full mt-1"
                  style={{ backgroundColor: c.accent }}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>
                    {t('dashboard.addTransaction')}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {selectedTxs.map((tx) => {
                  const cat = cats.data?.find((x) => x.id === tx.category_id);
                  const isInc = tx.kind === 'income';
                  return (
                    <Pressable
                      key={tx.id}
                      onPress={() =>
                        router.push({
                          pathname: '/(app)/edit-transaction',
                          params: { id: tx.id },
                        })
                      }
                      className="rounded-2xl p-3 flex-row items-center gap-3"
                      style={{ backgroundColor: c.cardElevated }}
                    >
                      <View
                        className="w-10 h-10 rounded-full items-center justify-center"
                        style={{ backgroundColor: c.bg }}
                      >
                        <EmojiOrIcon
                          value={cat?.icon}
                          fallback={isInc ? 'accounts' : 'receipt'}
                          size={20}
                        />
                      </View>

                      <View className="flex-1 min-w-0">
                        <Text
                          style={{ color: c.text, fontSize: 13, fontWeight: '600' }}
                          numberOfLines={1}
                        >
                          {cat?.name ?? (isInc ? t('common.income') : t('common.expense'))}
                        </Text>
                        <Text
                          style={{ color: c.textSecondary, fontSize: 11, marginTop: 2 }}
                          numberOfLines={1}
                        >
                          {tx.note ? `${tx.note} · ` : ''}
                          {formatTime(tx.occurred_at)}
                        </Text>
                      </View>

                      <Text
                        style={{
                          color: isInc ? c.income : c.expense,
                          fontSize: 14,
                          fontWeight: '700',
                        }}
                      >
                        {isInc ? '+' : '-'}฿{Math.round(tx.amount).toLocaleString()}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({
  title,
  value,
  color,
  bg,
}: {
  title: string;
  value: string | number;
  color: string;
  bg: string;
}) {
  return (
    <View
      className="flex-1 rounded-2xl p-3.5"
      style={{ backgroundColor: bg }}
    >
      <Text style={{ color: color, fontSize: 11, opacity: 0.8 }}>
        {title}
      </Text>
      <Text style={{ color: color, fontSize: 16, fontWeight: '700', marginTop: 4 }}>
        {value}
      </Text>
    </View>
  );
}
