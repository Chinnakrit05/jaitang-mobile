import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
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
import { CURRENCIES, currencySymbol } from '../../lib/fx';
import {
  useLoans,
  useLoanRepaidTotals,
  useLoanRepayments,
  useCreateLoan,
  useUpdateLoan,
  useSetLoanStatus,
  useDeleteLoan,
  useAddLoanRepayment,
  useDeleteLoanRepayment,
  type Loan,
  type LoanKind,
} from '../../lib/queries/loans';

/**
 * Loans screen — money lent out (someone owes you) or borrowed (you owe).
 * Modeled on goals.tsx: header → net-position summary → list → inline
 * form. Each loan tracks outstanding = principal − Σ repayments. Tap a
 * loan → repayment sheet (log + add + mark settled).
 *
 * Repayments are a separate log; they don't create transactions or move
 * account balances (matches the web app).
 */

const COLOR_LENT = '#34D399'; // they owe us — green
const COLOR_BORROWED = '#FB7185'; // we owe — rose

function thousands(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function money(amount: number, currency: string | null): string {
  const cur = currency ?? 'THB';
  if (cur === 'THB') return `${currencySymbol(cur)}${thousands(amount)}`;
  return `${thousands(amount)} ${cur}`;
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

export default function LoansScreen() {
  const c = useTheme().colors;
  const { ledger } = useActiveLedger();
  const home = ledger?.currency ?? 'THB';
  const homeSym = currencySymbol(home);
  const loansQuery = useLoans(ledger?.id);
  const repaid = useLoanRepaidTotals(ledger?.id);
  const createMut = useCreateLoan();
  const updateMut = useUpdateLoan();
  const deleteMut = useDeleteLoan();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [kind, setKind] = useState<LoanKind>('lent');
  const [counterparty, setCounterparty] = useState('');
  const [principal, setPrincipal] = useState('');
  const [currency, setCurrency] = useState<string>(home);
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [repayLoan, setRepayLoan] = useState<Loan | null>(null);

  const currencyOptions = useMemo(
    () => [home, ...CURRENCIES.filter((x) => x !== home)],
    [home],
  );

  // Net position over OPEN loans, in home-currency face value. (Loans are
  // typically single-currency; cross-currency netting is out of scope.)
  const net = useMemo(() => {
    let lent = 0;
    let borrowed = 0;
    for (const l of loansQuery.data ?? []) {
      if (l.status === 'settled') continue;
      const outstanding = Math.max(0, l.principal - (repaid.data?.get(l.id) ?? 0));
      if (l.kind === 'lent') lent += outstanding;
      else borrowed += outstanding;
    }
    return { lent, borrowed, net: lent - borrowed };
  }, [loansQuery.data, repaid.data]);

  function resetForm() {
    setKind('lent');
    setCounterparty('');
    setPrincipal('');
    setCurrency(home);
    setDueDate('');
    setNote('');
    setError(null);
    setEditingId(null);
  }

  function openCreate() {
    resetForm();
    setShowForm(true);
  }

  function openEdit(l: Loan) {
    setEditingId(l.id);
    setKind(l.kind);
    setCounterparty(l.counterparty ?? '');
    setPrincipal(String(l.principal));
    setCurrency(l.currency ?? home);
    setDueDate(l.due_date ? l.due_date.slice(0, 10) : '');
    setNote(l.note ?? '');
    setError(null);
    setShowForm(true);
  }

  async function save() {
    setError(null);
    if (!ledger) return;
    const who = counterparty.trim();
    if (!who) {
      setError('ใส่ชื่อคู่กรณีก่อน (ใคร)');
      return;
    }
    const principalValue = Number(principal.replace(/,/g, ''));
    if (!Number.isFinite(principalValue) || principalValue <= 0) {
      setError('ใส่ยอดเงิน');
      return;
    }
    const due = dueDate.trim() ? dueDate.trim() : null;
    try {
      if (editingId) {
        await updateMut.mutateAsync({
          id: editingId,
          ledger_id: ledger.id,
          kind,
          counterparty: who,
          principal: principalValue,
          currency,
          started_at: null,
          due_date: due,
          note: note.trim() || null,
        });
      } else {
        await createMut.mutateAsync({
          ledger_id: ledger.id,
          kind,
          counterparty: who,
          principal: principalValue,
          currency,
          due_date: due,
          note: note.trim() || null,
        });
      }
      setShowForm(false);
      resetForm();
    } catch (e) {
      console.error('loan save failed:', e);
      setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    }
  }

  function confirmDelete(l: Loan) {
    Alert.alert('ลบรายการนี้?', `"${l.counterparty ?? ''}" และประวัติการชำระจะถูกลบถาวร`, [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'ลบ',
        style: 'destructive',
        onPress: () => deleteMut.mutate({ id: l.id, ledger_id: l.ledger_id }),
      },
    ]);
  }

  function close() {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/more');
  }

  const saving = createMut.isPending || updateMut.isPending;
  const loans = loansQuery.data ?? [];

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
          <Text style={{ color: c.text, fontSize: 17, fontWeight: '700' }}>หนี้สิน</Text>
          <Pressable
            onPress={openCreate}
            style={{
              minWidth: 36,
              height: 36,
              borderRadius: 18,
              paddingHorizontal: 12,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: c.accent,
            }}
          >
            <Text style={{ color: c.accentText, fontSize: 13, fontWeight: '800' }}>
              + เพิ่ม
            </Text>
          </Pressable>
        </View>

        {/* Net position summary */}
        {loans.length > 0 && (
          <View className="rounded-2xl p-4" style={{ backgroundColor: c.card, gap: 10 }}>
            <View className="flex-row justify-between">
              <View>
                <Text style={{ color: c.textSecondary, fontSize: 11 }}>เขายืมเรา</Text>
                <Text style={{ color: COLOR_LENT, fontSize: 16, fontWeight: '800' }}>
                  {homeSym}
                  {thousands(net.lent)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: c.textSecondary, fontSize: 11 }}>เรายืมเขา</Text>
                <Text style={{ color: COLOR_BORROWED, fontSize: 16, fontWeight: '800' }}>
                  {homeSym}
                  {thousands(net.borrowed)}
                </Text>
              </View>
            </View>
            <View style={{ height: 1, backgroundColor: c.border }} />
            <View className="flex-row items-center justify-between">
              <Text style={{ color: c.textSecondary, fontSize: 12, fontWeight: '600' }}>
                สุทธิ {net.net >= 0 ? '(คนอื่นติดเรา)' : '(เราติดคนอื่น)'}
              </Text>
              <Text
                style={{
                  color: net.net >= 0 ? COLOR_LENT : COLOR_BORROWED,
                  fontSize: 16,
                  fontWeight: '800',
                }}
              >
                {net.net >= 0 ? '+' : '−'}
                {homeSym}
                {thousands(Math.abs(net.net))}
              </Text>
            </View>
          </View>
        )}

        {/* List */}
        {loansQuery.isLoading ? (
          <ActivityIndicator color={c.accent} />
        ) : loans.length === 0 ? (
          <View className="rounded-2xl p-6 items-center" style={{ backgroundColor: c.card, gap: 8 }}>
            <Text style={{ fontSize: 28 }}>🤝</Text>
            <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>
              ยังไม่มีรายการหนี้สิน
            </Text>
            <Text style={{ color: c.textSecondary, fontSize: 12, textAlign: 'center' }}>
              บันทึกเงินที่ให้คนอื่นยืม หรือที่เรายืมมา แล้วผ่อนชำระเป็นงวดได้
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {loans.map((l) => (
              <LoanCard
                key={l.id}
                loan={l}
                repaid={repaid.data?.get(l.id) ?? 0}
                colors={c}
                onPress={() => setRepayLoan(l)}
                onEdit={() => openEdit(l)}
                onLongPress={() => confirmDelete(l)}
              />
            ))}
          </View>
        )}

        {/* Form */}
        {showForm && (
          <View className="rounded-3xl p-4" style={{ backgroundColor: c.card, gap: 12 }}>
            <View className="flex-row items-center justify-between">
              <Text style={{ color: c.text, fontSize: 15, fontWeight: '800' }}>
                {editingId ? 'แก้ไขรายการ' : 'รายการใหม่'}
              </Text>
              <Pressable
                onPress={() => {
                  setShowForm(false);
                  resetForm();
                }}
              >
                <Text style={{ color: c.textSecondary, fontSize: 13 }}>ยกเลิก</Text>
              </Pressable>
            </View>

            {/* Kind toggle */}
            <View className="rounded-full p-1.5 flex-row" style={{ backgroundColor: c.bg }}>
              {(
                [
                  { v: 'lent' as const, label: 'ให้ยืม (เขาติดเรา)' },
                  { v: 'borrowed' as const, label: 'ยืมมา (เราติดเขา)' },
                ]
              ).map((k) => {
                const active = kind === k.v;
                return (
                  <Pressable
                    key={k.v}
                    onPress={() => setKind(k.v)}
                    className="flex-1 py-2.5 rounded-full items-center"
                    style={{
                      backgroundColor: active
                        ? k.v === 'lent'
                          ? COLOR_LENT
                          : COLOR_BORROWED
                        : 'transparent',
                    }}
                  >
                    <Text
                      style={{
                        color: active ? '#FFFFFF' : c.textSecondary,
                        fontSize: 12,
                        fontWeight: '700',
                      }}
                    >
                      {k.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View>
              <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 4 }}>
                คู่กรณี (ใคร)
              </Text>
              <TextInput
                value={counterparty}
                onChangeText={setCounterparty}
                placeholder="เช่น พี่ส้ม, ร้านกาแฟ"
                placeholderTextColor={c.textMuted}
                style={inputStyle(c)}
              />
            </View>

            <View>
              <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 4 }}>ยอดเงิน</Text>
              <TextInput
                value={principal}
                onChangeText={setPrincipal}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={c.textMuted}
                style={inputStyle(c)}
              />
            </View>

            {/* Currency */}
            <View>
              <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 6 }}>สกุลเงิน</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingRight: 4 }}
              >
                {currencyOptions.map((cur) => {
                  const sel = currency === cur;
                  return (
                    <Pressable
                      key={cur}
                      onPress={() => setCurrency(cur)}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderRadius: 999,
                        backgroundColor: sel ? c.accent : c.bg,
                        borderWidth: 1,
                        borderColor: sel ? c.accent : c.border,
                      }}
                    >
                      <Text
                        style={{
                          color: sel ? c.accentText : c.text,
                          fontSize: 12,
                          fontWeight: sel ? '800' : '600',
                        }}
                      >
                        {currencySymbol(cur)} {cur}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <View>
              <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 4 }}>
                กำหนดคืน (ไม่บังคับ · YYYY-MM-DD)
              </Text>
              <TextInput
                value={dueDate}
                onChangeText={setDueDate}
                placeholder="2026-12-31"
                placeholderTextColor={c.textMuted}
                autoCapitalize="none"
                style={inputStyle(c)}
              />
            </View>

            <View>
              <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 4 }}>
                โน้ต (ไม่บังคับ)
              </Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="รายละเอียดเพิ่มเติม"
                placeholderTextColor={c.textMuted}
                style={inputStyle(c)}
              />
            </View>

            {error && <Text style={{ color: c.expense, fontSize: 12 }}>{error}</Text>}

            <Pressable
              onPress={save}
              disabled={saving}
              style={{
                backgroundColor: c.accent,
                paddingVertical: 14,
                borderRadius: 999,
                alignItems: 'center',
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? (
                <ActivityIndicator color={c.accentText} />
              ) : (
                <Text style={{ color: c.accentText, fontSize: 14, fontWeight: '800' }}>
                  {editingId ? 'บันทึก' : 'สร้างรายการ'}
                </Text>
              )}
            </Pressable>

            {editingId && (
              <Pressable
                onPress={() => {
                  const l = loans.find((x) => x.id === editingId);
                  if (l) confirmDelete(l);
                }}
                style={{ alignItems: 'center', paddingVertical: 8 }}
              >
                <Text style={{ color: c.expense, fontSize: 12, fontWeight: '700' }}>
                  ลบรายการนี้
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>

      <RepaymentSheet
        loan={repayLoan}
        repaid={repayLoan ? repaid.data?.get(repayLoan.id) ?? 0 : 0}
        colors={c}
        onClose={() => setRepayLoan(null)}
      />
    </SafeAreaView>
  );
}

function inputStyle(c: ReturnType<typeof useTheme>['colors']) {
  return {
    backgroundColor: c.bg,
    color: c.text,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  } as const;
}

function LoanCard({
  loan,
  repaid,
  colors,
  onPress,
  onEdit,
  onLongPress,
}: {
  loan: Loan;
  repaid: number;
  colors: ReturnType<typeof useTheme>['colors'];
  onPress: () => void;
  onEdit: () => void;
  onLongPress: () => void;
}) {
  const settled = loan.status === 'settled';
  const principal = loan.principal || 0;
  const outstanding = Math.max(0, principal - repaid);
  const pct = principal > 0 ? Math.min(1, repaid / principal) : 0;
  const isLent = loan.kind === 'lent';
  const accent = isLent ? COLOR_LENT : COLOR_BORROWED;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={300}
      style={{
        padding: 14,
        borderRadius: 18,
        backgroundColor: colors.card,
        opacity: settled ? 0.55 : 1,
        gap: 10,
      }}
    >
      <View className="flex-row items-center gap-3">
        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 8,
            backgroundColor: accent + '22',
          }}
        >
          <Text style={{ color: accent, fontSize: 10, fontWeight: '800' }}>
            {isLent ? 'ให้ยืม' : 'ยืมมา'}
          </Text>
        </View>
        <View className="flex-1 min-w-0">
          <Text
            numberOfLines={1}
            style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}
          >
            {loan.counterparty ?? '—'}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }}>
            {settled
              ? 'ชำระครบแล้ว'
              : loan.due_date
                ? `กำหนดคืน ${loan.due_date.slice(0, 10)}`
                : 'ยังไม่กำหนด'}
          </Text>
        </View>
        <Pressable onPress={onEdit} hitSlop={8} style={{ padding: 4 }}>
          <Text style={{ fontSize: 15 }}>✏️</Text>
        </Pressable>
      </View>

      {!settled && (
        <View
          style={{
            height: 8,
            borderRadius: 999,
            backgroundColor: colors.bg,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: `${Math.round(pct * 100)}%`,
              height: '100%',
              borderRadius: 999,
              backgroundColor: accent,
            }}
          />
        </View>
      )}

      <View className="flex-row items-center justify-between">
        <Text style={{ color: colors.textMuted, fontSize: 11 }}>
          {settled ? 'ยอดรวม' : 'คงเหลือ'}
        </Text>
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: '800' }}>
          {money(settled ? principal : outstanding, loan.currency)}
          {!settled && repaid > 0 ? (
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '500' }}>
              {'  '}/ {money(principal, loan.currency)}
            </Text>
          ) : null}
        </Text>
      </View>
    </Pressable>
  );
}

