import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { ICON_STYLES, type IconStyle } from './icon-names';

const STORAGE_KEY = 'jt-icon-style';
const DEFAULT_STYLE: IconStyle = 'sticker';

const Ctx = createContext<{
  style: IconStyle;
  setStyle: (s: IconStyle) => void;
}>({
  style: DEFAULT_STYLE,
  setStyle: () => {},
});

/**
 * Holds the active JtIcon sprite style. Same name + API as the web app's
 * provider, except persistence goes through AsyncStorage instead of
 * localStorage. SSR / hydration isn't a concern here — React Native
 * always renders client-side — so the rehydration flash is invisible.
 */
export function IconStyleProvider({ children }: { children: ReactNode }) {
  const [style, setStyleState] = useState<IconStyle>(DEFAULT_STYLE);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (!mounted || !stored) return;
      if ((ICON_STYLES as readonly string[]).includes(stored)) {
        setStyleState(stored as IconStyle);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  function setStyle(next: IconStyle) {
    setStyleState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      // Persistence is best-effort; in-memory state still updated.
    });
  }

  return <Ctx.Provider value={{ style, setStyle }}>{children}</Ctx.Provider>;
}

export function useIconStyle(): IconStyle {
  return useContext(Ctx).style;
}

export function useSetIconStyle(): (s: IconStyle) => void {
  return useContext(Ctx).setStyle;
}
