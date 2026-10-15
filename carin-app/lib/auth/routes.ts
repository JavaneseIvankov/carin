export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export type AuthRouteDecision =
  { type: 'render' } | { type: 'loading' } | { type: 'redirect'; href: string };

const SIGN_IN_ROUTE = '/(auth)/sign-in' as const;
const APP_ROUTE = '/(tabs)' as const;

export function resolvePostSignInDestination(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 512 ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\?#\u0000-\u001f\u007f]/.test(value)
  ) {
    return null;
  }

  let segments: string[];
  try {
    segments = value
      .slice(1)
      .split('/')
      .map((segment) => decodeURIComponent(segment));
  } catch {
    return null;
  }

  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        /[\\/?#\u0000-\u001f\u007f]/.test(segment)
    )
  ) {
    return null;
  }

  const first = segments[0]?.toLowerCase();
  if (first === '(auth)' || first === 'auth') return null;
  return value;
}

export function decideAuthRoute(
  status: AuthStatus,
  segments: readonly string[],
  pathname?: string,
  requestedDestination?: string | string[]
): AuthRouteDecision {
  if (status === 'loading') return { type: 'loading' };
  if (segments[0] === 'index') return { type: 'render' };

  const resetFlowRoute =
    (segments[0] === 'auth' && segments[1] === 'reset') ||
    segments[0] === 'reset-password' ||
    segments[0] === 'forgot-password';
  if (resetFlowRoute) return { type: 'render' };

  const inAuthRoutes = segments[0] === '(auth)' || segments[0] === 'auth';
  if (inAuthRoutes) {
    if (status !== 'authenticated') return { type: 'render' };
    const destination =
      segments[1] === 'sign-in' ? resolvePostSignInDestination(requestedDestination) : null;
    return { type: 'redirect', href: destination ?? APP_ROUTE };
  }

  if (status !== 'unauthenticated') return { type: 'render' };
  const destination = resolvePostSignInDestination(pathname);
  return {
    type: 'redirect',
    href: destination ? `${SIGN_IN_ROUTE}?next=${encodeURIComponent(destination)}` : SIGN_IN_ROUTE,
  };
}

export function resolveIndexDestination(status: AuthStatus): '/(auth)/sign-in' | '/(tabs)' | null {
  if (status === 'loading') return null;
  return status === 'authenticated' ? APP_ROUTE : SIGN_IN_ROUTE;
}
