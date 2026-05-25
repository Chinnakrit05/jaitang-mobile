import { useEffect, useMemo, useRef, useState } from 'react';
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
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

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
import {
  applyCategoryOrder,
  loadCategoryOrder,
  loadShowAllPref,
  saveCategoryOrder,
  saveShowAllPref,
} from '../../lib/category-order';
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
  // Currency picker stays collapsed by default — the row showed every pill
  // upfront which was visually noisy for the 99% case (THB). Tap to open.
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllCats, setShowAllCats] = useState(false);
  // Edit mode for the category grid — adds ↑↓ controls per tile and
  // pins the picker open so the user can see (and reorder) the full
  // list. Saved order persists via AsyncStorage in lib/category-order.
  const [editCats, setEditCats] = useState(false);
  const [catOrder, setCatOrder] = useState<string[]>([]);

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

  // Load this ledger's saved ordering + show-all preference when the
  // active ledger changes. Each ledger gets its own preference because
  // category sets differ between books.
  useEffect(() => {
    const lid = ledger?.id;
    if (!lid) {
      setCatOrder([]);
      setShowAllCats(false);
      return;
    }
    let cancelled = false;
    Promise.all([loadCategoryOrder(lid), loadShowAllPref(lid)]).then(
      ([order, showAll]) => {
        if (cancelled) return;
        setCatOrder(order);
        setShowAllCats(showAll);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [ledger?.id]);

  const filteredCats = useMemo(() => {
    const base = (cats.data ?? []).filter((cat) => cat.kind === kind);
    // Once the user reorders, honor that exactly — skip the parent-then-
    // sub regrouping so manual swaps aren't undone. Until then, fall
    // back to the default hierarchy sort.
    return catOrder.length > 0
      ? applyCategoryOrder(base, catOrder)
      : sortCategoriesByHierarchy(base);
  }, [cats.data, kind, catOrder]);

  // For sub-categories the tile shows the parent's icon as a small corner
  // badge instead of the old "↳ " name prefix — gives users a at-a-glance
  // anchor of which family the sub belongs to.
  const categoryById = useMemo(() => {
    const m = new Map<string, (typeof filteredCats)[number]>();
    for (const c of cats.data ?? []) m.set(c.id, c);
    return m;
  }, [cats.data]);

  const visibleCats = useMemo(
    () =>
      showAllCats || editCats
        ? filteredCats
        : filteredCats.slice(0, MAX_VISIBLE_CATS),
    [filteredCats, showAllCats, editCats],
  );
  const overflowCount = Math.max(0, filteredCats.length - MAX_VISIBLE_CATS);

  /** Toggle the "show all by default" preference. Persists immediately. */
  function toggleShowAll(next: boolean) {
    setShowAllCats(next);
    const lid = ledger?.id;
    if (lid) saveShowAllPref(lid, next).catch((e) =>
      console.error('saveShowAllPref failed:', e),
    );
  }

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
            (white text reads cleanly on the orange surface). Currency
            picker now lives in the top-right of this card: collapsed by
            default to a small "THB ▾" chip, tap to expand into a full
            scroll row of pills below the card. */}
        <View
          className="rounded-3xl px-5 py-6"
          style={{ backgroundColor: c.accent }}
        >
          {/* Top row: label centered, currency chip in the right corner. */}
          <View className="flex-row items-center">
            <View style={{ width: 60 }} />
            <Text
              className="text-center"
              style={{
                color: 'rgba(255, 255, 255, 0.75)',
                fontSize: 13,
                flex: 1,
              }}
            >
              {t('common.amount')}
            </Text>
            <Pressable
              onPress={() => setCurrencyOpen((v) => !v)}
              style={{
                width: 60,
                alignItems: 'flex-end',
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 999,
                  backgroundColor: 'rgba(255,255,255,0.18)',
                }}
              >
                <Text
                  style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}
                >
                  {currency}
                </Text>
                <Text
                  style={{
                    color: 'rgba(255,255,255,0.85)',
                    fontSize: 10,
                    fontWeight: '700',
                    transform: [{ rotate: currencyOpen ? '180deg' : '0deg' }],
                  }}
                >
                  ▾
                </Text>
              </View>
            </Pressable>
          </View>
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

        {/* Currency list — animated, only mounted when the chip is tapped.
            Reanimated's layout transitions handle the fade + slight slide
            so it feels like a real dropdown without any imperative work. */}
        {currencyOpen && (
          <Animated.View
            entering={FadeIn.duration(180)}
            exiting={FadeOut.duration(140)}
          >
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
                    onPress={() => {
                      setCurrency(cur);
                      setCurrencyOpen(false);
                    }}
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
          </Animated.View>
        )}

        {/* Payment method */}
        {/* Note (left) + payment methods (right). Two columns so the
            two infrequent inputs share one row, freeing space below for
            the category grid. Payment cards stack vertically on the
            right and the note card stretches to match the column height. */}
        <View className="flex-row gap-3" style={{ alignItems: 'stretch' }}>
          {/* Left — note input. Multiline so it can grow as the right
              column grows with both payment cards. */}
          <View
            className="rounded-2xl px-4 py-3"
            style={{ flex: 1, backgroundColor: c.card }}
          >
            <View className="flex-row items-start gap-2" style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, marginTop: 2 }}>📝</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder={t('common.noteOptional')}
                placeholderTextColor={c.textMuted}
                multiline
                textAlignVertical="top"
                style={{
                  color: c.text,
                  fontSize: 14,
                  flex: 1,
                  paddingVertical: 4,
                  minHeight: 56,
                }}
              />
            </View>
          </View>
          {/* Right — payment methods stacked. Compact variants: the
              two cards combined now match the height of a single
              regular card so the row stays low-profile. */}
          <View style={{ flex: 1, gap: 6 }}>
            <CompactPaymentCard
              colors={c}
              icon="💵"
              title={t('quick.cash')}
              selected={payment === 'cash'}
              onPress={() => setPayment('cash')}
            />
            <CompactPaymentCard
              colors={c}
              icon="🏦"
              title={t('quick.transfer')}
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
          <View
            className="flex-row items-center justify-between"
            style={{ marginBottom: 10, paddingHorizontal: 2 }}
          >
            <Text style={{ color: c.text, fontSize: 13, fontWeight: '600' }}>
              {t('quick.chooseCategory')}
            </Text>
            <Pressable
              onPress={() => setEditCats((v) => !v)}
              style={{
                paddingHorizontal: editCats ? 18 : 10,
                paddingVertical: editCats ? 9 : 4,
                borderRadius: 999,
                backgroundColor: editCats ? c.accent : c.chip,
                // Edit-mode "เสร็จ" is the primary exit affordance now
                // that the bottom save bar is hidden — make it pop.
                shadowColor: editCats ? c.accent : 'transparent',
                shadowOpacity: editCats ? 0.35 : 0,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 3 },
                elevation: editCats ? 4 : 0,
              }}
            >
              <Text
                style={{
                  color: editCats ? c.accentText : c.textSecondary,
                  fontSize: editCats ? 14 : 11,
                  fontWeight: editCats ? '800' : '700',
                }}
              >
                {editCats
                  ? `✓ ${t('common.done', { defaultValue: 'เสร็จ' })}`
                  : `✏️ ${t('common.edit', { defaultValue: 'แก้ไข' })}`}
              </Text>
            </Pressable>
          </View>
          {/* Edit-mode toolbar: choose whether to show everything by
              default, or stick with the compact "ที่ใช้บ่อย" view. */}
          {editCats && (
            <View
              className="flex-row gap-2"
              style={{ marginBottom: 10, paddingHorizontal: 2 }}
            >
              <Pressable
                onPress={() => toggleShowAll(false)}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: !showAllCats ? c.accent : c.card,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: !showAllCats ? c.accent : c.border,
                }}
              >
                <Text
                  style={{
                    color: !showAllCats ? c.accentText : c.text,
                    fontSize: 11,
                    fontWeight: '700',
                  }}
                >
                  ที่ใช้บ่อย ({MAX_VISIBLE_CATS})
                </Text>
              </Pressable>
              <Pressable
                onPress={() => toggleShowAll(true)}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: showAllCats ? c.accent : c.card,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: showAllCats ? c.accent : c.border,
                }}
              >
                <Text
                  style={{
                    color: showAllCats ? c.accentText : c.text,
                    fontSize: 11,
                    fontWeight: '700',
                  }}
                >
                  ทั้งหมด ({filteredCats.length})
                </Text>
              </Pressable>
            </View>
          )}
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
          ) : editCats ? (
            /* Drag-and-drop grid — long-press a tile (~180ms) to lift
               it, then drag to any slot. Releasing snaps it into place
               and persists the new order. Other tiles animate to their
               new positions after the drop, not live during the drag. */
            <DraggableCatGrid
              cats={filteredCats}
              categoryById={categoryById}
              colors={c}
              onReorder={(from, to) => {
                if (from === to) return;
                const ids = filteredCats.map((cc) => cc.id);
                const [moved] = ids.splice(from, 1);
                ids.splice(to, 0, moved);
                setCatOrder(ids);
                const lid = ledger?.id;
                if (lid)
                  saveCategoryOrder(lid, ids).catch((e) =>
                    console.error('saveCategoryOrder failed:', e),
                  );
              }}
            />
          ) : (
            <View className="flex-row flex-wrap" style={{ marginHorizontal: -4 }}>
              {visibleCats.map((cat) => {
                const selected = categoryId === cat.id;
                const parent = cat.parent_id
                  ? categoryById.get(cat.parent_id)
                  : null;
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
                      {/* Parent badge — small icon in the top-right
                          showing which family this sub belongs to.
                          Replaces the old "↳ " name prefix. */}
                      {parent && (
                        <View
                          style={{
                            position: 'absolute',
                            top: 4,
                            right: 4,
                            width: 20,
                            height: 20,
                            borderRadius: 10,
                            backgroundColor: selected
                              ? 'rgba(255,255,255,0.22)'
                              : c.chip,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {parent.icon && parent.icon.length <= 4 ? (
                            <Text style={{ fontSize: 11 }}>{parent.icon}</Text>
                          ) : (
                            <EmojiOrIcon
                              value={parent.icon}
                              fallback="sparkle"
                              size={12}
                            />
                          )}
                        </View>
                      )}
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

      </ScrollView>
      {/* Sticky save bar — hidden while editing the category grid so
          a stray tap on "บันทึก" doesn't get mistaken for "exit edit". */}
      <View
        pointerEvents={editCats ? 'none' : 'box-none'}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: Math.max(insets.bottom, 8),
          paddingHorizontal: 16,
          opacity: editCats ? 0 : 1,
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

/**
 * Drag-and-drop category grid used in the picker's edit mode. Keeps
 * the 4-col grid layout from the normal picker — each tile is just an
 * absolutely-positioned `Animated.View` whose target slot is derived
 * from its index. Long-press lifts a tile (z-index + scale + opacity);
 * pan moves it; release computes the destination slot from the finger
 * position and bubbles a `(from, to)` callback up. Other tiles slide
 * to their new spots via `withTiming` once the new order arrives.
 */
const GRID_COLS = 4;
const GRID_TILE_H = 88;

type GridCat = {
  id: string;
  name: string;
  icon: string | null;
  parent_id: string | null;
};

function DraggableCatGrid({
  cats,
  categoryById,
  colors,
  onReorder,
}: {
  cats: GridCat[];
  categoryById: Map<string, GridCat>;
  colors: ReturnType<typeof useTheme>['colors'];
  onReorder: (from: number, to: number) => void;
}) {
  const [gridW, setGridW] = useState(0);
  const tileW = gridW > 0 ? gridW / GRID_COLS : 0;
  const rows = Math.ceil(cats.length / GRID_COLS);
  return (
    <View
      onLayout={(e) => setGridW(e.nativeEvent.layout.width)}
      style={{ width: '100%', height: rows * GRID_TILE_H }}
    >
      {tileW > 0 &&
        cats.map((cat, idx) => (
          <DraggableTile
            key={cat.id}
            cat={cat}
            idx={idx}
            tileW={tileW}
            tileH={GRID_TILE_H}
            itemCount={cats.length}
            parent={cat.parent_id ? categoryById.get(cat.parent_id) ?? null : null}
            colors={colors}
            onReorder={onReorder}
          />
        ))}
    </View>
  );
}

function DraggableTile({
  cat,
  idx,
  tileW,
  tileH,
  itemCount,
  parent,
  colors,
  onReorder,
}: {
  cat: GridCat;
  idx: number;
  tileW: number;
  tileH: number;
  itemCount: number;
  parent: GridCat | null;
  colors: ReturnType<typeof useTheme>['colors'];
  onReorder: (from: number, to: number) => void;
}) {
  const baseX = (idx % GRID_COLS) * tileW;
  const baseY = Math.floor(idx / GRID_COLS) * tileH;

  // tx/ty hold the tile's actual position so we can animate other
  // tiles to their new slots after a drop without yanking the dragged
  // tile back to its old base first.
  const tx = useSharedValue(baseX);
  const ty = useSharedValue(baseY);
  const dragging = useSharedValue(false);
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const mounted = useRef(false);
  // iOS-style jiggle while edit mode is active. Alternating phase per
  // tile so neighbors wobble in opposite directions instead of in sync.
  const wobble = useSharedValue(0);
  useEffect(() => {
    wobble.value = withDelay(
      (idx % 2) * 80,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 110, easing: Easing.linear }),
          withTiming(-1, { duration: 220, easing: Easing.linear }),
          withTiming(0, { duration: 110, easing: Easing.linear }),
        ),
        -1,
        false,
      ),
    );
    return () => {
      wobble.value = 0;
    };
  }, [idx, wobble]);

  useEffect(() => {
    if (tileW === 0) return;
    if (!mounted.current) {
      // Snap to base position on first paint, no animation.
      tx.value = baseX;
      ty.value = baseY;
      mounted.current = true;
      return;
    }
    if (dragging.value) return;
    tx.value = withTiming(baseX, { duration: 220 });
    ty.value = withTiming(baseY, { duration: 220 });
  }, [baseX, baseY, tileW, tx, ty, dragging]);

  const animStyle = useAnimatedStyle(() => {
    // Pause the jiggle on the tile the user is actively dragging so it
    // lifts cleanly without spinning.
    const rotateDeg = dragging.value ? 0 : wobble.value * 1.6;
    return {
      transform: [
        { translateX: dragging.value ? tx.value + dragX.value : tx.value },
        { translateY: dragging.value ? ty.value + dragY.value : ty.value },
        { rotate: `${rotateDeg}deg` },
        { scale: dragging.value ? 1.08 : 1 },
      ],
      zIndex: dragging.value ? 1000 : 0,
      elevation: dragging.value ? 10 : 0,
      opacity: dragging.value ? 0.94 : 1,
    };
  });

  const pan = Gesture.Pan()
    .activateAfterLongPress(180)
    .onStart(() => {
      dragging.value = true;
      dragX.value = 0;
      dragY.value = 0;
    })
    .onChange((e) => {
      dragX.value = e.translationX;
      dragY.value = e.translationY;
    })
    .onEnd(() => {
      const finalX = tx.value + dragX.value;
      const finalY = ty.value + dragY.value;
      // Snap tx/ty to the drop position so the post-release animation
      // starts from where the user let go, not where the tile began.
      tx.value = finalX;
      ty.value = finalY;
      dragX.value = 0;
      dragY.value = 0;
      dragging.value = false;

      const fingerX = finalX + tileW / 2;
      const fingerY = finalY + tileH / 2;
      const newCol = Math.max(
        0,
        Math.min(GRID_COLS - 1, Math.floor(fingerX / tileW)),
      );
      const newRow = Math.max(0, Math.floor(fingerY / tileH));
      const newIdx = Math.min(itemCount - 1, newRow * GRID_COLS + newCol);

      if (newIdx === idx) {
        // No reorder — useEffect won't fire, so animate back manually.
        tx.value = withTiming(baseX, { duration: 220 });
        ty.value = withTiming(baseY, { duration: 220 });
      } else {
        runOnJS(onReorder)(idx, newIdx);
      }
    });

  const iconText = cat.icon && cat.icon.length <= 4 ? cat.icon : null;

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: tileW,
            height: tileH,
            padding: 4,
          },
          animStyle,
        ]}
      >
        <View
          style={{
            flex: 1,
            paddingVertical: 16,
            borderRadius: 18,
            backgroundColor: colors.card,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          {parent && (
            <View
              style={{
                position: 'absolute',
                top: 4,
                right: 4,
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: colors.chip,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {parent.icon && parent.icon.length <= 4 ? (
                <Text style={{ fontSize: 11 }}>{parent.icon}</Text>
              ) : (
                <EmojiOrIcon
                  value={parent.icon}
                  fallback="sparkle"
                  size={12}
                />
              )}
            </View>
          )}
          {iconText ? (
            <Text style={{ fontSize: 26 }}>{iconText}</Text>
          ) : (
            <EmojiOrIcon value={cat.icon} fallback="sparkle" size={24} />
          )}
          <Text
            numberOfLines={1}
            style={{ color: colors.text, fontSize: 12, fontWeight: '500' }}
          >
            {cat.name}
          </Text>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

/**
 * Slim payment chip — single-line icon + title, no subtitle. Used in
 * the note-and-payment row so two stacked chips total roughly one
 * regular card's height.
 */
function CompactPaymentCard({
  colors,
  icon,
  title,
  selected,
  onPress,
}: {
  colors: ReturnType<typeof useTheme>['colors'];
  icon: string;
  title: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
        backgroundColor: colors.card,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1.5,
        borderColor: selected ? colors.accent : 'transparent',
      }}
    >
      <Text style={{ fontSize: 16 }}>{icon}</Text>
      <Text
        numberOfLines={1}
        style={{
          color: colors.text,
          fontSize: 12,
          fontWeight: '700',
          flex: 1,
        }}
      >
        {title}
      </Text>
      {selected && (
        <View
          style={{
            width: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: '700' }}>
            ✓
          </Text>
        </View>
      )}
    </Pressable>
  );
}

