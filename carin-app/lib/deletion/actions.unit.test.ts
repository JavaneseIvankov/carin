import { describe, expect, it, vi } from 'vitest';
import { createDeletionActionState, createDeletionActions } from './actions';

const accepted = {
  status: 'deletion_pending' as const,
  acceptedAt: '2026-10-14T10:00:00.000Z',
  accessRevoked: true as const,
};

describe('deletion actions', () => {
  it('clears local session only after account deletion is accepted', async () => {
    const api = { deleteAccount: vi.fn().mockResolvedValue(accepted), deleteScan: vi.fn() };
    const clearLocalSession = vi.fn().mockResolvedValue(undefined);
    const actions = createDeletionActions(
      api,
      clearLocalSession,
      createDeletionActionState(() => 'delete-key')
    );

    await actions.deleteAccount('secret');

    expect(api.deleteAccount).toHaveBeenCalledWith({
      headers: { 'Idempotency-Key': 'delete-key' },
      body: { password: 'secret', confirmation: 'DELETE_MY_ACCOUNT' },
    });
    expect(clearLocalSession).toHaveBeenCalledOnce();
  });

  it('keeps the session when the password is rejected and reuses the request key on retry', async () => {
    const api = {
      deleteAccount: vi.fn().mockRejectedValueOnce(new Error('wrong password')),
      deleteScan: vi.fn(),
    };
    const clearLocalSession = vi.fn();
    const actions = createDeletionActions(
      api,
      clearLocalSession,
      createDeletionActionState(() => 'delete-key')
    );

    await expect(actions.deleteAccount('wrong')).rejects.toThrow('wrong password');
    api.deleteAccount.mockResolvedValueOnce(accepted);
    await actions.deleteAccount('wrong');

    expect(api.deleteAccount.mock.calls.map(([input]) => input.headers['Idempotency-Key'])).toEqual(
      ['delete-key', 'delete-key']
    );
    expect(clearLocalSession).toHaveBeenCalledOnce();
  });

  it('does not clear local data for an acknowledgement without revoked access', async () => {
    const api = {
      deleteAccount: vi.fn().mockResolvedValue({ ...accepted, accessRevoked: false }),
      deleteScan: vi.fn(),
    };
    const clearLocalSession = vi.fn();
    const actions = createDeletionActions(
      api,
      clearLocalSession,
      createDeletionActionState(() => 'delete-key')
    );

    await expect(actions.deleteAccount('secret')).rejects.toThrow(
      'Penghapusan akun belum dikonfirmasi oleh server.'
    );
    expect(clearLocalSession).not.toHaveBeenCalled();
  });

  it('deletes scans with a stable key and leaves consumption data untouched', async () => {
    const api = { deleteAccount: vi.fn(), deleteScan: vi.fn().mockResolvedValue(undefined) };
    const clearLocalSession = vi.fn();
    const invalidateScans = vi.fn().mockResolvedValue(undefined);
    const actions = createDeletionActions(
      api,
      clearLocalSession,
      createDeletionActionState(() => 'scan-key')
    );

    await actions.deleteScan('scan-1', invalidateScans);
    await actions.deleteScan('scan-1', invalidateScans);

    expect(api.deleteScan).toHaveBeenCalledWith({
      path: { id: 'scan-1' },
      headers: { 'Idempotency-Key': 'scan-key' },
    });
    expect(invalidateScans).toHaveBeenCalledTimes(2);
    expect(clearLocalSession).not.toHaveBeenCalled();
  });

  it('keeps scan visible when deletion fails', async () => {
    const api = {
      deleteAccount: vi.fn(),
      deleteScan: vi.fn().mockRejectedValue(new Error('offline')),
    };
    const invalidateScans = vi.fn();
    const actions = createDeletionActions(
      api,
      vi.fn(),
      createDeletionActionState(() => 'scan-key')
    );

    await expect(actions.deleteScan('scan-1', invalidateScans)).rejects.toThrow('offline');
    expect(invalidateScans).not.toHaveBeenCalled();
  });
});
