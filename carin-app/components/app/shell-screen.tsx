import { OnlineIndicator } from '@/components/app/online-indicator';
import { Text } from '@/components/ui/text';
import { useAppData } from '@/lib/data/provider';
import { ScrollView, View } from 'react-native';

export function ShellScreen({ title, description }: { title: string; description: string }) {
  const { connectivity } = useAppData();
  return (
    <View className="flex-1 bg-background">
      <OnlineIndicator connectivity={connectivity} />
      <ScrollView contentContainerClassName="gap-4 px-5 py-8">
        <Text variant="h2">{title}</Text>
        <Text variant="muted">{description}</Text>
      </ScrollView>
    </View>
  );
}
