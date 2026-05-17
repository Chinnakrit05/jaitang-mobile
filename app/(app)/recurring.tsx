import { useMemo, useState } from 'react';
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

import { useActiveLedger } from '../../providers/ActiveLedgerProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { useCategories } from '../../lib/queries/categories';
import {
  useCreateRecurring,
  useDeleteRecurring,
  useFillPendingRecurring,
  useRecurringRules,
  useRunDueRecurring,
  useUpdateRecurring,
  type Period,
  type RecurringRule,
} from '../../lib/queries/recurring';
import { sortCategoriesByHierarchy } from '../../lib/categories-helpers';
import { EmojiOrIcon } from '../../components/icons/EmojiOrIcon';

/**
 * Recurring rules manager.
 *
 * Sections top → bottom:
 *   1. Header (back / title / +).
 *   2. Pending bills — variable-cost rules whose `next_run_at <= now`.
 *      Each row has an inline amount input + ✓ button; tapping ✓ fires
 *      `fill_pending_recurring`, creating the tx and advancing next_run_at.
 *   3. Run-due banner — count of fixed-amount rules ready to fire.
 *      Single tap runs them all via `run_due_recurring`.
 *   4. Inline form (toggleable) — name + amount (optional!) + period +
 *      category + active toggle on edit.
 *   5. List of all rules, active first then paused.
 *
 * Variable mode: leave the amount field empty. The rule still saves;
 * it just won't auto-fire. When the next_run_at passes, the row shows
 * up in the Pending section for the user to enter the actual bill amount.
 */

const THAI_MONTH_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

const PERIOD_LABEL: Record<Period, string> = {
  daily: 'รายวัน',
  weekly: 'รายสัปดาห์',
  monthly: 'รายเดือน',
  yearly: 'รายปี',
};

const PERIOD_SHORT: Record<Period, string> = {
  daily: 'ทุกวัน',
  weekly: 'ทุกสัปดาห์',
  monthly: 'ทุกเดือน',
  yearly: 'ทุกปี',
};

