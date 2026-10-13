import { Text } from '@/components/ui/text';
import type { Connectivity } from '@/lib/data/network';
import { View } from 'react-native';

export function OnlineIndicator({ connectivity }: { connectivity: Connectivity }) {
  if (connectivity !== 'offline') return null;
  return (
    <View className="bg-amber-100 px-4 py-2 dark:bg-amber-950" accessibilityRole="alert">
      <Text className="text-center text-sm text-amber-950 dark:text-amber-100">
        Offline · Data tersimpan mungkin sudah lama. Menyimpan perlu koneksi.
      </Text>
    </View>
  );
}
