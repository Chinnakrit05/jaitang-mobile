import { Text } from 'react-native';

import { ICON_NAMES, type IconName } from './icon-names';
import { JtIcon } from './JtIcon';

const ICON_NAME_SET = new Set<string>(ICON_NAMES);

const NAME_TO_EMOJI: Partial<Record<IconName, string>> = {
  // Account palette
  'cash-stack': '💵',
  'piggy-bank': '🐷',
  'credit-card': '💳',
  'phone-wallet': '📱',
  'money-bag': '💰',
  'coin-purse': '👛',
  atm: '🏧',
  'gold-coin': '🪙',
  // Trip palette
  airplane: '✈️',
  beach: '🏖️',
  mountain: '🏔️',
  ramen: '🍜',
  party: '🎉',
  backpack: '🎒',
  car: '🚗',
  'cruise-ship': '🛳️',
  camping: '🏕️',
  gift: '🎁',
  // Goal palette
  bullseye: '🎯',
  house: '🏠',
  ring: '💍',
  'graduation-cap': '🎓',
  laptop: '💻',
  'game-controller': '🎮',
  'shopping-cart': '🛒',
  // Category palette
  coffee: '☕',
  pill: '💊',
  books: '📚',
  'trending-up': '📈',
  tag: '🏷️',
  sparkle: '✨',
  sparkles: '✨',
};

export function iconNameToEmoji(value: string | null | undefined): string {
  if (!value) return '';
  return NAME_TO_EMOJI[value as IconName] ?? value;
}

type Props = {
  value: string | null | undefined;
  size?: number;
  fallback?: IconName;
};

/**
 * Same dual-format renderer as the web app — JtIcon when the value
 * matches a sprite symbol, plain text when it doesn't (legacy emoji
 * chars in the DB). Lets the migration to JtIcon names happen lazily.
 */
export function EmojiOrIcon({ value, size = 24, fallback }: Props) {
  const v = value ?? fallback ?? '';
  if (!v) return null;
  if (ICON_NAME_SET.has(v)) {
    return <JtIcon name={v as IconName} size={size} />;
  }
  return <Text style={{ fontSize: size, lineHeight: size * 1.1 }}>{v}</Text>;
}