function RepaymentSheet({
  loan,
  repaid,
  colors,
  onClose,
}: {
  loan: Loan | null;
  repaid: number;
  colors: ReturnType<typeof useTheme>['colors'];
  onClose: () => void;
}) {
  const repayments = useLoanRepayments(loan?.id);
  const addMut = useAddLoanRepayment();
  const delMut = useDeleteLoanRepayment();
  const statusMut = useSetLoanStatus();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!loan) {
    return <Modal transparent visible={false} onRequestClose={onClose} />;
  }

  const principal = loan.principal || 0;
  const outstanding = Math.max(0, principal - repaid);
  const settled = loan.status === 'settled';

  async function add() {
    setError(null);
    const v = Number(amount.replace(/,/g, ''));
    if (!Number.isFinite(v) || v <= 0) {
      setError('ใส่จำนวนเงิน');
      return;
    }
    try {
      await addMut.mutateAsync({
        loan_id: loan!.id,
        ledger_id: loan!.ledger_id,
        amount: v,
        note: note.trim() || null,
      });
      setAmount('');
      setNote('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    }
  }

  function toggleSettled() {
    statusMut.mutate({
      id: loan!.id,
      ledger_id: loan!.ledger_id,
      status: settled ? 'open' : 'settled',
    });
  }

  return (
    <Modal transparent visible={!!loan} onRequestClose={onClose} animationType="slide">
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: colors.card,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingTop: 8,
            paddingBottom: 28,
            maxHeight: '85%',
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.border,
              marginBottom: 12,
            }}
          />

          <View className="px-5 pb-3 flex-row items-center justify-between">
            <View className="flex-1 min-w-0">
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>
                {loan.kind === 'lent' ? 'ให้ยืม' : 'ยืมมา'} · {loan.counterparty ?? '—'}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                {settled
                  ? `ชำระครบแล้ว · ${money(principal, loan.currency)}`
                  : `คงเหลือ ${money(outstanding, loan.currency)} / ${money(principal, loan.currency)}`}
              </Text>
            </View>
            <Pressable
              onPress={toggleSettled}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: settled ? colors.bg : COLOR_LENT,
                borderWidth: settled ? 1 : 0,
                borderColor: colors.border,
              }}
            >
              <Text
                style={{
                  color: settled ? colors.textSecondary : '#FFFFFF',
                  fontSize: 12,
                  fontWeight: '800',
                }}
              >
                {settled ? 'เปิดใหม่' : 'ชำระครบ'}
              </Text>
            </Pressable>
          </View>

          {/* Add repayment */}
          {!settled && (
            <View
              className="px-5 py-3"
              style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, gap: 8 }}
            >
              <View className="flex-row" style={{ gap: 8 }}>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  placeholder={`ชำระ (${currencySymbol(loan.currency ?? 'THB')})`}
                  placeholderTextColor={colors.textMuted}
                  style={{ ...inputStyle(colors), flex: 1 }}
                />
                <Pressable
                  onPress={add}
                  disabled={addMut.isPending}
                  style={{
                    backgroundColor: colors.accent,
                    paddingHorizontal: 18,
                    borderRadius: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: addMut.isPending ? 0.6 : 1,
                  }}
                >
                  {addMut.isPending ? (
                    <ActivityIndicator color={colors.accentText} />
                  ) : (
                    <Text style={{ color: colors.accentText, fontSize: 14, fontWeight: '800' }}>
                      บันทึก
                    </Text>
                  )}
                </Pressable>
              </View>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="โน้ต (ไม่บังคับ)"
                placeholderTextColor={colors.textMuted}
                style={inputStyle(colors)}
              />
              {error && <Text style={{ color: colors.expense, fontSize: 12 }}>{error}</Text>}
            </View>
          )}

          {/* Repayment log */}
          <ScrollView style={{ maxHeight: 280 }} contentContainerStyle={{ padding: 16, gap: 8 }}>
            {(repayments.data ?? []).length === 0 ? (
              <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: 'center' }}>
                ยังไม่มีการชำระ
              </Text>
            ) : (
              (repayments.data ?? []).map((rp) => (
                <View
                  key={rp.id}
                  className="flex-row items-center gap-3"
                  style={{
                    backgroundColor: colors.bg,
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    opacity: rp._sync_state !== 'clean' ? 0.7 : 1,
                  }}
                >
                  <View className="flex-1 min-w-0">
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>
                      {money(rp.amount, loan.currency)}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }}>
                      {rp.occurred_at.slice(0, 10)}
                      {rp.note ? ` · ${rp.note}` : ''}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() =>
                      Alert.alert('ลบรายการชำระ?', money(rp.amount, loan.currency), [
                        { text: 'ยกเลิก', style: 'cancel' },
                        {
                          text: 'ลบ',
                          style: 'destructive',
                          onPress: () => delMut.mutate({ id: rp.id, ledger_id: rp.ledger_id }),
                        },
                      ])
                    }
                    hitSlop={8}
                    style={{ padding: 4 }}
                  >
                    <Text style={{ fontSize: 14 }}>🗑</Text>
                  </Pressable>
                </View>
              ))
            )}
          </ScrollView>

          <View className="px-4 pt-2">
            <Pressable
              onPress={onClose}
              className="py-4 rounded-2xl items-center"
              style={{ backgroundColor: colors.bg }}
            >
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>ปิด</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
