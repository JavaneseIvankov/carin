import * as React from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Redirect, useGlobalSearchParams, usePathname, useSegments, type Href } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
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
  React.useEffect(() => {
    if (error !== undefined) {
      void SplashScreen.hideAsync().catch(() => {});
    }
  }, [error]);

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
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ next?: string | string[] }>();
  const decision = decideAuthRoute(status, segments.map(String), pathname, params.next);

  React.useEffect(() => {
    if (status !== 'loading' || error !== undefined) {
      void SplashScreen.hideAsync().catch(() => {});
    }
  }, [status, error]);

  if (decision.type === 'render') return null;
  const isLoading = decision.type === 'loading';
  return (
    <>
      <AuthRestorationState
        className="absolute inset-0 z-50 flex-1 items-center justify-center bg-background px-6"
        error={isLoading ? error : undefined}
        onRetry={isLoading ? () => void retryRestoration() : undefined}
      />
      {decision.type === 'redirect' ? <Redirect href={decision.href as Href} /> : null}
    </>
  );
}
