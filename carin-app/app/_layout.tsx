import '@/global.css';

import * as React from 'react';
import { View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { NAV_THEME } from '@/lib/theme';
import { ThemeProvider } from 'expo-router/react-navigation';
import { PortalHost } from '@rn-primitives/portal';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import { AppDataProvider } from '@/lib/data/provider';
import { AuthProvider } from '@/lib/auth/provider';
import { AuthGate } from '@/components/auth/auth-gate';

void SplashScreen.preventAutoHideAsync().catch(() => {});

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export default function RootLayout() {
  const { colorScheme } = useColorScheme();
  const splashHidden = React.useRef(false);
  const hideSplashAfterLayout = React.useCallback(() => {
    if (splashHidden.current) return;
    splashHidden.current = true;
    void SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <ThemeProvider value={NAV_THEME[colorScheme ?? 'light']}>
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
    </ThemeProvider>
  );
}
