import type { components } from '@/lib/api/generated/app-api';
import { createIdempotencyKey } from '@/lib/profile/profile';

export type ManualFoodComponentDraft = {
  id: string;
  displayName: string;
  catalogFoodId: string | null;
  preparation: string | null;
  portion:
    | { kind: 'unknown' }
    | { kind: 'known'; quantity: string; unit: 'g' }
    | { kind: 'known'; quantity: string; unit: 'serving'; servingId: string };
};

export type ManualConsumptionDraft = {
  consumedDate: string;
  consumedTime: string;
  catalogVersion: string;
  components: ManualFoodComponentDraft[];
  activeComponent?: ManualFoodComponentDraft | null;
  editingComponentId?: string | null;
};

export type ManualComponentInput = components['schemas']['ai__ComponentInput'];
export type CatalogFood = components['schemas']['ai__CatalogFood'];
export type ManualConsumptionInput = components['schemas']['ConsumptionCreate'];
export type ManualConsumptionUpdateInput = components['schemas']['ConsumptionUpdate'];
export type ManualConsumption = components['schemas']['Consumption'];

export function createManualFoodComponentDraft(
  name: string,
  food: CatalogFood | null = null,
  id = createIdempotencyKey()
): ManualFoodComponentDraft | null {
  const displayName = food?.displayName ?? name.trim();
  if (!displayName) return null;
  return {
    id,
    displayName,
    catalogFoodId: food?.id ?? null,
    preparation: food?.preparation ?? null,
    portion: { kind: 'unknown' },
  };
}

const dateFormatter = (timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

function zonedDateParts(instant: Date, timeZone: string) {
  const values = Object.fromEntries(
    dateFormatter(timeZone)
      .formatToParts(instant)
      .filter((part) => part.type !== 'literal')
      .map(({ type, value }) => [type, value])
  );
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

function asUtcMilliseconds(date: string, time: string) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return Date.UTC(year, month - 1, day, hour, minute);
}

export function parsePortionQuantity(raw: string): { value: number } | { error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { error: 'Masukkan jumlah porsi atau pilih Tidak tahu.' };
  if ((trimmed.includes(',') && trimmed.includes('.')) || (trimmed.match(/,/g)?.length ?? 0) > 1) {
    return { error: 'Masukkan satu angka desimal, misalnya 1,5.' };
  }
  const value = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(value)) return { error: 'Masukkan angka porsi yang valid.' };
  if (value <= 0) return { error: 'Jumlah porsi harus lebih besar dari 0.' };
  return { value };
}

export function mapManualComponent(
  component: ManualFoodComponentDraft
): { value: ManualComponentInput } | { error: string } {
  const displayName = component.displayName.trim();
  if (!displayName) return { error: 'Masukkan nama makanan.' };
  if (component.portion.kind === 'unknown') {
    return {
      value: {
        id: component.id,
        displayName,
        catalogFoodId: component.catalogFoodId,
        preparation: component.preparation,
        portion: { kind: 'unknown' },
      },
    };
  }

  const parsed = parsePortionQuantity(component.portion.quantity);
  if ('error' in parsed) return parsed;
  if (component.portion.unit === 'serving' && !component.portion.servingId) {
    return { error: 'Pilih takaran katalog atau gunakan gram.' };
  }

  return {
    value: {
      id: component.id,
      displayName,
      catalogFoodId: component.catalogFoodId,
      preparation: component.preparation,
      portion:
        component.portion.unit === 'g'
          ? { kind: 'known', quantity: parsed.value, unit: 'g' }
          : {
              kind: 'known',
              quantity: parsed.value,
              unit: 'serving',
              servingId: component.portion.servingId,
            },
    },
  };
}

export function upsertManualComponent(
  components: ManualFoodComponentDraft[],
  next: ManualFoodComponentDraft,
  replaceId: string | null = null
): { value: ManualFoodComponentDraft[] } | { error: string } {
  const mapped = mapManualComponent(next);
  if ('error' in mapped) return mapped;
  if (replaceId && !components.some((component) => component.id === replaceId)) {
    return { error: 'Komponen yang akan diubah tidak ditemukan.' };
  }
  if (!replaceId && components.some((component) => component.id === next.id)) {
    return { error: 'Komponen ini sudah ditambahkan.' };
  }
  if (!replaceId && components.length >= 30) return { error: 'Maksimal 30 komponen makanan.' };
  const normalized = { ...next, displayName: next.displayName.trim() };
  return {
    value: replaceId
      ? components.map((component) => (component.id === replaceId ? normalized : component))
      : [...components, normalized],
  };
}

export function removeManualComponent(components: ManualFoodComponentDraft[], id: string) {
  return components.filter((component) => component.id !== id);
}

export function formatLocalDateTime(
  instant: Date,
  timeZone: string
): { date: string; time: string } {
  return zonedDateParts(instant, timeZone);
}

