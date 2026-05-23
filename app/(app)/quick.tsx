import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { useActiveLedger } from '../../providers/ActiveLedgerProvider';
import { useActiveTrip } from '../../providers/ActiveTripProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { useCategories } from '../../lib/queries/categories';
import { useAccounts, ACCOUNT_TYPE_META } from '../../lib/queries/accounts';
import { useCreateTransaction } from '../../lib/queries/transactions-local';
import {
  useRemoveShortcut,
  useShortcuts,
} from '../../lib/queries/shortcuts';
import { sortCategoriesByHierarchy } from '../../lib/categories-helpers';
import { CURRENCIES, currencySymbol, useFxRate } from '../../lib/fx';
import type { Shortcut } from '../../lib/shortcuts';
import { Mascot } from '../../components/Mascot';
import { EmojiOrIcon } from '../../components/icons/EmojiOrIcon';

/**
 * Add Transaction — second-pass redesign to match the latest mockup.
 *
 * Key visual changes from the previous port:
 *   - Greeting banner — shiba shrinks into a small circular avatar on
 *     the left, with a white bubble pill carrying the text.
 *   - Kind toggle — segmented control where the active option is a
 *     filled accent pill and the inactive is transparent text.
 *   - Amount — promoted to a big peach (cardElevated) hero card with
 *     white text; the `.00` fraction trails in a muted shade as a
 *     decoration.
 *   - Category grid — each tile is its own rounded card (no shared
 *     wrapper). Selected tile flips to a vivid pink background with
 *     white text to read as the "active filter."
 *   - Submit — full-width pill with bone emoji + brand voice line.
 *
 * Data flow is unchanged: writes go via `useCreateTransaction` →
 * local SQLite (`_sync_state='pending_create'`) → sync engine pushes.
 */

const MAX_VISIBLE_CATS = 7; // 4-col grid; the 8th slot is the "ดูเพิ่ม" tile

// Active category tile color (independent of theme accent — semantic
// "you picked this" feedback rather than a chrome surface).
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

