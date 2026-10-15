import {
  resolvePostSignInDestination,
  type AuthRouteDecision,
  type AuthStatus,
} from '@/lib/auth/routes';

export type OnboardingGateState = 'loading' | 'incomplete' | 'complete' | 'unavailable';

export type OnboardingRouteInput = {
  authStatus: AuthStatus;
  authDecision: AuthRouteDecision;
  state: OnboardingGateState;
  segments: readonly string[];
  pathname: string;
  requestedDestination?: string | string[];
  bypassedUserId?: string | null;
  userId?: string | null;
};

export type OnboardingRouteDecision =
  | { type: 'render' }
  | { type: 'loading' }
  | { type: 'redirect'; href: string };

export type OnboardingQuerySnapshot = {
  data?: { data: { completedAt: string | null }; stale: boolean };
  isPending: boolean;
  isError: boolean;
};

const APP_ROUTE = '/(tabs)';
const WELCOME_ROUTE = '/(onboarding)/welcome';

export function onboardingGateStateFromQuery(query: OnboardingQuerySnapshot): OnboardingGateState {
  if (query.data?.data.completedAt) return 'complete';
  if (query.data && !query.data.stale) return 'incomplete';
  if (query.isError || query.data?.stale) return 'unavailable';
  return 'loading';
}

function singleValue(value: string | string[] | undefined): string | null {
  if (typeof value === 'string') return value;
  return Array.isArray(value) && value.length === 1 ? value[0] ?? null : null;
}

function safeDestination(value: string | string[] | undefined): string | null {
  return resolvePostSignInDestination(singleValue(value));
}

function isPasswordResetRoute(segments: readonly string[]): boolean {
  return (
    (segments[0] === 'auth' && segments[1] === 'reset') ||
    (segments[0] === '(auth)' &&
      (segments[1] === 'reset-password' || segments[1] === 'forgot-password'))
  );
}

function isSignInRoute(segments: readonly string[]): boolean {
  return (
    (segments[0] === '(auth)' && segments[1] === 'sign-in') ||
    (segments[0] === 'auth' && segments[1] === 'sign-in')
  );
}

function isOnboardingRoute(segments: readonly string[]): boolean {
  return segments[0] === '(onboarding)';
}

function isDashboardRoute(segments: readonly string[]): boolean {
  return segments[0] === '(tabs)' && (segments[1] === 'index' || segments.length === 1);
}

function returnDestination(input: OnboardingRouteInput): string {
  const requested = safeDestination(input.requestedDestination);
  if (requested) return requested;

  if (isSignInRoute(input.segments) && input.authDecision.type === 'redirect') {
    return safeDestination(input.authDecision.href) ?? APP_ROUTE;
  }

  if (!isOnboardingRoute(input.segments) && input.segments[0] !== 'index') {
    return resolvePostSignInDestination(input.pathname) ?? APP_ROUTE;
  }

  return APP_ROUTE;
}

function welcomeHref(destination: string): string {
  return destination === APP_ROUTE
    ? WELCOME_ROUTE
    : `${WELCOME_ROUTE}?returnTo=${encodeURIComponent(destination)}`;
}

export function decideOnboardingRoute(input: OnboardingRouteInput): OnboardingRouteDecision {
  if (input.authDecision.type === 'loading') return { type: 'loading' };
  if (input.authStatus !== 'authenticated') return input.authDecision;
  if (isPasswordResetRoute(input.segments)) return input.authDecision;
  if (input.state === 'loading') return { type: 'loading' };

  const hasSessionBypass =
    input.userId !== null &&
    input.userId !== undefined &&
    input.bypassedUserId === input.userId;
  if (hasSessionBypass) return input.authDecision;

  if (input.state === 'unavailable') {
    return isDashboardRoute(input.segments)
      ? input.authDecision
      : { type: 'redirect', href: APP_ROUTE };
  }

  if (input.state === 'complete') {
    if (!isOnboardingRoute(input.segments)) return input.authDecision;
    return { type: 'redirect', href: returnDestination(input) };
  }

  if (isOnboardingRoute(input.segments)) return input.authDecision;
  return { type: 'redirect', href: welcomeHref(returnDestination(input)) };
}
