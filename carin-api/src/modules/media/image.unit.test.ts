import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  MediaImageValidationError,
  MultipartPhotoValidationError,
  normalizePhoto,
  readMultipartPhoto,
} from './image.js';

const maxRawBytes = 10 * 1024 * 1024;

async function jpegBuffer(width: number, height: number, orientation?: number) {
  const image = sharp({
    create: { width, height, channels: 3, background: { r: 80, g: 120, b: 160 } },
  }).jpeg();
  if (orientation) image.withMetadata({ orientation });
  return image.toBuffer();
}

describe('photo normalization', () => {
  it('rejects a declared MIME type that does not match the decoded image', async () => {
    const jpeg = await jpegBuffer(8, 6);
    await expect(normalizePhoto(jpeg, 'image/png')).rejects.toBeInstanceOf(
      MediaImageValidationError,
    );
  });

  it('rejects corrupt bytes even when the declared MIME is allowed', async () => {
    await expect(
      normalizePhoto(Buffer.from([0xff, 0xd8, 0xff, 0x00]), 'image/jpeg'),
    ).rejects.toBeInstanceOf(MediaImageValidationError);
  });

  it('rejects raw files above 10 MiB before attempting image decode', async () => {
    await expect(
      normalizePhoto(Buffer.alloc(maxRawBytes + 1), 'image/jpeg'),
    ).rejects.toBeInstanceOf(MediaImageValidationError);
  });

  it('parses exactly one multipart file and rejects extra form fields', async () => {
    const form = new FormData();
    form.append('file', new Blob([await jpegBuffer(8, 6)], { type: 'image/jpeg' }), 'meal.jpg');
    form.append('caption', 'private');
    const request = new Request('http://carin.invalid/api/v1/photos', {
      method: 'POST',
      body: form,
    });

    await expect(readMultipartPhoto(request)).rejects.toBeInstanceOf(
      MultipartPhotoValidationError,
    );
  });

  it('bounds multipart streaming and rejects a file larger than 10 MiB', async () => {
    const form = new FormData();
    form.append('file', new Blob([Buffer.alloc(maxRawBytes + 1)], { type: 'image/jpeg' }), 'large.jpg');
    const request = new Request('http://carin.invalid/api/v1/photos', {
      method: 'POST',
      body: form,
    });

    await expect(readMultipartPhoto(request)).rejects.toBeInstanceOf(
      MultipartPhotoValidationError,
    );
  });

  it('applies EXIF orientation, limits the longest edge, and strips EXIF metadata', async () => {
    const source = await jpegBuffer(2400, 1200, 6);
    const result = await normalizePhoto(source, 'image/jpeg');
    const output = await sharp(result.bytes).metadata();

    expect(result.mimeType).toBe('image/jpeg');
    expect(result.width).toBe(800);
    expect(result.height).toBe(1600);
    expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(1600);
    expect(output.exif).toBeUndefined();
    expect(output.orientation).toBeUndefined();
    expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('keeps a valid PNG as PNG while normalizing its dimensions', async () => {
    const source = await sharp({
      create: { width: 2000, height: 1000, channels: 4, background: { r: 15, g: 25, b: 35, alpha: 0.5 } },
    }).png().toBuffer();
    const result = await normalizePhoto(source, 'image/png');

    expect(result.mimeType).toBe('image/png');
    expect(result.width).toBe(1600);
    expect(result.height).toBe(800);
    expect((await sharp(result.bytes).metadata()).format).toBe('png');
  });
});
