import type { CorrectionDraftComponent } from './correction';

export function loadCorrectionDraft<T>(load: () => Promise<T | null>, create: () => T): Promise<T> {
  return load().then((saved) => saved ?? create());
}

export function parseCorrectionQuantity(value: string): number | null {
  const trimmed = value.trim();
  if (!/^(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(trimmed)) return null;
  const quantity = Number(trimmed.replace(',', '.'));
  return Number.isFinite(quantity) && quantity > 0 ? quantity : null;
}

export function updateCorrectionDraftQuantity(
  component: CorrectionDraftComponent,
  value: string,
  mode: 'unknown' | 'g' | 'serving',
  servingId: string | null
): CorrectionDraftComponent | null {
  const quantity = parseCorrectionQuantity(value);
  if (!quantity || mode === 'unknown') return null;
  if (mode === 'serving') {
    if (!servingId) return null;
    return {
      ...component,
      portion: { kind: 'known', quantity, servingId, unit: 'serving' },
    };
  }
  return {
    ...component,
    portion: { kind: 'known', quantity, unit: 'g' },
  };
}

function correctionDraftFingerprint(draft: CorrectionDraftComponent[]): string {
  return JSON.stringify(
    draft.map((component) => ({
      id: component.id,
      catalogFoodId: component.catalogFoodId,
      displayName: component.displayName.trim(),
      preparation: component.preparation,
      portion:
        component.portion.kind === 'unknown'
          ? ['unknown']
          : component.portion.unit === 'g'
            ? ['known', 'g', component.portion.quantity]
            : ['known', 'serving', component.portion.quantity, component.portion.servingId],
    }))
  );
}

export function canRetryFailedCorrection(
  draft: CorrectionDraftComponent[],
  snapshot: { jobId: string; components: CorrectionDraftComponent[] } | null,
  failedJobId: string
): boolean {
  return (
    !!snapshot &&
    snapshot.jobId === failedJobId &&
    Array.isArray(snapshot.components) &&
    correctionDraftFingerprint(draft) === correctionDraftFingerprint(snapshot.components)
  );
}

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
  portionsValid?: boolean;
}) {
  return {
    editorDisabled:
      input.correctionPending || !input.sourceIsCurrent || input.submitting || input.retrying,
    submitDisabled:
      !input.canSubmit ||
      input.correctionPending ||
      input.submitting ||
      input.retrying ||
      !(input.portionsValid ?? true),
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
