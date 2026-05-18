import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  Share,
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
  useDeleteLedger,
  useLedgers,
  useUpdateLedger,
  type LedgerSummary,
} from '../../lib/queries/ledgers';
import { useAcceptInvite, useCreateInvite } from '../../lib/queries/invites';
import { EmojiOrIcon } from '../../components/icons/EmojiOrIcon';

/**
 * Ledger management — switcher + CRUD + share/accept invite.
 *
 * Sections:
 *   1. "Your books" list — tap to switch active, expand to edit/share/delete.
 *      Owner-only actions are gated by `ledger.role === 'owner'`.
 *   2. "Add new book" CTA — routes to onboarding flow (reused).
 *   3. "Join a book" — paste-code input → `accept_invite` RPC.
 *
 * Share flow per ledger:
 *   - Tap "แชร์" → generate invite via `create_invite` (default editor,
 *     1 use, 7-day expiry).
 *   - Modal shows the 8-char code + a QR image (server-rendered via
 *     qrserver.com so we don't pull a QR lib).
 *   - "ส่ง" button opens the OS share sheet with a friendly message.
 */

const ICON_PRESETS = ['🦊', '🐕', '🐱', '🌸', '☕', '🏠', '✈️', '💰'];
const COLOR_PRESETS = [
  '#D98556', '#FF7BAC', '#FB923C', '#FBBF24',
  '#34D399', '#60A5FA', '#A78BFA',
];
const CURRENCY_PRESETS = ['THB', 'USD', 'JPY', 'EUR'];

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

type EditForm = {
  id: string;
  name: string;
  icon: string;
  color: string;
  currency: string;
};

type ShareState = {
  ledgerId: string;
  ledgerName: string;
  code: string;
  expiresAt: string | null;
};

