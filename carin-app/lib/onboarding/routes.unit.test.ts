import { describe, expect, it } from 'vitest';
import { decideAuthRoute } from '@/lib/auth/routes';
import type { AuthStatus } from '@/lib/auth/routes';
import { decideOnboardingRoute, onboardingGateStateFromQuery } from './routes';
import type { OnboardingRouteInput } from './routes';

function input(
  overrides: Partial<OnboardingRouteInput> & {
    authStatus?: AuthStatus;
    segments?: readonly string[];
    pathname?: string;
  } = {}
): OnboardingRouteInput {
  const authStatus = overrides.authStatus ?? 'authenticated';
  const segments = overrides.segments ?? ['(tabs)', 'index'];
  const pathname = overrides.pathname ?? '/';
  return {
    authStatus,
    authDecision:
      overrides.authDecision ??
      decideAuthRoute(authStatus, segments.map(String), pathname, overrides.requestedDestination),
    state: overrides.state ?? 'incomplete',
    segments,
    pathname,
    requestedDestination: overrides.requestedDestination,
    userId: overrides.userId ?? 'account-1',
    bypassedUserId: overrides.bypassedUserId,
  };
}

describe('decideOnboardingRoute', () => {
  it('sends an incomplete account from the Dashboard to the welcome carousel', () => {
    expect(decideOnboardingRoute(input())).toEqual({
      type: 'redirect',
      href: '/(onboarding)/welcome',
    });
  });

  it('preserves a protected deep link through the carousel', () => {
    const result = decideOnboardingRoute(
      input({ segments: ['(tabs)', 'history'], pathname: '/history' })
    );
    expect(result).toEqual({
      type: 'redirect',
      href: '/(onboarding)/welcome?returnTo=%2Fhistory',
    });
  });

  it('renders the requested protected route after completion', () => {
    expect(decideOnboardingRoute(input({ state: 'complete' }))).toEqual({ type: 'render' });
  });

  it('opens the requested deep link after onboarding is completed', () => {
    const result = decideOnboardingRoute(
      input({
        state: 'complete',
        segments: ['(onboarding)', 'health-profile'],
        pathname: '/health-profile',
        requestedDestination: '/history',
      })
    );
    expect(result).toEqual({ type: 'redirect', href: '/history' });
  });

  it('uses the Dashboard when the completion status cannot be read', () => {
    expect(decideOnboardingRoute(input({ state: 'unavailable' }))).toEqual({ type: 'render' });
    expect(
      decideOnboardingRoute(
        input({
          state: 'unavailable',
          segments: ['(tabs)', 'history'],
          pathname: '/history',
        })
      )
    ).toEqual({ type: 'redirect', href: '/(tabs)' });
  });

  it('allows the welcome and profile steps while onboarding is incomplete', () => {
    for (const route of ['welcome', 'health-profile']) {
      expect(
        decideOnboardingRoute(
          input({ segments: ['(onboarding)', route], pathname: `/${route}` })
        )
      ).toEqual({ type: 'render' });
    }
  });

  it('uses a safe sign-in destination as the onboarding return route', () => {
    const segments = ['(auth)', 'sign-in'];
    const authDecision = decideAuthRoute('authenticated', segments, '/sign-in', '/history');
    expect(
      decideOnboardingRoute(
        input({
          segments,
          pathname: '/sign-in',
          authDecision,
          requestedDestination: '/history',
        })
      )
    ).toEqual({ type: 'redirect', href: '/(onboarding)/welcome?returnTo=%2Fhistory' });
  });

  it('returns a signed-in user to the sign-in destination when onboarding is already complete', () => {
    const segments = ['(auth)', 'sign-in'];
    const authDecision = decideAuthRoute('authenticated', segments, '/sign-in', '/history');
    expect(
      decideOnboardingRoute(
        input({
          state: 'complete',
          segments,
          pathname: '/sign-in',
          authDecision,
          requestedDestination: '/history',
        })
      )
    ).toEqual({ type: 'redirect', href: '/history' });
  });

  it('keeps guests and password reset routes under the auth gate', () => {
    const guestSegments = ['(tabs)', 'index'];
    const guestStatus = 'unauthenticated';
    expect(
      decideOnboardingRoute(
        input({
          authStatus: guestStatus,
          segments: guestSegments,
          pathname: '/',
          authDecision: decideAuthRoute(guestStatus, guestSegments, '/'),
        })
      )
    ).toEqual({ type: 'redirect', href: '/(auth)/sign-in' });

    const resetSegments = ['(auth)', 'reset-password'];
    expect(
      decideOnboardingRoute(
        input({
          state: 'incomplete',
          segments: resetSegments,
          pathname: '/reset-password',
          authDecision: decideAuthRoute('authenticated', resetSegments, '/reset-password'),
        })
      )
    ).toEqual({ type: 'render' });
  });

  it('rejects unsafe or ambiguous return destinations', () => {
    for (const destination of ['//example.com', '/%(auth)/sign-in', '/history?private=1', ['/history', '/profile']]) {
      const result = decideOnboardingRoute(
        input({
          state: 'complete',
          segments: ['(onboarding)', 'health-profile'],
          pathname: '/health-profile',
          requestedDestination: destination,
        })
      );
      expect(result).toEqual({ type: 'redirect', href: '/(tabs)' });
    }
  });

  it('bypasses onboarding only for the current session account', () => {
    expect(
      decideOnboardingRoute(input({ state: 'unavailable', bypassedUserId: 'account-1' }))
    ).toEqual({ type: 'render' });
    expect(
      decideOnboardingRoute(
        input({ state: 'incomplete', userId: 'account-2', bypassedUserId: 'account-1' })
      )
    ).toEqual({ type: 'redirect', href: '/(onboarding)/welcome' });
  });
});

describe('onboardingGateStateFromQuery', () => {
  it('uses only fresh incomplete data to prompt onboarding', () => {
    expect(
      onboardingGateStateFromQuery({
        data: { data: { completedAt: null }, stale: false },
        isPending: false,
        isError: false,
      })
    ).toBe('incomplete');
  });

  it('treats cached completion as complete and cached incomplete status as unavailable', () => {
    expect(
      onboardingGateStateFromQuery({
        data: { data: { completedAt: '2026-10-15T00:00:00.000Z' }, stale: true },
        isPending: false,
        isError: false,
      })
    ).toBe('complete');
    expect(
      onboardingGateStateFromQuery({
        data: { data: { completedAt: null }, stale: true },
        isPending: false,
        isError: false,
      })
    ).toBe('unavailable');
  });

  it('reports loading before a response and unavailable after a read error', () => {
    expect(onboardingGateStateFromQuery({ isPending: true, isError: false })).toBe('loading');
    expect(onboardingGateStateFromQuery({ isPending: false, isError: true })).toBe('unavailable');
  });
});