export const MANUAL_CONSUMPTION_CREATE_DRAFT_NAME = 'manual-consumption:create';

export type SavedManualConsumptionDraft = {
  draftId: string;
  timeZone: string;
  form: ManualConsumptionDraft;
};

export function createEmptyManualConsumptionDraft(timeZone: string): SavedManualConsumptionDraft {
  const local = formatLocalDateTime(new Date(), timeZone);
  return {
    draftId: createIdempotencyKey(),
    timeZone,
    form: {
      consumedDate: local.date,
      consumedTime: local.time,
      catalogVersion: 'unavailable',
      components: [],
      activeComponent: null,
      editingComponentId: null,
    },
  };
}

export function localDateTimeToIso(
  date: string,
  time: string,
  timeZone: string
): { value: string } | { error: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return { error: 'Periksa tanggal dan waktu makan.' };
  }
  const target = asUtcMilliseconds(date, time);
  const normalized = new Date(target);
  if (
    normalized.getUTCFullYear() !== Number(date.slice(0, 4)) ||
    normalized.getUTCMonth() + 1 !== Number(date.slice(5, 7)) ||
    normalized.getUTCDate() !== Number(date.slice(8, 10))
  ) {
    return { error: 'Tanggal makan tidak valid.' };
  }

  try {
    let instant = target;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const local = zonedDateParts(new Date(instant), timeZone);
      const difference = target - asUtcMilliseconds(local.date, local.time);
      if (difference === 0) return { value: new Date(instant).toISOString() };
      instant += difference;
    }
  } catch {
    return { error: 'Zona waktu akun tidak dikenali.' };
  }
  return { error: 'Waktu tersebut tidak ada di zona waktu akun.' };
}

export function buildManualConsumptionInput(
  draft: ManualConsumptionDraft,
  timeZone: string
): { value: ManualConsumptionInput } | { error: string } {
  if (draft.components.length < 1 || draft.components.length > 30) {
    return { error: 'Tambahkan satu sampai 30 komponen makanan.' };
  }
  if (!draft.catalogVersion.trim()) {
    return { error: 'Versi katalog belum tersedia. Coba cari makanan terlebih dahulu.' };
  }
  const dateTime = localDateTimeToIso(draft.consumedDate, draft.consumedTime, timeZone);
  if ('error' in dateTime) return dateTime;
  const components = draft.components.map(mapManualComponent);
  const invalidComponent = components.find((component) => 'error' in component);
  if (invalidComponent && 'error' in invalidComponent) return invalidComponent;

  return {
    value: {
      source: 'manual',
      scanId: null,
      sourceAnalysisResultId: null,
      occurrence: 'new_occurrence',
      consumedAt: dateTime.value,
      timezone: timeZone,
      components: components.map((component) => {
        if ('error' in component) throw new Error('Validated component unexpectedly failed.');
        return component.value;
      }),
      catalogVersion: draft.catalogVersion.trim(),
    },
  };
}

export function buildManualConsumptionUpdateInput(
  draft: ManualConsumptionDraft,
  timeZone: string,
  expectedRevision: number
): { value: ManualConsumptionUpdateInput } | { error: string } {
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
    return { error: 'Versi catatan tidak valid. Muat ulang sebelum menyimpan.' };
  }
  const createInput = buildManualConsumptionInput(draft, timeZone);
  if ('error' in createInput) return createInput;
  return {
    value: {
      expectedRevision,
      consumedAt: createInput.value.consumedAt,
      timezone: createInput.value.timezone,
      components: createInput.value.components,
      catalogVersion: createInput.value.catalogVersion,
    },
  };
}

export function createManualConsumptionDraftFromRecord(
  consumption: ManualConsumption
): ManualConsumptionDraft {
  const local = formatLocalDateTime(new Date(consumption.consumedAt), consumption.timezone);
  return {
    consumedDate: local.date,
    consumedTime: local.time,
    catalogVersion: consumption.snapshot.catalogVersion,
    components: consumption.snapshot.components.map((component) => {
      const portion = component.portion;
      const quantity =
        portion.quantity === null
          ? ''
          : new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(portion.quantity);
      const editablePortion: ManualFoodComponentDraft['portion'] =
        portion.quantity !== null && portion.unit === 'g'
          ? { kind: 'known', quantity, unit: 'g' }
          : portion.quantity !== null && portion.unit === 'serving' && portion.servingId
            ? { kind: 'known', quantity, unit: 'serving', servingId: portion.servingId }
            : { kind: 'unknown' };
      return {
        id: component.id,
        displayName: component.displayName,
        catalogFoodId: component.catalogFoodId,
        preparation: component.preparation,
        portion: editablePortion,
      };
    }),
    activeComponent: null,
    editingComponentId: null,
  };
}

export function formatNutrient(value: number | null, unit: string): string {
  if (value === null) return 'Belum tersedia';
  return `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(value)} ${unit}`;
}
