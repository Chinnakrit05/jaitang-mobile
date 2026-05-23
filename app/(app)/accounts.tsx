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
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_META,
  useAccountBalances,
  useAccounts,
  useCreateAccount,
  useDeleteAccount,
  useSetAccountArchived,
  useUpdateAccount,
  type Account,
  type AccountType,
} from '../../lib/queries/accounts';
import { currencySymbol } from '../../lib/fx';

/**
 * Accounts screen — CRUD for the user's wallets (cash, bank, credit
 * card, e-wallet).
 *
 * Reads come from the local SQLite mirror so the list survives offline.
 * Writes hit `create_account` / `update_account` / `set_account_archived`
 * / `delete_account` SECURITY DEFINER RPCs; the mutation hook refreshes
 * the local mirror before invalidating React Query so the row appears
 * immediately. Each row's current balance is computed locally as
 * `initial + Σ income − Σ expense` across the account's transactions.
 *
 * Layout:
 *   1. Header (back + title + "+ Add").
 *   2. Active accounts — non-archived, sorted by created_at. Selected
 *      account shows accent border + edit/delete actions.
 *   3. Archived accounts — only rendered if any exist.
 *   4. Inline form (toggleable) — name, type, icon, color, initial
 *      balance, currency.
 *
 * Tap row → select for editing. Long-press → archive (active) or delete
 * (archived).
 */

const ICON_PRESETS = ['💵', '🏦', '💳', '📱', '💰', '🪙', '🏧', '💴'];
const COLOR_PRESETS = [
  '#34D399',
  '#60A5FA',
  '#A78BFA',
  '#FBBF24',
  '#FB923C',
  '#FF7BAC',
  '#D98556',
  '#10B981',
];
const CURRENCY_PRESETS = ['THB', 'USD', 'JPY', 'EUR', 'KRW'];

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

