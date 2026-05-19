/**
 * Color tokens — the source of truth for every surface, text shade, and
 * accent in the app.
 *
 * There are three orthogonal knobs that combine into the final palette
 * the UI reads from:
 *
 *   1. **palette** — animal/breed-driven brand palette (Shiba, Calico,
 *      Penguin, Black cat, Samoyed). Each ships its own warm-vs-cool
 *      character, accent hex, and supporting tones.
 *   2. **mode** — light / dark.
 *   3. **oled**  — boolean, only meaningful in dark mode. Pure-black
 *      surfaces for OLED screens.
 *
 * `ThemeProvider` owns those knobs, persists them in AsyncStorage, and
 * exposes `colors: ColorTokens` to consumers via `useTheme()`. Screens
 * MUST read from `useTheme().colors` rather than hard-coding hexes —
 * that's what lets the palette swap with one tap from settings.
 *
 * Naming convention:
 *   - `bg*`      page / surface backgrounds
 *   - `card*`    raised surfaces
 *   - `chip*`    small interactive pills / tag backgrounds
 *   - `text*`    foreground text shades
 *   - `income / expense` semantic — stay vivid in both modes so users
 *     can spot direction at a glance, tuned per palette
 *   - `border`   hairline dividers
 *   - `accent`   playful CTA / active-state color
 *   - `trip`     blue trip-tag accent (kept cool across all palettes
 *     so it reads as "different category" everywhere)
 */

export type ColorTokens = {
  // Surfaces
  bg: string;
  bgSubtle: string;
  card: string;
  cardElevated: string;

  // Interactive
  chip: string;
  chipActive: string;
  chipActiveText: string;

  // Accent (CTAs, active tabs, selected states)
  accent: string;
  accentSoft: string;
  accentText: string;

  // Foreground text
  text: string;
  textSecondary: string;
  textMuted: string;

  // Semantic
  income: string;
  incomeBg: string;
  expense: string;
  expenseBg: string;

  // Structural
  border: string;
  shadow: string;

  // Trip card accent (blue)
  trip: string;
  tripBg: string;
};

// ─── SHIBA INU ──────────────────────────────────────────────────────────
// Warm peachy / earth-tone palette. Default brand.

export const SHIBA_LIGHT: ColorTokens = {
  bg: '#FFEDD5',
  bgSubtle: '#FFEDD5',
  card: '#FFFFFF',
  cardElevated: 'rgba(217, 133, 86, 0.22)',

  chip: 'rgba(217, 133, 86, 0.12)',
  chipActive: '#D98556',
  chipActiveText: '#FFFFFF',

  accent: '#D98556',
  accentSoft: 'rgba(217, 133, 86, 0.16)',
  accentText: '#FFFFFF',

  text: '#3D2A1E',
  textSecondary: '#8B7563',
  textMuted: '#9A958C',

  income: '#0F8A4E',
  incomeBg: 'rgba(52, 211, 153, 0.18)',
  expense: '#D98556',
  expenseBg: 'rgba(255, 123, 172, 0.18)',

  border: 'rgba(217, 133, 86, 0.1)',
  shadow: 'rgba(0, 0, 0, 0.12)',

  trip: '#60A5FA',
  tripBg: 'rgba(96, 165, 250, 0.18)',
};

export const SHIBA_DARK: ColorTokens = {
  bg: '#1A130D',
  bgSubtle: '#241B14',
  card: '#241B14',
  cardElevated: '#2E2218',

  chip: '#382819',
  chipActive: '#E8956A',
  chipActiveText: '#1A130D',

  accent: '#E8956A',
  accentSoft: 'rgba(232, 149, 106, 0.22)',
  accentText: '#1A130D',

  text: '#FFEDD5',
  textSecondary: '#C4A989',
  textMuted: '#8A7D72',

  income: '#34D399',
  incomeBg: 'rgba(52, 211, 153, 0.18)',
  expense: '#FF9EBE',
  expenseBg: 'rgba(255, 123, 172, 0.22)',

  border: 'rgba(244, 231, 213, 0.08)',
  shadow: 'rgba(0, 0, 0, 0.4)',

  trip: '#7DB3FF',
  tripBg: 'rgba(96, 165, 250, 0.18)',
};

