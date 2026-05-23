import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Insights / รายงาน — placeholder. Real screen ports from the
 * `ui/Insights.html` mockup in a later commit.
 */
export default function InsightsScreen() {
  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <Text className="text-2xl font-semibold">รายงาน</Text>
        <Text className="text-sm text-zinc-500">
          กราฟ + สรุปหมวดหมู่จะมาในเฟสถัดไป — ดู `ui/Insights.html` สำหรับ design
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
