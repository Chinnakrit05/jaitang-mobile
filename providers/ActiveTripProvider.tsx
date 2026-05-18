import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useActiveLedger } from './ActiveLedgerProvider';
import { useTrips, type Trip } from '../lib/queries/trips';

/**
 * Tracks which trip is "currently active" for the active ledger.
 *
 * The active trip is the one new transactions get auto-tagged to (in
 * `quick.tsx`). At most one trip can be active per ledger; selection
 * resets to null when the user switches ledgers, since trip ids are
 * ledger-scoped.
 *
 * Persisted in AsyncStorage under a per-ledger key so each book
 * remembers its own selection across app restarts.
 */

const KEY_PREFIX = 'jt-active-trip:';

type ActiveTripCtx = {
  trip: Trip | null;
  setActiveTrip: (id: string | null) => void;
};

const Ctx = createContext<ActiveTripCtx>({
  trip: null,
  setActiveTrip: () => {},
});

export function ActiveTripProvider({ children }: { children: ReactNode }) {
  const { ledger } = useActiveLedger();
  const trips = useTrips(ledger?.id);
  const [storedId, setStoredId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Reload the stored active-trip id whenever the active ledger changes
  // (different ledger → different key → different selection).
  useEffect(() => {
    let mounted = true;
    if (!ledger) {
      setStoredId(null);
      setHydrated(true);
      return;
    }
    setHydrated(false);
    AsyncStorage.getItem(KEY_PREFIX + ledger.id)
      .then((id) => {
        if (!mounted) return;
        setStoredId(id);
      })
      .finally(() => {
        if (mounted) setHydrated(true);
      });
    return () => {
      mounted = false;
    };
  }, [ledger?.id]);

  const trip = useMemo(() => {
    if (!storedId) return null;
    const found = (trips.data ?? []).find((t) => t.id === storedId);
    // If the stored trip got deleted or archived, clear silently.
    if (!found || found.archived) return null;
    return found;
  }, [storedId, trips.data]);

  function setActiveTrip(id: string | null) {
    if (!ledger) return;
    setStoredId(id);
    if (id) {
      AsyncStorage.setItem(KEY_PREFIX + ledger.id, id).catch(() => {});
    } else {
      AsyncStorage.removeItem(KEY_PREFIX + ledger.id).catch(() => {});
    }
  }

  return (
    <Ctx.Provider value={{ trip, setActiveTrip }}>{children}</Ctx.Provider>
  );
}

export function useActiveTrip() {
  return useContext(Ctx);
}
