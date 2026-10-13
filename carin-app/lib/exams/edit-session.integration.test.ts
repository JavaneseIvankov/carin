import { describe, expect, it, vi } from 'vitest';
import type { components } from '../api/generated/app-api';
import { ApiError, createAppRepository } from '../api/repository';
import type { DataScope, StorageAdapter } from '@/lib/data/scope';
import { createExaminationEditRouteController, createExaminationEditSession } from './edit-session';

type Examination = components['schemas']['Examination'];
type ExaminationInput = components['schemas']['ExaminationInput'];

function memoryStorage(): StorageAdapter {
  const values = new Map<string, string>();
  return {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      values.set(key, value);
    },
    removeItem: async (key) => {
      values.delete(key);
    },
    getAllKeys: async () => [...values.keys()],
  };
}

const scope: DataScope = { environment: 'dev', userId: 'alice' };
const initialRecord: ExaminationInput = {
  type: 'glucose',
  value: 100,
  unit: 'mg/dL',
  context: 'fasting',
  measuredOn: '2026-10-14',
  measuredTime: null,
  timezone: 'Asia/Jakarta',
  note: 'catatan awal',
};
const draft: ExaminationInput = { ...initialRecord, value: 110, note: 'edit lokal' };
const latestRecord: ExaminationInput = {
  ...initialRecord,
  value: 105,
  note: 'edit di perangkat lain',
};
const savedDraft: ExaminationInput = {
  ...latestRecord,
  value: 115,
  note: 'edit setelah muat ulang',
};

function examination(revision: number, record: ExaminationInput): Examination {
  const updatedAt = `2026-10-14T00:00:0${revision}Z`;
  return { id: 'examination-1', revision, record, createdAt: updatedAt, updatedAt };
}

