import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '../providers/AuthProvider';

/**
 * Root entry — sends signed-in users into the tab navigator and the rest
 * to the auth flow. Renders a spinner while the initial session check is
 * still resolving so we don't flash the wrong screen.
 */
export default function Index() {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  return session ? <Redirect href="/(app)/dashboard" /> : <Redirect href="/(auth)/login" />;
}
