import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canRetryFailedCorrection,
  createCorrectionDraftWriter,
  getCorrectionScreenActions,
  getResultScreenActions,
  loadCorrectionDraft,
  parseCorrectionQuantity,
  updateCorrectionDraftQuantity,
  disposeCorrectionDraftWriter,
  persistCorrectionDraft,
} from './correction-screen';
import type { CorrectionDraftComponent } from './correction';

afterEach(() => vi.useRealTimers());

describe('food correction screen behavior', () => {
  it('does not create a fallback draft when loading a saved draft rejects', async () => {
    const createFallback = vi.fn(() => []);

    await expect(
      loadCorrectionDraft(() => Promise.reject(new Error('storage unavailable')), createFallback)
    ).rejects.toThrow('storage unavailable');

    expect(createFallback).not.toHaveBeenCalled();
  });

  it('retries a failed job only when the current draft still matches that job payload', () => {
    const submittedComponent: CorrectionDraftComponent = {
      id: 'component-1',
      catalogFoodId: 'food-rice',
      displayName: 'Nasi putih',
      preparation: 'matang',
      portion: { kind: 'known', quantity: 100, unit: 'g' },
    };
    const snapshot = { jobId: 'job-1', components: [submittedComponent] };

    expect(canRetryFailedCorrection([submittedComponent], snapshot, 'job-1')).toBe(true);
    expect(
      canRetryFailedCorrection(
        [{ ...submittedComponent, displayName: 'Nasi merah' }],
        snapshot,
        'job-1'
      )
    ).toBe(false);
    expect(canRetryFailedCorrection([submittedComponent], snapshot, 'job-2')).toBe(false);
  });

  it('parses only complete positive portion quantities', () => {
    expect(parseCorrectionQuantity('1,5')).toBe(1.5);
    expect(parseCorrectionQuantity(' 2 ')).toBe(2);
    expect(parseCorrectionQuantity('')).toBeNull();
    expect(parseCorrectionQuantity('1,')).toBeNull();
    expect(parseCorrectionQuantity('.')).toBeNull();
    expect(parseCorrectionQuantity('0')).toBeNull();
    expect(parseCorrectionQuantity('-2')).toBeNull();
    expect(parseCorrectionQuantity('abc')).toBeNull();
  });

  it('does not convert an incomplete numeric edit into an unknown portion', () => {
    const component: CorrectionDraftComponent = {
      id: 'component-1',
      catalogFoodId: 'food-rice',
      displayName: 'Nasi putih',
      preparation: 'matang',
      portion: { kind: 'known', quantity: 100, unit: 'g' },
    };

    expect(updateCorrectionDraftQuantity(component, '1,', 'g', null)).toBeNull();
    expect(component.portion).toEqual({ kind: 'known', quantity: 100, unit: 'g' });
    expect(updateCorrectionDraftQuantity(component, '125', 'g', null)).toMatchObject({
      portion: { kind: 'known', quantity: 125, unit: 'g' },
    });
  });

  it('flushes the latest edited draft when leaving before the debounce expires', async () => {
    vi.useFakeTimers();
    const save = vi.fn(async (_draft: string) => {});
    const writer = createCorrectionDraftWriter(save, 250);
    writer.schedule('first edit');
    writer.schedule('last edit');

    await writer.flush();

    expect(save).toHaveBeenCalledExactlyOnceWith('last edit');
    await vi.advanceTimersByTimeAsync(250);
    expect(save).toHaveBeenCalledExactlyOnceWith('last edit');
  });

  it('does not overwrite the stored draft when the route leaves before hydration', async () => {
    vi.useFakeTimers();
    const save = vi.fn(async (_draft: string[]) => {});
    const writer = createCorrectionDraftWriter(save, 250);

    await expect(persistCorrectionDraft(writer, [], false)).resolves.toBe(false);
    await disposeCorrectionDraftWriter(writer, false);
    await vi.advanceTimersByTimeAsync(250);

    expect(save).not.toHaveBeenCalled();
  });

  it('cancels pending lifecycle writes after successful navigation starts', async () => {
    vi.useFakeTimers();
    const save = vi.fn(async (_draft: string[]) => {});
    const writer = createCorrectionDraftWriter(save, 250);
    writer.schedule(['latest edit']);

    await disposeCorrectionDraftWriter(writer, false);

    await vi.advanceTimersByTimeAsync(250);
    expect(save).not.toHaveBeenCalled();
  });

  it('disables editing and submission while a correction is pending', () => {
    expect(
      getCorrectionScreenActions({
        canSubmit: true,
        correctionPending: true,
        sourceIsCurrent: true,
        submitting: false,
        failedCorrection: false,
        retrying: false,
        portionsValid: true,
      })
    ).toMatchObject({ editorDisabled: true, submitDisabled: true, retryVisible: false });
  });

  it('offers retry and explicit return when the latest correction failed', () => {
    expect(
      getCorrectionScreenActions({
        canSubmit: false,
        correctionPending: false,
        sourceIsCurrent: false,
        submitting: false,
        failedCorrection: true,
        retrying: false,
        portionsValid: true,
      })
    ).toMatchObject({ retryVisible: true, retryDisabled: false, returnVisible: true });
  });

  it('disables submission while a numeric portion is incomplete', () => {
    expect(
      getCorrectionScreenActions({
        canSubmit: true,
        correctionPending: false,
        sourceIsCurrent: true,
        submitting: false,
        failedCorrection: false,
        retrying: false,
        portionsValid: false,
      }).submitDisabled
    ).toBe(true);
  });

  it('disables submission while retrying a failed correction', () => {
    expect(
      getCorrectionScreenActions({
        canSubmit: true,
        correctionPending: false,
        sourceIsCurrent: true,
        submitting: false,
        failedCorrection: true,
        retrying: true,
        portionsValid: true,
      }).submitDisabled
    ).toBe(true);
  });

  it('locks the editor while a correction request is being accepted', () => {
    expect(
      getCorrectionScreenActions({
        canSubmit: true,
        correctionPending: false,
        sourceIsCurrent: true,
        submitting: true,
        failedCorrection: false,
        retrying: false,
        portionsValid: true,
      }).editorDisabled
    ).toBe(true);
  });

  it('allows confirmation only for the latest valid result and blocks it while correction is active', () => {
    expect(
      getResultScreenActions({
        latestResultIsCurrent: true,
        canConfirm: true,
        correctionIsActive: false,
      })
    ).toMatchObject({ correctionDisabled: false, consumptionDisabled: false });
    expect(
      getResultScreenActions({
        latestResultIsCurrent: true,
        canConfirm: true,
        correctionIsActive: true,
      })
    ).toMatchObject({ correctionDisabled: true, consumptionDisabled: true });
    expect(
      getResultScreenActions({
        latestResultIsCurrent: false,
        canConfirm: false,
        correctionIsActive: false,
      })
    ).toMatchObject({ correctionDisabled: true, consumptionDisabled: true });
  });
});
