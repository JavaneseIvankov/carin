import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAppRepository } from '@/lib/api/query';
import { useAppData } from '@/lib/data/provider';
import { scopeKey } from '@/lib/data/scope';
import { createDeletionActionState, createDeletionActions } from '@/lib/deletion/actions';
import { Drawer } from '@/components/ui/drawer';
import { Icon } from '@/components/ui/icon';
import { useQueryClient } from '@tanstack/react-query';
import { Ellipsis, Trash2 } from 'lucide-react-native';
import * as React from 'react';
import { ActivityIndicator, View } from 'react-native';

export function ScanDeletionControl({
  scanId,
  jobId,
  photoId,
  onDeleted,
  trigger = 'button',
}: {
  scanId: string;
  jobId?: string;
  photoId?: string | null;
  onDeleted?: () => void;
  trigger?: 'button' | 'overflow';
}) {
  const repository = useAppRepository();
  const { scope } = useAppData();
  const queryClient = useQueryClient();
  const [visible, setVisible] = React.useState(false);
  const [step, setStep] = React.useState<'menu' | 'confirm'>('confirm');
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
      {trigger === 'overflow' ? (
        <Button
          variant="ghost"
          size="icon"
          accessibilityLabel="Opsi analisis foto"
          onPress={() => {
            setError(null);
            setStep('menu');
            setVisible(true);
          }}>
          <Icon as={Ellipsis} size={20} className="text-foreground" />
        </Button>
      ) : (
        <Button
          variant="destructive"
          className="min-h-12"
          accessibilityLabel="Hapus analisis dan foto sumber"
          onPress={() => {
            setError(null);
            setStep('confirm');
            setVisible(true);
          }}>
          <Text>Hapus analisis dan foto</Text>
        </Button>
      )}
      <Drawer
        isOpen={visible}
        onClose={() => setVisible(false)}
        title={step === 'menu' ? 'Tindakan analisis' : 'Hapus analisis foto?'}
        contentContainerClassName="gap-4">
        {step === 'menu' ? (
          <Button
            variant="ghost"
            className="min-h-12 justify-start px-2"
            accessibilityLabel="Hapus analisis dan foto sumber"
            onPress={() => setStep('confirm')}>
            <Icon as={Trash2} size={18} className="text-destructive" />
            <Text className="text-destructive">Hapus analisis dan foto</Text>
          </Button>
        ) : (
          <>
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
            <View className="gap-2.5 pt-2">
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
          </>
        )}
      </Drawer>
    </>
  );
}
