import type { AuthStatus } from './routes';
import type { OnboardingGateState } from '@/lib/onboarding/routes';

export type RootRouteAccess = {
  auth: boolean;
  onboarding: boolean;
  dashboard: boolean;
  authenticated: boolean;
};

export type RootRouteEntry =
  | { type: 'loading'; reason: 'auth' | 'onboarding' }
  | { type: 'redirect'; href: '/(auth)/sign-in' | '/(onboarding)/welcome' | '/(tabs)' };

export function getRootRouteAccess(
  authStatus: AuthStatus,
  onboardingState: OnboardingGateState,
  bypassedForSession = false
): RootRouteAccess {
  const authenticated = authStatus === 'authenticated';
  const bypassed = authenticated && bypassedForSession;
  const onboardingComplete = onboardingState === 'complete';

  return {
    auth: !authenticated,
    onboarding: authenticated && onboardingState === 'incomplete' && !bypassed,
    dashboard:
      authenticated && (onboardingComplete || onboardingState === 'unavailable' || bypassed),
    authenticated: authenticated && (onboardingComplete || bypassed),
  };
}

export function getRootRouteEntry(
  authStatus: AuthStatus,
  onboardingState: OnboardingGateState,
  bypassedForSession = false
): RootRouteEntry {
  if (authStatus === 'loading') return { type: 'loading', reason: 'auth' };
  if (authStatus === 'unauthenticated') {
    return { type: 'redirect', href: '/(auth)/sign-in' };
  }
  if (onboardingState === 'loading') {
    return { type: 'loading', reason: 'onboarding' };
  }
  if (onboardingState === 'incomplete' && !bypassedForSession) {
    return { type: 'redirect', href: '/(onboarding)/welcome' };
  }
  return { type: 'redirect', href: '/(tabs)' };
}
