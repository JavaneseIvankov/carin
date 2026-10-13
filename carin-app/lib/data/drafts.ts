import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  assertCurrentScope,
  persistScopedData,
  scopeGeneration,
  storageKey,
  type DataScope,
  type StorageAdapter,
} from './scope';

export const localStorageAdapter: StorageAdapter = AsyncStorage;

export function createDraftStore(storage: StorageAdapter = localStorageAdapter) {
  return {
    async load<T>(scope: DataScope, name: string): Promise<T | null> {
      const generation = scopeGeneration(storage, scope);
      const value = await storage.getItem(storageKey(scope, 'draft', name));
      assertCurrentScope(storage, scope, generation);
      return value ? (JSON.parse(value) as T) : null;
    },
    async save<T>(scope: DataScope, name: string, value: T): Promise<void> {
      await persistScopedData(
        storage,
        scope,
        scopeGeneration(storage, scope),
        storageKey(scope, 'draft', name),
        JSON.stringify(value)
      );
    },
    async remove(scope: DataScope, name: string): Promise<void> {
      await storage.removeItem(storageKey(scope, 'draft', name));
    },
  };
}
