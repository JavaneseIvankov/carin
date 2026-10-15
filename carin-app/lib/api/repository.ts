import type { operations } from './generated/app-api';
import * as Crypto from 'expo-crypto';
import { appOperations } from './generated/operations';
import { prepareAppRequest, type AppOperation, type AppRequestInput } from './contracts';
import { requireApiUrl } from '@/lib/config';
import { OfflineError, requireOnline, type Connectivity } from '@/lib/data/network';
import {
  assertCurrentScope,
  persistScopedData,
  scopeGeneration,
  storageKey,
  type DataScope,
  type StorageAdapter,
} from '@/lib/data/scope';
import { errorLogDetails, logAppEvent } from '@/lib/logging';

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
    message: string,
    public readonly code?: string
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
  nativeFileUploader?: (
    url: string,
    uri: string,
    options: {
      method: string;
      fieldName: string;
      mimeType: string;
      headers: Record<string, string>;
    }
  ) => Promise<Response>;
  getCookie?: () => Promise<string>;
  credentials?: RequestCredentials;
  baseUrl?: string;
};

export type NativePhotoFile = { uri: string; mimeType: string };

export function createAppRepository(deps: Dependencies) {
  const fetcher = deps.fetcher ?? fetch;
  const generation = scopeGeneration(deps.storage, deps.scope);
  const assertCurrent = () =>
    assertCurrentScope(deps.storage, deps.scope, generation, deps.isCurrentScope);
  async function send<O extends AppOperation>(
    name: O,
    input: AppRequestInput<O>,
    nativePhotoFile?: NativePhotoFile
  ) {
    const requestInput = nativePhotoFile
      ? ({ ...input, body: { file: new Blob([]) } } as AppRequestInput<O>)
      : input;
    const request = prepareAppRequest(name, requestInput);
    const requestId = Crypto.randomUUID();
    request.headers['x-request-id'] = requestId;
    if (request.method !== 'GET') requireOnline(deps.connectivity());
    const cookie = await deps.getCookie?.();
    assertCurrent();
    const startedAt = Date.now();
    logAppEvent('info', 'api.request.started', {
      requestId,
      operation: name,
      method: request.method,
    });
    let response: Response;
    try {
      const url = `${deps.baseUrl ?? requireApiUrl()}${request.path}`;
      const headers = cookie ? { ...request.headers, Cookie: cookie } : request.headers;
      if (nativePhotoFile && name === 'uploadPhoto' && deps.nativeFileUploader) {
        response = await deps.nativeFileUploader(url, nativePhotoFile.uri, {
          method: request.method,
          fieldName: 'file',
          mimeType: nativePhotoFile.mimeType,
          headers,
        });
      } else {
        response = await fetcher(url, {
          method: request.method,
          headers,
          body: request.body,
          credentials: deps.credentials ?? 'omit',
        });
      }
    } catch (error) {
      logAppEvent('error', 'api.request.failed', {
        requestId,
        operation: name,
        method: request.method,
        durationMs: Date.now() - startedAt,
        ...errorLogDetails(error),
      });
      throw error;
    }
    const responseRequestId = response.headers.get('x-request-id') ?? requestId;
    let responseErrorCode: string | undefined;
    if (!response.ok) {
      try {
        const payload: unknown = await response.clone().json();
        if (
          payload !== null &&
          typeof payload === 'object' &&
          'error' in payload &&
          payload.error !== null &&
          typeof payload.error === 'object' &&
          'code' in payload.error &&
          typeof payload.error.code === 'string'
        ) {
          responseErrorCode = payload.error.code;
        }
      } catch {
        // The status remains useful when a proxy returns a non-JSON body.
      }
    }
    logAppEvent(response.ok ? 'info' : 'warn', 'api.response.received', {
      requestId: responseRequestId,
      operation: name,
      method: request.method,
      status: response.status,
      durationMs: Date.now() - startedAt,
      ...(responseErrorCode ? { errorCode: responseErrorCode } : {}),
    });
    if (response.status === 401) {
      if (deps.isCurrentScope?.() ?? true) await deps.onUnauthorized();
      throw new ApiError(401, 'Sesi berakhir. Silakan masuk kembali.');
    }
    if (!response.ok) {
      throw new ApiError(
        response.status,
        `Permintaan gagal (${response.status}). Coba lagi.`,
        responseErrorCode
      );
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
      assertCurrent();
      const request = prepareAppRequest(name, input);
      const cacheKey = storageKey(deps.scope, 'read', request.path);
      const cached = await deps.storage.getItem(cacheKey);
      assertCurrent();
      if (deps.connectivity() === 'offline' && cached) {
        return {
          ...(JSON.parse(cached) as { data: AppResponse<O>; updatedAt: number }),
          stale: true,
        };
      }
      if (deps.connectivity() === 'offline') throw new OfflineError();
      try {
        const data = await send(name, input);
        assertCurrent();
        const result = { data, updatedAt: Date.now(), stale: false };
        // /me is never persisted as evidence of a session.
        if (name !== 'getMe' && name !== 'readSignedPhoto' && (deps.isCurrentScope?.() ?? true)) {
          await persistScopedData(
            deps.storage,
            deps.scope,
            generation,
            cacheKey,
            JSON.stringify(result)
          );
        }
        assertCurrent();
        return result;
      } catch (error) {
        if (error instanceof ApiError) throw error;
        assertCurrent();
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
    async uploadPhotoFile(
      input: Omit<AppRequestInput<'uploadPhoto'>, 'body'>,
      file: NativePhotoFile
    ): Promise<AppResponse<'uploadPhoto'>> {
      return send('uploadPhoto', { ...input, body: { file: new Blob([]) } }, file) as Promise<
        AppResponse<'uploadPhoto'>
      >;
    },
  };
}
