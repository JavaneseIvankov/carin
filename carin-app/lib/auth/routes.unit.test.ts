import { describe, expect, it } from 'vitest';
import { decideAuthRoute, resolveIndexDestination, resolvePostSignInDestination } from './routes';

describe('auth route decisions', () => {
  it('allows guests to open auth routes', () => {
    expect(decideAuthRoute('unauthenticated', ['(auth)', 'sign-in'])).toEqual({
      type: 'render',
    });
  });

  it.each([
    ['(tabs)', 'history'],
    ['food', 'capture'],
  ])('redirects guests away from app routes %j', (...segments) => {
    expect(decideAuthRoute('unauthenticated', segments)).toEqual({
      type: 'redirect',
      href: '/(auth)/sign-in',
    });
  });

  it.each(['sign-in', 'sign-up', 'verify-email'])(
    'redirects authenticated users away from auth route %s',
    (screen) => {
      expect(decideAuthRoute('authenticated', ['(auth)', screen])).toEqual({
        type: 'redirect',
        href: '/(tabs)',
      });
    }
  );

  it('does not grant or redirect route access while restoring a session', () => {
    expect(decideAuthRoute('loading', ['(tabs)', 'history'])).toEqual({ type: 'loading' });
  });

  it('resolves the index route only after session restoration', () => {
    expect(resolveIndexDestination('loading')).toBeNull();
    expect(resolveIndexDestination('unauthenticated')).toBe('/(auth)/sign-in');
    expect(resolveIndexDestination('authenticated')).toBe('/(tabs)');
  });

  it('leaves the root index redirect to the index screen after loading', () => {
    expect(decideAuthRoute('loading', ['index'])).toEqual({ type: 'loading' });
    expect(decideAuthRoute('unauthenticated', ['index'])).toEqual({ type: 'render' });
    expect(decideAuthRoute('authenticated', ['index'])).toEqual({ type: 'render' });
  });

  it('preserves a safe in-app destination through sign-in and authenticated redirect', () => {
    expect(resolvePostSignInDestination('/(tabs)/history')).toBe('/(tabs)/history');
    expect(
      decideAuthRoute('unauthenticated', ['food', 'analysis', 'meal-1'], '/food/analysis/meal-1')
    ).toEqual({
      type: 'redirect',
      href: '/(auth)/sign-in?next=%2Ffood%2Fanalysis%2Fmeal-1',
    });
    expect(
      decideAuthRoute(
        'authenticated',
        ['(auth)', 'sign-in'],
        '/(auth)/sign-in',
        '/food/analysis/meal-1'
      )
    ).toEqual({ type: 'redirect', href: '/food/analysis/meal-1' });
  });

  it.each([
    ['auth', 'reset'],
    ['(auth)', 'reset-password'],
    ['(auth)', 'forgot-password'],
  ])(
    'keeps the password-reset recovery route %j reachable for an authenticated user',
    (...segments) => {
      expect(decideAuthRoute('authenticated', segments)).toEqual({ type: 'render' });
    }
  );

  it.each([
    'https://evil.example',
    '//evil.example/path',
    '/(auth)/sign-in',
    '/auth/reset',
    '/food/../(auth)/sign-in',
    '/food/%2f%2fevil.example',
  ])('rejects an unsafe post-sign-in destination %s', (value) => {
    expect(resolvePostSignInDestination(value)).toBeNull();
    expect(
      decideAuthRoute('authenticated', ['(auth)', 'sign-in'], '/(auth)/sign-in', value)
    ).toEqual({
      type: 'redirect',
      href: '/(tabs)',
    });
  });
});
