export function createCorrectionDraftWriter<T>(
  save: (value: T) => Promise<void>,
  delayMs = 250,
  onError: (error: unknown) => void = () => {},
  onSaved: () => void = () => {}
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let latestValue: T;
  let revision = 0;
  let savedRevision = 0;
  let writeChain: Promise<void> = Promise.resolve();

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (revision === savedRevision) return writeChain;

    const writeRevision = revision;
    const value = latestValue;
    writeChain = writeChain
      .catch(() => {})
      .then(() => save(value))
      .then(() => {
        savedRevision = Math.max(savedRevision, writeRevision);
        onSaved();
      });
    return writeChain;
  };

  return {
    schedule(value: T) {
      latestValue = value;
      revision += 1;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void flush().catch(onError), delayMs);
    },
    flush,
    dispose: flush,
    cancel() {
      if (timer) clearTimeout(timer);
      timer = undefined;
    },
  };
}

type CorrectionDraftWriter<T> = ReturnType<typeof createCorrectionDraftWriter<T>>;

export async function persistCorrectionDraft<T>(
  writer: CorrectionDraftWriter<T>,
  value: T,
  enabled: boolean
): Promise<boolean> {
  if (!enabled) return false;
  writer.schedule(value);
  await writer.flush();
  return true;
}

export async function disposeCorrectionDraftWriter<T>(
  writer: CorrectionDraftWriter<T>,
  shouldFlush: boolean
): Promise<void> {
  if (shouldFlush) await writer.dispose();
  else writer.cancel();
}

export function getCorrectionScreenActions(input: {
  canSubmit: boolean;
  correctionPending: boolean;
  sourceIsCurrent: boolean;
  submitting: boolean;
  failedCorrection: boolean;
  retrying: boolean;
}) {
  return {
    editorDisabled: input.correctionPending || !input.sourceIsCurrent,
    submitDisabled: !input.canSubmit || input.correctionPending || input.submitting,
    retryVisible: input.failedCorrection,
    retryDisabled: input.retrying,
    returnVisible: true,
  };
}

export function getResultScreenActions(input: {
  latestResultIsCurrent: boolean;
  canConfirm: boolean;
  correctionIsActive: boolean;
}) {
  return {
    correctionDisabled: !input.latestResultIsCurrent || input.correctionIsActive,
    consumptionDisabled: !input.canConfirm || input.correctionIsActive,
  };
}
