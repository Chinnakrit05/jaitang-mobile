import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useActiveLedger } from '../../providers/ActiveLedgerProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { useSync } from '../../providers/SyncProvider';
import { useCategories } from '../../lib/queries/categories';
import {
  useRecurringRules,
  useUpdateRecurring,
  type RecurringRule,
  type Period,
} from '../../lib/queries/recurring';
import {
  useLocalRangeTransactions,
  useCreateTransaction,
  useUpdateTransaction,
} from '../../lib/queries/transactions-local';
import type { LocalTx } from '../../lib/sync/transactions';
import { currencySymbol } from '../../lib/fx';
import {
  getFiled,
  setFiled,
  filedTxIds,
  type FiledMarks,
} from '../../lib/recurring-filed';
import { EmojiOrIcon } from '../../components/icons/EmojiOrIcon';

/**
 * Monthly report — one month at a time with ‹ › navigation.
 *
 * Two sections, recurring FIRST then regular (per the user's spec):
 *   1. รายการประจำ (recurring) — all active rules. Variable-cost rules
 *      that are due (amount IS NULL && next_run_at <= now) get an inline
 *      amount field; filling calls `fill_pending_recurring`, which inserts
 *      the transaction server-side and advances the rule. Fixed / not-yet-
 *      due rules render as read-only info.
 *   2. รายการเดือนนี้ (regular) — the month's actual transactions.
 *
 * Reachable from the More menu (hidden tab). All reads come from the
 * local SQLite mirror; after filling a bill we kick `syncNow()` so the
 * freshly-created transaction shows up without waiting for the poll.
 */

const FILED_KEY = 'jt-recurring-filed';

const PERIOD_LABEL: Record<Period, string> = {
  daily: 'รายวัน',
  weekly: 'รายสัปดาห์',
  monthly: 'รายเดือน',
  yearly: 'รายปี',
};

function formatTHB(n: number): string {
  return Math.round(Math.abs(n)).toLocaleString('en-US');
}

function monthLabel(d: Date): string {
  try {
    return new Intl.DateTimeFormat('th-TH', {
      month: 'long',
      year: 'numeric',
    }).format(d);
  } catch {
    return `${d.getMonth() + 1}/${d.getFullYear()}`;
  }
}

function shortDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('th-TH', {
      day: '2-digit',
      month: 'short',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

function ChevronLeftIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M15 6l-6 6 6 6" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ChevronRightIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 6l6 6-6 6" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export default function ReportScreen() {
  const c = useTheme().colors;
  const { ledger } = useActiveLedger();
  const { syncNow } = useSync();

  // First day of the month being viewed.
  const [monthDate, setMonthDate] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const range = useMemo(() => {
    const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const end = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);
    return { start: start.toISOString(), end: end.toISOString() };
  }, [monthDate]);

  const txs = useLocalRangeTransactions({
    ledgerId: ledger?.id,
    startDate: range.start,
    endDate: range.end,
  });
  const rules = useRecurringRules(ledger?.id);
  const cats = useCategories(ledger?.id);
  const create = useCreateTransaction();
  const update = useUpdateTransaction();
  const updateRule = useUpdateRecurring();

  const catById = useMemo(
    () => new Map((cats.data ?? []).map((x) => [x.id, x])),
    [cats.data],
  );

  // Layout: "classic" = the original recurring + month list, "sheet" = the
  // Excel-style two-section table with recurring rows always visible (with
  // "-" when not filed this month).
  const [viewMode, setViewMode] = useState<'classic' | 'sheet'>('classic');

  // Per-rule amount inputs for the variable bills, keyed by rule id.
  const [pendingAmounts, setPendingAmounts] = useState<Record<string, string>>({});

  // "Filed this month" markers: `${ruleId}|YYYY-MM` → amount recorded.
  // A variable rule has no amount of its own, so without this the inline
  // field would never disappear after filling. Persisted to AsyncStorage
  // so it survives reloads.
  const [filedMarks, setFiledMarks] = useState<FiledMarks>({});
  useEffect(() => {
    AsyncStorage.getItem(FILED_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          setFiledMarks(JSON.parse(raw));
        } catch {
          /* ignore corrupt marker blob */
        }
      })
      .catch(() => {});
  }, []);

  function recordFiled(ruleId: string, amount: number, txId: string | null) {
    setFiledMarks((prev) => {
      const next = setFiled(prev, ruleId, monthDate, amount, txId);
      AsyncStorage.setItem(FILED_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }

  // Transient "✓ บันทึกแล้วเดือนนี้" flash — shown for a moment right after
  // saving, then removed (the row keeps showing the recorded amount).
  const [justSaved, setJustSaved] = useState<Record<string, boolean>>({});
  function flashSaved(ruleId: string) {
    setJustSaved((p) => ({ ...p, [ruleId]: true }));
    setTimeout(() => {
      setJustSaved((p) => {
        const n = { ...p };
        delete n[ruleId];
        return n;
      });
    }, 2500);
  }

  // Variable rules (amount IS NULL) ALWAYS get an inline amount field —
  // the user wants to type the amount for any amount-less recurring, not
  // only ones already past due. Fixed rules render as read-only info.
  const { variableBills, fixedRecurring } = useMemo(() => {
    const variableBills: RecurringRule[] = [];
    const fixedRecurring: RecurringRule[] = [];
    for (const r of rules.data ?? []) {
      if (!r.active) continue;
      if (r.amount == null) variableBills.push(r);
      else fixedRecurring.push(r);
    }
    return { variableBills, fixedRecurring };
  }, [rules.data]);

  const monthTx = txs.data ?? [];
  // Totals use ALL transactions (filed recurring bills are real expenses).
  const income = monthTx.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = monthTx.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0);
  // The "this month" list hides transactions created from recurring bills
  // — they're already shown (as done) in the recurring section above.
  const hiddenTxIds = useMemo(
    () => filedTxIds(filedMarks, monthDate),
    [filedMarks, monthDate],
  );
  const visibleMonthTx = useMemo(
    () => monthTx.filter((t) => !hiddenTxIds.has(t.id)),
    [monthTx, hiddenTxIds],
  );

  function prevMonth() {
    setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }
  function nextMonth() {
    setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }

  // occurred_at for a pre-logged (not-yet-due) bill: now if viewing the
  // current month, otherwise mid-day on the 15th of the viewed month so
  // it lands inside that month's range regardless of timezone.
  function occurredInViewedMonth(): string {
    const now = new Date();
    const sameMonth =
      now.getFullYear() === monthDate.getFullYear() &&
      now.getMonth() === monthDate.getMonth();
    if (sameMonth) return now.toISOString();
    return new Date(
      monthDate.getFullYear(),
      monthDate.getMonth(),
      15,
      12,
      0,
      0,
    ).toISOString();
  }

  async function fillBill(rule: RecurringRule) {
    const raw = (pendingAmounts[rule.id] ?? '').replace(/,/g, '').trim();
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      Alert.alert('ใส่จำนวนเงินก่อน', 'พิมพ์ยอดบิลของเดือนนี้');
      return;
    }
    try {
      // Record the month's instance as a normal transaction and remember
      // its id, so we can keep it OUT of the report's "this month" list
      // (it's already represented in the recurring section above).
      const txId = await create.mutateAsync({
        ledger_id: rule.ledger_id,
        kind: rule.kind,
        amount: n,
        note: rule.note,
        category_id: rule.category_id,
        occurred_at: occurredInViewedMonth(),
      });
      recordFiled(rule.id, n, txId ?? null);
      flashSaved(rule.id);
      setPendingAmounts((prev) => {
        const cp = { ...prev };
        delete cp[rule.id];
        return cp;
      });
      void syncNow();
    } catch (e) {
      console.error('fill bill failed:', e);
      Alert.alert('บันทึกไม่สำเร็จ', String((e as Error)?.message ?? e));
    }
  }

  function close() {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/more');
  }

  if (!ledger) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center" style={{ backgroundColor: c.bg }}>
        <Text style={{ color: c.textSecondary }}>ยังไม่มีสมุดบัญชี</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 96, gap: 16 }}>
        {/* Header */}
        <View className="flex-row items-center justify-between">
          <Pressable
            onPress={close}
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
          <Text style={{ color: c.text, fontSize: 17, fontWeight: '700' }}>
            รายงานรายเดือน
          </Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Month nav */}
        <View
          className="flex-row items-center justify-between rounded-2xl px-2 py-2"
          style={{ backgroundColor: c.card }}
        >
          <Pressable
            onPress={prevMonth}
            style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}
          >
            <ChevronLeftIcon color={c.text} size={20} />
          </Pressable>
          <Text style={{ color: c.text, fontSize: 15, fontWeight: '800' }}>
            {monthLabel(monthDate)}
          </Text>
          <Pressable
            onPress={nextMonth}
            style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}
          >
            <ChevronRightIcon color={c.text} size={20} />
          </Pressable>
        </View>

        {/* Summary */}
        <View className="rounded-2xl p-4 flex-row justify-between" style={{ backgroundColor: c.card }}>
          <View>
            <Text style={{ color: c.textSecondary, fontSize: 11 }}>รายรับ</Text>
            <Text style={{ color: c.income, fontSize: 15, fontWeight: '800' }}>+฿{formatTHB(income)}</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: c.textSecondary, fontSize: 11 }}>รายจ่าย</Text>
            <Text style={{ color: c.expense, fontSize: 15, fontWeight: '800' }}>−฿{formatTHB(expense)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: c.textSecondary, fontSize: 11 }}>คงเหลือ</Text>
            <Text style={{ color: c.text, fontSize: 15, fontWeight: '800' }}>
              {income - expense >= 0 ? '+' : '−'}฿{formatTHB(income - expense)}
            </Text>
          </View>
        </View>

        {/* View-mode tabs */}
        <View
          className="flex-row rounded-2xl p-1"
          style={{ backgroundColor: c.card }}
        >
          {(['classic', 'sheet'] as const).map((m) => {
            const sel = viewMode === m;
            return (
              <Pressable
                key={m}
                onPress={() => setViewMode(m)}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: sel ? c.accent : 'transparent',
                  alignItems: 'center',
                }}
              >
                <Text
                  style={{
                    color: sel ? c.accentText : c.textSecondary,
                    fontSize: 12,
                    fontWeight: '800',
                  }}
                >
                  {m === 'classic' ? 'แบบที่ 1' : 'แบบที่ 2 (ตาราง)'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {viewMode === 'sheet' ? (
          <SheetView
            monthDate={monthDate}
            rules={rules.data ?? []}
            visibleMonthTx={visibleMonthTx}
            filedMarks={filedMarks}
            catById={catById}
            income={income}
            expense={expense}
            colors={c}
            onSaveRow={async (source, patch) => {
              try {
                if (source.type === 'tx') {
                  await update.mutateAsync({ id: source.id, ...patch });
                } else if (source.filedTxId) {
                  // Filed bill — the row's tx already exists, so both
                  // edits patch the same row.
                  await update.mutateAsync({
                    id: source.filedTxId,
                    ...patch,
                  });
                  if (patch.amount != null) {
                    recordFiled(source.rule.id, patch.amount, source.filedTxId);
                  }
                } else if (patch.amount != null) {
                  // First time filling this bill — create the tx using the
                  // (possibly just-edited) note off the rule.
                  const newTxId = await create.mutateAsync({
                    ledger_id: source.rule.ledger_id,
                    kind: source.rule.kind,
                    amount: patch.amount,
                    note: patch.note ?? source.rule.note,
                    category_id: source.rule.category_id,
                    occurred_at: occurredInViewedMonth(),
                  });
                  recordFiled(source.rule.id, patch.amount, newTxId ?? null);
                } else if (patch.note !== undefined) {
                  // Note-only edit on an unfiled bill → update the rule
                  // itself so the note sticks for future months too.
                  await updateRule.mutateAsync({
                    id: source.rule.id,
                    ledger_id: source.rule.ledger_id,
                    kind: source.rule.kind,
                    amount: source.rule.amount,
                    note: patch.note,
                    category_id: source.rule.category_id,
                    period: source.rule.period,
                    active: source.rule.active,
                  });
                }
                void syncNow();
              } catch (e) {
                console.error('save sheet row failed:', e);
                Alert.alert(
                  'บันทึกไม่สำเร็จ',
                  String((e as Error)?.message ?? e),
                );
              }
            }}
          />
        ) : (
          <ClassicSections />
        )}
      </ScrollView>
    </SafeAreaView>
  );

  /** Render the original "recurring + this month" layout as a sub-tree
   *  so the JSX below can stay readable. Closed over the screen's hooks
   *  via lexical scope — no new props plumbing needed. */
  function ClassicSections() {
    return (
      <>
        {/* ── รายการประจำ ── */}
        <SectionHeader title="รายการประจำ" colors={c} />

        {rules.isLoading ? (
          <ActivityIndicator color={c.accent} />
        ) : variableBills.length === 0 && fixedRecurring.length === 0 ? (
          <Text style={{ color: c.textMuted, fontSize: 12, marginLeft: 4 }}>
            ยังไม่มีรายการประจำ
          </Text>
        ) : (
          <View style={{ gap: 8 }}>
            {/* Variable bills — inline amount field, or a "done" row once
                it's been recorded for the viewed month. */}
            {variableBills.map((rule) => {
              const cat = rule.category_id ? catById.get(rule.category_id) : null;
              const filed = getFiled(filedMarks, rule.id, monthDate);
              if (filed) {
                // Recorded for this month → stays here (not duplicated in
                // the list below). Right after saving it flashes a green
                // "✓ บันทึกแล้วเดือนนี้"; after a moment that fades to a
                // muted recorded row. No re-entry → can't double-file.
                const flashing = justSaved[rule.id];
                return (
                  <View
                    key={rule.id}
                    className="rounded-2xl p-3 flex-row items-center gap-3"
                    style={{ backgroundColor: c.card }}
                  >
                    <View
                      className="w-9 h-9 rounded-full items-center justify-center"
                      style={{ backgroundColor: c.chip }}
                    >
                      <EmojiOrIcon value={cat?.icon} fallback="sparkle" size={18} />
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text numberOfLines={1} style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>
                        {rule.note?.trim() || cat?.name || 'รายการประจำ'}
                      </Text>
                      {flashing ? (
                        <Text style={{ color: c.income, fontSize: 11, fontWeight: '700', marginTop: 1 }}>
                          ✓ บันทึกแล้วเดือนนี้
                        </Text>
                      ) : (
                        <Text style={{ color: c.textSecondary, fontSize: 11, marginTop: 1 }}>
                          {PERIOD_LABEL[rule.period]}
                        </Text>
                      )}
                    </View>
                    <Text
                      style={{
                        color: rule.kind === 'income' ? c.income : c.text,
                        fontSize: 14,
                        fontWeight: '700',
                      }}
                    >
                      {rule.kind === 'income' ? '+' : '−'}฿{formatTHB(filed.amount)}
                    </Text>
                  </View>
                );
              }
              return (
                <View
                  key={rule.id}
                  className="rounded-2xl p-3"
                  style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.accent, gap: 8 }}
                >
                  <View className="flex-row items-center gap-3">
                    <View
                      className="w-9 h-9 rounded-full items-center justify-center"
                      style={{ backgroundColor: c.accentSoft }}
                    >
                      <EmojiOrIcon value={cat?.icon} fallback="sparkle" size={18} />
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text numberOfLines={1} style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>
                        {rule.note?.trim() || cat?.name || 'รายการประจำ'}
                      </Text>
                      <Text style={{ color: c.accent, fontSize: 11, fontWeight: '700', marginTop: 1 }}>
                        📝 แปรผัน · ใส่ยอดเดือนนี้ · {PERIOD_LABEL[rule.period]}
                      </Text>
                    </View>
                  </View>
                  <View className="flex-row" style={{ gap: 8 }}>
                    <TextInput
                      value={pendingAmounts[rule.id] ?? ''}
                      onChangeText={(v) =>
                        setPendingAmounts((prev) => ({ ...prev, [rule.id]: v }))
                      }
                      keyboardType="decimal-pad"
                      placeholder="ใส่ยอดบิล"
                      placeholderTextColor={c.textMuted}
                      style={{
                        flex: 1,
                        backgroundColor: c.bg,
                        color: c.text,
                        fontSize: 15,
                        fontWeight: '700',
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        borderRadius: 12,
                      }}
                    />
                    <Pressable
                      onPress={() => fillBill(rule)}
                      disabled={create.isPending}
                      style={{
                        backgroundColor: c.accent,
                        paddingHorizontal: 18,
                        borderRadius: 12,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: create.isPending ? 0.6 : 1,
                      }}
                    >
                      {create.isPending ? (
                        <ActivityIndicator color={c.accentText} />
                      ) : (
                        <Text style={{ color: c.accentText, fontSize: 14, fontWeight: '800' }}>
                          บันทึก
                        </Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              );
            })}

            {/* Fixed recurring — read-only info */}
            {fixedRecurring.map((rule) => {
              const cat = rule.category_id ? catById.get(rule.category_id) : null;
              const variable = rule.amount == null;
              return (
                <View
                  key={rule.id}
                  className="rounded-2xl p-3 flex-row items-center gap-3"
                  style={{ backgroundColor: c.card }}
                >
                  <View
                    className="w-9 h-9 rounded-full items-center justify-center"
                    style={{ backgroundColor: c.chip }}
                  >
                    <EmojiOrIcon value={cat?.icon} fallback="sparkle" size={18} />
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text numberOfLines={1} style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>
                      {rule.note?.trim() || cat?.name || 'รายการประจำ'}
                    </Text>
                    <Text style={{ color: c.textSecondary, fontSize: 11, marginTop: 1 }}>
                      {PERIOD_LABEL[rule.period]}
                      {variable ? ' · แปรผัน' : ''} · ครั้งถัดไป {shortDate(rule.next_run_at)}
                    </Text>
                  </View>
                  {rule.amount != null ? (
                    <Text
                      style={{
                        color: rule.kind === 'income' ? c.income : c.text,
                        fontSize: 14,
                        fontWeight: '700',
                      }}
                    >
                      {rule.kind === 'income' ? '+' : '−'}฿{formatTHB(rule.amount)}
                    </Text>
                  ) : (
                    <Text style={{ color: c.textMuted, fontSize: 12 }}>แปรผัน</Text>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* ── รายการเดือนนี้ (ไม่รวมบิลประจำที่บันทึกด้านบนแล้ว) ── */}
        <SectionHeader title={`รายการเดือนนี้ · ${visibleMonthTx.length}`} colors={c} />

        {txs.isLoading ? (
          <ActivityIndicator color={c.accent} />
        ) : visibleMonthTx.length === 0 ? (
          <Text style={{ color: c.textMuted, fontSize: 12, marginLeft: 4 }}>
            ยังไม่มีรายการในเดือนนี้
          </Text>
        ) : (
          <View className="rounded-2xl overflow-hidden" style={{ backgroundColor: c.card }}>
            {visibleMonthTx.map((item, i) => (
              <TxRow
                key={item.id}
                tx={item}
                cat={item.category_id ? catById.get(item.category_id) : null}
                colors={c}
                isFirst={i === 0}
              />
            ))}
          </View>
        )}
      </>
    );
  }
}

/**
 * Excel-style two-section table. Recurring rules come first (always
 * visible — `-` when not filed this month), then ad-hoc transactions
 * that aren't tied to a recurring rule. Matches the printed spreadsheet
 * the user showed.
 *
 * Tap any amount to edit it inline — return-key / blur saves. Recurring
 * rows save through the same create-then-file path the classic view
 * uses (or update the filed tx if already recorded); ad-hoc rows just
 * patch the transaction's amount.
 */
type SheetRowSource =
  | { type: 'tx'; id: string }
  | { type: 'rule'; rule: RecurringRule; filedTxId: string | null };

function SheetView({
  monthDate,
  rules,
  visibleMonthTx,
  filedMarks,
  catById,
  income,
  expense,
  colors,
  onSaveRow,
}: {
  monthDate: Date;
  rules: RecurringRule[];
  visibleMonthTx: LocalTx[];
  filedMarks: FiledMarks;
  catById: Map<string, { name: string; icon: string | null }>;
  income: number;
  expense: number;
  colors: ReturnType<typeof useTheme>['colors'];
  onSaveRow: (
    source: SheetRowSource,
    patch: { amount?: number; note?: string | null },
  ) => Promise<void>;
}) {
  // ── De-dupe rule rows against orphan transactions ──
  // visibleMonthTx already excludes filedMarks-tracked txs, but the
  // user may still have a tx that matches a recurring rule's note +
  // category + kind (e.g., they typed it via Quick Add before setting
  // up the rule, or filed the rule on another device). Without this
  // pass the rule and that tx both show up — a confusing duplicate.
  //
  // Pair each unfiled rule with a single matching tx (if any). The
  // rule row borrows that tx's amount/id, and the tx is hidden from
  // ad-hoc. Subsequent edits go through the filedTxId update path and
  // call recordFiled, persisting the pairing for next render.
  const activeRules = rules.filter((r) => r.active);
  const linkedByRule = new Map<string, LocalTx>();
  const usedTxIds = new Set<string>();
  for (const rule of activeRules) {
    if (getFiled(filedMarks, rule.id, monthDate)) continue;
    const noteKey = (rule.note ?? '').trim();
    // Need a note OR a category to anchor the match — otherwise it's
    // too vague (e.g., would absorb every uncategorized expense).
    if (!noteKey && !rule.category_id) continue;
    const match = visibleMonthTx.find((t) => {
      if (usedTxIds.has(t.id)) return false;
      if (t.kind !== rule.kind) return false;
      if (rule.category_id && t.category_id !== rule.category_id) return false;
      if (noteKey && (t.note ?? '').trim() !== noteKey) return false;
      return true;
    });
    if (match) {
      linkedByRule.set(rule.id, match);
      usedTxIds.add(match.id);
    }
  }

  const incomeRules = activeRules.filter((r) => r.kind === 'income');
  const expenseRules = activeRules.filter((r) => r.kind === 'expense');
  const adHocIncome = visibleMonthTx.filter(
    (t) => t.kind === 'income' && !usedTxIds.has(t.id),
  );
  const adHocExpense = visibleMonthTx.filter(
    (t) => t.kind === 'expense' && !usedTxIds.has(t.id),
  );

  // Row label: note first (if any) with the category name as a smaller
  // secondary line below. If there's no note, just the category name on
  // a single line. Falls back to a generic label only when both are missing.
  const labelFor = (
    note: string | null | undefined,
    categoryId: string | null,
    fallback: string,
  ): { primary: string; secondary: string | null } => {
    const trimmed = note?.trim() || null;
    const catName =
      (categoryId && catById.get(categoryId)?.name) || null;
    if (trimmed) {
      return { primary: trimmed, secondary: catName };
    }
    return { primary: catName ?? fallback, secondary: null };
  };

  const ruleRow = (r: RecurringRule): SheetRow => {
    const filed = getFiled(filedMarks, r.id, monthDate);
    const linked = filed ? null : linkedByRule.get(r.id);
    const amount = filed ? filed.amount : linked?.amount ?? null;
    const txId = filed?.txId ?? linked?.id ?? null;
    const { primary, secondary } = labelFor(
      r.note,
      r.category_id,
      'รายการประจำ',
    );
    return {
      key: `r-${r.id}`,
      primary,
      secondary,
      note: r.note ?? '',
      amount,
      source: {
        type: 'rule',
        rule: r,
        filedTxId: txId,
      },
    };
  };
  const txRow = (t: LocalTx): SheetRow => {
    const { primary, secondary } = labelFor(t.note, t.category_id, 'รายการ');
    return {
      key: `t-${t.id}`,
      primary,
      secondary,
      note: t.note ?? '',
      amount: t.amount,
      source: { type: 'tx', id: t.id },
    };
  };

  return (
    <View style={{ gap: 12 }}>
      <SheetSection
        title="รายรับ"
        headerColor="#22C55E"
        rows={[...incomeRules.map(ruleRow), ...adHocIncome.map(txRow)]}
        total={income}
        totalLabel="รายได้ทั้งหมด"
        onSaveRow={onSaveRow}
        colors={colors}
      />
      <SheetSection
        title="รายจ่าย"
        headerColor="#EF4444"
        rows={[...expenseRules.map(ruleRow), ...adHocExpense.map(txRow)]}
        total={expense}
        totalLabel="ค่าใช้จ่ายทั้งหมด"
        onSaveRow={onSaveRow}
        colors={colors}
      />
    </View>
  );
}

type SheetRow = {
  key: string;
  primary: string;
  /** Sub-label shown under `primary`. Set when `primary` is the note —
   *  then this holds the category name. `null` for single-line rows. */
  secondary: string | null;
  /** Underlying stored note string (may be empty). The editor uses this
   *  as its draft starting value — distinct from `primary`, which is
   *  what we DISPLAY (note OR category fallback). */
  note: string;
  amount: number | null;
  source: SheetRowSource;
};

function SheetSection({
  title,
  headerColor,
  rows,
  total,
  totalLabel,
  onSaveRow,
  colors,
}: {
  title: string;
  headerColor: string;
  rows: SheetRow[];
  total: number;
  totalLabel: string;
  onSaveRow: (
    source: SheetRowSource,
    patch: { amount?: number; note?: string | null },
  ) => Promise<void>;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  // Editor state: which row + which field is being edited, plus the
  // in-progress draft string. Only one editor open at a time per section.
  type EditField = 'amount' | 'note';
  const [editing, setEditing] = useState<{
    key: string;
    field: EditField;
  } | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  function startEdit(row: SheetRow, field: EditField) {
    setEditing({ key: row.key, field });
    if (field === 'amount') {
      setDraft(row.amount != null ? String(row.amount) : '');
    } else {
      setDraft(row.note);
    }
  }

  async function commit(row: SheetRow, field: EditField) {
    if (field === 'amount') {
      const cleaned = draft.replace(/,/g, '').trim();
      if (cleaned === '') {
        setEditing(null);
        return;
      }
      const n = Number(cleaned);
      if (!Number.isFinite(n) || n < 0 || n === row.amount) {
        setEditing(null);
        return;
      }
      setBusy(true);
      try {
        await onSaveRow(row.source, { amount: n });
      } finally {
        setBusy(false);
        setEditing(null);
      }
      return;
    }
    // field === 'note'
    const next = draft.trim();
    if (next === row.note.trim()) {
      setEditing(null);
      return;
    }
    setBusy(true);
    try {
      await onSaveRow(row.source, { note: next || null });
    } finally {
      setBusy(false);
      setEditing(null);
    }
  }

  return (
    <View
      className="rounded-xl overflow-hidden"
      style={{ borderWidth: 1, borderColor: colors.border }}
    >
      <View
        style={{
          backgroundColor: headerColor,
          paddingHorizontal: 12,
          paddingVertical: 8,
        }}
      >
        <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '800' }}>
          {title}
        </Text>
      </View>
      {rows.length === 0 ? (
        <View style={{ padding: 12, backgroundColor: colors.card }}>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            ยังไม่มีรายการ
          </Text>
        </View>
      ) : (
        rows.map((row, i) => {
          const editingNote =
            editing?.key === row.key && editing.field === 'note';
          const editingAmount =
            editing?.key === row.key && editing.field === 'amount';
          return (
            <View
              key={row.key}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 12,
                paddingVertical: 9,
                backgroundColor:
                  editingNote || editingAmount ? colors.accentSoft : colors.card,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.border,
              }}
            >
              <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                {editingNote ? (
                  <TextInput
                    value={draft}
                    onChangeText={setDraft}
                    autoFocus
                    selectTextOnFocus
                    onBlur={() => commit(row, 'note')}
                    onSubmitEditing={() => commit(row, 'note')}
                    placeholder={row.secondary ?? 'โน๊ต'}
                    placeholderTextColor={colors.textMuted}
                    editable={!busy}
                    style={{
                      color: colors.text,
                      fontSize: 13,
                      paddingVertical: 0,
                    }}
                  />
                ) : (
                  <Pressable
                    onPress={() => startEdit(row, 'note')}
                    hitSlop={4}
                  >
                    <Text
                      numberOfLines={1}
                      style={{ color: colors.text, fontSize: 13 }}
                    >
                      {row.primary}
                    </Text>
                  </Pressable>
                )}
                {row.secondary ? (
                  <Text
                    numberOfLines={1}
                    style={{
                      color: colors.textSecondary,
                      fontSize: 11,
                      marginTop: 1,
                    }}
                  >
                    {row.secondary}
                  </Text>
                ) : null}
              </View>
              {editingAmount ? (
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  keyboardType="decimal-pad"
                  autoFocus
                  selectTextOnFocus
                  onBlur={() => commit(row, 'amount')}
                  onSubmitEditing={() => commit(row, 'amount')}
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  editable={!busy}
                  style={{
                    color: colors.text,
                    fontSize: 13,
                    fontWeight: '700',
                    minWidth: 80,
                    textAlign: 'right',
                    paddingVertical: 0,
                  }}
                />
              ) : (
                <Pressable
                  onPress={() => startEdit(row, 'amount')}
                  hitSlop={6}
                >
                  <Text
                    style={{
                      color:
                        row.amount == null ? colors.textMuted : colors.text,
                      fontSize: 13,
                      fontWeight: row.amount == null ? '500' : '600',
                    }}
                  >
                    {row.amount == null ? '-' : `฿${formatTHB(row.amount)}`}
                  </Text>
                </Pressable>
              )}
            </View>
          );
        })
      )}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 12,
          paddingVertical: 10,
          backgroundColor: colors.cardElevated ?? colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        <Text
          style={{ flex: 1, color: colors.text, fontSize: 13, fontWeight: '800' }}
        >
          {totalLabel}
        </Text>
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: '800' }}>
          ฿{formatTHB(total)}
        </Text>
      </View>
    </View>
  );
}

function SectionHeader({
  title,
  colors,
}: {
  title: string;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <Text
      style={{
        color: colors.textSecondary,
        fontSize: 11,
        fontWeight: '800',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginLeft: 4,
        marginBottom: -4,
      }}
    >
      {title}
    </Text>
  );
}

function TxRow({
  tx,
  cat,
  colors,
  isFirst,
}: {
  tx: LocalTx;
  cat: { name: string; icon: string | null } | null | undefined;
  colors: ReturnType<typeof useTheme>['colors'];
  isFirst: boolean;
}) {
  return (
    <View
      className="flex-row items-center gap-3 px-3 py-3"
      style={{
        borderTopWidth: isFirst ? 0 : 1,
        borderTopColor: colors.border,
        opacity: tx._sync_state !== 'clean' ? 0.7 : 1,
      }}
    >
      <View
        className="w-9 h-9 rounded-full items-center justify-center"
        style={{ backgroundColor: colors.chip }}
      >
        <EmojiOrIcon value={cat?.icon} fallback="sparkle" size={18} />
      </View>
      <View className="flex-1 min-w-0">
        <Text numberOfLines={1} style={{ color: colors.text, fontSize: 14, fontWeight: '500' }}>
          {tx.note?.trim() || cat?.name || 'รายการ'}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }}>
          {shortDate(tx.occurred_at)}
          {cat?.name ? ` · ${cat.name}` : ''}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text
          style={{
            color: tx.kind === 'income' ? colors.income : colors.text,
            fontSize: 14,
            fontWeight: '700',
          }}
        >
          {tx.kind === 'income' ? '+' : '−'}฿{formatTHB(tx.amount)}
        </Text>
        {tx.fx_currency && tx.fx_amount != null ? (
          <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 1 }}>
            {currencySymbol(tx.fx_currency)}
            {formatTHB(tx.fx_amount)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