export default function QuickAddScreen() {
  const { t } = useTranslation();
  const { ledger } = useActiveLedger();
  const { trip: activeTrip } = useActiveTrip();
  const cats = useCategories(ledger?.id);
  const accounts = useAccounts(ledger?.id);
  const create = useCreateTransaction();
  const shortcuts = useShortcuts(ledger?.id);
  const removeShortcut = useRemoveShortcut();
  const c = useTheme().colors;
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ date?: string }>();


  const home = ledger?.currency ?? 'THB';
  const [kind, setKind] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [payment, setPayment] = useState<'cash' | 'transfer'>('cash');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [currency, setCurrency] = useState<string>(home);
  const [error, setError] = useState<string | null>(null);
  const [showAllCats, setShowAllCats] = useState(false);

  // Foreign-currency capture: when `currency !== home`, the amount field
  // holds the FOREIGN value and we convert to home for storage. `amount`
  // on the row is always home currency so every aggregate stays in ฿.
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

  const filteredCats = useMemo(
    () =>
      sortCategoriesByHierarchy(
        (cats.data ?? []).filter((cat) => cat.kind === kind),
      ),
    [cats.data, kind],
  );

  const visibleCats = useMemo(
    () => (showAllCats ? filteredCats : filteredCats.slice(0, MAX_VISIBLE_CATS)),
    [filteredCats, showAllCats],
  );
  const overflowCount = Math.max(0, filteredCats.length - MAX_VISIBLE_CATS);

  function reset() {
    setAmount('');
    setNote('');
    setCategoryId(null);
    setPayment('cash');
    setAccountId(null);
    setCurrency(home);
    setError(null);
  }

  // Tapping a shortcut prefills the form from a saved template. The
  // user can still tweak any field before pressing save.
  function applyShortcut(s: Shortcut) {
    setKind(s.kind);
    setAmount(s.amount > 0 ? String(s.amount) : '');
    setNote(s.note ?? '');
    setCategoryId(s.category_id);
    setPayment(s.payment_method ?? 'cash');
    setError(null);
  }

  function close() {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/dashboard');
  }

  async function save() {
    setError(null);
    const value = Number(amount.replace(/,/g, ''));
    if (!ledger) {
      setError(t('quick.noLedgerError'));
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      setError(t('quick.amountRequired'));
      return;
    }
    // Resolve the home-currency amount + foreign trio. For home currency
    // the trio stays null and behaves exactly as before.
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
      await create.mutateAsync({
        ledger_id: ledger.id,
        kind,
        amount: homeAmount,
        note: note.trim() || null,
        category_id: categoryId,
        account_id: accountId,
        // Auto-tag the new transaction to the active trip (if any) so
        // the user doesn't have to remember — matches the web app's
        // "active trip banner" behavior.
        trip_id: activeTrip?.id ?? null,
        payment_method: payment,
        fx_currency: fxCurrency,
        fx_amount: fxAmount,
        fx_rate: fxRateVal,
        occurred_at: params.date
          ? `${params.date}T12:00:00.000Z`
          : new Date().toISOString(),
      });
      reset();
      router.replace('/(app)/transactions');

    } catch (e) {
      console.error('createTransaction failed:', e);
      const msg = e instanceof Error ? e.message : t('quick.saveFailed');
      setError(msg);
    }
  }

  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: c.bg }}
      edges={['top']}
    >
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 136, gap: 16 }}>
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
            {t('dashboard.addTransaction')}
          </Text>
          <Pressable onPress={reset} className="px-3 py-2">
            <Text style={{ color: c.accent, fontSize: 13, fontWeight: '700' }}>
              {t('quick.clear')}
            </Text>
          </Pressable>
        </View>

        {/* Shiba greeting — avatar + speech bubble */}
        <View className="flex-row items-center gap-3">
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: c.cardElevated,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {/* The mascot's viewBox includes a ground shadow — shift it
                down slightly so the face sits centered in the circle. */}
            <View style={{ marginTop: 4 }}>
              <Mascot size={48} />
            </View>
          </View>
          <View
            className="rounded-full px-4 py-2.5 flex-1"
            style={{ backgroundColor: c.card }}
          >
            <Text style={{ color: c.text, fontSize: 13 }}>
              {t('quick.greetingPrefix')}{' '}
              <Text style={{ fontWeight: '700' }}>{t('quick.greetingStrong')}</Text> 🦴
            </Text>
          </View>
        </View>

        {/* Shortcuts row — saved templates from the long-press action
            sheet. Tap to prefill, long-press to remove. Hidden when the
            user hasn't saved any yet. */}
        {(shortcuts.data ?? []).length > 0 && (
          <View>
            <Text
              style={{
                color: c.textSecondary,
                fontSize: 11,
                fontWeight: '700',
                marginBottom: 8,
                marginLeft: 2,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              ⚡️ Shortcut
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingRight: 4 }}
            >
              {(shortcuts.data ?? []).map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => applyShortcut(s)}
                  onLongPress={() =>
                    removeShortcut.mutate({
                      id: s.id,
                      ledger_id: s.ledger_id,
                    })
                  }
                  delayLongPress={400}
                  style={{
                    backgroundColor: c.card,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    minWidth: 110,
                  }}
                >
                  <EmojiOrIcon value={s.icon} fallback="sparkle" size={18} />
                  <View>
                    <Text
                      numberOfLines={1}
                      style={{
                        color: c.text,
                        fontSize: 12,
                        fontWeight: '600',
                        maxWidth: 100,
                      }}
                    >
                      {s.name}
                    </Text>
                    <Text
                      style={{
                        color: s.kind === 'income' ? c.income : c.expense,
                        fontSize: 11,
                        fontWeight: '700',
                      }}
                    >
                      {s.kind === 'income' ? '+' : '−'}฿
                      {Math.round(s.amount).toLocaleString('en-US')}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
            <Text
              style={{
                color: c.textMuted,
                fontSize: 10,
                marginTop: 4,
                marginLeft: 2,
              }}
            >
              💡 {t('quick.shortcutHint')}
            </Text>
          </View>
        )}

        {/* Kind toggle — segmented control */}
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

        {/* Amount — hero card uses accent color for visual punch
            (white text reads cleanly on the orange surface). */}
        <View
          className="rounded-3xl px-5 py-6"
          style={{ backgroundColor: c.accent }}
        >
          <Text
            className="text-center"
            style={{
              color: 'rgba(255, 255, 255, 0.75)',
              fontSize: 13,
            }}
          >
            {t('common.amount')}
          </Text>
          <View className="flex-row items-baseline justify-center gap-1 mt-2">
            <Text
              style={{
                color: '#FFFFFF',
                fontSize: 44,
                fontWeight: '700',
              }}
            >
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
          {/* Home-currency preview for foreign amounts */}
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

        {/* Currency picker — home currency first, then the common set.
            Foreign selection flips the amount field to that currency and
            stores the home-equiv on save. */}
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

        {/* Payment method */}
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
            <PaymentCard
              colors={c}
              icon="💵"
              title={t('quick.cash')}
              subtitle={t('quick.cashHint')}
              selected={payment === 'cash'}
              onPress={() => setPayment('cash')}
            />
            <PaymentCard
              colors={c}
              icon="🏦"
              title={t('quick.transfer')}
              subtitle="PromptPay"
              selected={payment === 'transfer'}
              onPress={() => setPayment('transfer')}
            />
          </View>
        </View>

        {/* Account picker — optional, links the transaction to a wallet
            so the accounts screen's balance numbers add up. "ไม่ระบุ"
            keeps account_id NULL. Only shows when the user has at least
            one active account. */}
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

        {/* Category grid — 4 columns, each tile its own card */}
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
          ) : visibleCats.length === 0 ? (
            <Pressable
              onPress={() => router.push('/(app)/categories')}
              className="py-3 items-center"
            >
              <Text style={{ color: c.textSecondary, fontSize: 12 }}>
                {t('quick.noCategories')}
              </Text>
            </Pressable>
          ) : (
            <View className="flex-row flex-wrap" style={{ marginHorizontal: -4 }}>
              {visibleCats.map((cat) => {
                const selected = categoryId === cat.id;
                const isSub = !!cat.parent_id;
                return (
                  <View key={cat.id} style={{ width: '25%', padding: 4 }}>
                    <Pressable
                      onPress={() =>
                        setCategoryId(selected ? null : cat.id)
                      }
                      style={{
                        paddingVertical: 16,
                        borderRadius: 18,
                        backgroundColor: selected
                          ? SELECTED_CAT_COLOR
                          : c.card,
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <Text style={{ fontSize: 26 }}>
                        {cat.icon &&
                        // If the icon value is a sprite name (text), JtIcon
                        // would render — but most user icons are emoji
                        // strings already. Render as text for the big
                        // emoji style.
                        cat.icon.length <= 4
                          ? cat.icon
                          : null}
                        {(!cat.icon || cat.icon.length > 4) && (
                          <EmojiOrIcon
                            value={cat.icon}
                            fallback="sparkle"
                            size={24}
                          />
                        )}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={{
                          color: selected ? '#FFFFFF' : c.text,
                          fontSize: 12,
                          fontWeight: selected ? '700' : '500',
                        }}
                      >
                        {isSub ? '↳ ' : ''}
                        {cat.name}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
              {!showAllCats && overflowCount > 0 && (
                <View style={{ width: '25%', padding: 4 }}>
                  <Pressable
                    onPress={() => setShowAllCats(true)}
                    style={{
                      paddingVertical: 16,
                      borderRadius: 18,
                      backgroundColor: c.card,
                      alignItems: 'center',
                      gap: 6,
                      borderWidth: 1,
                      borderColor: c.border,
                      borderStyle: 'dashed',
                    }}
                  >
                    <Text style={{ fontSize: 26, color: c.textSecondary }}>
                      ＋
                    </Text>
                    <Text
                      style={{
                        color: c.textSecondary,
                        fontSize: 12,
                        fontWeight: '500',
                      }}
                    >
                      {t('quick.showMore', { count: overflowCount })}
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Optional note */}
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

      </ScrollView>
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: Math.max(insets.bottom, 8),
          paddingHorizontal: 16,
        }}
      >
        <View
          style={{
            backgroundColor: c.card,
            borderRadius: 24,
            padding: 10,
            borderWidth: 1,
            borderColor: c.border,
            shadowColor: '#000000',
            shadowOpacity: 0.12,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 8 },
            elevation: 8,
          }}
        >
          {error && (
            <Text
              className="text-center"
              style={{ color: c.expense, fontSize: 12, marginBottom: 8 }}
            >
              {error}
            </Text>
          )}
          <Pressable
            onPress={save}
            disabled={create.isPending}
            style={{
              backgroundColor: c.accent,
              paddingVertical: 15,
              borderRadius: 999,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 8,
              shadowColor: c.accent,
              shadowOpacity: 0.3,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 6 },
              elevation: 4,
              opacity: create.isPending ? 0.6 : 1,
            }}
          >
            {create.isPending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={{ fontSize: 18 }}>🦴</Text>
                <Text
                  style={{
                    color: '#FFFFFF',
                    fontSize: 15,
                    fontWeight: '700',
                  }}
                >
                  {t('common.save')}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

function PaymentCard({
  colors,
  icon,
  title,
  subtitle,
  selected,
  onPress,
}: {
  colors: ReturnType<typeof useTheme>['colors'];
  icon: string;
  title: string;
  subtitle: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        padding: 12,
        borderRadius: 18,
        backgroundColor: colors.card,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderWidth: 1.5,
        borderColor: selected ? colors.accent : 'transparent',
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 12,
          backgroundColor: colors.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 18 }}>{icon}</Text>
      </View>
      <View className="flex-1">
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>
          {title}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 10 }}>
          {subtitle}
        </Text>
      </View>
      {selected && (
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>
            ✓
          </Text>
        </View>
      )}
    </Pressable>
  );
}