export const SHIBA_DARK_OLED: ColorTokens = {
  ...SHIBA_DARK,
  bg: '#000000',
  bgSubtle: '#0A0808',
  card: '#0F0B08',
  cardElevated: '#181210',
  chip: '#1C140F',
};

// ─── CALICO CAT ─────────────────────────────────────────────────────────
// Rust-orange + warm cream. A touch warmer and deeper than Shiba —
// reads as "homey" / vintage. Expense pink leans coral so it pairs.

export const CALICO_LIGHT: ColorTokens = {
  bg: '#FFE3CC',
  bgSubtle: '#FFE3CC',
  card: '#FFFFFF',
  cardElevated: 'rgba(196, 90, 53, 0.20)',

  chip: 'rgba(196, 90, 53, 0.12)',
  chipActive: '#C45A35',
  chipActiveText: '#FFFFFF',

  accent: '#C45A35',
  accentSoft: 'rgba(196, 90, 53, 0.18)',
  accentText: '#FFFFFF',

  text: '#4A2A18',
  textSecondary: '#8B5E48',
  textMuted: '#A28B7A',

  income: '#1E8A52',
  incomeBg: 'rgba(34, 197, 94, 0.16)',
  expense: '#C45A35',
  expenseBg: 'rgba(218, 95, 110, 0.18)',

  border: 'rgba(196, 90, 53, 0.10)',
  shadow: 'rgba(0, 0, 0, 0.12)',

  trip: '#5891D6',
  tripBg: 'rgba(88, 145, 214, 0.18)',
};

export const CALICO_DARK: ColorTokens = {
  bg: '#1B100A',
  bgSubtle: '#241510',
  card: '#241510',
  cardElevated: '#301B14',

  chip: '#3A2118',
  chipActive: '#E27553',
  chipActiveText: '#1B100A',

  accent: '#E27553',
  accentSoft: 'rgba(226, 117, 83, 0.22)',
  accentText: '#1B100A',

  text: '#FFE3CC',
  textSecondary: '#C09885',
  textMuted: '#8C7466',

  income: '#34D399',
  incomeBg: 'rgba(52, 211, 153, 0.18)',
  expense: '#F49684',
  expenseBg: 'rgba(218, 95, 110, 0.22)',

  border: 'rgba(255, 227, 204, 0.08)',
  shadow: 'rgba(0, 0, 0, 0.4)',

  trip: '#7DB3FF',
  tripBg: 'rgba(96, 165, 250, 0.18)',
};

export const CALICO_DARK_OLED: ColorTokens = {
  ...CALICO_DARK,
  bg: '#000000',
  bgSubtle: '#080604',
  card: '#0D0805',
  cardElevated: '#150E0B',
  chip: '#1A100B',
};

// ─── PENGUIN ────────────────────────────────────────────────────────────
// Deep navy + cool icy grey. Sharper, more formal — feels like a
// "professional" theme. Expense leans coral so it pops against navy.

export const PENGUIN_LIGHT: ColorTokens = {
  bg: '#E6EAF1',
  bgSubtle: '#E6EAF1',
  card: '#FFFFFF',
  cardElevated: 'rgba(44, 62, 80, 0.18)',

  chip: 'rgba(44, 62, 80, 0.10)',
  chipActive: '#2C3E50',
  chipActiveText: '#FFFFFF',

  accent: '#2C3E50',
  accentSoft: 'rgba(44, 62, 80, 0.14)',
  accentText: '#FFFFFF',

  text: '#1A2533',
  textSecondary: '#5B6B7E',
  textMuted: '#8A95A4',

  income: '#0F8A4E',
  incomeBg: 'rgba(34, 197, 94, 0.16)',
  expense: '#D26B57',
  expenseBg: 'rgba(218, 95, 110, 0.18)',

  border: 'rgba(44, 62, 80, 0.10)',
  shadow: 'rgba(0, 0, 0, 0.12)',

  trip: '#3B82F6',
  tripBg: 'rgba(59, 130, 246, 0.16)',
};

