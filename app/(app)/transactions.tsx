import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { router } from 'expo-router';

import { useActiveLedger } from '../../providers/ActiveLedgerProvider';
import { useTheme } from '../../providers/ThemeProvider';
import {
  useCreateTransaction,
  useDeleteTransaction,
  useLocalTransactions,
} from '../../lib/queries/transactions-local';
import type { LocalTx } from '../../lib/sync/transactions';
import { useCategories } from '../../lib/queries/categories';
import { useTrips } from '../../lib/queries/trips';
import { useTransfers, type Transfer } from '../../lib/queries/transfers';
import { useAccounts } from '../../lib/queries/accounts';
import { currencySymbol } from '../../lib/fx';
import { useAddShortcut } from '../../lib/queries/shortcuts';
import { EmojiOrIcon } from '../../components/icons/EmojiOrIcon';
import { Mascot } from '../../components/Mascot';

/**
 * Transactions list — port of `ui/Transaction List.html` (v2-playful).
 *
 * Layout: header → summary banner (shiba + month tally + income/expense
 * pills) → horizontally scrolling category filter chips → date-grouped
 * sections with per-day totals.
 *
 * Day totals follow the mockup's rule: if every row on the day is an
 * expense, render the absolute total in dark; otherwise render a signed
 * net (`+` for positive in green, `−` for negative in dark).
 *
 * Long-press a row to delete — the only edit affordance until a real
 * edit screen lands.
 *
 * Colors come from `useTheme()` so the screen tracks light / dark / OLED
 * automatically. Constants are computed inside the component because
 * `useTheme()` is a hook — they can't sit at module scope anymore.
 */

function formatDay(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
  }).format(new Date(iso));
}

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return '';
  }
}

function formatTHB(n: number) {
  return Math.round(Math.abs(n)).toLocaleString('en-US');
}

// Tiny chip label for the row's payment-method tag. Returns null when
// the row didn't capture one (legacy data) so we skip the separator dot.
function paymentLabel(
  method: 'cash' | 'transfer' | null,
  labels: { cash: string; transfer: string },
): string | null {
  if (method === 'cash') return `💵 ${labels.cash}`;
  if (method === 'transfer') return `🏦 ${labels.transfer}`;
  return null;
}

// Pastel tints for the round category icon. Each category id hashes to
// a stable index so the same category always picks the same color. The
// rgba alpha matches the mockup's "soft chip" feel — vivid enough to
// distinguish at a glance, gentle enough not to compete with the row's
// text. Income kind always lands on green so salary / refund rows pop
// out from regular expenses.
const ICON_TINTS = [
  'rgba(255, 123, 172, 0.20)',  // pink
  'rgba(251, 191, 36, 0.20)',   // yellow
  'rgba(167, 139, 250, 0.20)',  // lavender
  'rgba(96, 165, 250, 0.20)',   // sky
  'rgba(251, 146, 60, 0.20)',   // orange
];
const ICON_TINT_INCOME = 'rgba(52, 211, 153, 0.22)'; // mint green
const ICON_TINT_NEUTRAL = 'rgba(61, 42, 30, 0.06)';   // for uncategorized

function categoryTint(
  categoryId: string | null,
  kind: 'income' | 'expense',
): string {
  if (kind === 'income') return ICON_TINT_INCOME;
  if (!categoryId) return ICON_TINT_NEUTRAL;
  let hash = 0;
  for (let i = 0; i < categoryId.length; i++) {
    hash = (hash + categoryId.charCodeAt(i)) >>> 0;
  }
  return ICON_TINTS[hash % ICON_TINTS.length];
}

function SearchIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={6.5} stroke={color} strokeWidth={1.7} />
      <Path
        d="M21 21l-5-5"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
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

function transferMoney(amount: number, currency: string | null): string {
  const cur = currency ?? 'THB';
  if (cur === 'THB') return `฿${formatTHB(amount)}`;
  return `${formatTHB(amount)} ${cur}`;
}

// A row in the date-grouped list is either a transaction or a transfer.
// Transfers are net-zero money moves between accounts, so they show up as
// informational rows that don't count toward day totals.
type FeedItem =
  | { type: 'tx'; key: string; at: string; tx: LocalTx }
  | { type: 'transfer'; key: string; at: string; transfer: Transfer };

