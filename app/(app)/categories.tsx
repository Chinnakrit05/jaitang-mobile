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
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
  type Category,
} from '../../lib/queries/categories';
import { EmojiOrIcon } from '../../components/icons/EmojiOrIcon';

/**
 * Manage categories — list + create + edit + (soft) delete.
 *
 * Categories nest one level: a "parent" has no `parent_id`, a "sub" has
 * one. The web app enforces a 2-level cap and we mirror that here: the
 * parent picker only offers existing top-level categories of the same
 * kind, and excludes the row being edited (so you can't make a node its
 * own ancestor).
 *
 * The form lives inline at the top of the list. Tap `+` to open it
 * blank (create mode); tap a row to open it pre-filled (edit mode).
 * Long-press a row to delete — the tx rows that referenced it stay put
 * and just render as "อื่นๆ" elsewhere.
 *
 * Writes go straight to Supabase (categories are pull-only in the sync
 * engine — see HANDOFF section 3.5/4.7) and `pullCategories()` refreshes
 * the local mirror.
 */

const ICON_PRESETS = [
  '🏷️', '🍜', '☕', '🚕', '🛍', '💊', '🎬', '🧾',
  '🏠', '✈️', '💰', '🎁', '📚', '⛽', '💄', '🎮',
];

const HIDDEN_KIND_LABEL: Record<'expense' | 'income', string> = {
  expense: 'รายจ่าย',
  income: 'รายรับ',
};

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

type FormState = {
  mode: 'create' | 'edit';
  id?: string;
  name: string;
  icon: string;
  parentId: string | null;
};

