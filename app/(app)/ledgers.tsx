import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, View } from 'react-native';

export default function LedgersScreen() {
  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="px-5 pt-2">
        <Text className="text-2xl font-semibold">Ledgers</Text>
        <Text className="text-sm text-zinc-500 mt-1">
          TODO: list + switch + manage members on shared ones
        </Text>
      </View>
    </SafeAreaView>
  );
}