export default function TransactionsScreen() {
  const { t, i18n } = useTranslation();
  const { ledger, loading: ledgerLoading } = useActiveLedger();
  const txs = useLocalTransactions({ ledgerId: ledger?.id, limit: 500 });
  const cats = useCategories(ledger?.id);
  const del = useDeleteTransaction();
  const c = useTheme().colors;
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const paymentLabels = useMemo(
    () => ({ cash: t('quick.cash'), transfer: t('quick.transfer') }),
    [t],
  );

  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const catById = useMemo(
    () => new Map((cats.data ?? []).map((c) => [c.id, c])),
    [cats.data],
  );

  // Trip lookup for the per-row trip chip. Same id-keyed Map pattern as
  // catById so we can render the chip in O(1) per row.
  const trips = useTrips(ledger?.id);
  const tripById = useMemo(
    () => new Map((trips.data ?? []).map((t) => [t.id, t])),
    [trips.data],
  );

  // Transfers + account lookup so transfer rows can name their source /
  // destination wallets. Transfers only show when no category filter is
  // active (they carry no category).
  const transfers = useTransfers(ledger?.id);
  const accounts = useAccounts(ledger?.id, { includeArchived: true });
  const accById = useMemo(
    () => new Map((accounts.data ?? []).map((a) => [a.id, a])),
    [accounts.data],
  );

  // Long-press on a row opens this action sheet — `null` means closed.
  const [menuTx, setMenuTx] = useState<LocalTx | null>(null);
  const createTx = useCreateTransaction();
  const addShortcut = useAddShortcut();

  const monthScope = useMemo(() => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
    return (txs.data ?? []).filter(
      (t) => t.occurred_at >= from && t.occurred_at < to,
    );
  }, [txs.data]);

  const filterChips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of monthScope) {
      if (!t.category_id) continue;
      counts.set(t.category_id, (counts.get(t.category_id) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cid]) => {
        const c = catById.get(cid);
        return c ? { id: c.id, name: c.name, icon: c.icon } : null;
      })
      .filter((c): c is { id: string; name: string; icon: string | null } => !!c);
  }, [monthScope, catById]);

  const monthIncome = monthScope
    .filter((t) => t.kind === 'income')
    .reduce((s, t) => s + t.amount, 0);
  const monthExpense = monthScope
    .filter((t) => t.kind === 'expense')
    .reduce((s, t) => s + t.amount, 0);
  const monthCount = monthScope.length;

  const sections = useMemo(() => {
    const filtered = activeFilter
      ? (txs.data ?? []).filter((t) => t.category_id === activeFilter)
      : (txs.data ?? []);

    const byDay = new Map<string, FeedItem[]>();
    for (const t of filtered) {
      const day = t.occurred_at.slice(0, 10);
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day)!.push({ type: 'tx', key: t.id, at: t.occurred_at, tx: t });
    }
    // Transfers have no category, so only fold them in on the unfiltered
    // (All) view. They're informational rows — they don't affect the
    // per-day net / "all expenses" computation below.
    if (!activeFilter) {
      for (const tr of transfers.data ?? []) {
        const day = tr.occurred_at.slice(0, 10);
        if (!byDay.has(day)) byDay.set(day, []);
        byDay.get(day)!.push({
          type: 'transfer',
          key: `tr_${tr.id}`,
          at: tr.occurred_at,
          transfer: tr,
        });
      }
    }

    return [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([day, items]) => {
        items.sort((a, b) => (a.at < b.at ? 1 : -1));
        const txItems = items.filter(
          (i): i is Extract<FeedItem, { type: 'tx' }> => i.type === 'tx',
        );
        const allExpenses =
          txItems.length > 0 && txItems.every((i) => i.tx.kind === 'expense');
        const net = txItems.reduce(
          (s, i) => s + (i.tx.kind === 'income' ? i.tx.amount : -i.tx.amount),
          0,
        );
        return {
          title: day,
          data: items,
          allExpenses,
          net,
        };
      });
  }, [txs.data, transfers.data, activeFilter]);

  function confirmDelete(tx: LocalTx) {
    Alert.alert(
      t('transactions.deleteConfirm'),
      tx.note?.trim() || catById.get(tx.category_id ?? '')?.name || t('dashboard.genericTransaction'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => del.mutate(tx.id),
        },
      ],
    );
  }

  async function duplicateTx(tx: LocalTx) {
    if (!ledger) return;
    try {
      await createTx.mutateAsync({
        ledger_id: tx.ledger_id,
        kind: tx.kind,
        amount: tx.amount,
        note: tx.note,
        category_id: tx.category_id,
        account_id: tx.account_id,
        trip_id: tx.trip_id,
        payment_method: tx.payment_method,
        // Reuse fields but use NOW as occurred_at so it appears at the
        // top of today's section.
        occurred_at: new Date().toISOString(),
      });
    } catch (e) {
      Alert.alert(t('transactions.duplicateFailed', { defaultValue: 'Duplicate failed' }), String((e as Error)?.message ?? e));
    }
  }

  if (ledgerLoading || txs.isLoading) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: c.bg }}
      >
        <ActivityIndicator color={c.accent} />
      </SafeAreaView>
    );
  }
  if (txs.error) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center p-4"
        style={{ backgroundColor: c.bg }}
      >
        <Text style={{ color: c.expense }}>{String(txs.error)}</Text>
      </SafeAreaView>
    );
  }
  if (!ledger) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: c.bg }}
      >
        <Text style={{ color: c.textSecondary }}>{t('dashboard.noLedgerTitle')}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: c.bg }}
      edges={['top']}
    >
      <FlatList
        data={sections}
        keyExtractor={(section) => section.title}
        contentContainerStyle={{ paddingBottom: 96 }}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListHeaderComponent={
          <View style={{ padding: 16, gap: 14 }}>
            {/* Header */}
            <View className="flex-row items-center justify-between">
              <Text style={{ color: c.text, fontSize: 22, fontWeight: '700' }}>
                {t('transactions.title')}
              </Text>
              <Pressable
                onPress={() => {
                  /* TODO: search */
                }}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: c.card,
                }}
              >
                <SearchIcon color={c.text} size={18} />
              </Pressable>
            </View>

            {/* Summary banner — shiba avatar (in soft peach circle) +
                count text + plain colored amounts (no pill bg). */}
            <View
              className="rounded-2xl p-4 flex-row items-center gap-3"
              style={{ backgroundColor: c.card }}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  backgroundColor: c.cardElevated,
                }}
              >
                <Mascot size={48} />
              </View>
              <View className="flex-1">
                <Text style={{ color: c.text, fontSize: 13 }}>
                  {t('transactions.monthCount', {
                    defaultValue: 'This month: {count} transactions',
                    count: monthCount,
                  })}
                </Text>
                <View className="flex-row gap-3 mt-1">
                  <Text
                    style={{ color: c.income, fontSize: 13, fontWeight: '700' }}
                  >
                    +฿{formatTHB(monthIncome)}
                  </Text>
                  <Text
                    style={{ color: c.text, fontSize: 13, fontWeight: '700' }}
                  >
                    −฿{formatTHB(monthExpense)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Filter chips — horizontal scroll */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingRight: 4 }}
            >
              <Chip
                label={t('common.all')}
                active={activeFilter === null}
                onPress={() => setActiveFilter(null)}
                colors={c}
              />
              {filterChips.map((cat) => (
                <Chip
                  key={cat.id}
                  label={cat.name}
                  icon={cat.icon}
                  active={activeFilter === cat.id}
                  onPress={() =>
                    setActiveFilter(activeFilter === cat.id ? null : cat.id)
                  }
                  colors={c}
                />
              ))}
            </ScrollView>
          </View>
        }
        renderItem={({ item: section }) => {
          // Each "item" of this FlatList is a whole date section. The
          // date header + every transaction row of that day live inside
          // a SINGLE white card so the corners + hairlines stay tight —
          // SectionList's renderSectionHeader was leaving a stray gap
          // between header and the first item that no amount of padding
          // could close.
          const sign = section.allExpenses
            ? ''
            : section.net >= 0
              ? '+'
              : '−';
          const totalColor = section.allExpenses
            ? c.text
            : section.net >= 0
              ? c.income
              : c.text;
          return (
            <View className="px-4">
              <View
                style={{
                  backgroundColor: c.card,
                  borderRadius: 18,
                  overflow: 'hidden',
                }}
              >
                {/* Date header row */}
                <View
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{ color: c.text, fontSize: 13, fontWeight: '700' }}
                  >
                    {formatDay(section.title + 'T00:00:00', locale)}
                  </Text>
                  <Text
                    style={{
                      color: totalColor,
                      fontSize: 13,
                      fontWeight: '700',
                    }}
                  >
                    {sign}฿{formatTHB(section.net)}
                  </Text>
                </View>

                {/* Transaction rows */}
                {section.data.map((feed) => {
                  // Transfer rows — neutral (trip-blue) money moves
                  // between accounts. Tap routes to the transfers screen.
                  if (feed.type === 'transfer') {
                    const tr = feed.transfer;
                    const fromName = tr.from_account_id
                      ? accById.get(tr.from_account_id)?.name ?? '—'
                      : '—';
                    const toName = tr.to_account_id
                      ? accById.get(tr.to_account_id)?.name ?? '—'
                      : '—';
                    const cross =
                      tr.from_currency !== tr.to_currency ||
                      tr.from_amount !== tr.to_amount;
                    return (
                      <Pressable
                        key={feed.key}
                        onPress={() => router.push('/(app)/transfers')}
                        style={{
                          paddingHorizontal: 14,
                          paddingVertical: 12,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 12,
                          opacity: tr._sync_state !== 'clean' ? 0.7 : 1,
                          borderTopWidth: 1,
                          borderTopColor: c.border,
                        }}
                      >
                        <View
                          className="w-10 h-10 rounded-full items-center justify-center"
                          style={{ backgroundColor: c.tripBg }}
                        >
                          <SwapIcon color={c.trip} size={18} />
                        </View>
                        <View className="flex-1 min-w-0">
                          <Text
                            numberOfLines={1}
                            style={{ color: c.text, fontSize: 14, fontWeight: '500' }}
                          >
                            {fromName} → {toName}
                          </Text>
                          <Text style={{ color: c.textMuted, fontSize: 11, marginTop: 1 }}>
                            {t('transfers.label', { defaultValue: 'โอนเงิน' })}
                            {tr.note?.trim() ? ` · ${tr.note.trim()}` : ''}
                            {' · '}
                            {formatTime(tr.occurred_at)}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ color: c.trip, fontSize: 14, fontWeight: '700' }}>
                            {transferMoney(tr.from_amount, tr.from_currency)}
                          </Text>
                          {cross && (
                            <Text style={{ color: c.textMuted, fontSize: 10, marginTop: 1 }}>
                              → {transferMoney(tr.to_amount, tr.to_currency)}
                            </Text>
                          )}
                        </View>
                      </Pressable>
                    );
                  }

                  const item = feed.tx;
                  const cat = item.category_id
                    ? catById.get(item.category_id)
                    : null;
                  // Resolve the trip — `trip_id` can dangle if the
                  // referenced trip got deleted, so `tripById.get`
                  // safely returns undefined.
                  const tripTag = item.trip_id
                    ? tripById.get(item.trip_id)
                    : null;
                  return (
                    <Pressable
                      key={feed.key}
                      onLongPress={() => setMenuTx(item)}
                      delayLongPress={300}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        opacity: item._sync_state !== 'clean' ? 0.7 : 1,
                        borderTopWidth: 1,
                        borderTopColor: c.border,
                      }}
                    >
                      <View
                        className="w-10 h-10 rounded-full items-center justify-center"
                        style={{
                          backgroundColor: categoryTint(
                            item.category_id,
                            item.kind,
                          ),
                        }}
                      >
                        <EmojiOrIcon
                          value={cat?.icon}
                          fallback="sparkle"
                          size={20}
                        />
                      </View>
                      <View className="flex-1 min-w-0">
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
                            {item.note?.trim() || cat?.name || t('dashboard.genericTransaction')}
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
                          style={{
                            color: c.textMuted,
                            fontSize: 11,
                            marginTop: 1,
                          }}
                        >
                          {cat?.name ??
                            (item.kind === 'income' ? t('common.income') : t('common.uncategorized'))}
                          {paymentLabel(item.payment_method, paymentLabels) ? (
                            <Text>
                              <Text> · </Text>
                              {paymentLabel(item.payment_method, paymentLabels)}
                            </Text>
                          ) : null}
                          <Text> · </Text>
                          {formatTime(item.occurred_at)}
                          {item._sync_state !== 'clean' ? (
                            <Text style={{ color: c.accent }}>
                              {' · '}
                              {t('transactions.syncing', { defaultValue: 'Syncing' })}
                            </Text>
                          ) : null}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text
                          style={{
                            color: item.kind === 'income' ? c.income : c.text,
                            fontSize: 14,
                            fontWeight: '700',
                          }}
                        >
                          {item.kind === 'income' ? '+' : '−'}฿
                          {formatTHB(item.amount)}
                        </Text>
                        {item.fx_currency && item.fx_amount != null ? (
                          <Text
                            style={{ color: c.textMuted, fontSize: 10, marginTop: 1 }}
                          >
                            {currencySymbol(item.fx_currency)}
                            {formatTHB(item.fx_amount)}
                          </Text>
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View className="p-10 items-center">
            <Text style={{ fontSize: 36 }}>🌸</Text>
            <Text style={{ color: c.text, fontSize: 14, marginTop: 8 }}>
              {t('transactions.emptyTitle')}
            </Text>
            <Text
              style={{ color: c.textSecondary, fontSize: 12, marginTop: 4 }}
            >
              {activeFilter
                ? t('transactions.emptyCategory', { defaultValue: 'No transactions in this category — try All' })
                : t('transactions.emptyHint')}
            </Text>
          </View>
        }
      />

      {/* Long-press action sheet — pops up from the bottom with edit /
          duplicate / shortcut / delete actions for the chosen row. */}
      <TransactionActionSheet
        tx={menuTx}
        category={
          menuTx?.category_id ? catById.get(menuTx.category_id) ?? null : null
        }
        colors={c}
        onClose={() => setMenuTx(null)}
        onEdit={() => {
          if (!menuTx) return;
          const id = menuTx.id;
          setMenuTx(null);
          router.push({
            pathname: '/(app)/edit-transaction',
            params: { id },
          });
        }}
        onDuplicate={() => {
          if (!menuTx) return;
          const tx = menuTx;
          setMenuTx(null);
          duplicateTx(tx);
        }}
        onShortcut={async () => {
          if (!menuTx) return;
          const tx = menuTx;
          const cat = tx.category_id ? catById.get(tx.category_id) : null;
          setMenuTx(null);
          try {
            await addShortcut.mutateAsync({
              ledger_id: tx.ledger_id,
              name: tx.note?.trim() || cat?.name || t('dashboard.genericTransaction'),
              icon: cat?.icon ?? null,
              kind: tx.kind,
              amount: tx.amount,
              note: tx.note,
              category_id: tx.category_id,
              payment_method: tx.payment_method,
            });
            Alert.alert(
              t('transactions.shortcutSaved', { defaultValue: 'Shortcut saved' }),
              t('transactions.shortcutHint', { defaultValue: 'Open Quick add and tap the shortcut to use it' }),
            );
          } catch (e) {
            Alert.alert(t('quick.saveFailed'), String((e as Error)?.message ?? e));
          }
        }}
        onDelete={() => {
          if (!menuTx) return;
          const tx = menuTx;
          setMenuTx(null);
          confirmDelete(tx);
        }}
      />
    </SafeAreaView>
  );
}

function TransactionActionSheet({
  tx,
  category,
  colors,
  onClose,
  onEdit,
  onDuplicate,
  onShortcut,
  onDelete,
}: {
  tx: LocalTx | null;
  category: { name: string; icon: string | null; kind: string } | null;
  colors: ReturnType<typeof useTheme>['colors'];
  onClose: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onShortcut: () => void;
  onDelete: () => void;
}) {
  const { t, i18n } = useTranslation();
  if (!tx) {
    // We still render the Modal — visible=false — so React preserves
    // the component identity and the slide animation stays smooth on
    // open.
    return <Modal transparent visible={false} onRequestClose={onClose} />;
  }

  const visible = !!tx;
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const dateStr = formatDay(tx.occurred_at.slice(0, 10) + 'T00:00:00', locale);
  const timeStr = formatTime(tx.occurred_at);
  const sign = tx.kind === 'income' ? '+' : '−';
  const signColor = tx.kind === 'income' ? colors.income : colors.text;

  return (
    <Modal
      transparent
      visible={visible}
      onRequestClose={onClose}
      animationType="slide"
    >
      {/* Tap-outside-to-dismiss backdrop */}
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.45)',
          justifyContent: 'flex-end',
        }}
      >
        {/* Sheet — stop press from bubbling so taps inside don't close */}
        <Pressable
          onPress={() => {
            /* swallow */
          }}
          style={{
            backgroundColor: colors.card,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingTop: 8,
            paddingBottom: 28,
          }}
        >
          {/* Drag handle indicator */}
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

          {/* Transaction header row */}
          <View
            className="flex-row items-center gap-3 px-5 pb-3"
            style={{
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: categoryTint(tx.category_id, tx.kind),
              }}
            >
              <EmojiOrIcon
                value={category?.icon}
                fallback="sparkle"
                size={22}
              />
            </View>
            <View className="flex-1 min-w-0">
              <Text
                numberOfLines={1}
                style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}
              >
                {tx.note?.trim() || category?.name || t('dashboard.genericTransaction')}
              </Text>
              <Text
                style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }}
              >
                {category?.name ?? (tx.kind === 'income' ? t('common.income') : t('common.uncategorized'))}
                {' · '}
                {dateStr} · {timeStr}
              </Text>
            </View>
            <Text
              style={{ color: signColor, fontSize: 15, fontWeight: '700' }}
            >
              {sign}฿{formatTHB(tx.amount)}
            </Text>
          </View>

          {/* Action rows */}
          <SheetRow
            colors={colors}
            emoji="✏️"
            title={t('transactions.editTitle')}
            subtitle={t('transactions.editSheetSubtitle', { defaultValue: 'Amount, category, note' })}
            onPress={onEdit}
          />
          <SheetRow
            colors={colors}
            emoji="📋"
            title={t('transactions.duplicateThis', { defaultValue: 'Duplicate this transaction' })}
            subtitle={t('transactions.duplicateSubtitle', { defaultValue: 'Create a new matching transaction' })}
            onPress={onDuplicate}
          />
          <SheetRow
            colors={colors}
            emoji="⚡️"
            title={t('transactions.saveShortcut', { defaultValue: 'Save as shortcut' })}
            subtitle={t('transactions.saveShortcutSubtitle', { defaultValue: 'One tap to save it next time' })}
            onPress={onShortcut}
          />
          <SheetRow
            colors={colors}
            emoji="🗑"
            title={t('transactions.deleteThisItem')}
            subtitle={t('transactions.deleteSheetSubtitle', { defaultValue: 'Delete permanently' })}
            onPress={onDelete}
            destructive
          />

          {/* Cancel */}
          <View className="px-4 pt-3">
            <Pressable
              onPress={onClose}
              className="py-4 rounded-2xl items-center"
              style={{ backgroundColor: colors.bg }}
            >
              <Text
                style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}
              >
                {t('common.cancel')}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SheetRow({
  colors,
  emoji,
  title,
  subtitle,
  onPress,
  destructive = false,
}: {
  colors: ReturnType<typeof useTheme>['colors'];
  emoji: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 px-5 py-3.5"
      style={{
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <Text style={{ fontSize: 22 }}>{emoji}</Text>
      <View className="flex-1 min-w-0">
        <Text
          style={{
            color: destructive ? colors.expense : colors.text,
            fontSize: 14,
            fontWeight: '600',
          }}
        >
          {title}
        </Text>
        <Text
          style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }}
        >
          {subtitle}
        </Text>
      </View>
      <Text style={{ color: colors.textMuted, fontSize: 18 }}>›</Text>
    </Pressable>
  );
}

function Chip({
  label,
  icon,
  active,
  onPress,
  colors,
}: {
  label: string;
  icon?: string | null;
  active: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  // Filter chips have their own active style — dark brown fill, white
  // text — instead of the theme's accent orange. The mockup uses this
  // to keep the filter row distinct from the rest of the CTA orange.
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: active ? colors.text : colors.card,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
      }}
    >
      {icon ? <EmojiOrIcon value={icon} fallback="sparkle" size={14} /> : null}
      <Text
        style={{
          color: active ? '#FFFFFF' : colors.text,
          fontSize: 12,
          fontWeight: active ? '700' : '600',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
