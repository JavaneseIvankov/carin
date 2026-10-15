import type { QueryClient } from '@tanstack/react-query';
import { scopeKey, type DataScope } from '@/lib/data/scope';

export function invalidateScopedQueries(queryClient: QueryClient, scope: DataScope | null) {
  if (!scope) return Promise.resolve();
  return queryClient.invalidateQueries({ queryKey: scopeKey(scope) });
}
