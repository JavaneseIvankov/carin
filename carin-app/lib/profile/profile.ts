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

export type AiConsentStatus = 'active' | 'stale' | 'not_granted' | 'version_unavailable';
export type AiConsentDraft = { version: string; granted: boolean };
export type ProfileAccountQueryState = 'pending' | 'fetching' | 'error' | 'ready';
export type ProfileConsentSummary =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'unavailable' }
  | { kind: 'status'; status: AiConsentStatus };
export type LegalRegistryState =
  'loading' | 'current' | 'stale' | 'refreshing' | 'error' | 'unavailable';

export function getLegalRegistryState(query: {
  hasData: boolean;
  stale: boolean;
  isPending: boolean;
  isFetching: boolean;
  hasError: boolean;
}): LegalRegistryState {
  if (query.hasData && query.stale) return 'stale';
  if (query.hasError) return 'error';
  if (query.isFetching) return query.hasData ? 'refreshing' : 'loading';
  if (!query.hasData) return query.isPending ? 'loading' : 'unavailable';
  return 'current';
}

export function isCurrentLegalRegistry(state: LegalRegistryState): boolean {
  return state === 'current';
}

export function isSuccessfulQueryRefresh(result: {
  data: unknown;
  isError: boolean;
  error?: unknown;
}): boolean {
  const stale =
    typeof result.data === 'object' &&
    result.data !== null &&
    'stale' in result.data &&
    result.data.stale === true;
  return result.data !== undefined && !stale && !result.isError && result.error == null;
}

export function getAiConsentStatus(
  consent: { version: string | null; granted: boolean },
  currentVersion: string | null | undefined
): AiConsentStatus {
  if (!consent.granted) return 'not_granted';
  if (!currentVersion) return 'version_unavailable';
  return consent.version === currentVersion ? 'active' : 'stale';
}

export function getProfileConsentSummary(
  consent: { version: string | null; granted: boolean } | undefined,
  accountQueryState: ProfileAccountQueryState,
  currentVersion: string | null | undefined
): ProfileConsentSummary {
  if (accountQueryState === 'pending' || accountQueryState === 'fetching') {
    return { kind: 'loading' };
  }
  if (accountQueryState === 'error') return { kind: 'error' };
  if (!consent) return { kind: 'unavailable' };
  return { kind: 'status', status: getAiConsentStatus(consent, currentVersion) };
}

export function getAiConsentValue(
  draft: AiConsentDraft | null,
  currentVersion: string | null | undefined,
  currentConsentActive: boolean
): boolean {
  return draft && draft.version === currentVersion ? draft.granted : currentConsentActive;
}

export function isAiConsentDraftDirty(
  draft: AiConsentDraft | null,
  currentVersion: string | null | undefined,
  currentConsentActive: boolean
): boolean {
  return (
    draft !== null && draft.version === currentVersion && draft.granted !== currentConsentActive
  );
}

export function reconcileAiConsentDraft(
  draft: AiConsentDraft | null,
  previousVersion: string | null | undefined,
  latestVersion: string
): AiConsentDraft | null {
  return previousVersion === latestVersion ? draft : null;
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
