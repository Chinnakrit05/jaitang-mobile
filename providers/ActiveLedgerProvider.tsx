import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from './AuthProvider';
import { useLedgers, type LedgerSummary } from '../lib/queries/ledgers';
import {
  useCategories,
  useSeedDefaultCategories,
} from '../lib/queries/categories';

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

  // ---- Auto-seed default categories ----
  // A subcategory can't exist without a parent, so a brand-new ledger
  // with zero categories is a footgun (the parent picker would be
  // empty). New ledgers created via the `create_ledger` RPC already get
  // seeded server-side; this effect handles ledgers that pre-date the
  // auto-seed wiring or were created some other way.
  //
  // The seed RPC is idempotent (skips if any non-deleted category
  // already exists). We still track attempts per-session in a ref so we
  // don't spam the network if the seed fails for some reason — on
  // failure we remove the id so the next mount can retry.
  const cats = useCategories(active?.id);
  const seed = useSeedDefaultCategories();
  const seedAttempted = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!active) return;
    if (cats.isLoading || cats.isFetching) return;
    if ((cats.data?.length ?? 0) > 0) return;
    if (seedAttempted.current.has(active.id)) return;
    seedAttempted.current.add(active.id);
    console.log('[ActiveLedger] auto-seeding categories for', active.id);
    seed
      .mutateAsync(active.id)
      .then((count) => {
        console.log('[ActiveLedger] seed result — count from server:', count);
      })
      .catch((e) => {
        console.warn('[ActiveLedger] auto-seed failed for', active.id, e);
        // Allow a retry on next mount — but only if data is still empty
        // (otherwise we'd loop on transient errors).
        seedAttempted.current.delete(active.id);
      });
    // `seed` is a stable mutation object from react-query; intentionally
    // omitted from deps so we don't re-fire when its internal state
    // updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, cats.isLoading, cats.isFetching, cats.data?.length]);

  return (
    <Ctx.Provider value={{ ledger: active, loading, setActiveLedger }}>
      {children}
    </Ctx.Provider>
  );
}

export function useActiveLedger() {
  return useContext(Ctx);
}
