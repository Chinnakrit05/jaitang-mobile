import '../global.css';
import '../lib/i18n';

import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider } from '../providers/AuthProvider';
import { ActiveLedgerProvider } from '../providers/ActiveLedgerProvider';
import { QueryProvider } from '../providers/QueryProvider';
import { SyncProvider } from '../providers/SyncProvider';
import { IconStyleProvider } from '../components/icons/IconStyleContext';

/**
 * Root layout wraps every route in the auth + query providers. Per-segment
 * layouts under `(auth)/` and `(app)/` handle their own redirects based on
 * `useAuth()`.
 */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryProvider>
          <AuthProvider>
            <ActiveLedgerProvider>
              <SyncProvider>
                <IconStyleProvider>
                  <StatusBar style="auto" />
                  <Stack screenOptions={{ headerShown: false }} />
                </IconStyleProvider>
              </SyncProvider>
            </ActiveLedgerProvider>
          </AuthProvider>
        </QueryProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
