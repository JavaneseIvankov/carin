import { useAppRead } from '@/lib/api/query';

export function useFoodCatalogSearch(query: string, catalogVersion: string) {
  const trimmed = query.trim();
  return useAppRead(
    'searchFoods',
    {
      query: {
        q: trimmed,
        limit: 10,
        version: catalogVersion === 'unavailable' ? undefined : catalogVersion,
      },
    },
    { enabled: trimmed.length >= 2 }
  );
}
