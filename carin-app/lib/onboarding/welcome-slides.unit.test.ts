import { describe, expect, it } from 'vitest';
import {
  WELCOME_SLIDES,
  getNextWelcomeAction,
  getPreviousWelcomeIndex,
} from './welcome-slides';

describe('welcome carousel', () => {
  it('introduces the companion, food entry timing, and optional health profile in order', () => {
    expect(WELCOME_SLIDES.map(({ id }) => id)).toEqual([
      'companion',
      'food-paths',
      'health-profile',
    ]);
    expect(WELCOME_SLIDES[1]?.title).toContain('sebelum makan');
    expect(WELCOME_SLIDES[1]?.body).toContain('mengonfirmasi');
    expect(WELCOME_SLIDES[2]?.body).toContain('Isi nanti');
  });

  it('keeps the previous action at the first slide and moves back one slide', () => {
    expect(getPreviousWelcomeIndex(0)).toBe(0);
    expect(getPreviousWelcomeIndex(2)).toBe(1);
  });

  it('advances without going beyond the final slide, then opens the profile step', () => {
    expect(getNextWelcomeAction(0)).toEqual({ type: 'slide', index: 1 });
    expect(getNextWelcomeAction(1)).toEqual({ type: 'slide', index: 2 });
    expect(getNextWelcomeAction(2)).toEqual({ type: 'profile' });
  });
});
