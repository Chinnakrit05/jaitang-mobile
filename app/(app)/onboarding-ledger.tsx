import { useState } from 'react';
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

import { useActiveLedger } from '../../providers/ActiveLedgerProvider';
import { useCreateLedger } from '../../lib/queries/ledgers';

/**
 * Onboarding screen — create the user's first ledger. Hidden from the
 * tab bar (registered with `href: null` in `(app)/_layout.tsx`); the
 * dashboard's empty state navigates here.
 *
 * Form is intentionally tiny — name + icon + color + currency. The
 * mockup's design palette (CATEGORY_PALETTE) doubles as ledger color
 * presets so the UI stays consistent.
 */

const ICON_PRESETS = ['🦊', '🐕', '🐱', '🌸', '☕', '🏠', '✈️', '💰'];

const COLOR_PRESETS = [
  { value: '#D98556', label: 'Toffee' },
  { value: '#FF7BAC', label: 'Pink' },
  { value: '#FB923C', label: 'Orange' },
  { value: '#FBBF24', label: 'Yellow' },
  { value: '#34D399', label: 'Mint' },
  { value: '#60A5FA', label: 'Sky' },
  { value: '#A78BFA', label: 'Lavender' },
];

const CURRENCY_PRESETS = ['THB', 'USD', 'JPY', 'EUR'];

export default function OnboardingLedgerScreen() {
  const create = useCreateLedger();
  const { setActiveLedger } = useActiveLedger();

  const [name, setName] = useState('สมุดของฉัน');
  const [icon, setIcon] = useState<string>('🦊');
  const [color, setColor] = useState<string>(COLOR_PRESETS[0].value);
  const [currency, setCurrency] = useState<string>('THB');
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError('ใส่ชื่อสมุดก่อน');
      return;
    }
    try {
      const id = await create.mutateAsync({
        name: trimmed,
        icon,
        color,
        currency,
        is_personal: true,
      });
      setActiveLedger(id);
      // Replace so back button doesn't return to onboarding.
      router.replace('/(app)/dashboard');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'สร้างไม่สำเร็จ');
    }
  }

  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: '#FFF4E6' }}
      edges={['top', 'bottom']}
    >
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <View className="items-center mt-2 mb-1">
          <Text style={{ fontSize: 44 }}>{icon}</Text>
        </View>
        <Text
          className="text-center"
          style={{ color: '#3D2A1E', fontSize: 22, fontWeight: '700' }}
        >
          สร้างสมุดบัญชีแรก
        </Text>
        <Text
          className="text-center"
          style={{ color: '#8B7563', fontSize: 13 }}
        >
          สมุดคือกล่องเก็บรายการรายรับ-รายจ่ายของคุณ {'\n'}สร้างได้หลายเล่ม เช่น
          ส่วนตัว, ครอบครัว, ทริป ฯลฯ
        </Text>

        {/* Name */}
        <View
          className="rounded-2xl p-4"
          style={{ backgroundColor: '#FFFFFF' }}
        >
          <Text
            style={{ color: '#8B7563', fontSize: 11, marginBottom: 6 }}
          >
            ชื่อสมุด
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="เช่น สมุดของฉัน, ทริปเชียงใหม่"
            className="px-3 py-2.5 rounded-xl"
            style={{
              backgroundColor: '#FFF4E6',
              fontSize: 16,
              color: '#3D2A1E',
            }}
          />
        </View>

        {/* Icon picker */}
        <View
          className="rounded-2xl p-4"
          style={{ backgroundColor: '#FFFFFF' }}
        >
          <Text
            style={{ color: '#8B7563', fontSize: 11, marginBottom: 8 }}
          >
            ไอคอน
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {ICON_PRESETS.map((e) => {
              const selected = icon === e;
              return (
                <Pressable
                  key={e}
                  onPress={() => setIcon(e)}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: selected ? color : '#FFF4E6',
                    borderWidth: selected ? 2 : 0,
                    borderColor: '#3D2A1E',
                  }}
                >
                  <Text style={{ fontSize: 22 }}>{e}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Color picker */}
        <View
          className="rounded-2xl p-4"
          style={{ backgroundColor: '#FFFFFF' }}
        >
          <Text
            style={{ color: '#8B7563', fontSize: 11, marginBottom: 8 }}
          >
            สี
          </Text>
          <View className="flex-row flex-wrap gap-3">
            {COLOR_PRESETS.map((c) => {
              const selected = color === c.value;
              return (
                <Pressable
                  key={c.value}
                  onPress={() => setColor(c.value)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: c.value,
                    borderWidth: selected ? 3 : 0,
                    borderColor: '#3D2A1E',
                  }}
                />
              );
            })}
          </View>
        </View>

        {/* Currency picker */}
        <View
          className="rounded-2xl p-4"
          style={{ backgroundColor: '#FFFFFF' }}
        >
          <Text
            style={{ color: '#8B7563', fontSize: 11, marginBottom: 8 }}
          >
            สกุลเงิน
          </Text>
          <View className="flex-row gap-2">
            {CURRENCY_PRESETS.map((c) => {
              const selected = currency === c;
              return (
                <Pressable
                  key={c}
                  onPress={() => setCurrency(c)}
                  className="flex-1 py-2.5 rounded-xl items-center"
                  style={{
                    backgroundColor: selected ? color : '#FFF4E6',
                  }}
                >
                  <Text
                    style={{
                      color: selected ? '#FFFFFF' : '#3D2A1E',
                      fontSize: 13,
                      fontWeight: '600',
                    }}
                  >
                    {c}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {error && (
          <Text
            className="text-center"
            style={{ color: '#D98556', fontSize: 13 }}
          >
            {error}
          </Text>
        )}

        <Pressable
          onPress={save}
          disabled={create.isPending}
          style={{
            backgroundColor: color,
            paddingVertical: 14,
            borderRadius: 16,
            alignItems: 'center',
            shadowColor: color,
            shadowOpacity: 0.3,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
            elevation: 4,
            opacity: create.isPending ? 0.6 : 1,
          }}
        >
          {create.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text
              style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}
            >
              สร้างสมุดบัญชี
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
