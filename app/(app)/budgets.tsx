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
import { useTranslation } from 'react-i18next';
import Svg, { Path } from 'react-native-svg';

import { useActiveLedger } from '../../providers/ActiveLedgerProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { useCategories } from '../../lib/queries/categories';
import {
  monthKey,
  moveMonth,
  MONTHLY_BUDGET_PERIOD,
  useBudgets,
  useCategorySpend,
  useDeleteBudget,
  useUpsertBudget,
  type Budget,
} from '../../lib/queries/budgets';
import { EmojiOrIcon } from '../../components/icons/EmojiOrIcon';

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

function ChevronRightIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 6l6 6-6 6"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function formatAmount(n: number) {
  return Math.round(Math.abs(n)).toLocaleString('en-US');
}

function periodLabel(period: string, locale: string) {
  const [year, month] = period.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, (month || 1) - 1, 1));
}

export default function BudgetsScreen() {
  const { t, i18n } = useTranslation();
  const c = useTheme().colors;
  const { ledger } = useActiveLedger();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const [period, setPeriod] = useState(monthKey());
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  const cats = useCategories(ledger?.id);
  const budgets = useBudgets(ledger?.id, MONTHLY_BUDGET_PERIOD);
  const spend = useCategorySpend(ledger?.id, period);
  const upsert = useUpsertBudget();
  const del = useDeleteBudget();

  const parentExpenseCats = useMemo(
    () =>
      (cats.data ?? [])
        .filter((cat) => cat.kind === 'expense' && !cat.parent_id)
        .sort((a, b) => a.sort_order - b.sort_order),
    [cats.data],
  );

  const budgetByCategory = useMemo(
    () => new Map((budgets.data ?? []).map((b) => [b.category_id, b])),
    [budgets.data],
  );
  const editingCategory = useMemo(
    () =>
      parentExpenseCats.find((cat) => cat.id === editingCategoryId) ?? null,
    [editingCategoryId, parentExpenseCats],
  );

  const totalBudget = (budgets.data ?? []).reduce((s, b) => s + b.amount, 0);
  const totalSpent = [...(spend.data ?? new Map()).values()].reduce(
    (s, v) => s + v,
    0,
  );

  function openEdit(categoryId: string, existing?: Budget) {
    setEditingCategoryId(categoryId);
    setAmount(existing ? String(Math.round(existing.amount)) : '');
    setError(null);
  }

  function closeForm() {
    setEditingCategoryId(null);
    setAmount('');
    setError(null);
  }

  async function save() {
    if (!ledger || !editingCategoryId) return;
    const value = Number(amount.replace(/,/g, ''));
    if (!Number.isFinite(value) || value <= 0) {
      setError(t('budgets.amountRequired', { defaultValue: 'Enter a budget amount' }));
      return;
    }
    try {
      await upsert.mutateAsync({
        ledger_id: ledger.id,
        category_id: editingCategoryId,
        amount: value,
        period: MONTHLY_BUDGET_PERIOD,
      });
      closeForm();
    } catch (e) {
      console.error('budget save failed:', e);
      setError(e instanceof Error ? e.message : t('budgets.saveFailed', { defaultValue: 'Save failed' }));
    }
  }

  function confirmDelete(budget: Budget) {
    Alert.alert(
      t('budgets.deleteTitle', { defaultValue: 'Delete budget?' }),
      t('budgets.deleteHint', {
        defaultValue: 'This only removes the budget. Transactions stay untouched.',
      }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            if (!ledger) return;
            del.mutate({ id: budget.id, ledger_id: ledger.id });
          },
        },
      ],
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
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 96, gap: 14 }}>
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
          <View className="items-center">
            <Text style={{ color: c.text, fontSize: 17, fontWeight: '800' }}>
              {t('budgets.title')}
            </Text>
            <Text style={{ color: c.textSecondary, fontSize: 11, marginTop: 1 }}>
              {periodLabel(period, locale)}
            </Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        <View
          className="rounded-3xl p-4"
          style={{ backgroundColor: c.cardElevated, gap: 12 }}
        >
          <Text style={{ color: c.textSecondary, fontSize: 12 }}>
            {t('budgets.subtitle')}
          </Text>
          <View className="flex-row gap-2">
            <SummaryPill
              label={t('budgets.totalBudget', { defaultValue: 'Budget' })}
              value={`฿${formatAmount(totalBudget)}`}
              colors={c}
            />
            <SummaryPill
              label={t('budgets.totalSpent', { defaultValue: 'Spent' })}
              value={`฿${formatAmount(totalSpent)}`}
              colors={c}
            />
          </View>
          <View className="flex-row items-center justify-between">
            <Pressable
              onPress={() => setPeriod(moveMonth(period, -1))}
              className="px-3 py-2 rounded-full"
              style={{ backgroundColor: c.chip }}
            >
              <ChevronLeftIcon color={c.text} size={16} />
            </Pressable>
            <Pressable
              onPress={() => setPeriod(monthKey())}
              className="px-4 py-2 rounded-full"
              style={{ backgroundColor: c.chip }}
            >
              <Text style={{ color: c.text, fontSize: 12, fontWeight: '700' }}>
                {t('common.today')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setPeriod(moveMonth(period, 1))}
              className="px-3 py-2 rounded-full"
              style={{ backgroundColor: c.chip }}
            >
              <ChevronRightIcon color={c.text} size={16} />
            </Pressable>
          </View>
        </View>

        {cats.isLoading || budgets.isLoading || spend.isLoading ? (
          <ActivityIndicator color={c.accent} />
        ) : parentExpenseCats.length === 0 ? (
          <View
            className="rounded-2xl p-8 items-center"
            style={{ backgroundColor: c.card }}
          >
            <Text style={{ fontSize: 32 }}>🏷</Text>
            <Text style={{ color: c.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 8 }}>
              {t('budgets.empty')}
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {parentExpenseCats.map((cat) => {
              const budget = budgetByCategory.get(cat.id);
              const spent = spend.data?.get(cat.id) ?? 0;
              return (
                <BudgetRow
                  key={cat.id}
                  category={cat}
                  budget={budget}
                  spent={spent}
                  colors={c}
                  onEdit={() => openEdit(cat.id, budget)}
                  onDelete={budget ? () => confirmDelete(budget) : undefined}
                  t={t}
                />
              );
            })}
          </View>
        )}
      </ScrollView>

      {editingCategoryId && (
        <View
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: 16,
            backgroundColor: c.card,
            borderRadius: 24,
            padding: 14,
            borderWidth: 1,
            borderColor: c.border,
            shadowColor: '#000000',
            shadowOpacity: 0.16,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 8 },
            elevation: 8,
          }}
        >
          <View className="flex-row items-center gap-3">
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 14,
                backgroundColor: (editingCategory?.color ?? c.accent) + '22',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <EmojiOrIcon
                value={editingCategory?.icon}
                fallback="sparkle"
                size={20}
              />
            </View>
            <View className="flex-1 min-w-0">
              <Text style={{ color: c.textSecondary, fontSize: 11, fontWeight: '700' }}>
                {t('budgets.setBudget')}
              </Text>
              <Text
                numberOfLines={1}
                style={{ color: c.text, fontSize: 16, fontWeight: '800', marginTop: 1 }}
              >
                {editingCategory?.name ?? t('common.category')}
              </Text>
            </View>
          </View>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={c.textMuted}
            style={{
              marginTop: 10,
              backgroundColor: c.bg,
              color: c.text,
              fontSize: 22,
              fontWeight: '800',
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 14,
            }}
          />
          {error && (
            <Text style={{ color: c.expense, fontSize: 12, marginTop: 8 }}>
              {error}
            </Text>
          )}
          <View className="flex-row gap-2 mt-3">
            <Pressable
              onPress={closeForm}
              className="flex-1 py-3 rounded-full items-center"
              style={{ backgroundColor: c.chip }}
            >
              <Text style={{ color: c.text, fontSize: 13, fontWeight: '700' }}>
                {t('common.cancel')}
              </Text>
            </Pressable>
            <Pressable
              onPress={save}
              disabled={upsert.isPending}
              className="flex-1 py-3 rounded-full items-center"
              style={{ backgroundColor: c.accent, opacity: upsert.isPending ? 0.6 : 1 }}
            >
              {upsert.isPending ? (
                <ActivityIndicator color={c.accentText} />
              ) : (
                <Text style={{ color: c.accentText, fontSize: 13, fontWeight: '800' }}>
                  {t('common.save')}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

function SummaryPill({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <View
      className="flex-1 rounded-2xl px-3 py-2"
      style={{ backgroundColor: colors.chip }}
    >
      <Text style={{ color: colors.textSecondary, fontSize: 11 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 2 }}>
        {value}
      </Text>
    </View>
  );
}

function BudgetRow({
  category,
  budget,
  spent,
  colors,
  onEdit,
  onDelete,
  t,
}: {
  category: { name: string; icon: string | null; color: string | null };
  budget?: Budget;
  spent: number;
  colors: ReturnType<typeof useTheme>['colors'];
  onEdit: () => void;
  onDelete?: () => void;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  const amount = budget?.amount ?? 0;
  const pct = amount > 0 ? Math.round((spent / amount) * 100) : 0;
  const width = Math.min(100, pct);
  const barColor =
    pct >= 100 ? colors.expense : pct >= 80 ? colors.accent : colors.income;
  const status =
    amount <= 0
      ? t('budgets.notSet', { defaultValue: 'Not set' })
      : spent > amount
        ? t('budgets.overBudget', { amount: `฿${formatAmount(spent - amount)}` })
        : pct >= 80
          ? t('budgets.nearBudget', { pct })
          : t('budgets.remaining', { amount: `฿${formatAmount(amount - spent)}` });

  return (
    <Pressable
      onPress={onEdit}
      onLongPress={onDelete}
      className="rounded-2xl p-4"
      style={{ backgroundColor: colors.card, gap: 10 }}
    >
      <View className="flex-row items-center gap-3">
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 14,
            backgroundColor: (category.color ?? colors.accent) + '22',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <EmojiOrIcon value={category.icon} fallback="sparkle" size={22} />
        </View>
        <View className="flex-1 min-w-0">
          <Text numberOfLines={1} style={{ color: colors.text, fontSize: 14, fontWeight: '800' }}>
            {category.name}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
            {amount > 0
              ? `฿${formatAmount(spent)} / ฿${formatAmount(amount)}`
              : `฿${formatAmount(spent)} · ${t('budgets.tapToSet', { defaultValue: 'tap to set' })}`}
          </Text>
        </View>
        <Text style={{ color: barColor, fontSize: 12, fontWeight: '800' }}>
          {amount > 0 ? `${pct}%` : '—'}
        </Text>
      </View>
      <View className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: colors.bg }}>
        <View
          className="h-2 rounded-full"
          style={{ width: `${width}%`, backgroundColor: barColor }}
        />
      </View>
      <View className="flex-row items-center justify-between">
        <Text style={{ color: amount > 0 ? barColor : colors.textMuted, fontSize: 12, fontWeight: '700' }}>
          {status}
        </Text>
        {budget && onDelete ? (
          <Pressable onPress={onDelete} hitSlop={8}>
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700' }}>
              {t('common.delete')}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}
