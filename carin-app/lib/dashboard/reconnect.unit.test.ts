import { describe, expect, it } from 'vitest';
import { shouldRefetchDashboardOnReconnect } from './reconnect';

describe('dashboard reconnect refresh', () => {
  it('refreshes only when the focused home tab transitions from offline to online', () => {
    expect(shouldRefetchDashboardOnReconnect('offline', 'online', true)).toBe(true);
    expect(shouldRefetchDashboardOnReconnect('offline', 'online', false)).toBe(false);
    expect(shouldRefetchDashboardOnReconnect('unknown', 'online', true)).toBe(false);
    expect(shouldRefetchDashboardOnReconnect('online', 'offline', true)).toBe(false);
  });
});