function formatThaiDate(iso: string) {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, '0')} ${THAI_MONTH_SHORT[d.getMonth()]} ${d.getFullYear() + 543}`;
  } catch {
    return iso;
  }
}

function formatTHB(n: number) {
  return Math.round(Math.abs(n)).toLocaleString('en-US');
}

function ChevronLeftIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15 6l-6 6 6 6"
        stroke={color}
        strokeWidth={1.8}
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

function PlayIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M7 5v14l12-7z" />
    </Svg>
  );
}

function CheckIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 12l5 5L20 7"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

type FormState = {
  mode: 'create' | 'edit';
  id?: string;
  kind: 'expense' | 'income';
  amount: string; // empty string = variable mode
  note: string;
  categoryId: string | null;
  period: Period;
  active: boolean;
};

export default function RecurringScreen() {
  const c = useTheme().colors;
  const { ledger, loading: ledgerLoading } = useActiveLedger();
  const rules = useRecurringRules(ledger?.id);
  const cats = useCategories(ledger?.id);
  const create = useCreateRecurring();
  const update = useUpdateRecurring();
  const del = useDeleteRecurring();
  const runDue = useRunDueRecurring();
  const fill = useFillPendingRecurring();

  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Per-pending-row amount input, keyed by rule id.
  const [pendingAmounts, setPendingAmounts] = useState<
    Record<string, string>
  >({});

  const catById = useMemo(
    () => new Map((cats.data ?? []).map((cat) => [cat.id, cat])),
    [cats.data],
  );

  const now = new Date().toISOString();

  const { fixedDue, pendingBills } = useMemo(() => {
    const all = rules.data ?? [];
    const fixedDue: RecurringRule[] = [];
    const pendingBills: RecurringRule[] = [];
    for (const r of all) {
      if (!r.active) continue;
      if (r.next_run_at > now) continue;
      if (r.amount == null) pendingBills.push(r);
      else fixedDue.push(r);
    }
    return { fixedDue, pendingBills };
  }, [rules.data, now]);

  function openCreate() {
    setError(null);
    setForm({
      mode: 'create',
      kind: 'expense',
      amount: '',
      note: '',
      categoryId: null,
      period: 'monthly',
      active: true,
    });
  }

  function openEdit(rule: RecurringRule) {
    setError(null);
    setForm({
      mode: 'edit',
      id: rule.id,
      kind: rule.kind,
      amount: rule.amount != null ? String(rule.amount) : '',
      note: rule.note ?? '',
      categoryId: rule.category_id,
      period: rule.period,
      active: rule.active,
    });
  }

  function closeForm() {
    setForm(null);
    setError(null);
  }

  async function save() {
    if (!ledger || !form) return;
    const note = form.note.trim();
    if (!note) {
      setError('ใส่ชื่อรายการก่อน');
      return;
    }
    // Amount is optional now — empty string means variable mode.
    const trimmedAmount = form.amount.replace(/,/g, '').trim();
    let amountValue: number | null = null;
    if (trimmedAmount !== '') {
      const n = Number(trimmedAmount);
      if (!Number.isFinite(n) || n <= 0) {
        setError('จำนวนเงินต้องมากกว่า 0 หรือเว้นว่างไว้สำหรับบิลที่ราคาไม่แน่');
        return;
      }
      amountValue = n;
    }
    try {
      setError(null);
      if (form.mode === 'create') {
        await create.mutateAsync({
          ledger_id: ledger.id,
          kind: form.kind,
          amount: amountValue,
          note,
          category_id: form.categoryId,
          period: form.period,
          next_run_at: new Date().toISOString(),
        });
      } else {
        await update.mutateAsync({
          id: form.id!,
          ledger_id: ledger.id,
          kind: form.kind,
          amount: amountValue,
          note,
          category_id: form.categoryId,
          period: form.period,
          active: form.active,
        });
      }
      closeForm();
    } catch (e) {
      console.error('save recurring failed:', e);
      setError(extractErrorMessage(e));
    }
  }

  function confirmDelete(rule: RecurringRule) {
    Alert.alert(
      `ลบ "${rule.note ?? 'รายการประจำ'}"?`,
      'ลบเฉพาะกฎ — transactions ที่สร้างไปแล้วยังอยู่',
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'ลบ',
          style: 'destructive',
          onPress: async () => {
            if (!ledger) return;
            try {
              await del.mutateAsync({ id: rule.id, ledger_id: ledger.id });
              if (form?.mode === 'edit' && form.id === rule.id) closeForm();
            } catch (e) {
              console.error('delete recurring failed:', e);
              Alert.alert('ลบไม่สำเร็จ', extractErrorMessage(e));
            }
          },
        },
      ],
    );
  }

  async function handleRunDue() {
    if (!ledger) return;
    try {
      const count = await runDue.mutateAsync(ledger.id);
      Alert.alert(
        'รันสำเร็จ',
        count > 0
          ? `สร้าง ${count} รายการในสมุดแล้ว`
          : 'ไม่มีกฎที่ถึงกำหนดในตอนนี้',
      );
    } catch (e) {
      console.error('run due failed:', e);
      Alert.alert('รันไม่สำเร็จ', extractErrorMessage(e));
    }
  }

  async function handleFillPending(rule: RecurringRule) {
    if (!ledger) return;
    const raw = (pendingAmounts[rule.id] ?? '').replace(/,/g, '').trim();
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      Alert.alert('ใส่จำนวนเงิน', 'กรอกยอดบิลก่อนกดบันทึก');
      return;
    }
    try {
      await fill.mutateAsync({
        id: rule.id,
        ledger_id: ledger.id,
        amount: n,
      });
      // Clear the inline input
      setPendingAmounts((prev) => {
        const next = { ...prev };
        delete next[rule.id];
        return next;
      });
    } catch (e) {
      console.error('fill pending failed:', e);
      Alert.alert('บันทึกไม่สำเร็จ', extractErrorMessage(e));
    }
  }

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
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: c.bg }}
      >
        <Text style={{ color: c.textSecondary }}>ยังไม่มีสมุดบัญชี</Text>
      </SafeAreaView>
    );
  }

  const visibleCats = sortCategoriesByHierarchy(
    (cats.data ?? []).filter((cat) => form && cat.kind === form.kind),
  );

  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: c.bg }}
      edges={['top']}
    >
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 96, gap: 14 }}>
        {/* Header */}
        <View className="flex-row items-center justify-between">
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
            รายการประจำ
          </Text>
          <Pressable
            onPress={form ? closeForm : openCreate}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: form ? c.chip : c.accent,
            }}
          >
            {form ? (
              <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>
                ✕
              </Text>
            ) : (
              <PlusIcon color={c.chipActiveText} size={18} />
            )}
          </Pressable>
        </View>

        {/* Pending bills section (variable amount, due) */}
        {pendingBills.length > 0 && (
          <View
            className="rounded-2xl p-4"
            style={{ backgroundColor: c.cardElevated, gap: 10 }}
          >
            <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>
              📝 บิลที่รอใส่ราคา ({pendingBills.length})
            </Text>
            <Text style={{ color: c.textSecondary, fontSize: 11, marginTop: -4 }}>
              บิลพวกนี้ราคาไม่แน่นอน — ใส่ยอดแล้วกด ✓ เพื่อบันทึก
            </Text>
            {pendingBills.map((rule) => {
              const cat = rule.category_id ? catById.get(rule.category_id) : null;
              return (
                <View
                  key={rule.id}
                  className="rounded-xl p-3"
                  style={{ backgroundColor: c.card, gap: 8 }}
                >
                  <View className="flex-row items-center gap-2">
                    <EmojiOrIcon
                      value={cat?.icon ?? '🧾'}
                      fallback="sparkle"
                      size={20}
                    />
                    <Text
                      className="flex-1"
                      style={{ color: c.text, fontSize: 14, fontWeight: '600' }}
                      numberOfLines={1}
                    >
                      {rule.note ?? 'บิลรอกรอก'}
                    </Text>
                    <Text style={{ color: c.textMuted, fontSize: 11 }}>
                      {PERIOD_SHORT[rule.period]}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <View
                      className="flex-row items-center gap-1 px-3 rounded-lg flex-1"
                      style={{ backgroundColor: c.bg }}
                    >
                      <Text style={{ color: c.textSecondary, fontSize: 14 }}>
                        ฿
                      </Text>
                      <TextInput
                        value={pendingAmounts[rule.id] ?? ''}
                        onChangeText={(v) =>
                          setPendingAmounts((prev) => ({
                            ...prev,
                            [rule.id]: v,
                          }))
                        }
                        keyboardType="decimal-pad"
                        placeholder="ใส่ยอดบิลครั้งนี้"
                        placeholderTextColor={c.textMuted}
                        style={{
                          flex: 1,
                          color: c.text,
                          fontSize: 14,
                          fontWeight: '600',
                          paddingVertical: 9,
                        }}
                      />
                    </View>
                    <Pressable
                      onPress={() => handleFillPending(rule)}
                      disabled={fill.isPending}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        backgroundColor: c.accent,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: fill.isPending ? 0.6 : 1,
                      }}
                    >
                      {fill.isPending ? (
                        <ActivityIndicator color={c.chipActiveText} />
                      ) : (
                        <CheckIcon color={c.chipActiveText} size={18} />
                      )}
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Run-due banner */}
        {fixedDue.length > 0 && (
          <Pressable
            onPress={handleRunDue}
            disabled={runDue.isPending}
            className="rounded-2xl p-4 flex-row items-center gap-3"
            style={{
              backgroundColor: c.cardElevated,
              opacity: runDue.isPending ? 0.6 : 1,
            }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: c.accent,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {runDue.isPending ? (
                <ActivityIndicator color={c.chipActiveText} />
              ) : (
                <PlayIcon color={c.chipActiveText} size={18} />
              )}
            </View>
            <View className="flex-1">
              <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>
                บิลที่ถึงกำหนด {fixedDue.length} รายการ
              </Text>
              <Text style={{ color: c.textSecondary, fontSize: 11, marginTop: 1 }}>
                กดเพื่อสร้าง transactions ใหม่ตามกฎอัตโนมัติ
              </Text>
            </View>
          </Pressable>
        )}

        {/* Form */}
        {form && (
          <View
            className="rounded-2xl p-4"
            style={{ backgroundColor: c.card, gap: 12 }}
          >
            <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>
              {form.mode === 'create' ? 'รายการประจำใหม่' : 'แก้ไขรายการประจำ'}
            </Text>

            {/* Kind toggle */}
            <View
              className="rounded-xl p-1 flex-row"
              style={{ backgroundColor: c.bg }}
            >
              {(['expense', 'income'] as const).map((k) => {
                const active = form.kind === k;
                return (
                  <Pressable
                    key={k}
                    onPress={() =>
                      setForm({ ...form, kind: k, categoryId: null })
                    }
                    className="flex-1 py-2 rounded-lg items-center"
                    style={{
                      backgroundColor: active ? c.card : 'transparent',
                    }}
                  >
                    <Text
                      style={{
                        color: active ? c.text : c.textSecondary,
                        fontSize: 12,
                        fontWeight: active ? '700' : '500',
                      }}
                    >
                      {k === 'expense' ? 'รายจ่าย' : 'รายรับ'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Note (name) */}
            <View>
              <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 6 }}>
                ชื่อรายการ
              </Text>
              <TextInput
                value={form.note}
                onChangeText={(v) => setForm({ ...form, note: v })}
                placeholder="ค่าเช่าบ้าน, เน็ต, ค่าสมาชิก..."
                placeholderTextColor={c.textMuted}
                style={{
                  backgroundColor: c.bg,
                  color: c.text,
                  fontSize: 14,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 12,
                }}
              />
            </View>

            {/* Amount — optional */}
            <View>
              <View className="flex-row items-baseline justify-between mb-1">
                <Text style={{ color: c.textSecondary, fontSize: 11 }}>
                  จำนวนเงิน ({ledger.currency})
                </Text>
                <Text style={{ color: c.textMuted, fontSize: 10 }}>
                  เว้นว่าง = ให้กรอกตอนได้บิล
                </Text>
              </View>
              <TextInput
                value={form.amount}
                onChangeText={(v) => setForm({ ...form, amount: v })}
                keyboardType="decimal-pad"
                placeholder="0 (หรือเว้นว่างสำหรับบิลรอกรอก)"
                placeholderTextColor={c.textMuted}
                style={{
                  backgroundColor: c.bg,
                  color: c.text,
                  fontSize: 16,
                  fontWeight: '600',
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 12,
                }}
              />
            </View>

            {/* Period */}
            <View>
              <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 8 }}>
                ความถี่
              </Text>
              <View className="flex-row gap-2">
                {(['daily', 'weekly', 'monthly', 'yearly'] as const).map((p) => {
                  const active = form.period === p;
                  return (
                    <Pressable
                      key={p}
                      onPress={() => setForm({ ...form, period: p })}
                      className="flex-1 py-2 rounded-lg items-center"
                      style={{
                        backgroundColor: active ? c.chipActive : c.bg,
                      }}
                    >
                      <Text
                        style={{
                          color: active ? c.chipActiveText : c.text,
                          fontSize: 11,
                          fontWeight: active ? '700' : '500',
                        }}
                      >
                        {PERIOD_LABEL[p]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Category */}
            <View>
              <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 8 }}>
                หมวด (ไม่บังคับ)
              </Text>
              {visibleCats.length === 0 ? (
                <Text style={{ color: c.textMuted, fontSize: 12 }}>
                  ยังไม่มีหมวดสำหรับ {form.kind === 'expense' ? 'รายจ่าย' : 'รายรับ'}
                </Text>
              ) : (
                <View className="flex-row flex-wrap gap-1.5">
                  {visibleCats.map((cat) => {
                    const selected = form.categoryId === cat.id;
                    return (
                      <Pressable
                        key={cat.id}
                        onPress={() =>
                          setForm({
                            ...form,
                            categoryId: selected ? null : cat.id,
                          })
                        }
                        className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full"
                        style={{
                          backgroundColor: selected ? c.chipActive : c.bg,
                        }}
                      >
                        <EmojiOrIcon
                          value={cat.icon}
                          fallback="sparkle"
                          size={14}
                        />
                        <Text
                          style={{
                            color: selected ? c.chipActiveText : c.text,
                            fontSize: 12,
                            fontWeight: selected ? '700' : '500',
                          }}
                        >
                          {cat.parent_id ? '↳ ' : ''}
                          {cat.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>

            {/* Active toggle (edit only) */}
            {form.mode === 'edit' && (
              <Pressable
                onPress={() => setForm({ ...form, active: !form.active })}
                className="flex-row items-center justify-between rounded-xl px-3 py-2.5"
                style={{ backgroundColor: c.bg }}
              >
                <Text style={{ color: c.text, fontSize: 13, fontWeight: '600' }}>
                  เปิดใช้งานกฎ
                </Text>
                <View
                  style={{
                    width: 42,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: form.active ? c.accent : c.chip,
                    justifyContent: 'center',
                    paddingHorizontal: 2,
                  }}
                >
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      backgroundColor: c.card,
                      alignSelf: form.active ? 'flex-end' : 'flex-start',
                    }}
                  />
                </View>
              </Pressable>
            )}

            {error && (
              <Text style={{ color: c.expense, fontSize: 12 }}>{error}</Text>
            )}

            <View className="flex-row gap-2">
              <Pressable
                onPress={closeForm}
                className="flex-1 py-3 rounded-xl items-center"
                style={{ backgroundColor: c.chip }}
              >
                <Text style={{ color: c.text, fontSize: 13, fontWeight: '600' }}>
                  ยกเลิก
                </Text>
              </Pressable>
              <Pressable
                onPress={save}
                disabled={create.isPending || update.isPending}
                className="flex-1 py-3 rounded-xl items-center"
                style={{
                  backgroundColor: c.accent,
                  opacity: create.isPending || update.isPending ? 0.6 : 1,
                }}
              >
                {create.isPending || update.isPending ? (
                  <ActivityIndicator color={c.chipActiveText} />
                ) : (
                  <Text
                    style={{
                      color: c.chipActiveText,
                      fontSize: 13,
                      fontWeight: '700',
                    }}
                  >
                    {form.mode === 'create' ? 'เพิ่ม' : 'บันทึก'}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        )}

        {/* List */}
        {rules.isLoading ? (
          <View className="p-8 items-center">
            <ActivityIndicator color={c.accent} />
          </View>
        ) : rules.error ? (
          <Text className="text-center" style={{ color: c.expense, fontSize: 13 }}>
            {String(rules.error)}
          </Text>
        ) : (rules.data ?? []).length === 0 ? (
          <View
            className="rounded-2xl p-8 items-center"
            style={{ backgroundColor: c.card }}
          >
            <Text style={{ fontSize: 36 }}>🔁</Text>
            <Text
              style={{ color: c.text, fontSize: 14, marginTop: 8, fontWeight: '500' }}
            >
              ยังไม่มีรายการประจำ
            </Text>
            <Text
              className="text-center"
              style={{ color: c.textSecondary, fontSize: 12, marginTop: 4 }}
            >
              กด + เพื่อเพิ่ม{'\n'}เช่น ค่าเช่าบ้าน, Netflix, ค่ามือถือ
            </Text>
          </View>
        ) : (
          <View
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: c.card }}
          >
            {(rules.data ?? []).map((rule, idx) => {
              const cat = rule.category_id ? catById.get(rule.category_id) : null;
              const isVariable = rule.amount == null;
              const isDue = rule.active && rule.next_run_at <= now;
              return (
                <Pressable
                  key={rule.id}
                  onPress={() => openEdit(rule)}
                  onLongPress={() => confirmDelete(rule)}
                  delayLongPress={350}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    borderTopWidth: idx === 0 ? 0 : 1,
                    borderTopColor: c.border,
                    opacity: rule.active ? 1 : 0.55,
                  }}
                >
                  <View
                    className="w-10 h-10 rounded-full items-center justify-center"
                    style={{ backgroundColor: c.bg }}
                  >
                    <EmojiOrIcon
                      value={cat?.icon ?? '🔁'}
                      fallback="sparkle"
                      size={20}
                    />
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text
                      style={{ color: c.text, fontSize: 14, fontWeight: '500' }}
                      numberOfLines={1}
                    >
                      {rule.note ?? 'รายการประจำ'}
                    </Text>
                    <Text
                      style={{ color: c.textSecondary, fontSize: 11, marginTop: 1 }}
                      numberOfLines={1}
                    >
                      {PERIOD_SHORT[rule.period]}
                      {!rule.active ? ' · หยุดอยู่' : ''}
                      {isVariable ? ' · 📝 บิลรอกรอก' : ''}
                      {isDue && !isVariable ? ' · ' : ' · ครั้งถัดไป '}
                      {isDue && !isVariable ? (
                        <Text style={{ color: c.accent, fontWeight: '700' }}>
                          ถึงกำหนดแล้ว
                        </Text>
                      ) : (
                        formatThaiDate(rule.next_run_at)
                      )}
                    </Text>
                  </View>
                  <Text
                    style={{
                      color: rule.kind === 'income' ? c.income : c.text,
                      fontSize: 14,
                      fontWeight: '700',
                    }}
                  >
                    {isVariable ? (
                      <Text style={{ color: c.textMuted, fontStyle: 'italic' }}>
                        ฿—
                      </Text>
                    ) : (
                      <>
                        {rule.kind === 'income' ? '+' : '−'}฿
                        {formatTHB(rule.amount!)}
                      </>
                    )}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {(rules.data ?? []).length > 0 && (
          <Text
            style={{
              color: c.textMuted,
              fontSize: 11,
              textAlign: 'center',
              marginTop: 4,
            }}
          >
            💡 กดที่แถวเพื่อแก้ไข · กดค้างเพื่อลบ
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function extractErrorMessage(e: unknown): string {
  if (!e) return 'เกิดข้อผิดพลาด';
  if (e instanceof Error) return e.message;
  if (typeof e === 'object') {
    const err = e as { message?: unknown; code?: unknown; details?: unknown };
    const parts: string[] = [];
    if (typeof err.message === 'string' && err.message) parts.push(err.message);
    if (typeof err.code === 'string' && err.code) parts.push(`(${err.code})`);
    if (typeof err.details === 'string' && err.details) parts.push(err.details);
    if (parts.length > 0) return parts.join(' ');
  }
  if (typeof e === 'string') return e;
  return 'เกิดข้อผิดพลาด';
}
