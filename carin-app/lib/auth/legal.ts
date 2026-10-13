import type { components } from '@/lib/api/generated/app-api';
import { requireApiUrl } from '@/lib/config';

export type LegalRegistry = components['schemas']['LegalRegistry'];
export type LegalDocument = components['schemas']['LegalDocument'];

export async function loadLegalRegistry(): Promise<LegalRegistry> {
  const response = await fetch(`${requireApiUrl()}/api/v1/legal`, {
    headers: { accept: 'application/json', 'cache-control': 'no-cache' },
  });
  if (!response.ok) throw new Error('LEGAL_REGISTRY_UNAVAILABLE');
  return (await response.json()) as LegalRegistry;
}
