import type { components } from '@/lib/api/generated/app-api';
import { requireApiUrl } from '@/lib/config';

export type LegalRegistry = components['schemas']['LegalRegistry'];
export type LegalDocument = components['schemas']['LegalDocument'];

export async function loadLegalRegistry(): Promise<LegalRegistry> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${requireApiUrl()}/api/v1/legal`, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('LEGAL_REGISTRY_UNAVAILABLE');
    return (await response.json()) as LegalRegistry;
  } finally {
    clearTimeout(timeout);
  }
}
