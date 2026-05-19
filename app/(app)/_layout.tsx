import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '../../providers/AuthProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { AppTabBar } from '../../components/AppTabBar';

/**
 * Tab navigator for signed-in users. The visual layout is rendered by
 * `AppTabBar` (see `ui/Dashboard.html` for the source design) — order is
 * dashboard → transactions → quick (FAB) → insights → settings. The
 * declaration order here must match the visual order because the tab
 * bar reads `state.routes` by index.
 *
 * `ledgers` is intentionally hidden from the bar via `href: null`; it's
 * still reachable programmatically (e.g. from the profile screen) but
 * not pinned to the bottom nav.
 */
export default function AppLayout() {
  const { session, loading } = useAuth();
  const c = useTheme().colors;
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  if (!session) return <Redirect href="/(auth)/login" />;
  return (
    <Tabs
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        animation: 'shift',
        sceneStyle: { backgroundColor: c.bg },
        transitionSpec: {
          animation: 'timing',
          config: { duration: 240 },
        },
      }}
    >
      <Tabs.Screen name="dashboard" />
      <Tabs.Screen name="transactions" />
      <Tabs.Screen name="quick" />
      <Tabs.Screen name="insights" />
      <Tabs.Screen name="more" />
      {/* Hidden screens — reachable via router.push but not pinned to
          the bottom nav. The "more" tab acts as the menu hub. */}
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="categories" options={{ href: null }} />
      <Tabs.Screen name="recurring" options={{ href: null }} />
      <Tabs.Screen name="trips" options={{ href: null }} />
      <Tabs.Screen name="accounts" options={{ href: null }} />
      <Tabs.Screen name="budgets" options={{ href: null }} />
      <Tabs.Screen name="ledgers" options={{ href: null }} />
      <Tabs.Screen name="onboarding-ledger" options={{ href: null }} />
      <Tabs.Screen name="edit-transaction" options={{ href: null }} />
    </Tabs>
  );
}
