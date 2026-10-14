import { describe, expect, it } from 'vitest';
import { shouldShowDashboardNextAction, shouldStackDashboardActions } from './layout';

describe('shouldStackDashboardActions', () => {
  it('stacks on narrow screens and enlarged text', () => {
    expect(shouldStackDashboardActions(320, 1)).toBe(true);
    expect(shouldStackDashboardActions(390, 1)).toBe(false);
    expect(shouldStackDashboardActions(390, 1.3)).toBe(true);
  });
});

describe('shouldShowDashboardNextAction', () => {
  it('hides actions already represented by the dashboard action group', () => {
    expect(shouldShowDashboardNextAction('record_consumption')).toBe(false);
    expect(shouldShowDashboardNextAction('complete_profile')).toBe(false);
    expect(shouldShowDashboardNextAction('record_examination')).toBe(true);
  });
});
