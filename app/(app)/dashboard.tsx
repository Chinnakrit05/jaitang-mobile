import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { useAuth } from '../../providers/AuthProvider';
import { useActiveLedger } from '../../providers/ActiveLedgerProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { useLocalMonthTransactions } from '../../lib/queries/transactions-local';
import { useCategories } from '../../lib/queries/categories';
import { formatCurrency } from '../../lib/format';
import { Donut, type DonutSlice } from '../../components/Donut';
import { ShibaMascot } from '../../components/ShibaMascot';
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

const THAI_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

function formatThaiMonth(d: Date) {
  return `${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
}

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return '';
  }
}

export default function DashboardScreen() {
  const { session } = useAuth();
  const { ledger, loading: ledgerLoading } = useActiveLedger();
  const txs = useLocalMonthTransactions(ledger?.id);
  const cats = useCategories(ledger?.id);
  const c = useTheme().colors;

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
          name: cat?.name ?? 'อื่นๆ',
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
  }, [txs.data, cats.data]);

  const recent = useMemo(() => {
    return [...(txs.data ?? [])]
      .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1))
      .slice(0, 5);
  }, [txs.data]);

  const budgetCap = 42000;
  const moodPct = Math.min(100, Math.round((monthExpense / budgetCap) * 100));
  const moodLabel =
    moodPct < 70 ? 'กำลังแฮปปี้' : moodPct < 90 ? 'เริ่มกังวล' : 'เกินงบแล้ว';

  const userName =
    (session?.user.user_metadata?.full_name as string | undefined) ??
    session?.user.email?.split('@')[0] ??
    'เพื่อน';

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
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <View
              className="w-11 h-11 rounded-full items-center justify-center"
              style={{ backgroundColor: c.chip }}
            >
              <Text style={{ fontSize: 22 }}>🦊</Text>
            </View>
            <View>
              <Text style={{ color: c.textSecondary, fontSize: 12 }}>
                สวัสดี ✨
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
              12 วัน
            </Text>
          </View>
        </View>

        <SyncStatusBadge />

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
              ยังไม่มีสมุดบัญชี
            </Text>
            <Text
              className="text-center"
              style={{ color: c.textSecondary, fontSize: 13, marginTop: 4 }}
            >
              สร้างสมุดเล่มแรกเพื่อเริ่มจดรายรับ-รายจ่าย
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
                + สร้างสมุดบัญชี
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* 2. Hero balance card — text on the left, shiba in the
                top-right corner. The card uses `position: relative` so
                ShibaMascot can absolute-position itself; everything
                below has rightward padding to leave room for the mascot
                without overlapping. */}
            <View
              className="rounded-3xl p-5 overflow-hidden"
              style={{
                backgroundColor: c.cardElevated,
                position: 'relative',
              }}
            >
              <View style={{ position: 'absolute', top: 8, right: 8 }}>
                <ShibaMascot size={76} />
              </View>

              <Text
                style={{ color: c.textSecondary, fontSize: 12, paddingRight: 80 }}
              >
                ยอดคงเหลือเดือนนี้
              </Text>
              <Text
                style={{
                  color: c.textSecondary,
                  fontSize: 11,
                  marginTop: 2,
                  paddingRight: 80,
                }}
              >
                ‹ {formatThaiMonth(new Date())} ›
              </Text>
              <Text
                style={{
                  color: c.text,
                  fontSize: 40,
                  fontWeight: '700',
                  marginTop: 14,
                }}
              >
                ฿ {Math.round(monthNet).toLocaleString('en-US')}
              </Text>

              <View className="flex-row gap-2 mt-3">
                <View
                  className="flex-row items-center gap-1 px-3 py-1.5 rounded-full"
                  style={{ backgroundColor: 'rgba(255, 255, 255, 0.65)' }}
                >
                  <Text style={{ color: c.income, fontSize: 11 }}>▲</Text>
                  <Text
                    style={{ color: c.text, fontSize: 12, fontWeight: '600' }}
                  >
                    รายรับ ฿{Math.round(monthIncome).toLocaleString('en-US')}
                  </Text>
                </View>
                <View
                  className="flex-row items-center gap-1 px-3 py-1.5 rounded-full"
                  style={{ backgroundColor: 'rgba(255, 255, 255, 0.65)' }}
                >
                  <Text style={{ color: c.expense, fontSize: 11 }}>▼</Text>
                  <Text
                    style={{ color: c.text, fontSize: 12, fontWeight: '600' }}
                  >
                    รายจ่าย ฿{Math.round(monthExpense).toLocaleString('en-US')}
                  </Text>
                </View>
              </View>

              {/* Mood + progress — same as before, sits at the bottom
                  of the hero card as a soft white sub-pill. */}
              <View
                className="mt-4 px-3 py-2.5 rounded-2xl"
                style={{ backgroundColor: 'rgba(255, 255, 255, 0.6)' }}
              >
                <Text style={{ color: c.text, fontSize: 13 }}>
                  น้องชิบะ
                  <Text style={{ color: c.textSecondary, fontSize: 12 }}>
                    {'  '}
                    {moodLabel} · {moodPct}% ของงบ
                  </Text>
                </Text>
                <View
                  className="h-1.5 rounded-full mt-2"
                  style={{ backgroundColor: 'rgba(255, 255, 255, 0.6)' }}
                >
                  <View
                    className="h-1.5 rounded-full"
                    style={{ backgroundColor: c.accent, width: `${moodPct}%` }}
                  />
                </View>
              </View>
            </View>

            {/* 3. Trip card — HIDDEN until the trips table + sync mirror
                land. The mockup keeps a slot here; we'll re-enable when
                an `useActiveTrip()` hook + trips mirror exist so the
                values come from real data instead of being hardcoded. */}

            {/* 4. Category breakdown */}
            <View>
              <View className="flex-row items-center justify-between mb-3">
                <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>
                  สรุปหมวดหมู่
                </Text>
                <Pressable onPress={() => router.push('/(app)/insights')}>
                  <Text style={{ color: c.accent, fontSize: 13, fontWeight: '600' }}>
                    ดูรายงาน →
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
                  label="จ่ายไป"
                  centerValue={
                    monthExpense
                      ? `฿${Math.round(monthExpense).toLocaleString('en-US')}`
                      : '—'
                  }
                />
                <View className="flex-1 gap-2">
                  {breakdown.rows.length === 0 ? (
                    <Text style={{ color: c.textSecondary, fontSize: 12 }}>
                      ยังไม่มีรายจ่าย — เพิ่มรายการแรกได้เลย
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
                        <Text
                          numberOfLines={1}
                          style={{ color: c.text, fontSize: 13, flex: 1 }}
                        >
                          {r.name}
                        </Text>
                      </View>
                    ))
                  )}
                </View>
              </View>
            </View>

            {/* 5. Recent transactions */}
            <View>
              <View className="flex-row items-center justify-between mb-3">
                <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>
                  รายการล่าสุด
                </Text>
                <Pressable onPress={() => router.push('/(app)/transactions')}>
                  <Text style={{ color: c.accent, fontSize: 13, fontWeight: '600' }}>
                    ดูทั้งหมด →
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
                    ยังไม่มีรายการในเดือนนี้
                  </Text>
                ) : (
                  recent.map((t, idx) => {
                    const cat = cats.data?.find((c) => c.id === t.category_id);
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
                          <Text
                            numberOfLines={1}
                            style={{
                              color: c.text,
                              fontSize: 14,
                              fontWeight: '500',
                            }}
                          >
                            {t.note ?? cat?.name ?? 'รายการ'}
                          </Text>
                          <Text
                            style={{ color: c.textMuted, fontSize: 11 }}
                            numberOfLines={1}
                          >
                            {cat?.name ?? (t.kind === 'income' ? 'รายรับ' : 'อื่นๆ')}
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
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
