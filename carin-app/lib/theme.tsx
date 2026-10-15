import { DarkTheme, DefaultTheme, ThemeProvider, type Theme } from 'expo-router/react-navigation';
import { useColorScheme } from 'nativewind';
import * as React from 'react';
import { Platform, type ColorValue } from 'react-native';
import { cssColorToNativeColor } from '@/lib/css-color';
import { useNativeCssVariable } from '@/lib/use-native-css-variable';

const NAVIGATION_COLOR_TOKENS = [
  'background',
  'border',
  'card',
  'destructive',
  'foreground',
  'primary',
] as const;

type NavigationColorToken = (typeof NAVIGATION_COLOR_TOKENS)[number];
type NavigationColors = Record<NavigationColorToken, ColorValue>;
const WEB_NAVIGATION_COLORS = Object.fromEntries(
  NAVIGATION_COLOR_TOKENS.map((token) => [token, cssVariable(token)])
) as NavigationColors;

function createNavigationTheme(scheme: 'light' | 'dark', colors: NavigationColors): Theme {
  const baseTheme = scheme === 'dark' ? DarkTheme : DefaultTheme;

  return {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      background: colors.background,
      border: colors.border,
      card: colors.card,
      notification: colors.destructive,
      primary: colors.primary,
      text: colors.foreground,
    },
  };
}

function cssVariable(token: NavigationColorToken) {
  return `hsl(var(--${token}))` as ColorValue;
}

function NativeNavigationThemeProvider({ children }: React.PropsWithChildren) {
  const { colorScheme } = useColorScheme();
  const background = useNativeCssVariable('--background');
  const border = useNativeCssVariable('--border');
  const card = useNativeCssVariable('--card');
  const destructive = useNativeCssVariable('--destructive');
  const foreground = useNativeCssVariable('--foreground');
  const primary = useNativeCssVariable('--primary');
  const scheme = colorScheme === 'dark' ? 'dark' : 'light';
  const theme = React.useMemo(
    () =>
      createNavigationTheme(scheme, {
        background: cssColorToNativeColor(background),
        border: cssColorToNativeColor(border),
        card: cssColorToNativeColor(card),
        destructive: cssColorToNativeColor(destructive),
        foreground: cssColorToNativeColor(foreground),
        primary: cssColorToNativeColor(primary),
      }),
    [background, border, card, destructive, foreground, primary, scheme]
  );

  return <ThemeProvider value={theme}>{children}</ThemeProvider>;
}

function WebNavigationThemeProvider({ children }: React.PropsWithChildren) {
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === 'dark' ? 'dark' : 'light';
  const theme = React.useMemo(() => createNavigationTheme(scheme, WEB_NAVIGATION_COLORS), [scheme]);

  return <ThemeProvider value={theme}>{children}</ThemeProvider>;
}

/** Bridges the canonical CSS-variable palette to navigator-owned surfaces. */
export function CarinThemeProvider({ children }: React.PropsWithChildren) {
  return Platform.OS === 'web' ? (
    <WebNavigationThemeProvider>{children}</WebNavigationThemeProvider>
  ) : (
    <NativeNavigationThemeProvider>{children}</NativeNavigationThemeProvider>
  );
}
