import { Hono } from 'hono';
import type { SessionResolver } from '../../http/access.js';
import { requireSession } from '../../http/access.js';
import { ContractValidationError, validateRequest, validateResponse } from '../../contracts/validation.js';
import type { AppEnv } from '../../http/types.js';
import { ApiError } from '../../http/errors.js';
import { MediaIdempotencyConflict, MediaUploadInProgress } from './repository.js';
import {
  MediaPhotoNotFound,
  MediaServiceUnavailable,
  createMediaService,
} from './service.js';
import type { MediaServiceOptions } from './service.js';
import { MediaImageValidationError, MultipartPhotoValidationError, readMultipartPhoto } from './image.js';

export type MediaRouteDependencies = MediaServiceOptions & {
  resolveSession: SessionResolver;
};

function routeError(error: unknown): never {
  if (
    error instanceof ContractValidationError ||
    error instanceof MultipartPhotoValidationError ||
    error instanceof MediaImageValidationError
  ) throw new ApiError(422, 'INVALID_REQUEST', 'Request does not match the API contract');
  if (error instanceof MediaPhotoNotFound)
    throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Resource not found');
  if (error instanceof MediaUploadInProgress)
    throw new ApiError(409, 'IDEMPOTENCY_IN_PROGRESS', 'An upload with this key is still in progress', true);
  if (error instanceof MediaIdempotencyConflict)
    throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key was already used for another upload');
  if (error instanceof MediaServiceUnavailable)
    throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Photo storage is temporarily unavailable', true);
  throw error;
}

function invalidContract(error: unknown): never {
  if (error instanceof ContractValidationError)
    throw new ApiError(422, 'INVALID_REQUEST', 'Request does not match the API contract');
  throw error;
}

export function registerMediaRoutes(app: Hono<AppEnv>, dependencies: MediaRouteDependencies): void {
  const service = createMediaService(dependencies);
  app.post('/api/v1/photos', requireSession(dependencies.resolveSession), async (c) => {
    try {
      const session = c.get('session');
      if (!session.sessionId)
        throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication session is unavailable');
      const upload = await readMultipartPhoto(c.req.raw);
      const body = new FormData();
      body.append('file', new Blob([], { type: upload.declaredMime }), 'photo');
      let validated: ReturnType<typeof validateRequest>;
      try {
        validated = validateRequest('app.uploadPhoto', {
          headers: c.req.header(),
          body,
          contentType: c.req.header('content-type'),
        });
      } catch (error) {
        invalidContract(error);
      }
      const result = await service.upload({
        userId: session.userId,
        sessionId: session.sessionId,
        idempotencyKey: validated.headers['idempotency-key'] as string,
        bytes: upload.bytes,
        declaredMime: upload.declaredMime,
      });
      try {
        validateResponse('app.uploadPhoto', 201, result, { contentType: 'application/json' });
      } catch {
        throw new ApiError(500, 'INTERNAL_ERROR', 'Photo upload failed');
      }
      return c.json(result, 201);
    } catch (error) {
      routeError(error);
    }
  });

  app.get('/api/v1/photos/:id/view', requireSession(dependencies.resolveSession), async (c) => {
    try {
      let validated: ReturnType<typeof validateRequest>;
      try {
        validated = validateRequest('app.getPhotoView', {
          path: { id: c.req.param('id') },
          headers: c.req.header(),
        });
      } catch (error) {
        invalidContract(error);
      }
      const result = await service.issueViewUrl(c.get('session').userId, validated.path.id as string);
      try {
        validateResponse('app.getPhotoView', 200, result, { contentType: 'application/json' });
      } catch {
        throw new ApiError(500, 'INTERNAL_ERROR', 'Photo view could not be created');
      }
      return c.json(result);
    } catch (error) {
      routeError(error);
    }
  });

  app.get('/media/photos/:photoId', async (c) => {
    try {
      let validated: ReturnType<typeof validateRequest>;
      try {
        validated = validateRequest('app.readSignedPhoto', {
          path: { photoId: c.req.param('photoId') },
          query: new URL(c.req.url).searchParams,
        });
      } catch (error) {
        invalidContract(error);
      }
      const result = await service.readGrantedPhoto(
        validated.path.photoId as string,
        validated.query.token as string,
      );
      const headers = new Headers({
        'Content-Type': result.mimeType,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      try {
        validateResponse('app.readSignedPhoto', 200, result.bytes, {
          contentType: result.mimeType,
          headers,
        });
      } catch {
        throw new ApiError(500, 'INTERNAL_ERROR', 'Photo could not be read');
      }
      return new Response(new Uint8Array(result.bytes), { status: 200, headers });
    } catch (error) {
      routeError(error);
    }
  });
}

