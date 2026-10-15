import { describe, expect, it, vi } from 'vitest';
import { createScanActionState, createScanActions, type ScanApi } from './scan-actions';

describe('scan actions', () => {
  it('requires current AI consent before uploading a photo', async () => {
    const write = vi.fn();
    const api: ScanApi = {
      uploadPhoto: write,
      createPhotoAnalysis: write,
      retryAnalysisJob: write,
    };
    const actions = createScanActions(api);

    await expect(actions.start(new Blob(['photo']), 'photo-draft-1', false)).rejects.toThrow(
      /persetujuan/i
    );
    expect(write).not.toHaveBeenCalled();
  });

  it('reuses the same job creation key when the server response fails', async () => {
    const write = vi
      .fn()
      .mockResolvedValueOnce({ id: 'photo-1' })
      .mockRejectedValueOnce(new Error('server unavailable'))
      .mockResolvedValueOnce({ id: 'job-1' });
    const keys = ['upload-key', 'job-key'];
    const api: ScanApi = {
      uploadPhoto: (input) => write('uploadPhoto', input),
      createPhotoAnalysis: (input) => write('createPhotoAnalysis', input),
      retryAnalysisJob: (input) => write('retryAnalysisJob', input),
    };
    const actionState = createScanActionState(() => keys.shift() ?? 'unexpected');
    const actions = createScanActions(api, undefined, actionState);
    const recreatedActions = createScanActions(api, undefined, actionState);
    const image = new Blob(['photo'], { type: 'image/jpeg' });

    await expect(actions.start(image, 'photo-draft-1', true)).rejects.toThrow('server unavailable');
    await recreatedActions.start(image, 'photo-draft-1', true);

    expect(write).toHaveBeenNthCalledWith(
      1,
      'uploadPhoto',
      expect.objectContaining({
        headers: { 'Idempotency-Key': 'upload-key' },
      })
    );
    expect(write).toHaveBeenNthCalledWith(
      2,
      'createPhotoAnalysis',
      expect.objectContaining({
        headers: { 'Idempotency-Key': 'job-key' },
        body: { photoId: 'photo-1' },
      })
    );
    expect(write).toHaveBeenNthCalledWith(
      3,
      'createPhotoAnalysis',
      expect.objectContaining({
        headers: { 'Idempotency-Key': 'job-key' },
        body: { photoId: 'photo-1' },
      })
    );
  });

  it('uploads a newly selected photo after job creation failed for the previous photo', async () => {
    const uploadPhoto = vi
      .fn()
      .mockResolvedValueOnce({ id: 'photo-old' })
      .mockResolvedValueOnce({ id: 'photo-new' });
    const createPhotoAnalysis = vi
      .fn()
      .mockRejectedValueOnce(new Error('server unavailable'))
      .mockResolvedValueOnce({ id: 'job-new' });
    const api: ScanApi = {
      uploadPhoto,
      createPhotoAnalysis,
      retryAnalysisJob: vi.fn(),
    };
    const actions = createScanActions(api);

    await expect(actions.start(new Blob(['old']), 'photo-draft-1', true)).rejects.toThrow(
      'server unavailable'
    );
    await actions.start(new Blob(['new']), 'photo-draft-2', true);

    expect(uploadPhoto).toHaveBeenCalledTimes(2);
    expect(createPhotoAnalysis).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ body: { photoId: 'photo-new' } })
    );
  });

  it('uploads and creates only an analysis job without writing a consumption', async () => {
    const calls: string[] = [];
    const actions = createScanActions({
      uploadPhoto: async () => {
        calls.push('uploadPhoto');
        return { id: 'photo-1' } as never;
      },
      createPhotoAnalysis: async () => {
        calls.push('createPhotoAnalysis');
        return { id: 'job-1' } as never;
      },
      retryAnalysisJob: async () => {
        calls.push('retryAnalysisJob');
        return { id: 'retry-1' } as never;
      },
    });

    await actions.start(new Blob(['photo']), 'photo-draft-1', true);

    expect(calls).toEqual(['uploadPhoto', 'createPhotoAnalysis']);
  });

  it('reports the upload and job stages before each request', async () => {
    const stages: string[] = [];
    const actions = createScanActions({
      uploadPhoto: async () => ({ id: 'photo-1' }) as never,
      createPhotoAnalysis: async () => ({ id: 'job-1' }) as never,
      retryAnalysisJob: async () => ({ id: 'retry-1' }) as never,
    });

    await actions.start(new Blob(['photo']), 'photo-draft-1', true, (stage) => stages.push(stage));

    expect(stages).toEqual(['upload-photo', 'create-analysis-job']);
  });

  it('uses the native file upload action for device photo URIs', async () => {
    const uploadPhotoFile = vi.fn(async () => ({ id: 'photo-1' }) as never);
    const uploadPhoto = vi.fn(async () => ({ id: 'wrong-path' }) as never);
    const createPhotoAnalysis = vi.fn(async () => ({ id: 'job-1' }) as never);
    const actions = createScanActions({
      uploadPhoto,
      uploadPhotoFile,
      createPhotoAnalysis,
      retryAnalysisJob: vi.fn(),
    });

    await actions.start(
      { kind: 'native-file', uri: 'file:///cache/photo.jpg', mimeType: 'image/jpeg' },
      'photo-draft-1',
      true
    );

    expect(uploadPhotoFile).toHaveBeenCalledOnce();
    expect(uploadPhoto).not.toHaveBeenCalled();
    expect(createPhotoAnalysis).toHaveBeenCalledWith({
      headers: { 'Idempotency-Key': expect.any(String) },
      body: { photoId: 'photo-1' },
    });
  });

  it('keeps a retry key stable until the retry is acknowledged', async () => {
    const write = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ id: 'retry-1' });
    const api: ScanApi = {
      uploadPhoto: (input) => write('uploadPhoto', input),
      createPhotoAnalysis: (input) => write('createPhotoAnalysis', input),
      retryAnalysisJob: (input) => write('retryAnalysisJob', input),
    };
    const actions = createScanActions(api, () => 'retry-key');

    await expect(actions.retry('job-failed')).rejects.toThrow('timeout');
    await actions.retry('job-failed');

    expect(write).toHaveBeenNthCalledWith(
      1,
      'retryAnalysisJob',
      expect.objectContaining({
        path: { id: 'job-failed' },
        headers: { 'Idempotency-Key': 'retry-key' },
      })
    );
    expect(write).toHaveBeenNthCalledWith(
      2,
      'retryAnalysisJob',
      expect.objectContaining({
        path: { id: 'job-failed' },
        headers: { 'Idempotency-Key': 'retry-key' },
      })
    );
  });
});
