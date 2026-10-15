import { describe, expect, it } from 'vitest';
import { getRootRouteAccess, getRootRouteEntry } from './root-route-access';

describe('root route access', () => {
  it('holds navigation on the entry route while auth or onboarding state is loading', () => {
    expect(getRootRouteAccess('loading', 'loading')).toEqual({
      auth: true,
      onboarding: false,
      dashboard: false,
      authenticated: false,
    });
    expect(getRootRouteEntry('loading', 'loading')).toEqual({ type: 'loading', reason: 'auth' });
    expect(getRootRouteEntry('authenticated', 'loading')).toEqual({
      type: 'loading',
      reason: 'onboarding',
    });
  });

  it('exposes only auth routes to guests', () => {
    expect(getRootRouteAccess('unauthenticated', 'loading')).toEqual({
      auth: true,
      onboarding: false,
      dashboard: false,
      authenticated: false,
    });
    expect(getRootRouteEntry('unauthenticated', 'loading')).toEqual({
      type: 'redirect',
      href: '/(auth)/sign-in',
    });
  });

  it('exposes onboarding routes and directs new accounts to welcome', () => {
    expect(getRootRouteAccess('authenticated', 'incomplete')).toEqual({
      auth: false,
      onboarding: true,
      dashboard: false,
      authenticated: false,
    });
    expect(getRootRouteEntry('authenticated', 'incomplete')).toEqual({
      type: 'redirect',
      href: '/(onboarding)/welcome',
    });
  });

  it('exposes the full app after onboarding is complete', () => {
    expect(getRootRouteAccess('authenticated', 'complete')).toEqual({
      auth: false,
      onboarding: false,
      dashboard: true,
      authenticated: true,
    });
    expect(getRootRouteEntry('authenticated', 'complete')).toEqual({
      type: 'redirect',
      href: '/(tabs)',
    });
  });

  it('allows dashboard-only access when onboarding status is unavailable', () => {
    expect(getRootRouteAccess('authenticated', 'unavailable')).toEqual({
      auth: false,
      onboarding: false,
      dashboard: true,
      authenticated: false,
    });
    expect(getRootRouteEntry('authenticated', 'unavailable')).toEqual({
      type: 'redirect',
      href: '/(tabs)',
    });
  });

  it('allows the current account to bypass onboarding for this session only', () => {
    expect(getRootRouteAccess('authenticated', 'incomplete', true)).toEqual({
      auth: false,
      onboarding: false,
      dashboard: true,
      authenticated: true,
    });
    expect(getRootRouteEntry('authenticated', 'incomplete', true)).toEqual({
      type: 'redirect',
      href: '/(tabs)',
    });
  });
});
