export type KnowledgeArea = 'diagnoses' | 'familyHistory' | 'allergies';

export function createIdempotencyKey(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (marker) => {
    const random = Math.floor(Math.random() * 16);
    const value = marker === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function createStableActionKey(makeKey: () => string = createIdempotencyKey) {
  let previousPayload: string | null = null;
  let previousKey: string | null = null;
  return {
    forPayload(payload: unknown) {
      const serialized = stableJson(payload);
      if (serialized !== previousPayload || previousKey === null) {
        previousPayload = serialized;
        previousKey = makeKey();
      }
      return previousKey;
    },
    clear() {
      previousPayload = null;
      previousKey = null;
    },
  };
}

export function createOtherDiagnosisEntry(label: string) {
  const normalized = label.trim();
  if (!normalized) return null;
  return { id: createIdempotencyKey(), conditionId: null, label: normalized };
}

export function parseOptionalPositiveNumber(
  raw: string
): { value: number | null } | { error: string } {
  const normalized = raw.trim().replace(',', '.');
  if (!normalized) return { value: null };
  const value = Number(normalized);
  if (!Number.isFinite(value)) return { error: 'Masukkan angka yang valid.' };
  if (value <= 0) return { error: 'Masukkan angka lebih besar dari 0.' };
  return { value };
}

const KNOWLEDGE_LABELS: Record<KnowledgeArea, Record<string, string>> = {
  diagnoses: {
    not_provided: 'Belum diisi',
    none_known: 'Tidak ada diagnosis yang diketahui',
    never_examined: 'Belum pernah diperiksa',
    reported: 'Ada kondisi yang dilaporkan',
  },
  familyHistory: {
    not_provided: 'Belum diisi',
    unknown: 'Belum tahu riwayat keluarga',
    none_known: 'Tidak ada riwayat keluarga yang diketahui',
    reported: 'Ada riwayat keluarga yang dilaporkan',
  },
  allergies: {
    not_provided: 'Belum diisi',
    unknown: 'Belum diketahui',
    none_known: 'Tidak ada alergi yang diketahui',
    reported: 'Ada alergi atau pantangan yang dilaporkan',
  },
};

export function getKnowledgeStateLabel(area: KnowledgeArea, state: string): string {
  return KNOWLEDGE_LABELS[area][state] ?? 'Belum diisi';
}

export function transitionKnowledgeState<TEntry>(
  current: { state: string; entries: TEntry[] },
  nextState: string,
  confirmed = false
): {
  kind: 'confirmation-required' | 'changed' | 'unchanged';
  value: { state: string; entries: TEntry[] };
} {
  if (current.state === nextState) return { kind: 'unchanged', value: current };
  if (nextState !== 'reported' && current.entries.length > 0 && !confirmed) {
    return { kind: 'confirmation-required', value: current };
  }
  return {
    kind: 'changed',
    value: { state: nextState, entries: nextState === 'reported' ? current.entries : [] },
  };
}

const MISSING_FIELD_TARGETS: Record<string, { label: string; focus: string }> = {
  heightCm: { label: 'Tinggi badan', focus: 'heightCm' },
  weightKg: { label: 'Berat badan', focus: 'weightKg' },
  sexForReference: { label: 'Informasi seks untuk acuan', focus: 'sexForReference' },
  diagnoses: { label: 'Informasi diagnosis', focus: 'diagnoses' },
  'diagnoses.state': { label: 'Status diagnosis', focus: 'diagnoses' },
  'diagnoses.entries': { label: 'Kondisi yang dilaporkan', focus: 'diagnoses' },
  familyHistory: { label: 'Riwayat keluarga', focus: 'familyHistory' },
  'familyHistory.state': { label: 'Status riwayat keluarga', focus: 'familyHistory' },
  'familyHistory.entries': { label: 'Riwayat keluarga', focus: 'familyHistory' },
  allergies: { label: 'Alergi dan pantangan', focus: 'allergies' },
  'allergies.state': { label: 'Status alergi dan pantangan', focus: 'allergies' },
  'allergies.entries': { label: 'Alergi dan pantangan', focus: 'allergies' },
  clinicianNotes: { label: 'Arahan tenaga kesehatan', focus: 'clinicianNotes' },
  activity: { label: 'Aktivitas', focus: 'activity' },
  smoking: { label: 'Kebiasaan merokok', focus: 'smoking' },
};

export function getMissingFieldTarget(path: string): { label: string; focus: string } | null {
  const target = MISSING_FIELD_TARGETS[path];
  return target ?? (path.trim() ? { label: path, focus: 'other' } : null);
}
