import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

/**
 * Thin wrapper around NetInfo so the sync engine and UI badges can
 * share a single source of truth. `isOnline` flips false while the
 * device has no usable connectivity (airplane mode, captive portal,
 * etc.); true when we can actually reach the internet.
 */
export function useNetworkStatus() {
  const [isOnline, setOnline] = useState(true);
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const reachable =
        state.isConnected === true && state.isInternetReachable !== false;
      setOnline(reachable);
    });
    NetInfo.fetch().then((state) => {
      const reachable =
        state.isConnected === true && state.isInternetReachable !== false;
      setOnline(reachable);
    });
    return () => unsub();
  }, []);
  return { isOnline };
}

export async function isOnlineNow(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return state.isConnected === true && state.isInternetReachable !== false;
}
