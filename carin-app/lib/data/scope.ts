import type { QueryClient } from '@tanstack/react-query';

export type DataScope = { environment: string; userId: string };

export function scopeKey(scope: DataScope, ...parts: readonly unknown[]) {
  return ['carin', scope.environment, scope.userId, ...parts] as const;
}

export function storageKey(scope: DataScope, kind: 'draft' | 'read', key: string) {
  return `carin:${encodeURIComponent(scope.environment)}:${encodeURIComponent(scope.userId)}:${kind}:${encodeURIComponent(key)}`;
}

export function sameScope(a: DataScope | null, b: DataScope | null) {
  return a?.environment === b?.environment && a?.userId === b?.userId;
}

export type StorageAdapter = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
  removeItem(key: string): Promise<void>;
};

type WriteState = { generation: number; pending: Set<Promise<void>> };
const writeStates = new WeakMap<StorageAdapter, Map<string, WriteState>>();

function scopePrefix(scope: DataScope) {
  return `carin:${encodeURIComponent(scope.environment)}:${encodeURIComponent(scope.userId)}:`;
}

function writeState(storage: StorageAdapter, scope: DataScope) {
  let scopes = writeStates.get(storage);
  if (!scopes) {
    scopes = new Map();
    writeStates.set(storage, scopes);
  }
  const prefix = scopePrefix(scope);
  let state = scopes.get(prefix);
  if (!state) {
    state = { generation: 0, pending: new Set() };
    scopes.set(prefix, state);
  }
  return state;
}

export function scopeGeneration(storage: StorageAdapter, scope: DataScope) {
  return writeState(storage, scope).generation;
}

export class StaleScopeError extends Error {
  constructor() {
    super('Scope changed while reading data.');
    this.name = 'StaleScopeError';
  }
}

export function assertCurrentScope(
  storage: StorageAdapter,
  scope: DataScope,
  generation: number,
  isCurrentScope?: () => boolean
) {
  if (scopeGeneration(storage, scope) !== generation || isCurrentScope?.() === false) {
    throw new StaleScopeError();
  }
}

export async function persistScopedData(
  storage: StorageAdapter,
  scope: DataScope,
  generation: number,
  key: string,
  value: string
) {
  const state = writeState(storage, scope);
  if (state.generation !== generation) return;
  const write = storage.setItem(key, value);
  state.pending.add(write);
  try {
    await write;
  } finally {
    state.pending.delete(write);
  }
}

/** Called by the auth owner when a session ends or an account changes. */
export async function clearScopedData(
  scope: DataScope | null,
  queryClient: QueryClient,
  storage: StorageAdapter
) {
  if (!scope) return;
  const state = writeState(storage, scope);
  state.generation += 1;
  queryClient.removeQueries({ queryKey: scopeKey(scope) });
  const mutationCache = queryClient.getMutationCache();
  mutationCache
    .findAll({ mutationKey: scopeKey(scope) })
    .forEach((mutation) => mutationCache.remove(mutation));
  await Promise.allSettled([...state.pending]);
  const prefix = scopePrefix(scope);
  const keys = (await storage.getAllKeys()).filter((key) => key.startsWith(prefix));
  await Promise.all(keys.map((key) => storage.removeItem(key)));
}
