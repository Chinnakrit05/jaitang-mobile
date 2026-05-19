import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  PALETTES,
  PALETTE_ORDER,
  SHIBA_LIGHT,
  type ColorTokens,
  type PaletteId,
} from '../lib/theme/colors';

/**
 * Theme provider — owns the active color palette for the whole app.
 *
 * Three orthogonal knobs:
 *   - `palette` ∈ 'shiba' | 'calico' | 'penguin' | 'blackcat' | 'samoyed'
 *   - `mode`    ∈ 'light' | 'dark' | 'system'
 *   - `oled`    boolean — picks a pure-black variant inside dark mode
 *
 * They compose to a single `ColorTokens` object that screens consume via
 * `useTheme().colors`. Each knob persists in AsyncStorage under its own
 * key (so a corrupted value for one doesn't lose the others). System
 * mode subscribes to `Appearance` so the app re-themes when the OS
 * toggles dark mode at sunset.
 */

export type Mode = 'light' | 'dark' | 'system';

const MODE_KEY = 'jt-theme-mode';
const OLED_KEY = 'jt-theme-oled';
const PALETTE_KEY = 'jt-theme-palette';

type ThemeCtx = {
  colors: ColorTokens;
  mode: Mode;
  setMode: (m: Mode) => void;
  oled: boolean;
  setOled: (b: boolean) => void;
  palette: PaletteId;
  setPalette: (p: PaletteId) => void;
  isDark: boolean;
};

const Ctx = createContext<ThemeCtx>({
  colors: SHIBA_LIGHT,
  mode: 'system',
  setMode: () => {},
  oled: false,
  setOled: () => {},
  palette: 'shiba',
  setPalette: () => {},
  isDark: false,
});

function isPaletteId(v: unknown): v is PaletteId {
  return typeof v === 'string' && (PALETTE_ORDER as string[]).includes(v);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>('system');
  const [oled, setOledState] = useState(false);
  const [palette, setPaletteState] = useState<PaletteId>('shiba');
  const [systemDark, setSystemDark] = useState(
    Appearance.getColorScheme() === 'dark',
  );

  // Hydrate persisted prefs once on mount. Done in independent reads so
  // a corrupted value for one key doesn't blow away the others.
  useEffect(() => {
    AsyncStorage.getItem(MODE_KEY)
      .then((v) => {
        if (v === 'light' || v === 'dark' || v === 'system') setModeState(v);
      })
      .catch(() => {});
    AsyncStorage.getItem(OLED_KEY)
      .then((v) => {
        if (v === 'true') setOledState(true);
      })
      .catch(() => {});
    AsyncStorage.getItem(PALETTE_KEY)
      .then((v) => {
        if (isPaletteId(v)) setPaletteState(v);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemDark(colorScheme === 'dark');
    });
    return () => sub.remove();
  }, []);

  function setMode(m: Mode) {
    setModeState(m);
    AsyncStorage.setItem(MODE_KEY, m).catch(() => {});
  }
  function setOled(b: boolean) {
    setOledState(b);
    AsyncStorage.setItem(OLED_KEY, b ? 'true' : 'false').catch(() => {});
  }
  function setPalette(p: PaletteId) {
    setPaletteState(p);
    AsyncStorage.setItem(PALETTE_KEY, p).catch(() => {});
  }

  const isDark = mode === 'dark' || (mode === 'system' && systemDark);
  const variants = PALETTES[palette] ?? PALETTES.shiba;
  const colors = isDark ? (oled ? variants.darkOled : variants.dark) : variants.light;

  return (
    <Ctx.Provider
      value={{
        colors,
        mode,
        setMode,
        oled,
        setOled,
        palette,
        setPalette,
        isDark,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useTheme() {
  return useContext(Ctx);
}
