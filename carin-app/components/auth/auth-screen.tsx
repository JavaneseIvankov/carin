import { Text } from '@/components/ui/text';
import { Image, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const MASCOT = require('../../assets/images/carin-mascot.png');

export function AuthScreen({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          className="flex-1"
          contentContainerClassName="flex-grow justify-center px-5 py-8"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}>
          <View className="mx-auto w-full max-w-lg gap-6">
            <View className="items-center gap-3">
              <View
                className="items-center justify-center bg-carin-butter"
                style={{
                  borderRadius: 20,
                  width: 56,
                  height: 56,
                }}>
                <Image
                  source={MASCOT}
                  resizeMode="contain"
                  accessibilityLabel="Maskot Carin"
                  style={{
                    width: 62,
                    height: 66,
                    transform: [{ rotate: '-4deg' }],
                  }}
                />
              </View>
              <View className="items-center gap-1 px-2">
                <Text variant="h1" className="text-center">
                  {title}
                </Text>
                <Text variant="muted" className="text-center">
                  {description}
                </Text>
              </View>
            </View>
            <View className="rounded-summary border border-border bg-card p-6">
              {children}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
