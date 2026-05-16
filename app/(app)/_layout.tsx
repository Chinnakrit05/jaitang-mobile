import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '../../providers/AuthProvider';
import { JtIcon, type IconName } from '../../components/icons/JtIcon';

/**
 * Tab navigator for signed-in users. The four MVP tabs match what the
 * web app exposes most prominently on its mobile bottom bar — dashboard,
 * quick add, transactions, ledger book. Real screens land per-tab.
 */
export default function AppLayout() {
  const { session, loading } = useAuth();
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
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#06b6d4',
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Home',
          tabBarIcon: ({ size }) => <Tab name="home" size={size} />,
        }}
      />
      <Tabs.Screen
        name="quick"
        options={{
          title: 'Quick',
          tabBarIcon: ({ size }) => <Tab name="quick" size={size} />,
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Tx',
          tabBarIcon: ({ size }) => <Tab name="transactions" size={size} />,
        }}
      />
      <Tabs.Screen
        name="ledgers"
        options={{
          title: 'Books',
          tabBarIcon: ({ size }) => <Tab name="ledgers" size={size} />,
        }}
      />
    </Tabs>
  );
}

function Tab({ name, size }: { name: IconName; size: number }) {
  return <JtIcon name={name} size={size} />;
}
