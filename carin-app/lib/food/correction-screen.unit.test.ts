import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createCorrectionDraftWriter,
  getCorrectionScreenActions,
  getResultScreenActions,
  disposeCorrectionDraftWriter,
  persistCorrectionDraft,
} from './correction-screen';

afterEach(() => vi.useRealTimers());

describe('food correction screen behavior', () => {
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
      })
    ).toMatchObject({ retryVisible: true, retryDisabled: false, returnVisible: true });
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
