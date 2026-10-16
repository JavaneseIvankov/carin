import type { components } from '@/lib/api/generated/app-api';
import {
  formatLocalDateTime,
  localDateTimeToIso,
  mapManualComponent,
  parsePhotoPortionFraction,
  type ManualConsumptionDraft,
  type ManualFoodComponentDraft,
} from './consumption';

export type PhotoConfirmationOccurrence = 'default_confirmation' | 'new_occurrence';

type AnalysisResult = components['schemas']['ai__AnalysisResult'];
type AnalysisComponent = components['schemas']['ai__ComponentResult'];
type PhotoConsumptionInput = components['schemas']['ConsumptionCreate'];

function mapPhotoComponent(
  component: AnalysisComponent,
  modelEstimateSourceIds: ReadonlySet<string>
): ManualFoodComponentDraft {
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

  const photoEstimated = Object.values(component.nutrientSourceIds).some(
    (sourceId) => sourceId !== null && modelEstimateSourceIds.has(sourceId)
  );

  return {
    id: component.id,
    displayName: component.displayName,
    catalogFoodId: component.matchStatus === 'matched' ? component.catalogFoodId : null,
    preparation: component.preparation,
    portion: editablePortion,
    ...(photoEstimated
      ? {
          photoEstimated: true,
          photoSourceGrams: portion.grams,
          photoPortionFraction: '1',
        }
      : {}),
  };
}

export function createPhotoConfirmationDraft(
  result: AnalysisResult,
  instant: Date,
  timeZone: string
): ManualConsumptionDraft {
  const local = formatLocalDateTime(instant, timeZone);
  const modelEstimateSourceIds = new Set(
    result.sources.filter((source) => source.kind === 'model_estimate').map(({ id }) => id)
  );
  return {
    consumedDate: local.date,
    consumedTime: local.time,
    catalogVersion: result.catalogVersion,
    components: result.components.map((component) =>
      mapPhotoComponent(component, modelEstimateSourceIds)
    ),
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
  const photoComponents = mappedComponents.map((mapped, index) => {
    if ('error' in mapped) throw new Error('Validated component unexpectedly failed.');
    const draftComponent = draft.components[index]!;
    if (!draftComponent.photoEstimated || draftComponent.catalogFoodId !== null)
      return mapped.value;
    const fraction = parsePhotoPortionFraction(draftComponent.photoPortionFraction ?? '1');
    if ('error' in fraction) return fraction;
    return { ...mapped.value, photoPortionFraction: fraction.value };
  });
  const invalidFraction = photoComponents.find((component) => 'error' in component);
  if (invalidFraction && 'error' in invalidFraction) return invalidFraction;

  return {
    value: {
      source: 'photo_confirmation',
      scanId: input.scanId,
      sourceAnalysisResultId: input.resultId,
      occurrence: input.occurrence,
      consumedAt: consumedAt.value,
      timezone: input.timeZone,
      components: photoComponents.map((component) => {
        if ('error' in component) throw new Error('Validated component unexpectedly failed.');
        return component;
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
  occurrence?: PhotoConfirmationOccurrence;
}): 'loading' | 'unavailable' | 'correction_pending' | 'confirm' | 'open_existing' {
  const {
    scan,
    latestJob,
    resultId,
    result,
    explicitlyUseLastSuccessfulResult,
    occurrence = 'default_confirmation',
  } = input;

  if (occurrence === 'default_confirmation' && scan.defaultConsumptionId) return 'open_existing';

  if (!scan.latestResultId) return 'unavailable';
  if (!latestJob) return 'loading';

  const latestScanJob =
    latestJob.id === scan.latestJobId &&
    latestJob.scanId === scan.id &&
    latestJob.targetType === 'scan' &&
    latestJob.targetId === scan.id;
  if (!latestScanJob) return 'unavailable';

  if (latestJob.status === 'queued' || latestJob.status === 'processing') {
    return latestJob.inputKind === 'correction' && latestJob.targetRevision === scan.revision + 1
      ? 'correction_pending'
      : 'unavailable';
  }

  if (latestJob.status === 'failed') {
    if (latestJob.inputKind !== 'correction' || latestJob.targetRevision !== scan.revision + 1) {
      return 'unavailable';
    }
    if (!explicitlyUseLastSuccessfulResult) return 'unavailable';
    if (resultId && resultId !== scan.latestResultId) return 'unavailable';
    if (!resultId || !result) return 'loading';
    return 'confirm';
  }

  if (latestJob.status !== 'completed' || latestJob.targetRevision !== scan.revision) {
    return 'unavailable';
  }
  if (latestJob.resultId !== scan.latestResultId) return 'unavailable';
  if (resultId && resultId !== scan.latestResultId) return 'unavailable';
  if (!resultId || !result) return 'loading';
  if (latestJob.resultId !== resultId) return 'unavailable';

  return 'confirm';
}
