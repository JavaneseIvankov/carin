import '@/global.css';

import { NAV_THEME } from '@/lib/theme';
import { ThemeProvider } from 'expo-router/react-navigation';
import { PortalHost } from '@rn-primitives/portal';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import { AppDataProvider } from '@/lib/data/provider';
import { AuthProvider } from '@/lib/auth/provider';
import { AuthGate } from '@/components/auth/auth-gate';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export default function RootLayout() {
  const { colorScheme } = useColorScheme();

  return (
    <ThemeProvider value={NAV_THEME[colorScheme ?? 'light']}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <AppDataProvider>
        <AuthProvider>
          <Stack screenOptions={{ headerShown: false }} />
          <PortalHost />
          <AuthGate />
        </AuthProvider>
      </AppDataProvider>
    </ThemeProvider>
  );
}
