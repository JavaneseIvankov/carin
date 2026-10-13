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

/** Called by the auth owner when a session ends or an account changes. */
export async function clearScopedData(
  scope: DataScope | null,
  queryClient: QueryClient,
  storage: Pick<StorageAdapter, 'getAllKeys' | 'removeItem'>
) {
  queryClient.clear();
  if (!scope) return;
  const prefix = `carin:${encodeURIComponent(scope.environment)}:${encodeURIComponent(scope.userId)}:`;
  const keys = (await storage.getAllKeys()).filter((key) => key.startsWith(prefix));
  await Promise.all(keys.map((key) => storage.removeItem(key)));
}
