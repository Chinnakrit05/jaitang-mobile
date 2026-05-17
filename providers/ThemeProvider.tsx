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
  LIGHT,
  DARK,
  DARK_OLED,
  type ColorTokens,
} from '../lib/theme/colors';

/**
 * Theme provider — owns the active color palette for the whole app.
 *
 * Three knobs:
 *   - `mode` ∈ 'light' | 'dark' | 'system'
 *   - `oled` boolean — picks a pure-black palette inside dark mode
 *   - `isDark` computed — true when current effective mode is dark
 *
 * Both knobs persist in AsyncStorage (`jt-theme-mode` / `jt-theme-oled`).
 * System mode subscribes to `Appearance` so the app re-themes when the
 * OS toggles dark mode at sunset.
 *
 * Future accent colors + seasonal palettes will plug in here by adding
 * extra knobs that compose with mode.
 */

export type Mode = 'light' | 'dark' | 'system';

const MODE_KEY = 'jt-theme-mode';
const OLED_KEY = 'jt-theme-oled';

type ThemeCtx = {
  colors: ColorTokens;
  mode: Mode;
  setMode: (m: Mode) => void;
  oled: boolean;
  setOled: (b: boolean) => void;
  isDark: boolean;
};

const Ctx = createContext<ThemeCtx>({
  colors: LIGHT,
  mode: 'system',
  setMode: () => {},
  oled: false,
  setOled: () => {},
  isDark: false,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>('system');
  const [oled, setOledState] = useState(false);
  const [systemDark, setSystemDark] = useState(
    Appearance.getColorScheme() === 'dark',
  );

  // Hydrate persisted prefs once on mount. Done in two queries instead
  // of one composite read so a corrupted value for one key doesn't lose
  // the other.
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
  }, []);

  // Track system color scheme — only meaningful when `mode === 'system'`,
  // but it's cheap to keep up-to-date regardless.
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

  const isDark = mode === 'dark' || (mode === 'system' && systemDark);
  const colors = isDark ? (oled ? DARK_OLED : DARK) : LIGHT;

  return (
    <Ctx.Provider
      value={{ colors, mode, setMode, oled, setOled, isDark }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useTheme() {
  return useContext(Ctx);
}
