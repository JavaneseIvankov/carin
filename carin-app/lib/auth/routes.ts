export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export type AuthRouteDecision =
  | { type: 'render' }
  | { type: 'loading' }
  | { type: 'redirect'; href: '/(auth)/sign-in' | '/(tabs)' };

const SIGN_IN_ROUTE = '/(auth)/sign-in' as const;
const APP_ROUTE = '/(tabs)' as const;

export function decideAuthRoute(
  status: AuthStatus,
  segments: readonly string[]
): AuthRouteDecision {
  if (status === 'loading') return { type: 'loading' };
  if (segments[0] === 'index') return { type: 'render' };

  const inAuthRoutes = segments[0] === '(auth)' || segments[0] === 'auth';
  if (inAuthRoutes) {
    return status === 'authenticated' ? { type: 'redirect', href: APP_ROUTE } : { type: 'render' };
  }

  return status === 'unauthenticated'
    ? { type: 'redirect', href: SIGN_IN_ROUTE }
    : { type: 'render' };
}

export function resolveIndexDestination(status: AuthStatus): '/(auth)/sign-in' | '/(tabs)' | null {
  if (status === 'loading') return null;
  return status === 'authenticated' ? APP_ROUTE : SIGN_IN_ROUTE;
}
