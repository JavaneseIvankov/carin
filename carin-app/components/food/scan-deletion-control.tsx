import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAppRepository } from '@/lib/api/query';
import { useAppData } from '@/lib/data/provider';
import { scopeKey } from '@/lib/data/scope';
import { createDeletionActionState, createDeletionActions } from '@/lib/deletion/actions';
import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { ActivityIndicator, Modal, View } from 'react-native';

export function ScanDeletionControl({
  scanId,
  jobId,
  photoId,
  onDeleted,
}: {
  scanId: string;
  jobId?: string;
  photoId?: string | null;
  onDeleted?: () => void;
}) {
  const repository = useAppRepository();
  const { scope } = useAppData();
  const queryClient = useQueryClient();
  const [visible, setVisible] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [actionState] = React.useState(() => createDeletionActionState());

  const confirm = async () => {
    if (!repository || submitting) return;
    setSubmitting(true);
    setError(null);
    const actions = createDeletionActions(
      {
        deleteAccount: (input) => repository.write('deleteAccount', input),
        deleteScan: (input) => repository.write('deleteScan', input),
      },
      async () => {},
      actionState
    );
    try {
      await actions.deleteScan(scanId, async () => {
        if (scope) {
          queryClient.removeQueries({
            queryKey: scopeKey(scope, 'getScan', { path: { id: scanId } }),
          });
          if (jobId) {
            queryClient.removeQueries({
              queryKey: scopeKey(scope, 'getAnalysisJob', { path: { id: jobId } }),
            });
          }
          if (photoId) {
            queryClient.removeQueries({
              queryKey: scopeKey(scope, 'getPhotoView', { path: { id: photoId } }),
            });
          }
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: scopeKey(scope, 'listScans') }),
            queryClient.invalidateQueries({ queryKey: scopeKey(scope, 'listConsumptions') }),
          ]);
        }
      });
      setVisible(false);
      onDeleted?.();
    } catch {
      setError('Analisis belum terhapus. Data tetap tersedia; periksa koneksi lalu coba lagi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button
        variant="destructive"
        className="min-h-12"
        accessibilityLabel="Hapus analisis dan foto sumber"
        onPress={() => {
          setError(null);
          setVisible(true);
        }}>
        <Text>Hapus analisis dan foto</Text>
      </Button>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={() => setVisible(false)}>
        <View className="flex-1 justify-end bg-black/50">
          <View className="gap-4 rounded-t-3xl bg-background px-5 pb-8 pt-5">
            <Text variant="h3">Hapus analisis foto?</Text>
            <Text>
              Hasil analisis, foto sumber, dan job yang masih berjalan akan dihapus dari akun.
              Server dapat menyelesaikan penghapusan file setelah permintaan diterima.
            </Text>
            <Text variant="muted">
              Catatan konsumsi yang sudah dibuat tetap tersimpan dengan ringkasan gizinya dan akan
              menampilkan “Foto sumber telah dihapus”. Tindakan ini tidak menghapus konsumsi.
            </Text>
            {error ? (
              <Text accessibilityRole="alert" className="text-sm text-destructive">
                {error}
              </Text>
            ) : null}
            <Button
              variant="destructive"
              className="min-h-12"
              disabled={submitting || !repository}
              onPress={() => void confirm()}>
              {submitting ? <ActivityIndicator color="white" /> : <Text>Konfirmasi hapus</Text>}
            </Button>
            <Button
              variant="outline"
              className="min-h-12"
              disabled={submitting}
              onPress={() => setVisible(false)}>
              <Text>Batalkan</Text>
            </Button>
          </View>
        </View>
      </Modal>
    </>
  );
}
