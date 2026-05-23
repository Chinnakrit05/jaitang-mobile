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

import { useActiveLedger } from '../../providers/ActiveLedgerProvider';
import { useTheme } from '../../providers/ThemeProvider';
import {
  useAccounts,
  ACCOUNT_TYPE_META,
  type Account,
} from '../../lib/queries/accounts';
import {
  useTransfers,
  useCreateTransfer,
  useUpdateTransfer,
  useDeleteTransfer,
  type Transfer,
} from '../../lib/queries/transfers';
import { currencySymbol, useFxRate } from '../../lib/fx';

/**
 * Transfers screen — move money between accounts (cash → bank, bank →
 * e-wallet, …). Transfers are NOT income/expense: they leave the source
 * account and land in the destination, so spend totals stay clean.
 *
 * Reads come from the local SQLite mirror (offline-safe). Writes hit the
 * `create_transfer` / `update_transfer` / `delete_transfer` SECURITY
 * DEFINER RPCs; the mutation hook refreshes the mirror + invalidates
 * `['account-balances']` so the accounts screen updates immediately.
 *
 * Same-currency is the default: one amount field, from == to, rate 1.
 * When the two chosen accounts hold different currencies, a second
 * "amount received" field appears so the destination amount is recorded
 * accurately (live FX lookup lands in the multi-currency pass).
 *
 * Layout mirrors the accounts screen: header → list → inline form.
 * Tap a row to edit, long-press to delete.
 */