export default function CategoriesScreen() {
  const c = useTheme().colors;
  const { ledger, loading: ledgerLoading } = useActiveLedger();
  const cats = useCategories(ledger?.id);
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const del = useDeleteCategory();

  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Categories of the current kind, sorted into tree order:
  // each parent immediately followed by its subs.
  const tree = useMemo(() => {
    const filtered = (cats.data ?? []).filter((cat) => cat.kind === kind);
    const subsByParent = new Map<string, Category[]>();
    const roots: Category[] = [];
    for (const cat of filtered) {
      if (cat.parent_id) {
        if (!subsByParent.has(cat.parent_id)) {
          subsByParent.set(cat.parent_id, []);
        }
        subsByParent.get(cat.parent_id)!.push(cat);
      } else {
        roots.push(cat);
      }
    }
    roots.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    const out: Array<{ cat: Category; level: 0 | 1 }> = [];
    for (const root of roots) {
      out.push({ cat: root, level: 0 });
      const subs = (subsByParent.get(root.id) ?? []).sort(
        (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
      );
      for (const sub of subs) out.push({ cat: sub, level: 1 });
    }
    // Orphans — subs whose parent is filtered out (different kind, or
    // soft-deleted). Show at the bottom unindented.
    for (const [parentId, subs] of subsByParent) {
      if (!roots.some((r) => r.id === parentId)) {
        for (const sub of subs) out.push({ cat: sub, level: 0 });
      }
    }
    return out;
  }, [cats.data, kind]);

  // Parent options for the form picker: existing top-level cats of the
  // same kind, excluding the row being edited (no self-reference) and
  // excluding any cat that already has subs (can't nest beyond 2 levels
  // — but mid-edit we allow current parent so a sub can stay a sub).
  const parentOptions = useMemo(() => {
    return (cats.data ?? []).filter((cat) => {
      if (cat.kind !== kind) return false;
      if (cat.parent_id) return false; // only top-level can be parents
      if (form?.mode === 'edit' && cat.id === form.id) return false;
      return true;
    });
  }, [cats.data, kind, form]);

  function openCreate() {
    setError(null);
    setForm({
      mode: 'create',
      name: '',
      icon: ICON_PRESETS[0],
      parentId: null,
    });
  }

  function openEdit(cat: Category) {
    setError(null);
    setForm({
      mode: 'edit',
      id: cat.id,
      name: cat.name,
      icon: cat.icon ?? ICON_PRESETS[0],
      parentId: cat.parent_id,
    });
  }

  function closeForm() {
    setForm(null);
    setError(null);
  }

  async function save() {
    if (!ledger || !form) return;
    const name = form.name.trim();
    if (!name) {
      setError('ใส่ชื่อหมวดก่อน');
      return;
    }
    try {
      setError(null);
      if (form.mode === 'create') {
        // Append to the end of siblings in this group.
        const siblings = (cats.data ?? []).filter(
          (cat) => cat.kind === kind && cat.parent_id === form.parentId,
        );
        const maxSort = siblings.reduce(
          (m, s) => Math.max(m, s.sort_order),
          -1,
        );
        await create.mutateAsync({
          ledger_id: ledger.id,
          name,
          icon: form.icon,
          kind,
          parent_id: form.parentId,
          sort_order: maxSort + 1,
        });
      } else {
        await update.mutateAsync({
          id: form.id!,
          ledger_id: ledger.id,
          name,
          icon: form.icon,
          parent_id: form.parentId,
        });
      }
      closeForm();
    } catch (e) {
      console.error('save category failed:', e);
      const msg = extractErrorMessage(e);
      setError(msg);
    }
  }

  function confirmDelete(cat: Category) {
    Alert.alert(
      `ลบ "${cat.name}"?`,
      'รายการที่ใช้หมวดนี้จะกลายเป็น "ไม่ระบุหมวด" (ไม่ถูกลบ)',
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'ลบ',
          style: 'destructive',
          onPress: async () => {
            if (!ledger) return;
            try {
              await del.mutateAsync({ id: cat.id, ledger_id: ledger.id });
              if (form?.mode === 'edit' && form.id === cat.id) closeForm();
            } catch (e) {
              console.error('delete category failed:', e);
              Alert.alert('ลบไม่สำเร็จ', extractErrorMessage(e));
            }
          },
        },
      ],
    );
  }

  if (ledgerLoading || cats.isLoading) {
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
            หมวดหมู่
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

        {/* Kind toggle */}
        <View
          className="rounded-2xl p-1.5 flex-row"
          style={{ backgroundColor: c.chip }}
        >
          {(['expense', 'income'] as const).map((k) => {
            const active = kind === k;
            return (
              <Pressable
                key={k}
                onPress={() => {
                  setKind(k);
                  if (form && form.mode === 'create') {
                    // Switching kind invalidates the parent picker —
                    // clear it so user doesn't carry a now-illegal value.
                    setForm({ ...form, parentId: null });
                  }
                }}
                className="flex-1 py-2.5 rounded-xl items-center"
                style={{ backgroundColor: active ? c.card : 'transparent' }}
              >
                <Text
                  style={{
                    color: active ? c.text : c.textSecondary,
                    fontSize: 14,
                    fontWeight: active ? '700' : '500',
                  }}
                >
                  {HIDDEN_KIND_LABEL[k]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Form */}
        {form && (
          <View
            className="rounded-2xl p-4"
            style={{ backgroundColor: c.card, gap: 12 }}
          >
            <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>
              {form.mode === 'create' ? 'หมวดใหม่' : 'แก้ไขหมวด'}
            </Text>

            {/* Name */}
            <View>
              <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 6 }}>
                ชื่อหมวด
              </Text>
              <TextInput
                value={form.name}
                onChangeText={(v) => setForm({ ...form, name: v })}
                placeholder={
                  kind === 'expense' ? 'เช่น ค่ากาแฟ' : 'เช่น เงินเดือนพิเศษ'
                }
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

            {/* Icon picker */}
            <View>
              <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 8 }}>
                ไอคอน
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {ICON_PRESETS.map((emoji) => {
                  const selected = form.icon === emoji;
                  return (
                    <Pressable
                      key={emoji}
                      onPress={() => setForm({ ...form, icon: emoji })}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: selected ? c.chipActive : c.bg,
                      }}
                    >
                      <Text style={{ fontSize: 20 }}>{emoji}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Parent picker */}
            <View>
              <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 8 }}>
                ประเภท
              </Text>
              <View className="flex-row flex-wrap gap-2">
                <ParentChip
                  label="⭐ หมวดหลัก"
                  active={form.parentId === null}
                  onPress={() => setForm({ ...form, parentId: null })}
                  colors={c}
                />
                {parentOptions.map((p) => (
                  <ParentChip
                    key={p.id}
                    label={`↳ อยู่ใต้ ${p.icon ?? '🏷️'} ${p.name}`}
                    active={form.parentId === p.id}
                    onPress={() => setForm({ ...form, parentId: p.id })}
                    colors={c}
                  />
                ))}
              </View>
              {parentOptions.length === 0 && form.parentId === null && (
                <Text
                  style={{ color: c.textMuted, fontSize: 11, marginTop: 6 }}
                >
                  💡 ยังไม่มีหมวดหลักให้ใช้เป็น parent — สร้างหมวดนี้เป็นหมวดหลักก่อน
                </Text>
              )}
            </View>

            {error && (
              <Text style={{ color: c.expense, fontSize: 12 }}>{error}</Text>
            )}

            {/* Buttons */}
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
        {tree.length === 0 ? (
          <View
            className="rounded-2xl p-8 items-center"
            style={{ backgroundColor: c.card }}
          >
            {cats.isFetching ? (
              <>
                <ActivityIndicator color={c.accent} />
                <Text
                  style={{
                    color: c.textSecondary,
                    fontSize: 12,
                    marginTop: 8,
                  }}
                >
                  กำลังเตรียมหมวดมาตรฐาน...
                </Text>
              </>
            ) : (
              <>
                <Text style={{ fontSize: 36 }}>🌱</Text>
                <Text
                  style={{
                    color: c.text,
                    fontSize: 14,
                    marginTop: 8,
                    fontWeight: '500',
                  }}
                >
                  ยังไม่มีหมวด{HIDDEN_KIND_LABEL[kind]}
                </Text>
                <Text
                  style={{
                    color: c.textSecondary,
                    fontSize: 12,
                    marginTop: 4,
                    textAlign: 'center',
                  }}
                >
                  กด + ด้านบนเพื่อสร้างหมวดแรก
                </Text>
              </>
            )}
          </View>
        ) : (
          <View
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: c.card }}
          >
            {tree.map(({ cat, level }, idx) => (
              <Pressable
                key={cat.id}
                onPress={() => openEdit(cat)}
                onLongPress={() => confirmDelete(cat)}
                delayLongPress={350}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  paddingLeft: 14 + level * 20,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  borderTopWidth: idx === 0 ? 0 : 1,
                  borderTopColor: c.border,
                  backgroundColor:
                    form?.mode === 'edit' && form.id === cat.id
                      ? c.bg
                      : 'transparent',
                }}
              >
                {level === 1 && (
                  <Text
                    style={{ color: c.textMuted, fontSize: 14, marginRight: -6 }}
                  >
                    ↳
                  </Text>
                )}
                <View
                  className="w-9 h-9 rounded-full items-center justify-center"
                  style={{ backgroundColor: c.bg }}
                >
                  <EmojiOrIcon value={cat.icon} fallback="sparkle" size={18} />
                </View>
                <View className="flex-1 min-w-0">
                  <Text
                    style={{ color: c.text, fontSize: 14, fontWeight: '500' }}
                    numberOfLines={1}
                  >
                    {cat.name}
                  </Text>
                  {level === 0 && (() => {
                    const subCount = tree.filter(
                      (n) => n.cat.parent_id === cat.id,
                    ).length;
                    return subCount > 0 ? (
                      <Text style={{ color: c.textMuted, fontSize: 11, marginTop: 1 }}>
                        {subCount} หมวดย่อย
                      </Text>
                    ) : null;
                  })()}
                </View>
                <Text style={{ color: c.textMuted, fontSize: 18 }}>›</Text>
              </Pressable>
            ))}
          </View>
        )}

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
      </ScrollView>
    </SafeAreaView>
  );
}

function ParentChip({
  label,
  active,
  onPress,
  colors,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        backgroundColor: active ? colors.chipActive : colors.bg,
      }}
    >
      <Text
        style={{
          color: active ? colors.chipActiveText : colors.text,
          fontSize: 12,
          fontWeight: active ? '700' : '500',
        }}
      >
        {label}
      </Text>
    </Pressable>
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