export default function LedgersScreen() {
  const c = useTheme().colors;
  const ledgers = useLedgers();
  const { ledger: active, setActiveLedger } = useActiveLedger();
  const update = useUpdateLedger();
  const del = useDeleteLedger();
  const createInvite = useCreateInvite();
  const acceptInvite = useAcceptInvite();

  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [shareState, setShareState] = useState<ShareState | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  function openEdit(l: LedgerSummary) {
    setEditError(null);
    setEditForm({
      id: l.id,
      name: l.name,
      icon: l.icon ?? ICON_PRESETS[0],
      color: l.color ?? COLOR_PRESETS[0],
      currency: l.currency,
    });
  }

  async function saveEdit() {
    if (!editForm) return;
    if (!editForm.name.trim()) {
      setEditError('ใส่ชื่อสมุดก่อน');
      return;
    }
    try {
      setEditError(null);
      await update.mutateAsync({
        id: editForm.id,
        name: editForm.name.trim(),
        icon: editForm.icon,
        color: editForm.color,
        currency: editForm.currency,
      });
      setEditForm(null);
    } catch (e) {
      console.error('update ledger failed:', e);
      setEditError(extractErrorMessage(e));
    }
  }

  function confirmDelete(l: LedgerSummary) {
    Alert.alert(
      `ลบ "${l.name}"?`,
      'ลบเฉพาะสมุด — รายการ/หมวด/สมาชิกที่ผูกอยู่จะคงไว้แต่จะไม่เห็นในแอป',
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'ลบ',
          style: 'destructive',
          onPress: async () => {
            try {
              await del.mutateAsync(l.id);
              if (editForm?.id === l.id) setEditForm(null);
            } catch (e) {
              console.error('delete ledger failed:', e);
              Alert.alert('ลบไม่สำเร็จ', extractErrorMessage(e));
            }
          },
        },
      ],
    );
  }

  async function openShare(l: LedgerSummary) {
    try {
      const result = await createInvite.mutateAsync({
        ledger_id: l.id,
        role: 'editor',
        max_uses: 1,
        expires_days: 7,
      });
      setShareState({
        ledgerId: l.id,
        ledgerName: l.name,
        code: result.code,
        expiresAt: result.expires_at,
      });
    } catch (e) {
      console.error('create invite failed:', e);
      Alert.alert('สร้างรหัสเชิญไม่สำเร็จ', extractErrorMessage(e));
    }
  }

  async function nativeShare() {
    if (!shareState) return;
    try {
      await Share.share({
        title: 'รหัสเชิญสมุด Jaitang',
        message: `เข้าร่วมสมุด "${shareState.ledgerName}" ของฉัน!\nรหัสเชิญ: ${shareState.code}\n(เปิด Jaitang → เพิ่มเติม → สมุดบัญชี → ใส่รหัส)`,
      });
    } catch (e) {
      console.error('share failed:', e);
    }
  }

  async function handleAcceptInvite() {
    const code = joinCode.trim();
    if (code.length < 4) {
      setJoinError('ใส่รหัสเชิญก่อน');
      return;
    }
    try {
      setJoinError(null);
      const ledgerId = await acceptInvite.mutateAsync(code);
      setActiveLedger(ledgerId);
      setJoinCode('');
      Alert.alert('เข้าร่วมสำเร็จ!', 'สลับเป็นสมุดที่เพิ่งเข้าให้แล้ว', [
        { text: 'OK', onPress: () => router.push('/(app)/dashboard') },
      ]);
    } catch (e) {
      console.error('accept invite failed:', e);
      setJoinError(extractErrorMessage(e));
    }
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
            สมุดบัญชี
          </Text>
          <Pressable
            onPress={() => router.push('/(app)/onboarding-ledger')}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: c.accent,
            }}
          >
            <PlusIcon color={c.chipActiveText} size={18} />
          </Pressable>
        </View>

        {/* Ledger list */}
        {ledgers.isLoading ? (
          <ActivityIndicator color={c.accent} />
        ) : ledgers.error ? (
          <Text style={{ color: c.expense, fontSize: 13 }}>
            {String(ledgers.error)}
          </Text>
        ) : (ledgers.data ?? []).length === 0 ? (
          <View
            className="rounded-2xl p-8 items-center"
            style={{ backgroundColor: c.card }}
          >
            <Text style={{ fontSize: 36 }}>📒</Text>
            <Text
              style={{ color: c.text, fontSize: 14, marginTop: 8, fontWeight: '500' }}
            >
              ยังไม่มีสมุดบัญชี
            </Text>
            <Text
              className="text-center"
              style={{ color: c.textSecondary, fontSize: 12, marginTop: 4 }}
            >
              กด + ด้านบนเพื่อสร้างสมุดเล่มแรก
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {(ledgers.data ?? []).map((l) => {
              const isActive = l.id === active?.id;
              const isOwner = l.role === 'owner';
              const isEditing = editForm?.id === l.id;
              return (
                <View
                  key={l.id}
                  style={{
                    backgroundColor: c.card,
                    borderRadius: 18,
                    overflow: 'hidden',
                    borderWidth: isActive ? 2 : 0,
                    borderColor: isActive ? c.accent : 'transparent',
                  }}
                >
                  {/* Header row — tap to switch active */}
                  <Pressable
                    onPress={() => setActiveLedger(l.id)}
                    className="flex-row items-center gap-3 p-4"
                  >
                    <View
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 22,
                        backgroundColor:
                          (l.color ?? c.accent) + '33',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <EmojiOrIcon
                        value={l.icon}
                        fallback="users"
                        size={22}
                      />
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text
                        style={{ color: c.text, fontSize: 15, fontWeight: '700' }}
                        numberOfLines={1}
                      >
                        {l.name}
                      </Text>
                      <Text style={{ color: c.textMuted, fontSize: 11, marginTop: 2 }}>
                        {l.is_personal ? 'ส่วนตัว' : 'แชร์'} · {l.role} ·{' '}
                        {l.currency}
                        {isActive ? ' · 🟢 กำลังใช้' : ''}
                      </Text>
                    </View>
                  </Pressable>

                  {/* Action buttons row */}
                  <View
                    className="flex-row gap-2 px-4 pb-3"
                    style={{
                      borderTopWidth: 1,
                      borderTopColor: c.border,
                      paddingTop: 10,
                    }}
                  >
                    {isOwner && (
                      <Pressable
                        onPress={() =>
                          isEditing ? setEditForm(null) : openEdit(l)
                        }
                        className="flex-1 py-2 rounded-lg items-center"
                        style={{ backgroundColor: c.bg }}
                      >
                        <Text style={{ color: c.text, fontSize: 12, fontWeight: '600' }}>
                          ✏️ {isEditing ? 'ปิด' : 'แก้ไข'}
                        </Text>
                      </Pressable>
                    )}
                    <Pressable
                      onPress={() => openShare(l)}
                      disabled={createInvite.isPending}
                      className="flex-1 py-2 rounded-lg items-center"
                      style={{ backgroundColor: c.bg }}
                    >
                      {createInvite.isPending ? (
                        <ActivityIndicator size="small" color={c.accent} />
                      ) : (
                        <Text style={{ color: c.text, fontSize: 12, fontWeight: '600' }}>
                          📤 แชร์
                        </Text>
                      )}
                    </Pressable>
                    {isOwner && (
                      <Pressable
                        onPress={() => confirmDelete(l)}
                        className="flex-1 py-2 rounded-lg items-center"
                        style={{ backgroundColor: 'rgba(217, 133, 86, 0.12)' }}
                      >
                        <Text style={{ color: c.expense, fontSize: 12, fontWeight: '600' }}>
                          🗑 ลบ
                        </Text>
                      </Pressable>
                    )}
                  </View>

                  {/* Inline edit form */}
                  {isEditing && (
                    <View
                      style={{
                        backgroundColor: c.bg,
                        padding: 14,
                        gap: 10,
                      }}
                    >
                      <View>
                        <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 4 }}>
                          ชื่อสมุด
                        </Text>
                        <TextInput
                          value={editForm.name}
                          onChangeText={(v) =>
                            setEditForm({ ...editForm, name: v })
                          }
                          style={{
                            backgroundColor: c.card,
                            color: c.text,
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                            borderRadius: 10,
                            fontSize: 14,
                          }}
                        />
                      </View>

                      <View>
                        <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 6 }}>
                          ไอคอน
                        </Text>
                        <View className="flex-row flex-wrap gap-2">
                          {ICON_PRESETS.map((e) => {
                            const sel = editForm.icon === e;
                            return (
                              <Pressable
                                key={e}
                                onPress={() =>
                                  setEditForm({ ...editForm, icon: e })
                                }
                                style={{
                                  width: 36,
                                  height: 36,
                                  borderRadius: 10,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  backgroundColor: sel
                                    ? editForm.color
                                    : c.card,
                                }}
                              >
                                <Text style={{ fontSize: 18 }}>{e}</Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>

                      <View>
                        <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 6 }}>
                          สี
                        </Text>
                        <View className="flex-row flex-wrap gap-2">
                          {COLOR_PRESETS.map((col) => {
                            const sel = editForm.color === col;
                            return (
                              <Pressable
                                key={col}
                                onPress={() =>
                                  setEditForm({ ...editForm, color: col })
                                }
                                style={{
                                  width: 30,
                                  height: 30,
                                  borderRadius: 15,
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
                        <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 6 }}>
                          สกุลเงิน
                        </Text>
                        <View className="flex-row gap-2">
                          {CURRENCY_PRESETS.map((cur) => {
                            const sel = editForm.currency === cur;
                            return (
                              <Pressable
                                key={cur}
                                onPress={() =>
                                  setEditForm({ ...editForm, currency: cur })
                                }
                                className="flex-1 py-2 rounded-lg items-center"
                                style={{
                                  backgroundColor: sel
                                    ? editForm.color
                                    : c.card,
                                }}
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

                      {editError && (
                        <Text style={{ color: c.expense, fontSize: 12 }}>
                          {editError}
                        </Text>
                      )}

                      <Pressable
                        onPress={saveEdit}
                        disabled={update.isPending}
                        className="py-3 rounded-xl items-center"
                        style={{
                          backgroundColor: c.accent,
                          opacity: update.isPending ? 0.6 : 1,
                        }}
                      >
                        {update.isPending ? (
                          <ActivityIndicator color={c.chipActiveText} />
                        ) : (
                          <Text
                            style={{
                              color: c.chipActiveText,
                              fontSize: 13,
                              fontWeight: '700',
                            }}
                          >
                            บันทึก
                          </Text>
                        )}
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Join via invite code */}
        <View
          className="rounded-2xl p-4"
          style={{ backgroundColor: c.card, gap: 10, marginTop: 6 }}
        >
          <View>
            <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>
              เข้าร่วมสมุดของคนอื่น
            </Text>
            <Text style={{ color: c.textSecondary, fontSize: 11, marginTop: 2 }}>
              ใส่รหัสเชิญ 8 หลัก ที่ได้รับจากเจ้าของสมุด
            </Text>
          </View>
          <View className="flex-row gap-2">
            <TextInput
              value={joinCode}
              onChangeText={(v) => {
                setJoinCode(v.toUpperCase());
                setJoinError(null);
              }}
              placeholder="เช่น A1B2C3D4"
              placeholderTextColor={c.textMuted}
              autoCapitalize="characters"
              maxLength={12}
              style={{
                flex: 1,
                backgroundColor: c.bg,
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderRadius: 12,
                fontSize: 16,
                fontWeight: '700',
                color: c.text,
                letterSpacing: 2,
              }}
            />
            <Pressable
              onPress={handleAcceptInvite}
              disabled={acceptInvite.isPending || joinCode.trim().length < 4}
              style={{
                paddingHorizontal: 18,
                borderRadius: 12,
                backgroundColor: c.accent,
                alignItems: 'center',
                justifyContent: 'center',
                opacity:
                  acceptInvite.isPending || joinCode.trim().length < 4
                    ? 0.5
                    : 1,
              }}
            >
              {acceptInvite.isPending ? (
                <ActivityIndicator color={c.chipActiveText} />
              ) : (
                <Text
                  style={{
                    color: c.chipActiveText,
                    fontSize: 13,
                    fontWeight: '700',
                  }}
                >
                  เข้าร่วม
                </Text>
              )}
            </Pressable>
          </View>
          {joinError && (
            <Text style={{ color: c.expense, fontSize: 12 }}>{joinError}</Text>
          )}
        </View>

        <Text
          style={{
            color: c.textMuted,
            fontSize: 11,
            textAlign: 'center',
            marginTop: 4,
          }}
        >
          💡 แตะที่สมุดเพื่อสลับใช้งาน · กดปุ่มเพื่อแก้/แชร์/ลบ
        </Text>
      </ScrollView>

      {/* Share modal — full-screen overlay */}
      {shareState && (
        <ShareModal
          colors={c}
          state={shareState}
          onClose={() => setShareState(null)}
          onShare={nativeShare}
        />
      )}
    </SafeAreaView>
  );
}

function ShareModal({
  colors,
  state,
  onClose,
  onShare,
}: {
  colors: ReturnType<typeof useTheme>['colors'];
  state: ShareState;
  onClose: () => void;
  onShare: () => void;
}) {
  // QR via qrserver.com — no extra dependency needed. The URL encoded
  // is just the invite code (the recipient pastes it into the "join"
  // input on their device).
  const qrDark = colors.bg === '#000000' || colors.bg.startsWith('#1') || colors.bg.startsWith('#0');
  const qrFg = qrDark ? 'FFEDD5' : '3D2A1E';
  const qrBg = qrDark ? colors.cardElevated.replace('#', '') : 'FFFFFF';
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(state.code)}&color=${qrFg}&bgcolor=${qrBg}`;

  const expiresText = state.expiresAt
    ? new Date(state.expiresAt).toLocaleDateString('th-TH', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : 'ไม่หมดอายุ';

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <View
        style={{
          backgroundColor: colors.card,
          borderRadius: 24,
          padding: 24,
          width: '100%',
          maxWidth: 360,
          alignItems: 'center',
          gap: 16,
        }}
      >
        <View className="items-center">
          <Text
            style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '600' }}
          >
            แชร์สมุด
          </Text>
          <Text
            style={{
              color: colors.text,
              fontSize: 17,
              fontWeight: '700',
              marginTop: 2,
            }}
            numberOfLines={1}
          >
            {state.ledgerName}
          </Text>
        </View>

        {/* QR */}
        <View
          style={{
            backgroundColor: qrDark ? colors.cardElevated : '#FFFFFF',
            padding: 12,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Image
            source={{ uri: qrUrl }}
            style={{ width: 200, height: 200 }}
            resizeMode="contain"
          />
        </View>

        {/* Code */}
        <View
          style={{
            backgroundColor: colors.bg,
            paddingHorizontal: 20,
            paddingVertical: 12,
            borderRadius: 14,
          }}
        >
          <Text
            style={{
              color: colors.text,
              fontSize: 24,
              fontWeight: '700',
              letterSpacing: 4,
              textAlign: 'center',
            }}
            selectable
          >
            {state.code}
          </Text>
        </View>

        <Text
          style={{
            color: colors.textMuted,
            fontSize: 11,
            textAlign: 'center',
          }}
        >
          หมดอายุ {expiresText} · ใช้ได้ 1 ครั้ง · สิทธิ์ผู้ร่วมจด
        </Text>

        {/* Buttons */}
        <View className="flex-row gap-2 w-full">
          <Pressable
            onPress={onClose}
            className="flex-1 py-3 rounded-xl items-center"
            style={{ backgroundColor: colors.bg }}
          >
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>
              ปิด
            </Text>
          </Pressable>
          <Pressable
            onPress={onShare}
            className="flex-1 py-3 rounded-xl items-center"
            style={{ backgroundColor: colors.accent }}
          >
            <Text
              style={{
                color: colors.chipActiveText,
                fontSize: 13,
                fontWeight: '700',
              }}
            >
              📤 ส่งให้เพื่อน
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
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
