import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { useActiveLedger } from '../../providers/ActiveLedgerProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { useCategories } from '../../lib/queries/categories';
import { ACCOUNT_TYPE_META, useAccounts } from '../../lib/queries/accounts';
import {
  useLocalTransaction,
  useUpdateTransaction,
} from '../../lib/queries/transactions-local';
import { sortCategoriesByHierarchy } from '../../lib/categories-helpers';
import { CURRENCIES, currencySymbol, useFxRate } from '../../lib/fx';
import { EmojiOrIcon } from '../../components/icons/EmojiOrIcon';

/**
 * Edit Transaction — same form shape as `quick.tsx` but pre-filled
 * from an existing local row and calling `useUpdateTransaction` on
 * save. Receives the tx id via the `id` URL param.
 *
 * Hidden from the bottom tab bar (see `app/(app)/_layout.tsx`); the
 * long-press action sheet on `transactions.tsx` routes here.
 */

const SELECTED_CAT_COLOR = '#FF7BAC';

function CloseIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 6l12 12M18 6L6 18"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export default function EditTransactionScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : undefined;

  const { ledger } = useActiveLedger();
  const txQuery = useLocalTransaction(id);
  const cats = useCategories(ledger?.id);
  const accounts = useAccounts(ledger?.id);
  const update = useUpdateTransaction();
  const c = useTheme().colors;

  const home = ledger?.currency ?? 'THB';
  const [kind, setKind] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [payment, setPayment] = useState<'cash' | 'transfer'>('cash');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [currency, setCurrency] = useState<string>(home);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const foreign = currency !== home;
  const { rate: fxRate, loading: rateLoading, error: rateError } = useFxRate(
    currency,
    home,
  );
  const currencyOptions = useMemo(
    () => [home, ...CURRENCIES.filter((x) => x !== home)],
    [home],
  );
  const homeEquiv =
    foreign && amount && fxRate
      ? Math.round(Number(amount.replace(/,/g, '')) * fxRate)
      : null;

  // Once the tx loads, copy its fields into local state so the user
  // can edit. We only do this once (guarded by `hydrated`) so typing
  // doesn't get overwritten if the underlying query refetches mid-edit.
  useEffect(() => {
    if (hydrated) return;
    const tx = txQuery.data;
    if (!tx) return;
    setKind(tx.kind);
    // Foreign transactions edit in their foreign amount + currency; the
    // home value is recomputed on save from the (re-fetched) rate.
    if (tx.fx_currency && tx.fx_amount != null) {
      setCurrency(tx.fx_currency);
      setAmount(String(tx.fx_amount));
    } else {
      setCurrency(home);
      setAmount(String(tx.amount));
    }
    setNote(tx.note ?? '');
    setCategoryId(tx.category_id);
    setPayment(tx.payment_method ?? 'cash');
    setAccountId(tx.account_id ?? null);
    setHydrated(true);
  }, [txQuery.data, hydrated, home]);

  const visibleCats = useMemo(
    () =>
      sortCategoriesByHierarchy(
        (cats.data ?? []).filter((cat) => cat.kind === kind),
      ),
    [cats.data, kind],
  );

  function close() {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/transactions');
  }

  async function save() {
    setError(null);
    if (!id) return;
    const value = Number(amount.replace(/,/g, ''));
    if (!Number.isFinite(value) || value <= 0) {
      setError(t('quick.amountRequired'));
      return;
    }
    // Recompute the home amount + fx trio. Switching back to home clears
    // the trio (explicit nulls) so the row stops being multi-currency.
    let homeAmount = value;
    let fxCurrency: string | null = null;
    let fxAmount: number | null = null;
    let fxRateVal: number | null = null;
    if (foreign) {
      if (!fxRate) {
        setError(
          t('quick.fxUnavailable', {
            defaultValue: 'ยังดึงเรตแลกเปลี่ยนไม่ได้ ลองใหม่อีกครั้ง',
          }),
        );
        return;
      }
      fxCurrency = currency;
      fxAmount = value;
      fxRateVal = fxRate;
      homeAmount = Math.round(value * fxRate * 100) / 100;
    }
    try {
      await update.mutateAsync({
        id,
        kind,
        amount: homeAmount,
        note: note.trim() || null,
        category_id: categoryId,
        account_id: accountId,
        payment_method: payment,
        fx_currency: fxCurrency,
        fx_amount: fxAmount,
        fx_rate: fxRateVal,
      });
      close();
    } catch (e) {
      console.error('updateTransaction failed:', e);
      setError(e instanceof Error ? e.message : t('quick.saveFailed'));
    }
  }

  if (txQuery.isLoading || !hydrated) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: c.bg }}
      >
        <ActivityIndicator color={c.accent} />
      </SafeAreaView>
    );
  }
  if (!txQuery.data) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: c.bg }}
      >
        <Text style={{ color: c.textSecondary }}>{t('transactions.notFound', { defaultValue: 'Transaction not found' })}</Text>
      </SafeAreaView>
    );
  }

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
            <CloseIcon color={c.text} size={18} />
          </Pressable>
          <Text style={{ color: c.text, fontSize: 17, fontWeight: '700' }}>
            {t('transactions.editTitle')}
          </Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Kind toggle */}
        <View
          className="rounded-full p-1.5 flex-row"
          style={{ backgroundColor: c.card }}
        >
          {(['expense', 'income'] as const).map((k) => {
            const active = kind === k;
            return (
              <Pressable
                key={k}
                onPress={() => {
                  setKind(k);
                  setCategoryId(null);
                }}
                className="flex-1 py-2.5 rounded-full items-center"
                style={{
                  backgroundColor: active ? c.accent : 'transparent',
                }}
              >
                <Text
                  style={{
                    color: active ? '#FFFFFF' : c.textSecondary,
                    fontSize: 14,
                    fontWeight: '700',
                  }}
                >
                  {k === 'expense' ? t('common.expense') : t('common.income')}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Amount */}
        <View
          className="rounded-3xl px-5 py-6"
          style={{ backgroundColor: c.accent }}
        >
          <Text
            className="text-center"
            style={{ color: 'rgba(255, 255, 255, 0.75)', fontSize: 13 }}
          >
            {t('common.amount')}
          </Text>
          <View className="flex-row items-baseline justify-center gap-1 mt-2">
            <Text style={{ color: '#FFFFFF', fontSize: 44, fontWeight: '700' }}>
              {currencySymbol(currency)}
            </Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor="rgba(255, 255, 255, 0.5)"
              style={{
                color: '#FFFFFF',
                fontSize: 44,
                fontWeight: '700',
                paddingVertical: 0,
                minWidth: 80,
                textAlign: 'left',
              }}
            />
          </View>
          {foreign && (
            <Text
              className="text-center"
              style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, marginTop: 6 }}
            >
              {homeEquiv != null
                ? `≈ ${currencySymbol(home)}${homeEquiv.toLocaleString('en-US')}`
                : rateLoading
                  ? t('quick.fxLoading', { defaultValue: 'กำลังดึงเรต…' })
                  : rateError
                    ? t('quick.fxError', { defaultValue: 'ดึงเรตไม่ได้' })
                    : `1 ${currency} = ? ${home}`}
            </Text>
          )}
        </View>

        {/* Currency picker */}
        <View>
          <Text
            style={{
              color: c.text,
              fontSize: 13,
              fontWeight: '600',
              marginBottom: 8,
              marginLeft: 2,
            }}
          >
            {t('quick.currency', { defaultValue: 'สกุลเงิน' })}
          </Text>
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
                    paddingVertical: 9,
                    borderRadius: 999,
                    backgroundColor: sel ? c.accent : c.card,
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

        {/* Payment */}
        <View>
          <Text
            style={{
              color: c.text,
              fontSize: 13,
              fontWeight: '600',
              marginBottom: 8,
              marginLeft: 2,
            }}
          >
            {t('quick.paymentMethod')}
          </Text>
          <View className="flex-row gap-3">
            {(
              [
                { v: 'cash' as const, icon: '💵', title: t('quick.cash'), sub: t('quick.cashHint') },
                { v: 'transfer' as const, icon: '🏦', title: t('quick.transfer'), sub: 'PromptPay' },
              ]
            ).map((p) => {
              const sel = payment === p.v;
              return (
                <Pressable
                  key={p.v}
                  onPress={() => setPayment(p.v)}
                  style={{
                    flex: 1,
                    padding: 12,
                    borderRadius: 18,
                    backgroundColor: c.card,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    borderWidth: 1.5,
                    borderColor: sel ? c.accent : 'transparent',
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 12,
                      backgroundColor: c.bg,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 18 }}>{p.icon}</Text>
                  </View>
                  <View className="flex-1">
                    <Text style={{ color: c.text, fontSize: 13, fontWeight: '700' }}>
                      {p.title}
                    </Text>
                    <Text style={{ color: c.textSecondary, fontSize: 10 }}>
                      {p.sub}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Account picker — mirrors the chip row on quick.tsx. Empty
            state hides the whole section. */}
        {(accounts.data ?? []).length > 0 && (
          <View>
            <Text
              style={{
                color: c.text,
                fontSize: 13,
                fontWeight: '600',
                marginBottom: 8,
                marginLeft: 2,
              }}
            >
              บัญชี
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingRight: 4 }}
            >
              <Pressable
                onPress={() => setAccountId(null)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: 999,
                  backgroundColor: accountId === null ? c.accent : c.card,
                  borderWidth: 1,
                  borderColor: accountId === null ? c.accent : c.border,
                }}
              >
                <Text
                  style={{
                    color: accountId === null ? c.accentText : c.text,
                    fontSize: 12,
                    fontWeight: accountId === null ? '800' : '600',
                  }}
                >
                  ไม่ระบุ
                </Text>
              </Pressable>
              {(accounts.data ?? []).map((acc) => {
                const sel = accountId === acc.id;
                return (
                  <Pressable
                    key={acc.id}
                    onPress={() => setAccountId(acc.id)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderRadius: 999,
                      backgroundColor: sel ? c.accent : c.card,
                      borderWidth: 1,
                      borderColor: sel ? c.accent : c.border,
                    }}
                  >
                    <Text style={{ fontSize: 14 }}>
                      {acc.icon ?? ACCOUNT_TYPE_META[acc.type].icon}
                    </Text>
                    <Text
                      style={{
                        color: sel ? c.accentText : c.text,
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
        )}

        {/* Category */}
        <View>
          <Text
            style={{
              color: c.text,
              fontSize: 13,
              fontWeight: '600',
              marginBottom: 10,
              marginLeft: 2,
            }}
          >
            {t('quick.chooseCategory')}
          </Text>
          {cats.isLoading ? (
            <ActivityIndicator color={c.accent} />
          ) : (
            <View className="flex-row flex-wrap" style={{ marginHorizontal: -4 }}>
              {visibleCats.map((cat) => {
                const selected = categoryId === cat.id;
                return (
                  <View key={cat.id} style={{ width: '25%', padding: 4 }}>
                    <Pressable
                      onPress={() => setCategoryId(selected ? null : cat.id)}
                      style={{
                        paddingVertical: 16,
                        borderRadius: 18,
                        backgroundColor: selected ? SELECTED_CAT_COLOR : c.card,
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <EmojiOrIcon value={cat.icon} fallback="sparkle" size={24} />
                      <Text
                        numberOfLines={1}
                        style={{
                          color: selected ? '#FFFFFF' : c.text,
                          fontSize: 12,
                          fontWeight: selected ? '700' : '500',
                        }}
                      >
                        {cat.parent_id ? '↳ ' : ''}
                        {cat.name}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Note */}
        <View
          className="rounded-2xl px-4 py-3"
          style={{ backgroundColor: c.card }}
        >
          <View className="flex-row items-center gap-2">
            <Text style={{ fontSize: 16 }}>📝</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder={t('common.noteOptional')}
              placeholderTextColor={c.textMuted}
              style={{
                color: c.text,
                fontSize: 14,
                flex: 1,
                paddingVertical: 4,
              }}
            />
          </View>
        </View>

        {error && (
          <Text className="text-center" style={{ color: c.expense, fontSize: 13 }}>
            {error}
          </Text>
        )}

        <Pressable
          onPress={save}
          disabled={update.isPending}
          style={{
            backgroundColor: c.accent,
            paddingVertical: 16,
            borderRadius: 999,
            alignItems: 'center',
            opacity: update.isPending ? 0.6 : 1,
          }}
        >
          {update.isPending ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700' }}>
              {t('common.save')}
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
