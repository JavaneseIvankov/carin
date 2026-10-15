import '@/global.css';

import * as React from 'react';
import { View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { PortalHost } from '@rn-primitives/portal';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import { AppDataProvider } from '@/lib/data/provider';
import { AuthProvider, useAuth } from '@/lib/auth/provider';
import { OnboardingSessionProvider, useOnboardingSession } from '@/components/onboarding/onboarding-session';
import { useAppRead } from '@/lib/api/query';
import { onboardingGateStateFromQuery } from '@/lib/onboarding/routes';
import { getRootRouteAccess } from '@/lib/auth/root-route-access';
import type { ErrorBoundaryProps } from 'expo-router';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { errorLogDetails, logAppEvent } from '@/lib/logging';
import { CarinThemeProvider } from '@/lib/theme';

void SplashScreen.preventAutoHideAsync().catch(() => {});

export const unstable_settings = { anchor: 'index' };

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  React.useEffect(() => {
    logAppEvent('error', 'ui.root_error.displayed', errorLogDetails(error));
  }, [error]);

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background p-6">
      <Text className="text-center">Terjadi kendala saat membuka aplikasi.</Text>
      <Button onPress={() => void retry()} accessibilityLabel="Coba lagi">
        <Text>Coba lagi</Text>
      </Button>
    </View>
  );
}

function RootNavigator() {
  const { status, user } = useAuth();
  const { isBypassed } = useOnboardingSession();
  const onboardingQuery = useAppRead('getOnboarding', {}, { enabled: status === 'authenticated' });
  const onboardingState = onboardingGateStateFromQuery(onboardingQuery);
  const access = getRootRouteAccess(
    status,
    onboardingState,
    Boolean(user?.id && isBypassed(user.id))
  );

  return (
    <>
      <Stack
        screenOptions={{ headerShown: false }}
        UNSTABLE_routeNamesChangeBehavior="lastUnhandled">
        <Stack.Screen name="index" />
        <Stack.Screen name="auth/reset" />
        <Stack.Screen name="forgot-password" />
        <Stack.Screen name="reset-password" />
        <Stack.Screen name="legal/[document]" />

        <Stack.Protected guard={access.auth}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>

        <Stack.Protected guard={access.onboarding}>
          <Stack.Screen name="(onboarding)" />
        </Stack.Protected>

        <Stack.Protected guard={access.dashboard}>
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>

        <Stack.Protected guard={access.authenticated}>
          <Stack.Screen name="account/delete" />
          <Stack.Screen name="consumptions/[id]" />
          <Stack.Screen name="consumptions/[id]/edit" />
          <Stack.Screen name="consumptions/from-scan/[scanId]" />
          <Stack.Screen name="consumptions/new" />
          <Stack.Screen name="exams/[id]" />
          <Stack.Screen name="exams/[id]/edit" />
          <Stack.Screen name="exams/new" />
          <Stack.Screen name="food/analysis/[id]" />
          <Stack.Screen name="food/capture" />
          <Stack.Screen name="food/correction/[id]" />
          <Stack.Screen name="settings" />
        </Stack.Protected>
      </Stack>
      <PortalHost />
    </>
  );
}

export default function RootLayout() {
  const { colorScheme } = useColorScheme();
  const splashHidden = React.useRef(false);
  const hideSplashAfterLayout = React.useCallback(() => {
    if (splashHidden.current) return;
    splashHidden.current = true;
    void SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <CarinThemeProvider>
      <View style={{ flex: 1 }} onLayout={hideSplashAfterLayout}>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
        <AppDataProvider>
          <AuthProvider>
            <OnboardingSessionProvider>
              <RootNavigator />
            </OnboardingSessionProvider>
          </AuthProvider>
        </AppDataProvider>
      </View>
    </CarinThemeProvider>
  );
}
