import { createHash } from 'node:crypto';
import sharp from 'sharp';

export const MAX_RAW_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_NORMALIZED_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTO_DIMENSION = 1600;
const MAX_INPUT_PIXELS = 40_000_000;
const MAX_MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const MAX_MULTIPART_BODY_BYTES = MAX_RAW_PHOTO_BYTES + MAX_MULTIPART_OVERHEAD_BYTES;

export class MediaImageValidationError extends Error {
  constructor() {
    super('Photo is not a supported JPEG or PNG image');
    this.name = 'MediaImageValidationError';
  }
}

export class MultipartPhotoValidationError extends Error {
  constructor() {
    super('Multipart request must contain one photo up to 10 MiB');
    this.name = 'MultipartPhotoValidationError';
  }
}

export type MultipartPhoto = { bytes: Buffer; declaredMime: string };

export async function readMultipartPhoto(request: Request): Promise<MultipartPhoto> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!/^multipart\/form-data\s*;/i.test(contentType) || !request.body)
    throw new MultipartPhotoValidationError();
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_MULTIPART_BODY_BYTES)
      throw new MultipartPhotoValidationError();
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      totalBytes += result.value.byteLength;
      if (totalBytes > MAX_MULTIPART_BODY_BYTES) {
        await reader.cancel();
        throw new MultipartPhotoValidationError();
      }
      chunks.push(result.value);
    }
  } catch (error) {
    if (error instanceof MultipartPhotoValidationError) throw error;
    throw new MultipartPhotoValidationError();
  } finally {
    reader.releaseLock();
  }

  try {
    const boundedRequest = new Request(request.url, {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))),
    });
    const form = await boundedRequest.formData();
    const entries = [...form.entries()];
    if (entries.length !== 1 || entries[0]?.[0] !== 'file')
      throw new MultipartPhotoValidationError();
    const file = entries[0][1];
    if (
      !(file instanceof File) || file.size === 0 ||
      file.size > MAX_RAW_PHOTO_BYTES ||
      !['image/jpeg', 'image/png'].includes(file.type)
    ) {
      throw new MultipartPhotoValidationError();
    }
    return {
      bytes: Buffer.from(await file.arrayBuffer()),
      declaredMime: file.type,
    };
  } catch (error) {
    if (error instanceof MultipartPhotoValidationError) throw error;
    throw new MultipartPhotoValidationError();
  }
}

export type NormalizedPhoto = {
  bytes: Buffer;
  mimeType: 'image/jpeg' | 'image/png';
  width: number;
  height: number;
  checksum: string;
};

export async function normalizePhoto(
  input: Uint8Array,
  declaredMime: string,
): Promise<NormalizedPhoto> {
  if (
    input.byteLength === 0 ||
    input.byteLength > MAX_RAW_PHOTO_BYTES ||
    !['image/jpeg', 'image/png'].includes(declaredMime)
  ) {
    throw new MediaImageValidationError();
  }

  try {
    const source = sharp(input, {
      failOn: 'warning',
      limitInputPixels: MAX_INPUT_PIXELS,
      pages: 1,
    });
    const metadata = await source.metadata();
    const mimeType = metadata.format === 'jpeg'
      ? 'image/jpeg'
      : metadata.format === 'png'
        ? 'image/png'
        : null;
    if (
      !mimeType || mimeType !== declaredMime ||
      !metadata.width || !metadata.height ||
      metadata.width * metadata.height > MAX_INPUT_PIXELS ||
      (metadata.pages ?? 1) !== 1
    ) {
      throw new MediaImageValidationError();
    }

    const pipeline = sharp(input, {
      failOn: 'warning',
      limitInputPixels: MAX_INPUT_PIXELS,
      pages: 1,
    })
      .rotate()
      .resize({
        width: MAX_PHOTO_DIMENSION,
        height: MAX_PHOTO_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      });
    const bytes = mimeType === 'image/jpeg'
      ? await pipeline.jpeg({ quality: 84, mozjpeg: true }).toBuffer()
      : await pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
    if (!bytes.length || bytes.length > MAX_NORMALIZED_PHOTO_BYTES)
      throw new MediaImageValidationError();

    const output = await sharp(bytes, { failOn: 'warning' }).metadata();
    if (
      !output.width || !output.height ||
      output.width > MAX_PHOTO_DIMENSION || output.height > MAX_PHOTO_DIMENSION ||
      output.format !== (mimeType === 'image/jpeg' ? 'jpeg' : 'png')
    ) {
      throw new MediaImageValidationError();
    }
    return {
      bytes,
      mimeType,
      width: output.width,
      height: output.height,
      checksum: createHash('sha256').update(bytes).digest('hex'),
    };
  } catch (error) {
    if (error instanceof MediaImageValidationError) throw error;
    throw new MediaImageValidationError();
  }
}
