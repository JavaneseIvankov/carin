import * as React from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';

export function AuthRestorationState({
  error,
  onRetry,
  onSignIn,
  loadingLabel = 'Memulihkan sesi',
}: {
  error?: unknown;
  onRetry?: () => void;
  onSignIn?: () => void;
  loadingLabel?: string;
}) {
  return (
    <View className="flex-1 items-center justify-center bg-background px-6">
      {error === undefined ? <ActivityIndicator accessibilityLabel={loadingLabel} /> : null}
      {error !== undefined ? (
        <View className="mt-4 items-center gap-3">
          <Text className="text-center text-muted-foreground">
            Sesi belum dapat diperiksa. Periksa koneksi lalu coba lagi.
          </Text>
          {onRetry ? (
            <Pressable accessibilityRole="button" onPress={onRetry}>
              <Text className="font-semibold text-primary">Coba lagi</Text>
            </Pressable>
          ) : null}
          {onSignIn ? (
            <Pressable accessibilityRole="button" onPress={onSignIn}>
              <Text className="font-semibold text-primary">Masuk kembali</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
