import { describe, expect, it } from 'vitest';
import { decideAuthRoute, resolveIndexDestination } from './routes';

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

  it.each(['sign-in', 'sign-up'])(
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
});