function thousands(n: number): string {
  const fixed = Math.round(n).toString();
  return fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function money(amount: number, currency: string | null): string {
  const cur = currency ?? 'THB';
  // THB reads naturally as a prefix (฿100); keep other codes explicit by
  // trailing the code so "100 JPY" isn't mistaken for another currency.
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

function SwapIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M7 7h13l-3.5-3.5M17 17H4l3.5 3.5"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default function TransfersScreen() {
  const c = useTheme().colors;
  const { ledger } = useActiveLedger();
  const accountsQuery = useAccounts(ledger?.id);
  const transfersQuery = useTransfers(ledger?.id);
  const createMut = useCreateTransfer();
  const updateMut = useUpdateTransfer();
  const deleteMut = useDeleteTransfer();

  const accounts = accountsQuery.data ?? [];
  const accById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  // True once the user edits the destination amount by hand (or when
  // editing an existing transfer) so the FX auto-fill stops overwriting.
  const [toAmountTouched, setToAmountTouched] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fromAcc = fromId ? accById.get(fromId) : null;
  const toAcc = toId ? accById.get(toId) : null;
  const fromCurrency = fromAcc?.currency ?? ledger?.currency ?? 'THB';
  const toCurrency = toAcc?.currency ?? ledger?.currency ?? 'THB';
  const crossCurrency = !!fromAcc && !!toAcc && fromCurrency !== toCurrency;

  // Live rate for cross-currency transfers — auto-fills the destination
  // amount unless the user has typed their own.
  const { rate: xferRate, loading: rateLoading, error: rateError } = useFxRate(
    fromCurrency,
    toCurrency,
  );
  useEffect(() => {
    if (!crossCurrency || toAmountTouched || !xferRate) return;
    const v = Number(amount.replace(/,/g, ''));
    if (!Number.isFinite(v) || v <= 0) {
      setToAmount('');
      return;
    }
    setToAmount(String(Math.round(v * xferRate * 100) / 100));
  }, [amount, xferRate, crossCurrency, toAmountTouched]);

  function resetForm() {
    setFromId(null);
    setToId(null);
    setAmount('');
    setToAmount('');
    setToAmountTouched(false);
    setNote('');
    setError(null);
    setEditingId(null);
  }

  function openCreate() {
    resetForm();
    setShowForm(true);
  }

  function openEdit(tr: Transfer) {
    setEditingId(tr.id);
    setFromId(tr.from_account_id);
    setToId(tr.to_account_id);
    setAmount(String(tr.from_amount));
    setToAmount(String(tr.to_amount));
    // Keep the saved destination amount — don't let FX auto-fill clobber it.
    setToAmountTouched(true);
    setNote(tr.note ?? '');
    setError(null);
    setShowForm(true);
  }

  async function save() {
    setError(null);
    if (!ledger) return;
    if (!fromId || !toId) {
      setError('เลือกบัญชีต้นทางและปลายทาง');
      return;
    }
    if (fromId === toId) {
      setError('บัญชีต้นทางและปลายทางต้องไม่ใช่บัญชีเดียวกัน');
      return;
    }
    const fromValue = Number(amount.replace(/,/g, ''));
    if (!Number.isFinite(fromValue) || fromValue <= 0) {
      setError('ใส่จำนวนเงินที่โอน');
      return;
    }
    // For same-currency transfers the received amount equals the sent
    // amount. For cross-currency the user fills the second field.
    let toValue = fromValue;
    if (crossCurrency) {
      toValue = Number(toAmount.replace(/,/g, ''));
      if (!Number.isFinite(toValue) || toValue <= 0) {
        setError('ใส่จำนวนเงินที่เข้าบัญชีปลายทาง');
        return;
      }
    }
    const rate = fromValue > 0 ? toValue / fromValue : 1;

    try {
      if (editingId) {
        await updateMut.mutateAsync({
          id: editingId,
          ledger_id: ledger.id,
          from_account_id: fromId,
          to_account_id: toId,
          from_amount: fromValue,
          from_currency: fromCurrency,
          to_amount: toValue,
          to_currency: toCurrency,
          fx_rate: rate,
          note: note.trim() || null,
        });
      } else {
        await createMut.mutateAsync({
          ledger_id: ledger.id,
          from_account_id: fromId,
          to_account_id: toId,
          from_amount: fromValue,
          from_currency: fromCurrency,
          to_amount: toValue,
          to_currency: toCurrency,
          fx_rate: rate,
          note: note.trim() || null,
        });
      }
      setShowForm(false);
      resetForm();
    } catch (e) {
      console.error('transfer save failed:', e);
      setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    }
  }

  function confirmDelete(tr: Transfer) {
    const fromName = tr.from_account_id
      ? accById.get(tr.from_account_id)?.name ?? 'บัญชี'
      : 'บัญชี';
    const toName = tr.to_account_id
      ? accById.get(tr.to_account_id)?.name ?? 'บัญชี'
      : 'บัญชี';
    Alert.alert(
      'ลบรายการโอน?',
      `${fromName} → ${toName} · ${money(tr.from_amount, tr.from_currency)}`,
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'ลบ',
          style: 'destructive',
          onPress: () =>
            deleteMut.mutate({ id: tr.id, ledger_id: tr.ledger_id }),
        },
      ],
    );
  }

  function close() {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/more');
  }

  const canTransfer = accounts.length >= 2;
  const saving = createMut.isPending || updateMut.isPending;

  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: c.bg }}
      edges={['top']}
    >
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
            โอนเงิน
          </Text>
          {canTransfer ? (
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
          ) : (
            <View style={{ width: 36 }} />
          )}
        </View>

        {/* No-accounts gate — a transfer needs at least two wallets. */}
        {!canTransfer ? (
          <View
            className="rounded-2xl p-6 items-center"
            style={{ backgroundColor: c.card, gap: 10 }}
          >
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                backgroundColor: c.tripBg,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <SwapIcon color={c.trip} size={26} />
            </View>
            <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>
              ต้องมีอย่างน้อย 2 บัญชี
            </Text>
            <Text style={{ color: c.textSecondary, fontSize: 12, textAlign: 'center' }}>
              สร้างบัญชี (เงินสด, ธนาคาร, ฯลฯ) ก่อน แล้วค่อยโอนเงินระหว่างบัญชี
            </Text>
            <Pressable
              onPress={() => router.push('/(app)/accounts')}
              style={{
                marginTop: 4,
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 999,
                backgroundColor: c.accent,
              }}
            >
              <Text style={{ color: c.accentText, fontSize: 13, fontWeight: '800' }}>
                ไปที่บัญชี
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Transfer list */}
            {transfersQuery.isLoading ? (
              <ActivityIndicator color={c.accent} />
            ) : (transfersQuery.data ?? []).length === 0 ? (
              <View
                className="rounded-2xl p-6 items-center"
                style={{ backgroundColor: c.card, gap: 8 }}
              >
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    backgroundColor: c.tripBg,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <SwapIcon color={c.trip} size={24} />
                </View>
                <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>
                  ยังไม่มีรายการโอน
                </Text>
                <Text style={{ color: c.textSecondary, fontSize: 12, textAlign: 'center' }}>
                  กด “+ เพิ่ม” เพื่อย้ายเงินจากบัญชีหนึ่งไปอีกบัญชี
                </Text>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {(transfersQuery.data ?? []).map((tr) => (
                  <TransferRow
                    key={tr.id}
                    transfer={tr}
                    fromName={
                      tr.from_account_id
                        ? accById.get(tr.from_account_id)?.name ?? '—'
                        : '—'
                    }
                    fromIcon={
                      tr.from_account_id
                        ? accById.get(tr.from_account_id)?.icon ?? null
                        : null
                    }
                    toName={
                      tr.to_account_id
                        ? accById.get(tr.to_account_id)?.name ?? '—'
                        : '—'
                    }
                    toIcon={
                      tr.to_account_id
                        ? accById.get(tr.to_account_id)?.icon ?? null
                        : null
                    }
                    selected={editingId === tr.id}
                    colors={c}
                    onPress={() => openEdit(tr)}
                    onLongPress={() => confirmDelete(tr)}
                  />
                ))}
              </View>
            )}
          </>
        )}

        {/* Inline form */}
        {showForm && canTransfer && (
          <View
            className="rounded-3xl p-4"
            style={{ backgroundColor: c.card, gap: 14 }}
          >
            <View className="flex-row items-center justify-between">
              <Text style={{ color: c.text, fontSize: 15, fontWeight: '800' }}>
                {editingId ? 'แก้ไขการโอน' : 'โอนเงินใหม่'}
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

            {/* From account */}
            <AccountPicker
              label="จากบัญชี"
              accounts={accounts}
              selectedId={fromId}
              disabledId={toId}
              onSelect={setFromId}
              colors={c}
            />

            {/* To account */}
            <AccountPicker
              label="ไปบัญชี"
              accounts={accounts}
              selectedId={toId}
              disabledId={fromId}
              onSelect={setToId}
              colors={c}
            />

            {/* Amount sent */}
            <View>
              <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 4 }}>
                จำนวนเงิน{crossCurrency ? ` (${fromCurrency})` : ''}
              </Text>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={c.textMuted}
                style={{
                  backgroundColor: c.bg,
                  color: c.text,
                  fontSize: 16,
                  fontWeight: '700',
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  borderRadius: 12,
                }}
              />
            </View>

            {/* Amount received — only when the two accounts differ in
                currency. Live FX lookup arrives in the multi-currency
                pass; for now the user enters the received amount. */}
            {crossCurrency && (
              <View>
                <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 4 }}>
                  เข้าบัญชีปลายทาง ({toCurrency})
                </Text>
                <TextInput
                  value={toAmount}
                  onChangeText={(v) => {
                    setToAmountTouched(true);
                    setToAmount(v);
                  }}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={c.textMuted}
                  style={{
                    backgroundColor: c.bg,
                    color: c.text,
                    fontSize: 16,
                    fontWeight: '700',
                    paddingHorizontal: 12,
                    paddingVertical: 12,
                    borderRadius: 12,
                  }}
                />
                <Text style={{ color: c.textMuted, fontSize: 10, marginTop: 4 }}>
                  {rateLoading
                    ? 'กำลังดึงเรต…'
                    : rateError
                      ? 'ดึงเรตอัตโนมัติไม่ได้ — กรอกยอดปลายทางเอง'
                      : xferRate
                        ? `เรต 1 ${fromCurrency} ≈ ${xferRate.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${toCurrency} · แก้ได้`
                        : ''}
                </Text>
              </View>
            )}

            {/* Note */}
            <View>
              <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 4 }}>
                โน้ต (ไม่บังคับ)
              </Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="เช่น ถอนเงินสด, เติม TrueMoney"
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

            {error && (
              <Text style={{ color: c.expense, fontSize: 12 }}>{error}</Text>
            )}

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
                  {editingId ? 'บันทึก' : 'โอนเงิน'}
                </Text>
              )}
            </Pressable>

            {editingId && (
              <Pressable
                onPress={() => {
                  const tr = (transfersQuery.data ?? []).find(
                    (x) => x.id === editingId,
                  );
                  if (tr) confirmDelete(tr);
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
    </SafeAreaView>
  );
}

function AccountPicker({
  label,
  accounts,
  selectedId,
  disabledId,
  onSelect,
  colors,
}: {
  label: string;
  accounts: Account[];
  selectedId: string | null;
  disabledId: string | null;
  onSelect: (id: string) => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <View>
      <Text style={{ color: colors.textSecondary, fontSize: 11, marginBottom: 6 }}>
        {label}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingRight: 4 }}
      >
        {accounts.map((acc) => {
          const sel = selectedId === acc.id;
          const disabled = disabledId === acc.id;
          return (
            <Pressable
              key={acc.id}
              onPress={() => onSelect(acc.id)}
              disabled={disabled}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderRadius: 999,
                backgroundColor: sel ? colors.accent : colors.bg,
                borderWidth: 1,
                borderColor: sel ? colors.accent : colors.border,
                opacity: disabled ? 0.35 : 1,
              }}
            >
              <Text style={{ fontSize: 14 }}>
                {acc.icon ?? ACCOUNT_TYPE_META[acc.type].icon}
              </Text>
              <Text
                style={{
                  color: sel ? colors.accentText : colors.text,
                  fontSize: 12,
                  fontWeight: sel ? '800' : '600',
                }}
              >
                {acc.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function TransferRow({
  transfer,
  fromName,
  fromIcon,
  toName,
  toIcon,
  selected,
  colors,
  onPress,
  onLongPress,
}: {
  transfer: Transfer;
  fromName: string;
  fromIcon: string | null;
  toName: string;
  toIcon: string | null;
  selected: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
  onPress: () => void;
  onLongPress: () => void;
}) {
  const cross =
    transfer.from_currency !== transfer.to_currency ||
    transfer.from_amount !== transfer.to_amount;
  const dateStr = transfer.occurred_at.slice(0, 10);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={300}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        borderRadius: 18,
        backgroundColor: colors.card,
        borderWidth: 1.5,
        borderColor: selected ? colors.accent : 'transparent',
        opacity: transfer._sync_state !== 'clean' ? 0.7 : 1,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: colors.tripBg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <SwapIcon color={colors.trip} size={22} />
      </View>
      <View className="flex-1 min-w-0">
        <Text
          numberOfLines={1}
          style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}
        >
          {fromIcon ? `${fromIcon} ` : ''}
          {fromName} → {toIcon ? `${toIcon} ` : ''}
          {toName}
        </Text>
        <Text
          numberOfLines={1}
          style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}
        >
          {dateStr}
          {transfer.note ? ` · ${transfer.note}` : ''}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: '800' }}>
          {money(transfer.from_amount, transfer.from_currency)}
        </Text>
        {cross && (
          <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>
            → {money(transfer.to_amount, transfer.to_currency)}
          </Text>
        )}
      </View>
    </Pressable>
  );
}
