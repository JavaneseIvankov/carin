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
  };
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
