import '@/global.css';

import * as React from 'react';
import { View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { PortalHost } from '@rn-primitives/portal';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import { AppDataProvider } from '@/lib/data/provider';
import { AuthProvider } from '@/lib/auth/provider';
import { AuthGate } from '@/components/auth/auth-gate';
import type { ErrorBoundaryProps } from 'expo-router';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { errorLogDetails, logAppEvent } from '@/lib/logging';
import { CarinThemeProvider } from '@/lib/theme';

void SplashScreen.preventAutoHideAsync().catch(() => {});

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
            <Stack screenOptions={{ headerShown: false }} />
            <PortalHost />
            <AuthGate />
          </AuthProvider>
        </AppDataProvider>
      </View>
    </CarinThemeProvider>
  );
}
