import type { components } from '@/lib/api/generated/app-api';
import {
  formatLocalDateTime,
  localDateTimeToIso,
  mapManualComponent,
  type ManualConsumptionDraft,
  type ManualFoodComponentDraft,
} from './consumption';

export type PhotoConfirmationOccurrence = 'default_confirmation' | 'new_occurrence';

type AnalysisResult = components['schemas']['ai__AnalysisResult'];
type AnalysisComponent = components['schemas']['ai__ComponentResult'];
type PhotoConsumptionInput = components['schemas']['ConsumptionCreate'];

function mapPhotoComponent(component: AnalysisComponent): ManualFoodComponentDraft {
  const { portion } = component;
  let editablePortion: ManualFoodComponentDraft['portion'] = { kind: 'unknown' };

  if (portion.quantity !== null && portion.unit === 'g') {
    editablePortion = {
      kind: 'known',
      quantity: String(portion.quantity),
      unit: 'g',
    };
  } else if (portion.quantity !== null && portion.unit === 'serving' && portion.servingId) {
    editablePortion = {
      kind: 'known',
      quantity: String(portion.quantity),
      unit: 'serving',
      servingId: portion.servingId,
    };
  }

  return {
    id: component.id,
    displayName: component.displayName,
    catalogFoodId: component.catalogFoodId,
    preparation: component.preparation,
    portion: editablePortion,
  };
}

export function createPhotoConfirmationDraft(
  result: AnalysisResult,
  instant: Date,
  timeZone: string
): ManualConsumptionDraft {
  const local = formatLocalDateTime(instant, timeZone);
  return {
    consumedDate: local.date,
    consumedTime: local.time,
    catalogVersion: result.catalogVersion,
    components: result.components.map(mapPhotoComponent),
    activeComponent: null,
    editingComponentId: null,
  };
}

export function buildPhotoConsumptionInput(
  draft: ManualConsumptionDraft,
  input: {
    scanId: string;
    resultId: string;
    occurrence: PhotoConfirmationOccurrence;
    timeZone: string;
  }
): { value: PhotoConsumptionInput } | { error: string } {
  if (draft.components.length < 1 || draft.components.length > 30) {
    return { error: 'Tambahkan satu sampai 30 komponen makanan.' };
  }
  if (!draft.catalogVersion.trim()) {
    return { error: 'Versi katalog belum tersedia. Coba muat ulang hasil analisis.' };
  }

  const consumedAt = localDateTimeToIso(draft.consumedDate, draft.consumedTime, input.timeZone);
  if ('error' in consumedAt) return consumedAt;

  const mappedComponents = draft.components.map(mapManualComponent);
  const invalidComponent = mappedComponents.find((component) => 'error' in component);
  if (invalidComponent && 'error' in invalidComponent) return invalidComponent;

  return {
    value: {
      source: 'photo_confirmation',
      scanId: input.scanId,
      sourceAnalysisResultId: input.resultId,
      occurrence: input.occurrence,
      consumedAt: consumedAt.value,
      timezone: input.timeZone,
      components: mappedComponents.map((component) => {
        if ('error' in component) throw new Error('Validated component unexpectedly failed.');
        return component.value;
      }),
      catalogVersion: draft.catalogVersion.trim(),
    },
  };
}

export function getPhotoConfirmationAvailability(input: {
  scan: components['schemas']['Scan'];
  latestJob: components['schemas']['AnalysisJob'] | undefined;
  resultId: string | undefined;
  result: AnalysisResult | undefined;
  explicitlyUseLastSuccessfulResult: boolean;
}): 'loading' | 'unavailable' | 'correction_pending' | 'confirm' | 'open_existing' {
  const { scan, latestJob, resultId, result, explicitlyUseLastSuccessfulResult } = input;

  if (!scan.latestResultId) return 'unavailable';
  if (!latestJob) return 'loading';

  const latestScanJob =
    latestJob.id === scan.latestJobId &&
    latestJob.targetType === 'scan' &&
    latestJob.targetId === scan.id;
  if (!latestScanJob) return 'loading';
  if (latestJob.status === 'queued' || latestJob.status === 'processing') {
    return 'correction_pending';
  }

  if (!resultId || !result) return 'loading';
  if (resultId !== scan.latestResultId) return 'unavailable';

  if (latestJob.status === 'failed') {
    if (!explicitlyUseLastSuccessfulResult) return 'unavailable';
  } else if (latestJob.status !== 'completed' || latestJob.resultId !== resultId) {
    return 'unavailable';
  }

  return scan.defaultConsumptionId ? 'open_existing' : 'confirm';
}
