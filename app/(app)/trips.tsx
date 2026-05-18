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
import { useActiveTrip } from '../../providers/ActiveTripProvider';
import { useTheme } from '../../providers/ThemeProvider';
import {
  useCreateTrip,
  useDeleteTrip,
  useSetTripArchived,
  useTrips,
  useUpdateTrip,
  type Trip,
} from '../../lib/queries/trips';

/**
 * Trips screen — CRUD + active selection + archive.
 *
 * Sections:
 *   1. Header + add button.
 *   2. Active section — non-archived trips. The currently active one
 *      has an accent border + "🟢 กำลังใช้" badge.
 *   3. Archived section (collapsible if many).
 *   4. Inline form (toggleable) — name, icon, color, currency, date
 *      range. Dates are plain text inputs in YYYY-MM-DD format with
 *      "วันนี้" / "+1 week" / "+1 month" quick buttons.
 *
 * Tap a trip → set as active. Long-press → archive (or delete from
 * archive). Edit / delete from the inline action row.
 */

const ICON_PRESETS = ['✈️', '🏖', '⛰', '🍜', '🎉', '🎒', '🚗', '🛳'];
const COLOR_PRESETS = [
  '#60A5FA', '#FF7BAC', '#FBBF24', '#FB923C',
  '#34D399', '#A78BFA', '#D98556',
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
  color: string;
  currency: string;
  startsAt: string; // YYYY-MM-DD or ''
  endsAt: string;
};

const TODAY_ISO = () => new Date().toISOString().slice(0, 10);

