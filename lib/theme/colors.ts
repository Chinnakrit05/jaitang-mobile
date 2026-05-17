/**
 * Color tokens for the three theme modes the app supports:
 *
 *   - **light** — the default warm peachy / earth-tone palette ported
 *     directly from `ui/Dashboard.html`.
 *   - **dark** — same brand voice (warm, playful) but with deep brown
 *     backgrounds and cream-on-brown text.
 *   - **darkOled** — dark mode with pure-black surfaces for OLED screens.
 *     Inherits everything from dark except the background tones.
 *
 * Every screen should read from `useTheme().colors` rather than hard-
 * coding hexes so dark mode + accent / seasonal palettes (a future
 * shipment) can swap the whole app without touching individual files.
 *
 * Naming convention:
 *   - `bg*`     — page / surface backgrounds
 *   - `card*`   — raised surfaces (white in light mode)
 *   - `chip*`   — small interactive pills / tag backgrounds
 *   - `text*`   — foreground text shades
 *   - `income / expense` — semantic colors that already have meaning
 *     and shouldn't be themed at the palette level
 *   - `border`  — hairline dividers
 *   - `accent`  — the playful CTA / active-state color
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
  accentSoft: string; // tinted background for accent pills
  accentText: string; // text color *on* the accent

  // Foreground text
  text: string;
  textSecondary: string;
  textMuted: string;

  // Semantic — these intentionally stay vivid in both modes so users
  // can spot income vs expense at a glance.
  income: string;
  incomeBg: string;
  expense: string;
  expenseBg: string;

  // Structural
  border: string;
  shadow: string;

  // Trip card accent (blue) — used as a category-style highlight
  trip: string;
  tripBg: string;
};

export const LIGHT: ColorTokens = {
  // Three-color palette (per design): #D98556 accent, #FFEDD5 light,
  // #FFFFFF white. Sub-tones use rgba of the accent so we don't
  // introduce additional brand colors. `cardElevated` is a translucent
  // accent overlay — sits as a deeper peach on top of the #FFEDD5 page
  // bg, giving the hero card a visible "raised" look without leaving
  // the 3-color brand palette.
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

export const DARK: ColorTokens = {
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

export const DARK_OLED: ColorTokens = {
  ...DARK,
  bg: '#000000',
  bgSubtle: '#0A0808',
  card: '#0F0B08',
  cardElevated: '#181210',
  chip: '#1C140F',
};
