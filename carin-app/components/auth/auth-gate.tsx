import * as React from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Redirect, useSegments } from 'expo-router';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/auth/provider';
import { decideAuthRoute } from '@/lib/auth/routes';

export function AuthRestorationState({
  error,
  onRetry,
  className = 'flex-1 items-center justify-center bg-background px-6',
}: {
  error?: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <View className={className}>
      <ActivityIndicator accessibilityLabel="Memulihkan sesi" />
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
        </View>
      ) : null}
    </View>
  );
}

export function AuthGate() {
  const { status, error, retryRestoration } = useAuth();
  const segments = useSegments();
  const decision = decideAuthRoute(status, segments.map(String));

  if (decision.type === 'render') return null;
  const isLoading = decision.type === 'loading';
  return (
    <>
      <AuthRestorationState
        className="absolute inset-0 z-50 flex-1 items-center justify-center bg-background px-6"
        error={isLoading ? error : undefined}
        onRetry={isLoading ? () => void retryRestoration() : undefined}
      />
      {decision.type === 'redirect' ? <Redirect href={decision.href} /> : null}
    </>
  );
}
