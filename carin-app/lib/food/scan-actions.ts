import type { AppRequestInput } from '@/lib/api/contracts';
import type { AppResponse } from '@/lib/api/repository';
import { createStableActionKey } from '@/lib/profile/profile';

export type ScanApi = {
  uploadPhoto(input: AppRequestInput<'uploadPhoto'>): Promise<AppResponse<'uploadPhoto'>>;
  createPhotoAnalysis(
    input: AppRequestInput<'createPhotoAnalysis'>
  ): Promise<AppResponse<'createPhotoAnalysis'>>;
  retryAnalysisJob(
    input: AppRequestInput<'retryAnalysisJob'>
  ): Promise<AppResponse<'retryAnalysisJob'>>;
};

export function createScanActionState(makeKey?: () => string) {
  return {
    uploadKeys: createStableActionKey(makeKey),
    jobKeys: createStableActionKey(makeKey),
    retryKeys: createStableActionKey(makeKey),
    uploadedPhoto: null as AppResponse<'uploadPhoto'> | null,
    photoIdentity: null as string | null,
  };
}

export type ScanActionState = ReturnType<typeof createScanActionState>;

export function createScanActions(
  api: ScanApi,
  makeKey?: () => string,
  state: ScanActionState = createScanActionState(makeKey)
) {
  return {
    async start(photo: Blob, photoIdentity: string, consentIsCurrent: boolean) {
      if (state.photoIdentity !== photoIdentity) {
        state.photoIdentity = photoIdentity;
        state.uploadedPhoto = null;
        state.uploadKeys.clear();
        state.jobKeys.clear();
      }
      if (!consentIsCurrent) throw new Error('Persetujuan pemrosesan AI versi terbaru diperlukan.');
      if (!state.uploadedPhoto) {
        const uploadKey = state.uploadKeys.forPayload({ action: 'upload-photo' });
        state.uploadedPhoto = await api.uploadPhoto({
          headers: { 'Idempotency-Key': uploadKey },
          body: { file: photo },
        });
        state.uploadKeys.clear();
      }

      const body = { photoId: state.uploadedPhoto.id };
      const jobKey = state.jobKeys.forPayload(body);
      const job = await api.createPhotoAnalysis({
        headers: { 'Idempotency-Key': jobKey },
        body,
      });
      state.jobKeys.clear();
      state.uploadedPhoto = null;
      state.photoIdentity = null;
      return job;
    },

    async retry(jobId: string) {
      const body = { jobId };
      const key = state.retryKeys.forPayload(body);
      const job = await api.retryAnalysisJob({
        path: { id: jobId },
        headers: { 'Idempotency-Key': key },
      });
      state.retryKeys.clear();
      return job;
    },
  };
}
