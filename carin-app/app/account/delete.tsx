import { Button } from '@/components/ui/button';
import { FormField } from '@/components/app/form-field';
import { Text } from '@/components/ui/text';
import { ApiError } from '@/lib/api/repository';
import { useAppRepository } from '@/lib/api/query';
import { createDeletionActionState, createDeletionActions } from '@/lib/deletion/actions';
import { useAuth } from '@/lib/auth/provider';
import { useRouter, type Href } from 'expo-router';
import * as React from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

const CONFIRMATION = 'DELETE_MY_ACCOUNT';

export default function DeleteAccountScreen() {
  const router = useRouter();
  const repository = useAppRepository();
  const { signOut } = useAuth();
  const [actionState] = React.useState(() => createDeletionActionState());
  const [password, setPassword] = React.useState('');
  const [confirmation, setConfirmation] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async () => {
    if (!repository || submitting || !password || confirmation !== CONFIRMATION) return;
    setSubmitting(true);
    setError(null);
    const actions = createDeletionActions(
      {
        deleteAccount: (input) => repository.write('deleteAccount', input),
        deleteScan: (input) => repository.write('deleteScan', input),
      },
      signOut,
      actionState
    );
    try {
      await actions.deleteAccount(password);
    } catch (caught) {
      setError(
        caught instanceof ApiError &&
          caught.status === 403 &&
          caught.code === 'REAUTHENTICATION_REQUIRED'
          ? 'Kata sandi tidak cocok. Akun dan data lokal Anda belum dihapus.'
          : 'Permintaan belum diterima. Akun dan data lokal Anda belum dihapus; periksa koneksi lalu coba lagi.'
      );
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerClassName="gap-5 px-5 pb-10 pt-7">
        <Button variant="ghost" className="min-h-12 self-start" onPress={() => router.back()}>
          <Text>Kembali</Text>
        </Button>
        <View className="gap-2">
          <Text variant="h2">Hapus akun Carin</Text>
          <Text>
            Tindakan ini langsung mencabut akses semua sesi dan mengantrekan penghapusan data serta
            foto. Proses penghapusan di server mungkin masih berlangsung setelah permintaan
            diterima.
          </Text>
          <Text variant="muted">
            Setelah diterima, aplikasi menghapus sesi, cache, draft, dan preview lokal.
          </Text>
        </View>
        <FormField
          label="Kata sandi saat ini"
          value={password}
          onChangeText={setPassword}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          textContentType="password"
          returnKeyType="next"
        />
        <FormField
          label={`Ketik ${CONFIRMATION} untuk mengonfirmasi`}
          value={confirmation}
          onChangeText={setConfirmation}
          autoCapitalize="characters"
          autoCorrect={false}
          accessibilityHint={`Ketik persis ${CONFIRMATION}`}
          returnKeyType="done"
          onSubmitEditing={() => void submit()}
        />
        {error ? (
          <Text accessibilityRole="alert" className="text-sm text-destructive">
            {error}
          </Text>
        ) : null}
        <Button
          variant="destructive"
          className="min-h-12"
          disabled={submitting || !password || confirmation !== CONFIRMATION || !repository}
          onPress={() => void submit()}>
          {submitting ? <ActivityIndicator color="white" /> : <Text>Hapus akun</Text>}
        </Button>
        <Button
          variant="outline"
          className="min-h-12"
          onPress={() => router.replace('/(tabs)/profile' as Href)}>
          <Text>Batalkan dan kembali ke profil</Text>
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
