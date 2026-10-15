import type { components } from '@/lib/api/generated/app-api';
import { createStableActionKey, createIdempotencyKey } from '@/lib/profile/profile';

export type AccountDeletionInput = components['schemas']['AccountDeletionInput'];
export type AccountDeletionAccepted = components['schemas']['AccountDeletionAccepted'];

export function createDeletionActionState(makeKey: () => string = createIdempotencyKey) {
  return {
    accountKeys: createStableActionKey(makeKey),
    scanKeys: createStableActionKey(makeKey),
  };
}

type DeletionApi = {
  deleteAccount: (input: {
    headers: { 'Idempotency-Key': string };
    body: AccountDeletionInput;
  }) => Promise<AccountDeletionAccepted>;
  deleteScan: (input: {
    path: { id: string };
    headers: { 'Idempotency-Key': string };
  }) => Promise<void>;
};

export function createDeletionActions(
  api: DeletionApi,
  clearLocalSession: () => Promise<void>,
  state: ReturnType<typeof createDeletionActionState> = createDeletionActionState()
) {
  return {
    async deleteAccount(password: string) {
      const body: AccountDeletionInput = { password, confirmation: 'DELETE_MY_ACCOUNT' };
      const response = await api.deleteAccount({
        headers: { 'Idempotency-Key': state.accountKeys.forPayload(body) },
        body,
      });
      if (response.status !== 'deletion_pending' || response.accessRevoked !== true) {
        throw new Error('Penghapusan akun belum dikonfirmasi oleh server.');
      }
      await clearLocalSession();
      state.accountKeys.clear();
      return response;
    },
    async deleteScan(scanId: string, onDeleted: () => Promise<void>) {
      await api.deleteScan({
        path: { id: scanId },
        headers: { 'Idempotency-Key': state.scanKeys.forPayload({ scanId }) },
      });
      await onDeleted();
      state.scanKeys.clear();
    },
  };
}
