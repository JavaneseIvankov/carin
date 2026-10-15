import type { components } from '../api/generated/app-api';
import { ApiError } from '../api/repository';
import type { ExaminationInput } from './model';

type Examination = components['schemas']['Examination'];

export type ExaminationEditSessionSnapshot = {
  current: Examination;
  draft: ExaminationInput | null;
  saving: boolean;
  revisionConflict: boolean;
  reloading: boolean;
  reloadError: unknown | null;
  generation: number;
};

type SaveInput = { expectedRevision: number; record: ExaminationInput; idempotencyKey: string };

type ExaminationEditActions = {
  createIdempotencyKey: () => string;
  save: (input: SaveInput) => Promise<unknown>;
  reload: () => Promise<Examination>;
};

type ExaminationEditSession = ReturnType<typeof createExaminationEditSession>;

export type SaveOutcome = 'saved' | 'revision-conflict' | 'blocked-conflict' | 'blocked' | 'error';

export function createExaminationEditSession(
  current: Examination,
  actions: ExaminationEditActions
) {
  let snapshot: ExaminationEditSessionSnapshot = {
    current,
    draft: null,
    saving: false,
    revisionConflict: false,
    reloading: false,
    reloadError: null,
    generation: 0,
  };
  const listeners = new Set<() => void>();
  let idempotencyKey: string | null = null;

  const updateSnapshot = (update: Partial<ExaminationEditSessionSnapshot>) => {
    snapshot = { ...snapshot, ...update };
    listeners.forEach((listener) => listener());
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    draftChanged() {
      idempotencyKey = null;
    },
    async save(record: ExaminationInput): Promise<SaveOutcome> {
      if (snapshot.revisionConflict) return 'blocked-conflict';
      if (snapshot.saving || snapshot.reloading) return 'blocked';
      idempotencyKey ??= actions.createIdempotencyKey();
      updateSnapshot({ saving: true, draft: record, reloadError: null });
      try {
        await actions.save({
          expectedRevision: snapshot.current.revision,
          record,
          idempotencyKey,
        });
        idempotencyKey = null;
        updateSnapshot({ saving: false });
        return 'saved';
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.status === 409 &&
          error.code === 'REVISION_CONFLICT'
        ) {
          updateSnapshot({ saving: false, revisionConflict: true });
          return 'revision-conflict';
        }
        updateSnapshot({ saving: false });
        return 'error';
      }
    },
    async reloadCurrent(): Promise<boolean> {
      if (!snapshot.revisionConflict || snapshot.reloading) return false;
      updateSnapshot({ reloading: true, reloadError: null });
      try {
        const current = await actions.reload();
        if (current.revision <= snapshot.current.revision) {
          throw new Error('Data terbaru belum tersedia. Coba muat ulang lagi.');
        }
        updateSnapshot({
          current,
          draft: current.record,
          revisionConflict: false,
          reloading: false,
          reloadError: null,
          generation: snapshot.generation + 1,
        });
        idempotencyKey = null;
        return true;
      } catch (reloadError) {
        updateSnapshot({ reloading: false, reloadError });
        return false;
      }
    },
  };
}

export function createExaminationEditRouteController() {
  let active: {
    id: string;
    session: ExaminationEditSession;
    actions: { current: ExaminationEditActions };
  } | null = null;

  return {
    getSession(id: string, initial: Examination, actions: ExaminationEditActions) {
      if (active?.id !== id) {
        const actionRef = { current: actions };
        const session = createExaminationEditSession(initial, {
          createIdempotencyKey: () => actionRef.current.createIdempotencyKey(),
          save: (input) => actionRef.current.save(input),
          reload: () => actionRef.current.reload(),
        });
        active = { id, session, actions: actionRef };
      } else {
        active.actions.current = actions;
      }
      return active.session;
    },
    getFormProps(
      id: string,
      snapshot: ExaminationEditSessionSnapshot,
      options: { submissionDisabled?: boolean } = {}
    ) {
      return {
        key: `${id}:${snapshot.generation}`,
        initialRecord: snapshot.current.record,
        submissionDisabled:
          options.submissionDisabled || snapshot.revisionConflict || snapshot.reloading,
      };
    },
  };
}
