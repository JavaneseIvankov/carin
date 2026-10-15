import { describe, expect, it } from 'vitest';
import { resolveExaminationTimezoneRead } from './timezone-state';

describe('examination account timezone read state', () => {
  it('blocks create and edit when getMe fails despite cached timezone data', () => {
    expect(
      resolveExaminationTimezoneRead({
        timezone: 'Asia/Jakarta',
        isPending: false,
        error: new Error('Network unavailable'),
      })
    ).toEqual({
      status: 'error',
      timezone: 'Asia/Jakarta',
      submissionDisabled: true,
    });
  });

  it('allows the form only after the account timezone read succeeds', () => {
    expect(
      resolveExaminationTimezoneRead({
        timezone: 'Asia/Jakarta',
        isPending: false,
        error: null,
      })
    ).toEqual({
      status: 'ready',
      timezone: 'Asia/Jakarta',
      submissionDisabled: false,
    });
  });
});