export const PENGUIN_DARK: ColorTokens = {
  bg: '#0E1620',
  bgSubtle: '#13202D',
  card: '#13202D',
  cardElevated: '#1B2A3A',

  chip: '#22344A',
  chipActive: '#6B8AB2',
  chipActiveText: '#0E1620',

  accent: '#6B8AB2',
  accentSoft: 'rgba(107, 138, 178, 0.22)',
  accentText: '#0E1620',

  text: '#E6EAF1',
  textSecondary: '#9AAABF',
  textMuted: '#6E7B8C',

  income: '#34D399',
  incomeBg: 'rgba(52, 211, 153, 0.18)',
  expense: '#F49684',
  expenseBg: 'rgba(218, 95, 110, 0.22)',

  border: 'rgba(230, 234, 241, 0.08)',
  shadow: 'rgba(0, 0, 0, 0.4)',

  trip: '#7DB3FF',
  tripBg: 'rgba(96, 165, 250, 0.18)',
};

export const PENGUIN_DARK_OLED: ColorTokens = {
  ...PENGUIN_DARK,
  bg: '#000000',
  bgSubtle: '#040608',
  card: '#080B0F',
  cardElevated: '#0E1318',
  chip: '#101820',
};

// ─── BLACK CAT ──────────────────────────────────────────────────────────
// Deep slate-purple + soft lavender. Mysterious / moody but still
// readable. Expense uses a dusty rose so it doesn't fight the accent.

export const BLACKCAT_LIGHT: ColorTokens = {
  bg: '#EDE6F3',
  bgSubtle: '#EDE6F3',
  card: '#FFFFFF',
  cardElevated: 'rgba(91, 75, 110, 0.20)',

  chip: 'rgba(91, 75, 110, 0.12)',
  chipActive: '#5B4B6E',
  chipActiveText: '#FFFFFF',

  accent: '#5B4B6E',
  accentSoft: 'rgba(91, 75, 110, 0.16)',
  accentText: '#FFFFFF',

  text: '#2A2236',
  textSecondary: '#695A7D',
  textMuted: '#9189A0',

  income: '#1E8A52',
  incomeBg: 'rgba(34, 197, 94, 0.14)',
  expense: '#B85A78',
  expenseBg: 'rgba(184, 90, 120, 0.16)',

  border: 'rgba(91, 75, 110, 0.10)',
  shadow: 'rgba(0, 0, 0, 0.12)',

  trip: '#5C8DEA',
  tripBg: 'rgba(92, 141, 234, 0.16)',
};

export const BLACKCAT_DARK: ColorTokens = {
  bg: '#14101C',
  bgSubtle: '#1C1626',
  card: '#1C1626',
  cardElevated: '#261E33',

  chip: '#2C2440',
  chipActive: '#9784B5',
  chipActiveText: '#14101C',

  accent: '#9784B5',
  accentSoft: 'rgba(151, 132, 181, 0.22)',
  accentText: '#14101C',

  text: '#EDE6F3',
  textSecondary: '#B5A8C9',
  textMuted: '#7E7390',

  income: '#34D399',
  incomeBg: 'rgba(52, 211, 153, 0.18)',
  expense: '#E489A4',
  expenseBg: 'rgba(184, 90, 120, 0.22)',

  border: 'rgba(237, 230, 243, 0.08)',
  shadow: 'rgba(0, 0, 0, 0.4)',

  trip: '#8FB1F2',
  tripBg: 'rgba(92, 141, 234, 0.20)',
};

export const BLACKCAT_DARK_OLED: ColorTokens = {
  ...BLACKCAT_DARK,
  bg: '#000000',
  bgSubtle: '#06040A',
  card: '#0A0710',
  cardElevated: '#100C18',
  chip: '#140F1E',
};

// ─── SAMOYED ────────────────────────────────────────────────────────────
// Almost-white background + cool steel blue accent. Light, airy,
// "clean fridge" vibe. Expense is a warm coral for contrast.

export const SAMOYED_LIGHT: ColorTokens = {
  bg: '#EAF0F4',
  bgSubtle: '#EAF0F4',
  card: '#FFFFFF',
  cardElevated: 'rgba(123, 167, 201, 0.22)',

  chip: 'rgba(123, 167, 201, 0.14)',
  chipActive: '#7BA7C9',
  chipActiveText: '#FFFFFF',

  accent: '#7BA7C9',
  accentSoft: 'rgba(123, 167, 201, 0.18)',
  accentText: '#FFFFFF',

  text: '#2C3B47',
  textSecondary: '#5F7383',
  textMuted: '#94A2AE',

  income: '#0F8A4E',
  incomeBg: 'rgba(34, 197, 94, 0.16)',
  expense: '#D17B6B',
  expenseBg: 'rgba(209, 123, 107, 0.18)',

  border: 'rgba(123, 167, 201, 0.14)',
  shadow: 'rgba(0, 0, 0, 0.10)',

  trip: '#5891D6',
  tripBg: 'rgba(88, 145, 214, 0.18)',
};

