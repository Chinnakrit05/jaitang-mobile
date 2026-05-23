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
import { currencySymbol } from '../../lib/fx';
import {
  useGoals,
  useGoalProgress,
  useGoalContributions,
  useCreateGoal,
  useUpdateGoal,
  useSetGoalArchived,
  useDeleteGoal,
  useAddGoalContribution,
  useDeleteGoalContribution,
  type Goal,
} from '../../lib/queries/goals';

/**
 * Goals (savings targets) screen. Modeled on accounts.tsx / transfers.tsx:
 * header → list → inline form. Each goal shows a progress bar of
 * contributed-vs-target. Tap a goal → contribution sheet (log + add a
 * deposit). The pencil opens the edit form; long-press archives/deletes.
 *
 * Contributions are a SEPARATE log — adding one never creates a
 * transaction or moves an account balance (matches the web app).
 */

const ICON_PRESETS = ['🎯', '✈️', '🏠', '🚗', '🎓', '💍', '🏖️', '💻', '🎁', '🐷'];
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

function thousands(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function daysLeft(deadline: string | null): number | null {
  if (!deadline) return null;
  const iso = deadline.length <= 10 ? `${deadline}T00:00:00` : deadline;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - today.getTime()) / 86_400_000);
}

function deadlineLabel(deadline: string | null): string | null {
  const n = daysLeft(deadline);
  if (n == null) return null;
  if (n < 0) return `เลยกำหนด ${Math.abs(n)} วัน`;
  if (n === 0) return 'ครบกำหนดวันนี้';
  if (n <= 60) return `เหลือ ${n} วัน`;
  return `เหลือ ${Math.round(n / 30)} เดือน`;
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

export default function GoalsScreen() {
  const c = useTheme().colors;
  const { ledger } = useActiveLedger();
  const sym = currencySymbol(ledger?.currency ?? 'THB');
  const goalsQuery = useGoals(ledger?.id, { includeArchived: true });
  const progress = useGoalProgress(ledger?.id);
  const createMut = useCreateGoal();
  const updateMut = useUpdateGoal();
  const archiveMut = useSetGoalArchived();
  const deleteMut = useDeleteGoal();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string>(ICON_PRESETS[0]);
  const [color, setColor] = useState<string>(COLOR_PRESETS[0]);
  const [target, setTarget] = useState('');
  const [deadline, setDeadline] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Goal whose contribution sheet is open.
  const [contribGoal, setContribGoal] = useState<Goal | null>(null);

  const { active, archived } = useMemo(() => {
    const list = goalsQuery.data ?? [];
    return {
      active: list.filter((g) => !g.archived),
      archived: list.filter((g) => g.archived),
    };
  }, [goalsQuery.data]);

  function resetForm() {
    setName('');
    setIcon(ICON_PRESETS[0]);
    setColor(COLOR_PRESETS[0]);
    setTarget('');
    setDeadline('');
    setError(null);
    setEditingId(null);
  }

  function openCreate() {
    resetForm();
    setShowForm(true);
  }

  function openEdit(g: Goal) {
    setEditingId(g.id);
    setName(g.name);
    setIcon(g.icon ?? ICON_PRESETS[0]);
    setColor(g.color ?? COLOR_PRESETS[0]);
    setTarget(String(g.target_amount));
    setDeadline(g.deadline ? g.deadline.slice(0, 10) : '');
    setError(null);
    setShowForm(true);
  }

  async function save() {
    setError(null);
    if (!ledger) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError('ใส่ชื่อเป้าหมายก่อน');
      return;
    }
    const targetValue = Number(target.replace(/,/g, ''));
    if (!Number.isFinite(targetValue) || targetValue <= 0) {
      setError('ใส่ยอดเป้าหมาย');
      return;
    }
    const deadlineValue = deadline.trim() ? deadline.trim() : null;
    try {
      if (editingId) {
        await updateMut.mutateAsync({
          id: editingId,
          ledger_id: ledger.id,
          name: trimmed,
          icon,
          color,
          target_amount: targetValue,
          deadline: deadlineValue,
        });
      } else {
        await createMut.mutateAsync({
          ledger_id: ledger.id,
          name: trimmed,
          icon,
          color,
          target_amount: targetValue,
          deadline: deadlineValue,
        });
      }
      setShowForm(false);
      resetForm();
    } catch (e) {
      console.error('goal save failed:', e);
      setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    }
  }

  function confirmArchive(g: Goal) {
    Alert.alert(
      g.archived ? 'นำกลับมาใช้?' : 'เก็บเข้าคลัง?',
      g.archived ? `นำ "${g.name}" กลับมาใช้งาน` : `ซ่อน "${g.name}" จากรายการ`,
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: g.archived ? 'นำกลับ' : 'เก็บ',
          onPress: () =>
            archiveMut.mutate({
              id: g.id,
              ledger_id: g.ledger_id,
              archived: !g.archived,
            }),
        },
      ],
    );
  }

  function confirmDelete(g: Goal) {
    Alert.alert('ลบเป้าหมาย?', `"${g.name}" และประวัติการเติมจะถูกลบถาวร`, [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'ลบ',
        style: 'destructive',
        onPress: () => deleteMut.mutate({ id: g.id, ledger_id: g.ledger_id }),
      },
    ]);
  }

  function close() {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/more');
  }

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
            เป้าออม
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

        {goalsQuery.isLoading ? (
          <ActivityIndicator color={c.accent} />
        ) : active.length === 0 && archived.length === 0 ? (
          <View
            className="rounded-2xl p-6 items-center"
            style={{ backgroundColor: c.card, gap: 8 }}
          >
            <Text style={{ fontSize: 28 }}>🎯</Text>
            <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>
              ยังไม่มีเป้าหมาย
            </Text>
            <Text style={{ color: c.textSecondary, fontSize: 12, textAlign: 'center' }}>
              ตั้งเป้าออม (เช่น เที่ยวญี่ปุ่น 50,000) แล้วค่อยๆ เติมเงินเข้าไป
            </Text>
          </View>
        ) : (
          <>
            {active.length > 0 && (
              <View style={{ gap: 10 }}>
                {active.map((g) => (
                  <GoalCard
                    key={g.id}
                    goal={g}
                    saved={progress.data?.get(g.id) ?? 0}
                    sym={sym}
                    colors={c}
                    onPress={() => setContribGoal(g)}
                    onEdit={() => openEdit(g)}
                    onLongPress={() => confirmArchive(g)}
                  />
                ))}
              </View>
            )}

            {archived.length > 0 && (
              <View style={{ gap: 10 }}>
                <Text
                  style={{
                    color: c.textSecondary,
                    fontSize: 11,
                    fontWeight: '800',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    marginLeft: 4,
                  }}
                >
                  เก็บไว้ · {archived.length}
                </Text>
                {archived.map((g) => (
                  <GoalCard
                    key={g.id}
                    goal={g}
                    saved={progress.data?.get(g.id) ?? 0}
                    sym={sym}
                    colors={c}
                    dimmed
                    onPress={() => confirmArchive(g)}
                    onEdit={() => openEdit(g)}
                    onLongPress={() => confirmDelete(g)}
                  />
                ))}
              </View>
            )}
          </>
        )}

        {/* Goal form */}
        {showForm && (
          <View className="rounded-3xl p-4" style={{ backgroundColor: c.card, gap: 12 }}>
            <View className="flex-row items-center justify-between">
              <Text style={{ color: c.text, fontSize: 15, fontWeight: '800' }}>
                {editingId ? 'แก้ไขเป้าหมาย' : 'เป้าหมายใหม่'}
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

            <View>
              <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 4 }}>
                ชื่อเป้าหมาย
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="เช่น เที่ยวญี่ปุ่น, iPhone ใหม่"
                placeholderTextColor={c.textMuted}
                style={inputStyle(c)}
              />
            </View>

            <View>
              <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 4 }}>
                ยอดเป้าหมาย
              </Text>
              <TextInput
                value={target}
                onChangeText={setTarget}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={c.textMuted}
                style={inputStyle(c)}
              />
            </View>

            <View>
              <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 4 }}>
                กำหนดเสร็จ (ไม่บังคับ · YYYY-MM-DD)
              </Text>
              <TextInput
                value={deadline}
                onChangeText={setDeadline}
                placeholder="2026-12-31"
                placeholderTextColor={c.textMuted}
                autoCapitalize="none"
                style={inputStyle(c)}
              />
            </View>

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
                  {editingId ? 'บันทึก' : 'สร้างเป้าหมาย'}
                </Text>
              )}
            </Pressable>

            {editingId && (
              <Pressable
                onPress={() => {
                  const g = (goalsQuery.data ?? []).find((x) => x.id === editingId);
                  if (g) confirmDelete(g);
                }}
                style={{ alignItems: 'center', paddingVertical: 8 }}
              >
                <Text style={{ color: c.expense, fontSize: 12, fontWeight: '700' }}>
                  ลบเป้าหมายนี้
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>

      <ContributionSheet
        goal={contribGoal}
        saved={contribGoal ? progress.data?.get(contribGoal.id) ?? 0 : 0}
        sym={sym}
        colors={c}
        onClose={() => setContribGoal(null)}
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

function GoalCard({
  goal,
  saved,
  sym,
  colors,
  onPress,
  onEdit,
  onLongPress,
  dimmed,
}: {
  goal: Goal;
  saved: number;
  sym: string;
  colors: ReturnType<typeof useTheme>['colors'];
  onPress: () => void;
  onEdit: () => void;
  onLongPress: () => void;
  dimmed?: boolean;
}) {
  const target = goal.target_amount || 0;
  const pct = target > 0 ? Math.min(1, saved / target) : 0;
  const done = pct >= 1;
  const barColor = done ? colors.income : goal.color ?? colors.accent;
  const dueLabel = deadlineLabel(goal.deadline);
  const overdue = (daysLeft(goal.deadline) ?? 1) < 0 && !done;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={300}
      style={{
        padding: 14,
        borderRadius: 18,
        backgroundColor: colors.card,
        opacity: dimmed ? 0.55 : 1,
        gap: 10,
      }}
    >
      <View className="flex-row items-center gap-3">
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 14,
            backgroundColor: (goal.color ?? colors.accent) + '22',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 20 }}>{goal.icon ?? '🎯'}</Text>
        </View>
        <View className="flex-1 min-w-0">
          <Text
            numberOfLines={1}
            style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}
          >
            {goal.name}
          </Text>
          {dueLabel ? (
            <Text
              style={{
                color: overdue ? colors.expense : colors.textSecondary,
                fontSize: 11,
                marginTop: 1,
              }}
            >
              {dueLabel}
            </Text>
          ) : null}
        </View>
        <Pressable onPress={onEdit} hitSlop={8} style={{ padding: 4 }}>
          <Text style={{ fontSize: 15 }}>✏️</Text>
        </Pressable>
      </View>

      {/* Progress bar */}
      <View
        style={{
          height: 10,
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
            backgroundColor: barColor,
          }}
        />
      </View>

      <View className="flex-row items-center justify-between">
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>
          {sym}
          {thousands(saved)}{' '}
          <Text style={{ color: colors.textMuted, fontWeight: '500' }}>
            / {sym}
            {thousands(target)}
          </Text>
        </Text>
        <Text
          style={{
            color: done ? colors.income : colors.textSecondary,
            fontSize: 12,
            fontWeight: '800',
          }}
        >
          {done ? '🎉 สำเร็จ' : `${Math.round(pct * 100)}%`}
        </Text>
      </View>
    </Pressable>
  );
}

