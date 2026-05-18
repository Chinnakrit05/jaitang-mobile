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
import { useTranslation } from 'react-i18next';

import { useActiveLedger } from '../../providers/ActiveLedgerProvider';
import { useTheme } from '../../providers/ThemeProvider';
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
  const { t } = useTranslation();
  const create = useCreateLedger();
  const { setActiveLedger } = useActiveLedger();
  const c = useTheme().colors;

  const [name, setName] = useState(() => t('onboarding.defaultLedgerName', { defaultValue: 'My ledger' }));
  const [icon, setIcon] = useState<string>('🦊');
  // Ledger color preset — picked by user, NOT a theme token. Stays
  // brand-fixed across light / dark so the user's chosen color is the
  // same on every device.
  const [color, setColor] = useState<string>(COLOR_PRESETS[0].value);
  const [currency, setCurrency] = useState<string>('THB');
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t('onboarding.nameRequired', { defaultValue: 'Enter a ledger name first' }));
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
      // Supabase errors come as plain PostgrestError objects (not Error
      // instances) — surface their `message`, `code`, and `details` so we
      // can actually see what went wrong instead of a generic fallback.
      console.error('createLedger failed:', e);
      let msg = t('onboarding.createFailed', { defaultValue: 'Could not create ledger' });
      if (e && typeof e === 'object') {
        const err = e as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
        const parts: string[] = [];
        if (typeof err.message === 'string' && err.message) parts.push(err.message);
        if (typeof err.code === 'string' && err.code) parts.push(`(${err.code})`);
        if (typeof err.details === 'string' && err.details) parts.push(err.details);
        if (typeof err.hint === 'string' && err.hint) parts.push(`💡 ${err.hint}`);
        if (parts.length > 0) msg = parts.join(' ');
      } else if (typeof e === 'string') {
        msg = e;
      }
      setError(msg);
    }
  }

  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: c.bg }}
      edges={['top', 'bottom']}
    >
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <View className="items-center mt-2 mb-1">
          <Text style={{ fontSize: 44 }}>{icon}</Text>
        </View>
        <Text
          className="text-center"
          style={{ color: c.text, fontSize: 22, fontWeight: '700' }}
        >
          {t('onboarding.title', { defaultValue: 'Create your first ledger' })}
        </Text>
        <Text
          className="text-center"
          style={{ color: c.textSecondary, fontSize: 13 }}
        >
          {t('onboarding.subtitle', {
            defaultValue: 'A ledger keeps your income and expenses. Create more than one for personal, family, trips, and more.',
          })}
        </Text>

        {/* Name */}
        <View
          className="rounded-2xl p-4"
          style={{ backgroundColor: c.card }}
        >
          <Text
            style={{ color: c.textSecondary, fontSize: 11, marginBottom: 6 }}
          >
            {t('ledgers.ledgerName')}
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t('ledgers.ledgerNamePlaceholder')}
            placeholderTextColor={c.textMuted}
            className="px-3 py-2.5 rounded-xl"
            style={{
              backgroundColor: c.bg,
              fontSize: 16,
              color: c.text,
            }}
          />
        </View>

        {/* Icon picker */}
        <View
          className="rounded-2xl p-4"
          style={{ backgroundColor: c.card }}
        >
          <Text
            style={{ color: c.textSecondary, fontSize: 11, marginBottom: 8 }}
          >
            {t('ledgers.icon')}
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
                    backgroundColor: selected ? color : c.bg,
                    borderWidth: selected ? 2 : 0,
                    borderColor: c.text,
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
          style={{ backgroundColor: c.card }}
        >
          <Text
            style={{ color: c.textSecondary, fontSize: 11, marginBottom: 8 }}
          >
            {t('ledgers.color')}
          </Text>
          <View className="flex-row flex-wrap gap-3">
            {COLOR_PRESETS.map((preset) => {
              const selected = color === preset.value;
              return (
                <Pressable
                  key={preset.value}
                  onPress={() => setColor(preset.value)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: preset.value,
                    borderWidth: selected ? 3 : 0,
                    borderColor: c.text,
                  }}
                />
              );
            })}
          </View>
        </View>

        {/* Currency picker */}
        <View
          className="rounded-2xl p-4"
          style={{ backgroundColor: c.card }}
        >
          <Text
            style={{ color: c.textSecondary, fontSize: 11, marginBottom: 8 }}
          >
            {t('trips.currencyLabel')}
          </Text>
          <View className="flex-row gap-2">
            {CURRENCY_PRESETS.map((cur) => {
              const selected = currency === cur;
              return (
                <Pressable
                  key={cur}
                  onPress={() => setCurrency(cur)}
                  className="flex-1 py-2.5 rounded-xl items-center"
                  style={{
                    backgroundColor: selected ? color : c.bg,
                  }}
                >
                  <Text
                    style={{
                      color: selected ? '#FFFFFF' : c.text,
                      fontSize: 13,
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

        {error && (
          <Text
            className="text-center"
            style={{ color: c.expense, fontSize: 13 }}
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
              {t('dashboard.createLedger').replace(/^\+\s*/, '')}
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
