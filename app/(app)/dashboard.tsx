import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, View } from 'react-native';

export default function DashboardScreen() {
  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="px-5 pt-2">
        <Text className="text-2xl font-semibold">Dashboard</Text>
        <Text className="text-sm text-zinc-500 mt-1">
          TODO: today / month summary + range pills + per-day mini chart
        </Text>
      </View>
    </SafeAreaView>
  );
}
