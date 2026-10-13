import { describe, expect, it } from 'vitest';
import {
  createIdempotencyKey,
  createOtherDiagnosisEntry,
  createStableActionKey,
  getAiConsentValue,
  getAiConsentStatus,
  getLegalRegistryState,
  getProfileConsentSummary,
  getKnowledgeStateLabel,
  getMissingFieldTarget,
  isAiConsentDraftDirty,
  isCurrentLegalRegistry,
  isSuccessfulQueryRefresh,
  parseOptionalPositiveNumber,
  reconcileAiConsentDraft,
  transitionKnowledgeState,
} from './profile';

describe('health profile presentation rules', () => {
  it('keeps unknown and not-provided knowledge separate from known absence', () => {
    expect(getKnowledgeStateLabel('diagnoses', 'not_provided')).toBe('Belum diisi');
    expect(getKnowledgeStateLabel('diagnoses', 'none_known')).toBe(
      'Tidak ada diagnosis yang diketahui'
    );
    expect(getKnowledgeStateLabel('diagnoses', 'never_examined')).toBe('Belum pernah diperiksa');
    expect(getKnowledgeStateLabel('allergies', 'unknown')).toBe('Belum diketahui');
    expect(getKnowledgeStateLabel('familyHistory', 'unknown')).toBe('Belum tahu riwayat keluarga');
  });

  it('requires confirmation before a knowledge-state change clears entries', () => {
    const current = { state: 'reported' as const, entries: ['hipertensi'] };
    const pending = transitionKnowledgeState(current, 'unknown');

    expect(pending).toEqual({ kind: 'confirmation-required', value: current });
    expect(transitionKnowledgeState(current, 'unknown', true)).toEqual({
      kind: 'changed',
      value: { state: 'unknown', entries: [] },
    });
    expect(transitionKnowledgeState(current, 'reported')).toEqual({
      kind: 'unchanged',
      value: current,
    });
  });

  it('maps missing profile fields to a focused Indonesian form target', () => {
    expect(getMissingFieldTarget('heightCm')).toEqual({ label: 'Tinggi badan', focus: 'heightCm' });
    expect(getMissingFieldTarget('diagnoses.state')).toEqual({
      label: 'Status diagnosis',
      focus: 'diagnoses',
    });
    expect(getMissingFieldTarget('allergies.entries')).toEqual({
      label: 'Alergi dan pantangan',
      focus: 'allergies',
    });
  });

  it('reuses an idempotency key for a retry of the same action payload', () => {
    const keys = ['fef4d5f0-7b6b-4fa3-97b8-f4f5d30aa4d4', 'ad9bcabd-10c5-4b36-aed6-1271ce945e3f'];
    const nextKey = createStableActionKey(() => keys.shift() ?? 'unexpected');

    expect(nextKey.forPayload({ version: 3, fields: { heightCm: 160 } })).toBe(
      'fef4d5f0-7b6b-4fa3-97b8-f4f5d30aa4d4'
    );
    expect(nextKey.forPayload({ version: 3, fields: { heightCm: 160 } })).toBe(
      'fef4d5f0-7b6b-4fa3-97b8-f4f5d30aa4d4'
    );
    expect(nextKey.forPayload({ version: 3, fields: { heightCm: 161 } })).toBe(
      'ad9bcabd-10c5-4b36-aed6-1271ce945e3f'
    );
    expect(createIdempotencyKey()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it('stores an explicit other diagnosis as free text without catalog matching', () => {
    expect(createOtherDiagnosisEntry(' PCOS ')).toMatchObject({
      conditionId: null,
      label: 'PCOS',
    });
    expect(createOtherDiagnosisEntry('  ')).toBeNull();
  });

  it('parses optional measurements without treating invalid values as empty', () => {
    expect(parseOptionalPositiveNumber('')).toEqual({ value: null });
    expect(parseOptionalPositiveNumber('52,4')).toEqual({ value: 52.4 });
    expect(parseOptionalPositiveNumber('0')).toEqual({
      error: 'Masukkan angka lebih besar dari 0.',
    });
    expect(parseOptionalPositiveNumber('tinggi')).toEqual({ error: 'Masukkan angka yang valid.' });
  });
});

describe('AI consent version handling', () => {
  it('does not treat a historical grant as active for a newer legal version', () => {
    const historical = { version: 'ai-v1', granted: true };

    expect(getAiConsentValue(null, undefined, false)).toBe(false);
    expect(getAiConsentStatus(historical, null)).toBe('version_unavailable');
    expect(getAiConsentStatus(historical, 'ai-v2')).toBe('stale');
    expect(getAiConsentValue({ version: 'ai-v1', granted: true }, 'ai-v2', false)).toBe(false);
    expect(isAiConsentDraftDirty(null, 'ai-v2', false)).toBe(false);
    expect(isAiConsentDraftDirty({ version: 'ai-v1', granted: true }, 'ai-v2', false)).toBe(false);
    expect(isAiConsentDraftDirty({ version: 'ai-v2', granted: true }, 'ai-v2', false)).toBe(true);
  });

  it('keeps current-version revoke actions dirty until they are saved', () => {
    const current = { version: 'ai-v2', granted: true };

    expect(getAiConsentStatus(current, 'ai-v2')).toBe('active');
    expect(isAiConsentDraftDirty({ version: 'ai-v2', granted: false }, 'ai-v2', true)).toBe(true);
    expect(isAiConsentDraftDirty(null, 'ai-v2', true)).toBe(false);
  });

  it('requires a new explicit choice when a conflict reload changes legal version', () => {
    expect(
      reconcileAiConsentDraft({ version: 'ai-v1', granted: true }, 'ai-v1', 'ai-v2')
    ).toBeNull();
    expect(
      reconcileAiConsentDraft({ version: 'ai-v1', granted: false }, 'ai-v1', 'ai-v2')
    ).toBeNull();
    expect(reconcileAiConsentDraft({ version: 'ai-v2', granted: false }, 'ai-v2', 'ai-v2')).toEqual(
      { version: 'ai-v2', granted: false }
    );
  });
});

describe('profile consent summary account loading', () => {
  it('keeps consent unknown while the account query is pending or failed', () => {
    expect(getProfileConsentSummary(undefined, 'pending', 'ai-v2')).toEqual({ kind: 'loading' });
    expect(
      getProfileConsentSummary({ version: null, granted: false }, 'fetching', 'ai-v2')
    ).toEqual({ kind: 'loading' });
    expect(getProfileConsentSummary(undefined, 'error', 'ai-v2')).toEqual({ kind: 'error' });
    expect(getProfileConsentSummary({ version: 'ai-v2', granted: true }, 'error', 'ai-v2')).toEqual(
      { kind: 'error' }
    );
    expect(getProfileConsentSummary(undefined, 'ready', 'ai-v2')).toEqual({
      kind: 'unavailable',
    });
  });
});

describe('legal registry freshness', () => {
  it('does not use cached stale registry versions for Profile or enable Settings consent actions', () => {
    const staleState = getLegalRegistryState({
      hasData: true,
      stale: true,
      isPending: false,
      isFetching: false,
      hasError: false,
    });
    const currentVersion = isCurrentLegalRegistry(staleState) ? 'ai-v1' : null;

    expect(staleState).toBe('stale');
    expect(isCurrentLegalRegistry(staleState)).toBe(false);
    expect(
      getProfileConsentSummary({ version: 'ai-v1', granted: true }, 'ready', currentVersion)
    ).toEqual({ kind: 'status', status: 'version_unavailable' });
    expect(
      getLegalRegistryState({
        hasData: false,
        stale: false,
        isPending: true,
        isFetching: true,
        hasError: false,
      })
    ).toBe('loading');
    expect(
      getLegalRegistryState({
        hasData: false,
        stale: false,
        isPending: false,
        isFetching: false,
        hasError: true,
      })
    ).toBe('error');
    expect(
      getLegalRegistryState({
        hasData: false,
        stale: true,
        isPending: false,
        isFetching: false,
        hasError: false,
      })
    ).toBe('unavailable');
    expect(
      isCurrentLegalRegistry(
        getLegalRegistryState({
          hasData: true,
          stale: false,
          isPending: false,
          isFetching: false,
          hasError: false,
        })
      )
    ).toBe(true);
  });
});

describe('query refresh handling', () => {
  it('does not accept cached data as fresh when the refetch failed', () => {
    expect(
      isSuccessfulQueryRefresh({ data: { version: 4 }, isError: true, error: new Error('offline') })
    ).toBe(false);
    expect(
      isSuccessfulQueryRefresh({
        data: { version: 4 },
        isError: false,
        error: new Error('offline'),
      })
    ).toBe(false);
    expect(isSuccessfulQueryRefresh({ data: { version: 4 }, isError: false, error: null })).toBe(
      true
    );
    expect(isSuccessfulQueryRefresh({ data: undefined, isError: false })).toBe(false);
  });
});
