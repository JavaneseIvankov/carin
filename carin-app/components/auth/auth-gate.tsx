import * as React from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import {
  Redirect,
  useGlobalSearchParams,
  usePathname,
  useRouter,
  useSegments,
  type Href,
} from 'expo-router';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/auth/provider';
import { decideAuthRoute } from '@/lib/auth/routes';

export function AuthRestorationState({
  error,
  onRetry,
  onSignIn,
  className = 'flex-1 items-center justify-center bg-background px-6',
}: {
  error?: unknown;
  onRetry?: () => void;
  onSignIn?: () => void;
  className?: string;
}) {
  return (
    <View className={className}>
      {error === undefined ? <ActivityIndicator accessibilityLabel="Memulihkan sesi" /> : null}
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

export function AuthGate() {
  const { status, error, retryRestoration, invalidateSession } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ next?: string | string[] }>();
  const decision = decideAuthRoute(status, segments.map(String), pathname, params.next);

  if (decision.type === 'render') return null;
  const isLoading = decision.type === 'loading';
  return (
    <>
      <AuthRestorationState
        className="absolute inset-0 z-50 flex-1 items-center justify-center bg-background px-6"
        error={isLoading ? error : undefined}
        onRetry={isLoading ? () => void retryRestoration() : undefined}
        onSignIn={
          isLoading && error !== undefined
            ? () => {
                void invalidateSession().then(() => router.replace('/(auth)/sign-in'));
              }
            : undefined
        }
      />
      {decision.type === 'redirect' ? <Redirect href={decision.href as Href} /> : null}
    </>
  );
}
