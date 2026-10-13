import type { operations } from './generated/app-api';
import { appOperations } from './generated/operations';
import { prepareAppRequest, type AppOperation, type AppRequestInput } from './contracts';
import { requireApiUrl } from '@/lib/config';
import { OfflineError, requireOnline, type Connectivity } from '@/lib/data/network';
import { storageKey, type DataScope, type StorageAdapter } from '@/lib/data/scope';

type ResponseFor<O extends AppOperation> = operations[O]['responses'];
export type AppResponse<O extends AppOperation> = {
  [K in keyof ResponseFor<O>]: `${K & (string | number)}` extends `2${string}`
    ? ResponseFor<O>[K] extends { content: infer C }
      ? C[keyof C]
      : undefined
    : never;
}[keyof ResponseFor<O>];
export type ReadOperation = {
  [K in AppOperation]: (typeof appOperations)[K]['method'] extends 'GET' ? K : never;
}[AppOperation];
export type WriteOperation = Exclude<AppOperation, ReadOperation>;

export type ReadResult<T> = { data: T; updatedAt: number; stale: boolean };

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Dependencies = {
  scope: DataScope;
  storage: StorageAdapter;
  connectivity: () => Connectivity;
  onUnauthorized: () => Promise<void>;
  isCurrentScope?: () => boolean;
  fetcher?: typeof fetch;
  baseUrl?: string;
};

export function createAppRepository(deps: Dependencies) {
  const fetcher = deps.fetcher ?? fetch;
  async function send<O extends AppOperation>(name: O, input: AppRequestInput<O>) {
    const request = prepareAppRequest(name, input);
    if (request.method !== 'GET') requireOnline(deps.connectivity());
    const response = await fetcher(`${deps.baseUrl ?? requireApiUrl()}${request.path}`, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      credentials: 'include',
    });
    if (response.status === 401) {
      if (deps.isCurrentScope?.() ?? true) await deps.onUnauthorized();
      throw new ApiError(401, 'Sesi berakhir. Silakan masuk kembali.');
    }
    if (!response.ok) {
      throw new ApiError(response.status, `Permintaan gagal (${response.status}). Coba lagi.`);
    }
    if (response.status === 204) return undefined as AppResponse<O>;
    if (response.headers.get('content-type')?.startsWith('image/')) {
      return (await response.blob()) as unknown as AppResponse<O>;
    }
    return (await response.json()) as AppResponse<O>;
  }

  return {
    async read<O extends ReadOperation>(
      name: O,
      input: AppRequestInput<O>
    ): Promise<ReadResult<AppResponse<O>>> {
      const request = prepareAppRequest(name, input);
      const cacheKey = storageKey(deps.scope, 'read', request.path);
      const cached = await deps.storage.getItem(cacheKey);
      if (deps.connectivity() === 'offline' && cached) {
        return {
          ...(JSON.parse(cached) as { data: AppResponse<O>; updatedAt: number }),
          stale: true,
        };
      }
      if (deps.connectivity() === 'offline') throw new OfflineError();
      try {
        const data = await send(name, input);
        const result = { data, updatedAt: Date.now(), stale: false };
        // /me is never persisted as evidence of a session.
        if (name !== 'getMe' && name !== 'readSignedPhoto' && (deps.isCurrentScope?.() ?? true)) {
          await deps.storage.setItem(cacheKey, JSON.stringify(result));
        }
        return result;
      } catch (error) {
        if (error instanceof ApiError) throw error;
        if (cached)
          return {
            ...(JSON.parse(cached) as { data: AppResponse<O>; updatedAt: number }),
            stale: true,
          };
        throw error;
      }
    },
    async write<O extends WriteOperation>(
      name: O,
      input: AppRequestInput<O>
    ): Promise<AppResponse<O>> {
      return send(name, input);
    },
  };
}