function thousands(n: number): string {
  const fixed = Math.round(n).toString();
  return fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export default function AccountsScreen() {
  const c = useTheme().colors;
  const { ledger } = useActiveLedger();
  const accountsQuery = useAccounts(ledger?.id, { includeArchived: true });
  const balances = useAccountBalances(ledger?.id);
  const createMut = useCreateAccount();
  const updateMut = useUpdateAccount();
  const archiveMut = useSetAccountArchived();
  const deleteMut = useDeleteAccount();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('cash');
  const [icon, setIcon] = useState<string>(ICON_PRESETS[0]);
  const [color, setColor] = useState<string>(COLOR_PRESETS[0]);
  const [initialBalance, setInitialBalance] = useState('0');
  const [currency, setCurrency] = useState<string>(
    ledger?.currency ?? 'THB',
  );
  const [error, setError] = useState<string | null>(null);

  const { active, archived } = useMemo(() => {
    const list = accountsQuery.data ?? [];
    return {
      active: list.filter((a) => !a.archived),
      archived: list.filter((a) => a.archived),
    };
  }, [accountsQuery.data]);

  function resetForm() {
    setName('');
    setType('cash');
    setIcon(ICON_PRESETS[0]);
    setColor(COLOR_PRESETS[0]);
    setInitialBalance('0');
    setCurrency(ledger?.currency ?? 'THB');
    setError(null);
    setEditingId(null);
  }

  function openCreate() {
    resetForm();
    setShowForm(true);
  }

  function openEdit(acc: Account) {
    setEditingId(acc.id);
    setName(acc.name);
    setType(acc.type);
    setIcon(acc.icon ?? ICON_PRESETS[0]);
    setColor(acc.color ?? COLOR_PRESETS[0]);
    setInitialBalance(String(acc.initial_balance));
    setCurrency(acc.currency ?? ledger?.currency ?? 'THB');
    setShowForm(true);
    setError(null);
  }

  async function save() {
    setError(null);
    if (!ledger) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError('ใส่ชื่อบัญชีก่อน');
      return;
    }
    const balValue = Number(initialBalance.replace(/,/g, ''));
    if (!Number.isFinite(balValue)) {
      setError('ยอดเริ่มต้นไม่ถูกต้อง');
      return;
    }
    try {
      if (editingId) {
        await updateMut.mutateAsync({
          id: editingId,
          ledger_id: ledger.id,
          name: trimmed,
          type,
          icon,
          color,
          initial_balance: balValue,
          currency,
        });
      } else {
        await createMut.mutateAsync({
          ledger_id: ledger.id,
          name: trimmed,
          type,
          icon,
          color,
          initial_balance: balValue,
          currency,
        });
      }
      setShowForm(false);
      resetForm();
    } catch (e) {
      console.error('account save failed:', e);
      setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    }
  }

  function confirmArchive(acc: Account) {
    Alert.alert(
      acc.archived ? 'นำกลับมาใช้?' : 'เก็บเข้าคลัง?',
      acc.archived
        ? `นำ "${acc.name}" กลับมาใช้งาน`
        : `"${acc.name}" จะถูกซ่อนจากตัวเลือกบัญชี แต่ประวัติยังอยู่ครบ`,
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: acc.archived ? 'นำกลับ' : 'เก็บ',
          onPress: () =>
            archiveMut.mutate({
              id: acc.id,
              ledger_id: acc.ledger_id,
              archived: !acc.archived,
            }),
        },
      ],
    );
  }

  function confirmDelete(acc: Account) {
    Alert.alert(
      'ลบบัญชี?',
      `"${acc.name}" จะถูกลบถาวร รายการที่อ้างอิงบัญชีนี้จะไม่มีบัญชีอีก`,
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'ลบ',
          style: 'destructive',
          onPress: () =>
            deleteMut.mutate({ id: acc.id, ledger_id: acc.ledger_id }),
        },
      ],
    );
  }

  function close() {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/more');
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
            <ChevronLeftIcon color={c.text} size={20} />
          </Pressable>
          <Text style={{ color: c.text, fontSize: 17, fontWeight: '700' }}>
            บัญชี / กระเป๋า
          </Text>
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

        {/* Active accounts */}
        {accountsQuery.isLoading ? (
          <ActivityIndicator color={c.accent} />
        ) : active.length === 0 && archived.length === 0 ? (
          <View
            className="rounded-2xl p-6 items-center"
            style={{ backgroundColor: c.card, gap: 8 }}
          >
            <Text style={{ fontSize: 28 }}>💰</Text>
            <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>
              ยังไม่มีบัญชี
            </Text>
            <Text style={{ color: c.textSecondary, fontSize: 12, textAlign: 'center' }}>
              สร้างบัญชีแรก (เงินสด, ธนาคาร, ฯลฯ) เพื่อแยกยอดเงิน
            </Text>
          </View>
        ) : (
          <>
            {active.length > 0 && (
              <View>
                <Text
                  style={{
                    color: c.textSecondary,
                    fontSize: 11,
                    fontWeight: '800',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    marginBottom: 8,
                    marginLeft: 4,
                  }}
                >
                  ใช้งาน · {active.length}
                </Text>
                <View style={{ gap: 8 }}>
                  {active.map((acc) => (
                    <AccountRow
                      key={acc.id}
                      account={acc}
                      balance={balances.data?.get(acc.id) ?? acc.initial_balance}
                      selected={editingId === acc.id}
                      colors={c}
                      onPress={() => openEdit(acc)}
                      onLongPress={() => confirmArchive(acc)}
                    />
                  ))}
                </View>
              </View>
            )}

            {archived.length > 0 && (
              <View>
                <Text
                  style={{
                    color: c.textSecondary,
                    fontSize: 11,
                    fontWeight: '800',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    marginBottom: 8,
                    marginLeft: 4,
                  }}
                >
                  เก็บไว้ · {archived.length}
                </Text>
                <View style={{ gap: 8 }}>
                  {archived.map((acc) => (
                    <AccountRow
                      key={acc.id}
                      account={acc}
                      balance={balances.data?.get(acc.id) ?? acc.initial_balance}
                      selected={editingId === acc.id}
                      colors={c}
                      onPress={() => confirmArchive(acc)}
                      onLongPress={() => confirmDelete(acc)}
                      dimmed
                    />
                  ))}
                </View>
              </View>
            )}
          </>
        )}

        {/* Form */}
        {showForm && (
          <View
            className="rounded-3xl p-4"
            style={{ backgroundColor: c.card, gap: 12 }}
          >
            <View className="flex-row items-center justify-between">
              <Text style={{ color: c.text, fontSize: 15, fontWeight: '800' }}>
                {editingId ? 'แก้ไขบัญชี' : 'บัญชีใหม่'}
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

            {/* Name */}
            <View>
              <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 4 }}>
                ชื่อบัญชี
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="เช่น เงินสด, SCB Easy, TrueMoney"
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

            {/* Type */}
            <View>
              <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 6 }}>
                ประเภท
              </Text>
              <View className="flex-row flex-wrap" style={{ marginHorizontal: -3 }}>
                {ACCOUNT_TYPES.map((t) => {
                  const sel = type === t;
                  return (
                    <View key={t} style={{ width: '50%', padding: 3 }}>
                      <Pressable
                        onPress={() => {
                          setType(t);
                          setIcon(ACCOUNT_TYPE_META[t].icon);
                        }}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 8,
                          paddingVertical: 10,
                          paddingHorizontal: 10,
                          borderRadius: 12,
                          backgroundColor: sel ? c.accentSoft : c.bg,
                          borderWidth: 1,
                          borderColor: sel ? c.accent : 'transparent',
                        }}
                      >
                        <Text style={{ fontSize: 16 }}>
                          {ACCOUNT_TYPE_META[t].icon}
                        </Text>
                        <Text
                          numberOfLines={1}
                          style={{
                            color: c.text,
                            fontSize: 12,
                            fontWeight: sel ? '800' : '600',
                          }}
                        >
                          {ACCOUNT_TYPE_META[t].label}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* Icon */}
            <View>
              <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 6 }}>
                ไอคอน
              </Text>
              <View className="flex-row flex-wrap" style={{ marginHorizontal: -3 }}>
                {ICON_PRESETS.map((emoji) => {
                  const sel = icon === emoji;
                  return (
                    <Pressable
                      key={emoji}
                      onPress={() => setIcon(emoji)}
                      style={{
                        width: 40,
                        height: 40,
                        marginHorizontal: 3,
                        marginVertical: 3,
                        borderRadius: 20,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: sel ? c.accent : c.bg,
                        borderWidth: 1,
                        borderColor: sel ? c.accent : c.border,
                      }}
                    >
                      <Text style={{ fontSize: 18 }}>{emoji}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Color */}
            <View>
              <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 6 }}>
                สี
              </Text>
              <View className="flex-row flex-wrap" style={{ marginHorizontal: -3 }}>
                {COLOR_PRESETS.map((hex) => {
                  const sel = color === hex;
                  return (
                    <Pressable
                      key={hex}
                      onPress={() => setColor(hex)}
                      style={{
                        width: 32,
                        height: 32,
                        marginHorizontal: 3,
                        marginVertical: 3,
                        borderRadius: 16,
                        backgroundColor: hex,
                        borderWidth: sel ? 3 : 1,
                        borderColor: sel ? c.text : c.border,
                      }}
                    />
                  );
                })}
              </View>
            </View>

            {/* Initial balance */}
            <View>
              <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 4 }}>
                ยอดเริ่มต้น
              </Text>
              <TextInput
                value={initialBalance}
                onChangeText={setInitialBalance}
                keyboardType="decimal-pad"
                placeholder="0"
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
              <Text style={{ color: c.textMuted, fontSize: 10, marginTop: 4 }}>
                ใส่ยอดที่มีอยู่ก่อนเริ่มจดในแอป
              </Text>
            </View>

            {/* Currency */}
            <View>
              <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 6 }}>
                สกุลเงิน
              </Text>
              <View className="flex-row flex-wrap" style={{ marginHorizontal: -3 }}>
                {CURRENCY_PRESETS.map((cur) => {
                  const sel = currency === cur;
                  return (
                    <Pressable
                      key={cur}
                      onPress={() => setCurrency(cur)}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        marginHorizontal: 3,
                        marginVertical: 3,
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
                        {cur}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {error && (
              <Text style={{ color: c.expense, fontSize: 12 }}>{error}</Text>
            )}

            <Pressable
              onPress={save}
              disabled={createMut.isPending || updateMut.isPending}
              style={{
                backgroundColor: c.accent,
                paddingVertical: 14,
                borderRadius: 999,
                alignItems: 'center',
                opacity: createMut.isPending || updateMut.isPending ? 0.6 : 1,
              }}
            >
              {createMut.isPending || updateMut.isPending ? (
                <ActivityIndicator color={c.accentText} />
              ) : (
                <Text style={{ color: c.accentText, fontSize: 14, fontWeight: '800' }}>
                  {editingId ? 'บันทึก' : 'สร้างบัญชี'}
                </Text>
              )}
            </Pressable>

            {editingId && (
              <Pressable
                onPress={() => {
                  const acc = (accountsQuery.data ?? []).find(
                    (a) => a.id === editingId,
                  );
                  if (acc) confirmDelete(acc);
                }}
                style={{ alignItems: 'center', paddingVertical: 8 }}
              >
                <Text style={{ color: c.expense, fontSize: 12, fontWeight: '700' }}>
                  ลบบัญชีนี้
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function AccountRow({
  account,
  balance,
  selected,
  colors,
  onPress,
  onLongPress,
  dimmed,
}: {
  account: Account;
  balance: number;
  selected: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
  onPress: () => void;
  onLongPress: () => void;
  dimmed?: boolean;
}) {
  const tint = (account.color ?? colors.accent) + '22';
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        borderRadius: 18,
        backgroundColor: colors.card,
        borderWidth: 1.5,
        borderColor: selected ? colors.accent : 'transparent',
        opacity: dimmed ? 0.55 : 1,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          backgroundColor: tint,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 22 }}>{account.icon ?? '💰'}</Text>
      </View>
      <View className="flex-1 min-w-0">
        <Text
          numberOfLines={1}
          style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}
        >
          {account.name}
        </Text>
        <Text
          numberOfLines={1}
          style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}
        >
          {ACCOUNT_TYPE_META[account.type].label}
          {account.currency ? ` · ${account.currency}` : ''}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text
          style={{
            color: balance < 0 ? colors.expense : colors.text,
            fontSize: 14,
            fontWeight: '800',
          }}
        >
          {balance < 0 ? '-' : ''}
          {currencySymbol(account.currency ?? 'THB')}
          {thousands(Math.abs(balance))}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>
          คงเหลือ
        </Text>
      </View>
    </Pressable>
  );
}
