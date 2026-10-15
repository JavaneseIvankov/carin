import type { AppRequestInput } from '@/lib/api/contracts';
import type { AppResponse } from '@/lib/api/repository';
import { createStableActionKey } from '@/lib/profile/profile';
import type { NativePhotoFile } from './photo-upload';

export type ScanApi = {
  uploadPhoto(input: AppRequestInput<'uploadPhoto'>): Promise<AppResponse<'uploadPhoto'>>;
  uploadPhotoFile?(
    input: Omit<AppRequestInput<'uploadPhoto'>, 'body'>,
    file: NativePhotoFile
  ): Promise<AppResponse<'uploadPhoto'>>;
  createPhotoAnalysis(
    input: AppRequestInput<'createPhotoAnalysis'>
  ): Promise<AppResponse<'createPhotoAnalysis'>>;
  retryAnalysisJob(
    input: AppRequestInput<'retryAnalysisJob'>
  ): Promise<AppResponse<'retryAnalysisJob'>>;
};

export type ScanActionStage = 'upload-photo' | 'create-analysis-job';

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
    async start(
      photo: Blob | NativePhotoFile,
      photoIdentity: string,
      consentIsCurrent: boolean,
      onStage?: (stage: ScanActionStage) => void
    ) {
      if (state.photoIdentity !== photoIdentity) {
        state.photoIdentity = photoIdentity;
        state.uploadedPhoto = null;
        state.uploadKeys.clear();
        state.jobKeys.clear();
      }
      if (!consentIsCurrent) throw new Error('Persetujuan pemrosesan AI versi terbaru diperlukan.');
      if (!state.uploadedPhoto) {
        onStage?.('upload-photo');
        const uploadKey = state.uploadKeys.forPayload({ action: 'upload-photo' });
        const input = { headers: { 'Idempotency-Key': uploadKey } };
        if (photo instanceof Blob) {
          state.uploadedPhoto = await api.uploadPhoto({ ...input, body: { file: photo } });
        } else {
          if (!api.uploadPhotoFile) throw new Error('Native photo upload is unavailable.');
          state.uploadedPhoto = await api.uploadPhotoFile(input, photo);
        }
        state.uploadKeys.clear();
      }

      const body = { photoId: state.uploadedPhoto.id };
      onStage?.('create-analysis-job');
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
