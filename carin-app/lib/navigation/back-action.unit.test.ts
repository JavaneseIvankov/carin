import { describe, expect, it } from 'vitest';
import { resolveBackAction } from './back-action';

describe('BackButton navigation resolution', () => {
  it('returns disabled when disabled is true, even if other handlers are passed', () => {
    expect(
      resolveBackAction({
        disabled: true,
        onPress: () => {},
        canGoBack: true,
        href: '/(tabs)/profile',
      })
    ).toBe('disabled');
  });

  it('prioritizes custom onPress handler over navigation stack and href', () => {
    expect(
      resolveBackAction({
        disabled: false,
        onPress: () => {},
        canGoBack: true,
        href: '/(tabs)/profile',
      })
    ).toBe('custom');
  });

  it('uses router.back() when canGoBack is true and no custom onPress was provided', () => {
    expect(
      resolveBackAction({
        disabled: false,
        canGoBack: true,
        href: '/(tabs)/exams',
      })
    ).toBe('back');
  });

  it('falls back to replacing with href when canGoBack is false', () => {
    expect(
      resolveBackAction({
        disabled: false,
        canGoBack: false,
        href: '/(tabs)/profile',
      })
    ).toEqual({ replace: '/(tabs)/profile' });
  });

  it('defaults to back if no href and canGoBack is false', () => {
    expect(
      resolveBackAction({
        disabled: false,
        canGoBack: false,
      })
    ).toBe('back');
  });
});