function ContributionSheet({
  goal,
  saved,
  sym,
  colors,
  onClose,
}: {
  goal: Goal | null;
  saved: number;
  sym: string;
  colors: ReturnType<typeof useTheme>['colors'];
  onClose: () => void;
}) {
  const contribs = useGoalContributions(goal?.id);
  const addMut = useAddGoalContribution();
  const delMut = useDeleteGoalContribution();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!goal) {
    return <Modal transparent visible={false} onRequestClose={onClose} />;
  }

  const target = goal.target_amount || 0;
  const remaining = Math.max(0, target - saved);

  async function add() {
    setError(null);
    const v = Number(amount.replace(/,/g, ''));
    if (!Number.isFinite(v) || v <= 0) {
      setError('ใส่จำนวนเงิน');
      return;
    }
    try {
      await addMut.mutateAsync({
        goal_id: goal!.id,
        ledger_id: goal!.ledger_id,
        amount: v,
        note: note.trim() || null,
      });
      setAmount('');
      setNote('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    }
  }

  return (
    <Modal transparent visible={!!goal} onRequestClose={onClose} animationType="slide">
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

          <View className="px-5 pb-3">
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>
              {goal.icon ?? '🎯'} {goal.name}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
              ออมแล้ว {sym}
              {thousands(saved)} / {sym}
              {thousands(target)}
              {remaining > 0 ? ` · เหลืออีก ${sym}${thousands(remaining)}` : ' · ครบแล้ว 🎉'}
            </Text>
          </View>

          {/* Add contribution */}
          <View
            className="px-5 py-3"
            style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, gap: 8 }}
          >
            <View className="flex-row gap-8" style={{ gap: 8 }}>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder={`เติมเงิน (${sym})`}
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
                    เติม
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

          {/* Contribution log */}
          <ScrollView style={{ maxHeight: 280 }} contentContainerStyle={{ padding: 16, gap: 8 }}>
            {(contribs.data ?? []).length === 0 ? (
              <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: 'center' }}>
                ยังไม่มีการเติมเงิน — เริ่มออมเลย!
              </Text>
            ) : (
              (contribs.data ?? []).map((ct) => (
                <View
                  key={ct.id}
                  className="flex-row items-center gap-3"
                  style={{
                    backgroundColor: colors.bg,
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    opacity: ct._sync_state !== 'clean' ? 0.7 : 1,
                  }}
                >
                  <View className="flex-1 min-w-0">
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>
                      +{sym}
                      {thousands(ct.amount)}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }}>
                      {ct.occurred_at.slice(0, 10)}
                      {ct.note ? ` · ${ct.note}` : ''}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() =>
                      Alert.alert('ลบรายการเติม?', `+${sym}${thousands(ct.amount)}`, [
                        { text: 'ยกเลิก', style: 'cancel' },
                        {
                          text: 'ลบ',
                          style: 'destructive',
                          onPress: () =>
                            delMut.mutate({ id: ct.id, ledger_id: ct.ledger_id }),
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
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>
                ปิด
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
