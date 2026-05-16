import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from './AuthProvider';
import { useLedgers, type LedgerSummary } from '../lib/queries/ledgers';

const STORAGE_KEY = 'jt-active-ledger';

type ActiveLedgerCtx = {
  ledger: LedgerSummary | null;
  /** True while the ledgers query is loading or no ledger has been picked. */
  loading: boolean;
  setActiveLedger: (id: string) => void;
};

const Ctx = createContext<ActiveLedgerCtx>({
  ledger: null,
  loading: true,
  setActiveLedger: () => {},
});

/**
 * Picks one ledger as "active" so the rest of the app has a known
 * scope to query against. Mirrors the web app's `jt_active_ledger`
 * cookie: hydrates from AsyncStorage on mount, falls back to the
 * first ledger the user owns if nothing is stored, and exposes a
 * setter so a ledger-switcher screen can change it.
 */
export function ActiveLedgerProvider({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth();
  const ledgers = useLedgers();
  const [storedId, setStoredId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Pull the persisted id once when the user is signed in.
  useEffect(() => {
    if (!session) {
      setStoredId(null);
      setHydrated(true);
      return;
    }
    AsyncStorage.getItem(STORAGE_KEY)
      .then((id) => setStoredId(id))
      .finally(() => setHydrated(true));
  }, [session]);

  const all = ledgers.data ?? [];
  // Prefer the stored id if it still maps to a ledger the user can see;
  // otherwise default to the first one (personal usually comes first).
  const active =
    (storedId ? all.find((l) => l.id === storedId) : null) ?? all[0] ?? null;

  function setActiveLedger(id: string) {
    setStoredId(id);
    AsyncStorage.setItem(STORAGE_KEY, id).catch(() => {});
  }

  const loading = authLoading || ledgers.isLoading || !hydrated;

  return (
    <Ctx.Provider value={{ ledger: active, loading, setActiveLedger }}>
      {children}
    </Ctx.Provider>
  );
}

export function useActiveLedger() {
  return useContext(Ctx);
}
