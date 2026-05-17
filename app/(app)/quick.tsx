import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { useCategories } from '../../lib/queries/categories';
import { useCreateTransaction } from '../../lib/queries/transactions-local';
import { sortCategoriesByHierarchy } from '../../lib/categories-helpers';
import { ShibaMascot } from '../../components/ShibaMascot';
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
  const { ledger } = useActiveLedger();
  const cats = useCategories(ledger?.id);
  const create = useCreateTransaction();
  const c = useTheme().colors;

  const [kind, setKind] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [payment, setPayment] = useState<'cash' | 'transfer'>('cash');
  const [error, setError] = useState<string | null>(null);
  const [showAllCats, setShowAllCats] = useState(false);

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
      setError('ยังไม่มีสมุดบัญชี');
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      setError('ใส่จำนวนเงินก่อน');
      return;
    }
    try {
      await create.mutateAsync({
        ledger_id: ledger.id,
        kind,
        amount: value,
        note: note.trim() || null,
        category_id: categoryId,
        payment_method: payment,
        occurred_at: new Date().toISOString(),
      });
      reset();
      router.replace('/(app)/transactions');
    } catch (e) {
      console.error('createTransaction failed:', e);
      const msg = e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ';
      setError(msg);
    }
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
            เพิ่มรายการ
          </Text>
          <Pressable onPress={reset} className="px-3 py-2">
            <Text style={{ color: c.accent, fontSize: 13, fontWeight: '700' }}>
              เคลียร์
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
              <ShibaMascot size={48} />
            </View>
          </View>
          <View
            className="rounded-full px-4 py-2.5 flex-1"
            style={{ backgroundColor: c.card }}
          >
            <Text style={{ color: c.text, fontSize: 13 }}>
              วันนี้บันทึก{' '}
              <Text style={{ fontWeight: '700' }}>อะไรน้า?</Text> 🦴
            </Text>
          </View>
        </View>

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
                  {k === 'expense' ? 'รายจ่าย' : 'รายรับ'}
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
            จำนวนเงิน
          </Text>
          <View className="flex-row items-baseline justify-center gap-1 mt-2">
            <Text
              style={{
                color: '#FFFFFF',
                fontSize: 44,
                fontWeight: '700',
              }}
            >
              ฿
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
            จ่ายด้วย
          </Text>
          <View className="flex-row gap-3">
            <PaymentCard
              colors={c}
              icon="💵"
              title="เงินสด"
              subtitle="ในกระเป๋า"
              selected={payment === 'cash'}
              onPress={() => setPayment('cash')}
            />
            <PaymentCard
              colors={c}
              icon="🏦"
              title="โอน"
              subtitle="PromptPay"
              selected={payment === 'transfer'}
              onPress={() => setPayment('transfer')}
            />
          </View>
        </View>

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
            เลือกหมวด
          </Text>
          {cats.isLoading ? (
            <ActivityIndicator color={c.accent} />
          ) : visibleCats.length === 0 ? (
            <Pressable
              onPress={() => router.push('/(app)/categories')}
              className="py-3 items-center"
            >
              <Text style={{ color: c.textSecondary, fontSize: 12 }}>
                ยังไม่มีหมวด — กดเพื่อสร้างหมวดแรก
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
                      ดูเพิ่ม +{overflowCount}
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
              placeholder="เพิ่มโน้ต (ไม่บังคับ)"
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
          <Text
            className="text-center"
            style={{ color: c.expense, fontSize: 13 }}
          >
            {error}
          </Text>
        )}

        {/* Submit — full pill */}
        <Pressable
          onPress={save}
          disabled={create.isPending}
          style={{
            backgroundColor: c.accent,
            paddingVertical: 16,
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
                บันทึกแล้ว น้องชิบะ ดีใจ
              </Text>
            </>
          )}
        </Pressable>
      </ScrollView>
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