export const SAMOYED_DARK: ColorTokens = {
  bg: '#101720',
  bgSubtle: '#162130',
  card: '#162130',
  cardElevated: '#1F2D3F',

  chip: '#26364B',
  chipActive: '#A4C7E0',
  chipActiveText: '#101720',

  accent: '#A4C7E0',
  accentSoft: 'rgba(164, 199, 224, 0.22)',
  accentText: '#101720',

  text: '#EAF0F4',
  textSecondary: '#A0B3C2',
  textMuted: '#74859A',

  income: '#34D399',
  incomeBg: 'rgba(52, 211, 153, 0.18)',
  expense: '#F4A593',
  expenseBg: 'rgba(209, 123, 107, 0.22)',

  border: 'rgba(234, 240, 244, 0.08)',
  shadow: 'rgba(0, 0, 0, 0.4)',

  trip: '#7DB3FF',
  tripBg: 'rgba(96, 165, 250, 0.18)',
};

export const SAMOYED_DARK_OLED: ColorTokens = {
  ...SAMOYED_DARK,
  bg: '#000000',
  bgSubtle: '#040608',
  card: '#080B0F',
  cardElevated: '#0E1419',
  chip: '#101820',
};

// ─── Registry ───────────────────────────────────────────────────────────

export type PaletteId = 'shiba' | 'calico' | 'penguin' | 'blackcat' | 'samoyed';

export type PaletteVariants = {
  light: ColorTokens;
  dark: ColorTokens;
  darkOled: ColorTokens;
};

export const PALETTES: Record<PaletteId, PaletteVariants> = {
  shiba: { light: SHIBA_LIGHT, dark: SHIBA_DARK, darkOled: SHIBA_DARK_OLED },
  calico: { light: CALICO_LIGHT, dark: CALICO_DARK, darkOled: CALICO_DARK_OLED },
  penguin: {
    light: PENGUIN_LIGHT,
    dark: PENGUIN_DARK,
    darkOled: PENGUIN_DARK_OLED,
  },
  blackcat: {
    light: BLACKCAT_LIGHT,
    dark: BLACKCAT_DARK,
    darkOled: BLACKCAT_DARK_OLED,
  },
  samoyed: {
    light: SAMOYED_LIGHT,
    dark: SAMOYED_DARK,
    darkOled: SAMOYED_DARK_OLED,
  },
};

/**
 * Display metadata for each palette — surfaced in the settings picker.
 * `swatch` is the single hex we paint the picker chip with so users can
 * tell themes apart at a glance.
 */
export const PALETTE_META: Record<
  PaletteId,
  { label: string; subtitle: string; swatch: string }
> = {
  shiba: { label: 'ชิบะ', subtitle: 'ส้มพีชอบอุ่น', swatch: '#D98556' },
  calico: { label: 'แมวสามสี', subtitle: 'ส้มสนิม + ครีม', swatch: '#C45A35' },
  penguin: { label: 'เพนกวิน', subtitle: 'กรมท่าเข้ม', swatch: '#2C3E50' },
  blackcat: { label: 'แมวดำ', subtitle: 'ม่วงเข้มลึกลับ', swatch: '#5B4B6E' },
  samoyed: { label: 'ซามอยด์', subtitle: 'ขาวเย็นอ่อนหวาน', swatch: '#7BA7C9' },
};

export const PALETTE_ORDER: PaletteId[] = [
  'shiba',
  'calico',
  'penguin',
  'blackcat',
  'samoyed',
];

// ─── Legacy aliases ─────────────────────────────────────────────────────
// Keep old names exported so any file that imported LIGHT/DARK/DARK_OLED
// directly keeps compiling. New code should use PALETTES[id] instead.

export const LIGHT = SHIBA_LIGHT;
export const DARK = SHIBA_DARK;
export const DARK_OLED = SHIBA_DARK_OLED;
