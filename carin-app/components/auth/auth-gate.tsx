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
import { useAppRead } from '@/lib/api/query';
import { useAuth } from '@/lib/auth/provider';
import { decideAuthRoute } from '@/lib/auth/routes';
import { useOnboardingSession } from '@/components/onboarding/onboarding-session';
import { decideOnboardingRoute, onboardingGateStateFromQuery } from '@/lib/onboarding/routes';

export function AuthRestorationState({
  error,
  onRetry,
  onSignIn,
  loadingLabel = 'Memulihkan sesi',
  className = 'flex-1 items-center justify-center bg-background px-6',
}: {
  error?: unknown;
  onRetry?: () => void;
  onSignIn?: () => void;
  loadingLabel?: string;
  className?: string;
}) {
  return (
    <View className={className}>
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

export function AuthGate() {
  const { status, error, user, retryRestoration, invalidateSession } = useAuth();
  const { isBypassed } = useOnboardingSession();
  const router = useRouter();
  const segments = useSegments();
  const pathname = usePathname();
  const params = useGlobalSearchParams<{
    next?: string | string[];
    returnTo?: string | string[];
  }>();
  const decision = decideAuthRoute(status, segments.map(String), pathname, params.next);
  const onboardingQuery = useAppRead('getOnboarding', {}, { enabled: status === 'authenticated' });
  const onboardingDecision = decideOnboardingRoute({
    authStatus: status,
    authDecision: decision,
    state: onboardingGateStateFromQuery(onboardingQuery),
    segments: segments.map(String),
    pathname,
    requestedDestination: params.returnTo ?? params.next,
    userId: user?.id,
    bypassedUserId: user?.id && isBypassed(user.id) ? user.id : null,
  });

  if (onboardingDecision.type === 'render') return null;
  const authIsLoading = decision.type === 'loading';
  return (
    <>
      <AuthRestorationState
        className="absolute inset-0 z-50 flex-1 items-center justify-center bg-background px-6"
        loadingLabel={authIsLoading ? 'Memulihkan sesi' : 'Memeriksa pengenalan Carin'}
        error={authIsLoading ? error : undefined}
        onRetry={authIsLoading ? () => void retryRestoration() : undefined}
        onSignIn={
          authIsLoading && error !== undefined
            ? () => {
                void invalidateSession().then(() => router.replace('/(auth)/sign-in'));
              }
            : undefined
        }
      />
      {onboardingDecision.type === 'redirect' ? (
        <Redirect href={onboardingDecision.href as Href} />
      ) : null}
    </>
  );
}