function plusDaysFromIso(iso: string, days: number): string {
  const d = iso ? new Date(iso) : new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function toTimestamptz(iso: string | null): string | null {
  if (!iso || !iso.trim()) return null;
  // Treat as local date midnight, send as ISO. Server stores timestamptz.
  return new Date(iso + 'T00:00:00').toISOString();
}

function fromTimestamptz(ts: string | null): string {
  if (!ts) return '';
  return ts.slice(0, 10);
}

function formatThaiDate(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export default function TripsScreen() {
  const c = useTheme().colors;
  const { ledger, loading: ledgerLoading } = useActiveLedger();
  const { trip: activeTrip, setActiveTrip } = useActiveTrip();
  const trips = useTrips(ledger?.id);
  const create = useCreateTrip();
  const update = useUpdateTrip();
  const setArchived = useSetTripArchived();
  const del = useDeleteTrip();

  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { active, archived } = useMemo(() => {
    const a: Trip[] = [];
    const ar: Trip[] = [];
    for (const t of trips.data ?? []) (t.archived ? ar : a).push(t);
    return { active: a, archived: ar };
  }, [trips.data]);

  function openCreate() {
    setError(null);
    setForm({
      mode: 'create',
      name: '',
      icon: ICON_PRESETS[0],
      color: COLOR_PRESETS[0],
      currency: ledger?.currency ?? 'THB',
      startsAt: TODAY_ISO(),
      endsAt: '',
    });
  }

  function openEdit(t: Trip) {
    setError(null);
    setForm({
      mode: 'edit',
      id: t.id,
      name: t.name,
      icon: t.icon ?? ICON_PRESETS[0],
      color: t.color ?? COLOR_PRESETS[0],
      currency: t.currency ?? ledger?.currency ?? 'THB',
      startsAt: fromTimestamptz(t.starts_at),
      endsAt: fromTimestamptz(t.ends_at),
    });
  }

  function closeForm() {
    setForm(null);
    setError(null);
  }

  async function save() {
    if (!ledger || !form) return;
    if (!form.name.trim()) {
      setError('ใส่ชื่อทริปก่อน');
      return;
    }
    try {
      setError(null);
      const startsAt = toTimestamptz(form.startsAt);
      const endsAt = toTimestamptz(form.endsAt);
      if (form.mode === 'create') {
        const id = await create.mutateAsync({
          ledger_id: ledger.id,
          name: form.name.trim(),
          icon: form.icon,
          color: form.color,
          currency: form.currency,
          starts_at: startsAt,
          ends_at: endsAt,
        });
        // Set as active immediately so the user can start tagging txs
        setActiveTrip(id);
      } else {
        await update.mutateAsync({
          id: form.id!,
          ledger_id: ledger.id,
          name: form.name.trim(),
          icon: form.icon,
          color: form.color,
          currency: form.currency,
          starts_at: startsAt,
          ends_at: endsAt,
        });
      }
      closeForm();
    } catch (e) {
      console.error('save trip failed:', e);
      setError(extractErrorMessage(e));
    }
  }

  function confirmArchive(t: Trip) {
    Alert.alert(
      `จบทริป "${t.name}"?`,
      'รายการที่อยู่ในทริปยังคงสภาพ tag ทริปไว้ — แค่หยุด tag รายการใหม่',
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'จบทริป',
          onPress: async () => {
            if (!ledger) return;
            try {
              await setArchived.mutateAsync({
                id: t.id,
                ledger_id: ledger.id,
                archived: true,
              });
              if (activeTrip?.id === t.id) setActiveTrip(null);
            } catch (e) {
              Alert.alert('จบไม่สำเร็จ', extractErrorMessage(e));
            }
          },
        },
      ],
    );
  }

  function confirmDelete(t: Trip) {
    Alert.alert(
      `ลบ "${t.name}"?`,
      'ลบเฉพาะทริป — รายการที่ผูกอยู่จะกลายเป็นรายการธรรมดา (ไม่ถูกลบ)',
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'ลบ',
          style: 'destructive',
          onPress: async () => {
            if (!ledger) return;
            try {
              await del.mutateAsync({ id: t.id, ledger_id: ledger.id });
              if (activeTrip?.id === t.id) setActiveTrip(null);
              if (form?.id === t.id) closeForm();
            } catch (e) {
              Alert.alert('ลบไม่สำเร็จ', extractErrorMessage(e));
            }
          },
        },
      ],
    );
  }

  async function unarchive(t: Trip) {
    if (!ledger) return;
    try {
      await setArchived.mutateAsync({
        id: t.id,
        ledger_id: ledger.id,
        archived: false,
      });
    } catch (e) {
      Alert.alert('เปิดทริปไม่สำเร็จ', extractErrorMessage(e));
    }
  }

  if (ledgerLoading) {
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
            ทริป
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

        {/* Form */}
        {form && (
          <View
            className="rounded-2xl p-4"
            style={{ backgroundColor: c.card, gap: 12 }}
          >
            <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>
              {form.mode === 'create' ? 'ทริปใหม่' : 'แก้ไขทริป'}
            </Text>

            <View>
              <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 6 }}>
                ชื่อทริป
              </Text>
              <TextInput
                value={form.name}
                onChangeText={(v) => setForm({ ...form, name: v })}
                placeholder="ทริปทะเล, เที่ยวเชียงใหม่, งานเลี้ยงเพื่อน..."
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

            <View>
              <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 8 }}>
                ไอคอน
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {ICON_PRESETS.map((e) => {
                  const sel = form.icon === e;
                  return (
                    <Pressable
                      key={e}
                      onPress={() => setForm({ ...form, icon: e })}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: sel ? form.color : c.bg,
                      }}
                    >
                      <Text style={{ fontSize: 20 }}>{e}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View>
              <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 8 }}>
                สี
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {COLOR_PRESETS.map((col) => {
                  const sel = form.color === col;
                  return (
                    <Pressable
                      key={col}
                      onPress={() => setForm({ ...form, color: col })}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        backgroundColor: col,
                        borderWidth: sel ? 3 : 0,
                        borderColor: c.text,
                      }}
                    />
                  );
                })}
              </View>
            </View>

            <View>
              <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 8 }}>
                สกุลเงิน (สำหรับทริปต่างประเทศ)
              </Text>
              <View className="flex-row gap-2">
                {CURRENCY_PRESETS.map((cur) => {
                  const sel = form.currency === cur;
                  return (
                    <Pressable
                      key={cur}
                      onPress={() => setForm({ ...form, currency: cur })}
                      className="flex-1 py-2 rounded-lg items-center"
                      style={{ backgroundColor: sel ? form.color : c.bg }}
                    >
                      <Text
                        style={{
                          color: sel ? '#FFFFFF' : c.text,
                          fontSize: 12,
                          fontWeight: '600',
                        }}
                      >
                        {cur}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View>
              <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 6 }}>
                วันเริ่ม (YYYY-MM-DD)
              </Text>
              <TextInput
                value={form.startsAt}
                onChangeText={(v) => setForm({ ...form, startsAt: v })}
                placeholder="2026-05-20"
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
              <View className="flex-row gap-2 mt-2">
                <QuickDate
                  label="วันนี้"
                  onPress={() => setForm({ ...form, startsAt: TODAY_ISO() })}
                  colors={c}
                />
                <QuickDate
                  label="พรุ่งนี้"
                  onPress={() =>
                    setForm({ ...form, startsAt: plusDaysFromIso(TODAY_ISO(), 1) })
                  }
                  colors={c}
                />
              </View>
            </View>

            <View>
              <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 6 }}>
                วันสิ้นสุด (ไม่บังคับ)
              </Text>
              <TextInput
                value={form.endsAt}
                onChangeText={(v) => setForm({ ...form, endsAt: v })}
                placeholder="2026-05-27"
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
              <View className="flex-row gap-2 mt-2">
                <QuickDate
                  label="+1 สัปดาห์"
                  onPress={() =>
                    setForm({
                      ...form,
                      endsAt: plusDaysFromIso(form.startsAt || TODAY_ISO(), 7),
                    })
                  }
                  colors={c}
                />
                <QuickDate
                  label="+1 เดือน"
                  onPress={() =>
                    setForm({
                      ...form,
                      endsAt: plusDaysFromIso(form.startsAt || TODAY_ISO(), 30),
                    })
                  }
                  colors={c}
                />
                <QuickDate
                  label="ล้าง"
                  onPress={() => setForm({ ...form, endsAt: '' })}
                  colors={c}
                />
              </View>
            </View>

            {error && (
              <Text style={{ color: c.expense, fontSize: 12 }}>{error}</Text>
            )}

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
                    {form.mode === 'create' ? 'เพิ่มและเปิดใช้' : 'บันทึก'}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        )}

        {/* Active section */}
        {trips.isLoading ? (
          <ActivityIndicator color={c.accent} />
        ) : trips.error ? (
          <Text style={{ color: c.expense, fontSize: 13 }}>
            {String(trips.error)}
          </Text>
        ) : active.length === 0 && archived.length === 0 ? (
          <View
            className="rounded-2xl p-8 items-center"
            style={{ backgroundColor: c.card }}
          >
            <Text style={{ fontSize: 36 }}>✈️</Text>
            <Text
              style={{
                color: c.text,
                fontSize: 14,
                marginTop: 8,
                fontWeight: '500',
              }}
            >
              ยังไม่มีทริป
            </Text>
            <Text
              className="text-center"
              style={{ color: c.textSecondary, fontSize: 12, marginTop: 4 }}
            >
              กด + เพื่อสร้างทริปแรก{'\n'}เช่น ทริปทะเล, เที่ยวเชียงใหม่
            </Text>
          </View>
        ) : (
          <>
            {active.length > 0 && (
              <View style={{ gap: 8 }}>
                <Text
                  style={{
                    color: c.textSecondary,
                    fontSize: 11,
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    marginLeft: 2,
                  }}
                >
                  ทริปกำลังใช้ ({active.length})
                </Text>
                {active.map((t) => (
                  <TripRow
                    key={t.id}
                    trip={t}
                    isActive={activeTrip?.id === t.id}
                    onSelect={() =>
                      setActiveTrip(activeTrip?.id === t.id ? null : t.id)
                    }
                    onEdit={() => openEdit(t)}
                    onArchive={() => confirmArchive(t)}
                    onDelete={() => confirmDelete(t)}
                    colors={c}
                  />
                ))}
              </View>
            )}

            {archived.length > 0 && (
              <View style={{ gap: 8, marginTop: 8 }}>
                <Text
                  style={{
                    color: c.textSecondary,
                    fontSize: 11,
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    marginLeft: 2,
                  }}
                >
                  ทริปที่จบไปแล้ว ({archived.length})
                </Text>
                {archived.map((t) => (
                  <ArchivedRow
                    key={t.id}
                    trip={t}
                    onUnarchive={() => unarchive(t)}
                    onDelete={() => confirmDelete(t)}
                    colors={c}
                  />
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
              💡 แตะที่ทริปเพื่อเปิด/ปิดใช้งาน · กดปุ่มเพื่อแก้/จบ/ลบ
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function TripRow({
  trip,
  isActive,
  onSelect,
  onEdit,
  onArchive,
  onDelete,
  colors,
}: {
  trip: Trip;
  isActive: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: 18,
        overflow: 'hidden',
        borderWidth: isActive ? 2 : 0,
        borderColor: isActive ? colors.accent : 'transparent',
      }}
    >
      <Pressable
        onPress={onSelect}
        className="flex-row items-center gap-3 p-4"
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: (trip.color ?? colors.accent) + '33',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 22 }}>{trip.icon ?? '✈️'}</Text>
        </View>
        <View className="flex-1 min-w-0">
          <Text
            style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}
            numberOfLines={1}
          >
            {trip.name}
          </Text>
          <Text
            style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}
            numberOfLines={1}
          >
            {trip.starts_at ? formatThaiDate(trip.starts_at) : '—'}
            {trip.ends_at ? ` → ${formatThaiDate(trip.ends_at)}` : ''}
            {trip.currency ? ` · ${trip.currency}` : ''}
            {isActive ? ' · 🟢 กำลังใช้' : ''}
          </Text>
        </View>
      </Pressable>

      <View
        className="flex-row gap-2 px-4 pb-3"
        style={{
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingTop: 10,
        }}
      >
        <Pressable
          onPress={onEdit}
          className="flex-1 py-2 rounded-lg items-center"
          style={{ backgroundColor: colors.bg }}
        >
          <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>
            ✏️ แก้ไข
          </Text>
        </Pressable>
        <Pressable
          onPress={onArchive}
          className="flex-1 py-2 rounded-lg items-center"
          style={{ backgroundColor: colors.bg }}
        >
          <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>
            📦 จบทริป
          </Text>
        </Pressable>
        <Pressable
          onPress={onDelete}
          className="flex-1 py-2 rounded-lg items-center"
          style={{ backgroundColor: 'rgba(217, 133, 86, 0.12)' }}
        >
          <Text style={{ color: colors.expense, fontSize: 12, fontWeight: '600' }}>
            🗑 ลบ
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function ArchivedRow({
  trip,
  onUnarchive,
  onDelete,
  colors,
}: {
  trip: Trip;
  onUnarchive: () => void;
  onDelete: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: 18,
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        opacity: 0.7,
      }}
    >
      <Text style={{ fontSize: 24 }}>{trip.icon ?? '✈️'}</Text>
      <View className="flex-1 min-w-0">
        <Text
          style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}
          numberOfLines={1}
        >
          {trip.name}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }}>
          จบแล้ว · {trip.starts_at ? formatThaiDate(trip.starts_at) : '—'}
        </Text>
      </View>
      <Pressable
        onPress={onUnarchive}
        className="px-3 py-1.5 rounded-lg"
        style={{ backgroundColor: colors.bg }}
      >
        <Text style={{ color: colors.text, fontSize: 11, fontWeight: '600' }}>
          เปิดอีก
        </Text>
      </Pressable>
      <Pressable onPress={onDelete} className="px-2 py-1.5">
        <Text style={{ color: colors.expense, fontSize: 14 }}>🗑</Text>
      </Pressable>
    </View>
  );
}

function QuickDate({
  label,
  onPress,
  colors,
}: {
  label: string;
  onPress: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <Pressable
      onPress={onPress}
      className="px-3 py-1.5 rounded-lg"
      style={{ backgroundColor: colors.chip }}
    >
      <Text style={{ color: colors.text, fontSize: 11, fontWeight: '600' }}>
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