describe('examination edit session revision recovery', () => {
  it('keeps a dirty edit draft and blocks submit while cached timezone data is in error', () => {
    const route = createExaminationEditRouteController();
    const session = route.getSession('examination-1', examination(1, initialRecord), {
      createIdempotencyKey: () => 'update-1',
      save: async () => {},
      reload: async () => examination(1, initialRecord),
    });
    const snapshot = session.getSnapshot();
    const readyForm = route.getFormProps('examination-1', snapshot);
    const dirtyValues = draft;
    const failedTimezoneRead = route.getFormProps('examination-1', snapshot, {
      submissionDisabled: true,
    });
    const visibleValues =
      failedTimezoneRead.key === readyForm.key ? dirtyValues : failedTimezoneRead.initialRecord;

    expect(failedTimezoneRead.key).toBe(readyForm.key);
    expect(failedTimezoneRead.initialRecord).toEqual(initialRecord);
    expect(failedTimezoneRead.submissionDisabled).toBe(true);
    expect(visibleValues).toEqual(draft);
  });

  it('keeps a dirty form mounted when a background query returns a newer revision', async () => {
    const route = createExaminationEditRouteController();
    const actions = {
      createIdempotencyKey: () => 'update-1',
      save: async () => {
        throw new ApiError(409, 'Conflict', 'REVISION_CONFLICT');
      },
      reload: async () => examination(2, latestRecord),
    };
    const session = route.getSession('examination-1', examination(1, initialRecord), actions);
    const initialForm = route.getFormProps('examination-1', session.getSnapshot());
    const dirtyForm = { key: initialForm.key, values: draft };
    session.draftChanged();

    const refreshedSession = route.getSession(
      'examination-1',
      examination(2, latestRecord),
      actions
    );
    const refreshedForm = route.getFormProps('examination-1', refreshedSession.getSnapshot());
    const visibleValues =
      refreshedForm.key === dirtyForm.key ? dirtyForm.values : refreshedForm.initialRecord;

    expect(refreshedSession).toBe(session);
    expect(refreshedForm.key).toBe(initialForm.key);
    expect(refreshedForm.initialRecord).toEqual(initialRecord);
    expect(visibleValues).toEqual(draft);

    await expect(refreshedSession.save(draft)).resolves.toBe('revision-conflict');
    await expect(refreshedSession.reloadCurrent()).resolves.toBe(true);

    const explicitSession = route.getSession(
      'examination-1',
      examination(2, latestRecord),
      actions
    );
    const explicitForm = route.getFormProps('examination-1', explicitSession.getSnapshot());
    const visibleValuesAfterReload =
      explicitForm.key === dirtyForm.key ? dirtyForm.values : explicitForm.initialRecord;
    expect(explicitSession).toBe(session);
    expect(explicitForm.key).not.toBe(initialForm.key);
    expect(explicitForm.initialRecord).toEqual(latestRecord);
    expect(visibleValuesAfterReload).toEqual(latestRecord);
  });

  it('keeps the conflict open when refresh returns the same revision', async () => {
    const editor = createExaminationEditSession(examination(1, initialRecord), {
      createIdempotencyKey: () => 'update-1',
      save: async () => {
        throw new ApiError(409, 'Conflict', 'REVISION_CONFLICT');
      },
      reload: async () => examination(1, initialRecord),
    });

    await expect(editor.save(draft)).resolves.toBe('revision-conflict');
    await expect(editor.reloadCurrent()).resolves.toBe(false);
    expect(editor.getSnapshot()).toMatchObject({
      current: { revision: 1 },
      draft,
      revisionConflict: true,
      reloading: false,
      reloadError: expect.any(Error),
      generation: 0,
    });
  });

  it('preserves the draft on conflict and uses the explicitly reloaded revision for a later save', async () => {
    const sentUpdates: { expectedRevision: number; idempotencyKey: string }[] = [];
    let readCalls = 0;
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body)) as { expectedRevision: number };
        sentUpdates.push({
          expectedRevision: body.expectedRevision,
          idempotencyKey: new Headers(init.headers).get('Idempotency-Key') ?? '',
        });
        if (sentUpdates.length === 1) {
          return new Response(
            JSON.stringify({
              error: {
                code: 'REVISION_CONFLICT',
                message: 'Examination has changed',
                retryable: false,
                requestId: 'request-conflict',
                details: {},
              },
            }),
            { status: 409, headers: { 'content-type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify(examination(3, savedDraft)), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      readCalls += 1;
      if (readCalls === 1) {
        return new Response(null, { status: 503 });
      }
      return new Response(JSON.stringify(examination(2, latestRecord)), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const repository = createAppRepository({
      scope,
      storage: memoryStorage(),
      connectivity: () => 'online',
      onUnauthorized: async () => {},
      fetcher: fetcher as typeof fetch,
      baseUrl: 'https://api.test',
    });
    let keySequence = 0;
    const editor = createExaminationEditSession(examination(1, initialRecord), {
      createIdempotencyKey: () => `update-${++keySequence}`,
      save: async ({ expectedRevision, record, idempotencyKey }) => {
        await repository.write('updateExamination', {
          path: { id: 'examination-1' },
          headers: { 'Idempotency-Key': idempotencyKey },
          body: { expectedRevision, record },
        });
      },
      reload: async () =>
        (await repository.read('getExamination', { path: { id: 'examination-1' } })).data,
    });

    await expect(editor.save(draft)).resolves.toBe('revision-conflict');
    expect(editor.getSnapshot()).toMatchObject({
      current: { revision: 1 },
      draft,
      revisionConflict: true,
      reloading: false,
      generation: 0,
    });
    await expect(editor.save(savedDraft)).resolves.toBe('blocked-conflict');
    expect(sentUpdates).toHaveLength(1);
    expect(keySequence).toBe(1);

    await expect(editor.reloadCurrent()).resolves.toBe(false);
    expect(editor.getSnapshot()).toMatchObject({
      current: { revision: 1 },
      draft,
      revisionConflict: true,
      reloading: false,
      reloadError: expect.anything(),
      generation: 0,
    });
    expect(keySequence).toBe(1);

    await expect(editor.reloadCurrent()).resolves.toBe(true);
    expect(editor.getSnapshot()).toMatchObject({
      current: { revision: 2, record: latestRecord },
      draft: latestRecord,
      revisionConflict: false,
      reloading: false,
      reloadError: null,
      generation: 1,
    });

    await expect(editor.save(savedDraft)).resolves.toBe('saved');
    expect(sentUpdates).toEqual([
      { expectedRevision: 1, idempotencyKey: 'update-1' },
      { expectedRevision: 2, idempotencyKey: 'update-2' },
    ]);
  });
});
