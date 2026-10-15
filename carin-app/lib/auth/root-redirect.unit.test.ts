import { describe, expect, it, vi } from 'vitest';
import { createRootRedirectCoordinator } from './root-redirect';

describe('createRootRedirectCoordinator', () => {
  it('waits for a route target and replaces once per target', () => {
    const coordinate = createRootRedirectCoordinator();
    const replace = vi.fn();

    coordinate(null, replace);
    coordinate('/(onboarding)/welcome', replace);
    coordinate('/(onboarding)/welcome', replace);
    coordinate('/(tabs)', replace);

    expect(replace.mock.calls).toEqual([['/(onboarding)/welcome'], ['/(tabs)']]);
  });

  it('allows the same target again after redirecting stops', () => {
    const coordinate = createRootRedirectCoordinator();
    const replace = vi.fn();

    coordinate('/(tabs)', replace);
    coordinate(null, replace);
    coordinate('/(tabs)', replace);

    expect(replace).toHaveBeenCalledTimes(2);
  });
});
