import { BackButton } from '@/components/app/back-button';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/app/form-field';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { ApiError } from '@/lib/api/repository';
import { useAppRepository } from '@/lib/api/query';
import { createDeletionActionState, createDeletionActions } from '@/lib/deletion/actions';
import { useAuth } from '@/lib/auth/provider';
import { useRouter, type Href } from 'expo-router';
import * as React from 'react';
import { AlertTriangle } from 'lucide-react-native';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';

const CONFIRMATION_TEXT = 'HAPUS AKUN';

const isConfirmed = (text: string) => {
  const norm = text.trim().toUpperCase();
  return norm === 'HAPUS AKUN' || norm === 'HAPUS AKUN SAYA' || norm === 'DELETE_MY_ACCOUNT';
};

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
    if (!repository || submitting || !password || !isConfirmed(confirmation)) return;
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
        <BackButton href="/(tabs)/profile" />

        <View className="gap-2">
          <Text variant="h1">Hapus akun Carin</Text>
          <Text variant="muted">
            Permintaan penghapusan akun akan mengantrekan penghapusan seluruh data Anda.
          </Text>
        </View>

        <View className="gap-3 rounded-summary border border-destructive/30 bg-destructive/5 p-5">
          <View className="flex-row items-center gap-2.5">
            <View className="h-9 w-9 items-center justify-center rounded-full bg-destructive/15">
              <Icon as={AlertTriangle} size={18} className="text-destructive" />
            </View>
            <Text variant="h3" className="font-bold text-destructive">
              Tindakan Permanen
            </Text>
          </View>
          <Text className="text-sm leading-5 text-foreground">
            Tindakan ini langsung mencabut akses semua sesi dan mengantrekan penghapusan data serta
            foto. Proses penghapusan di server mungkin masih berlangsung setelah permintaan
            diterima.
          </Text>
          <Text variant="caption" className="text-muted-foreground">
            Setelah diterima, aplikasi menghapus sesi, cache, draft, dan preview lokal secara menyeluruh.
          </Text>
        </View>

        <View className="gap-4 rounded-summary border border-border/60 bg-card p-5">
          <Text variant="h3">Konfirmasi Penghapusan</Text>
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
          <View className="gap-2">
            <FormField
              label={`Ketik ${CONFIRMATION_TEXT} untuk mengonfirmasi`}
              placeholder={CONFIRMATION_TEXT}
              value={confirmation}
              onChangeText={setConfirmation}
              autoCapitalize="characters"
              autoCorrect={false}
              accessibilityHint={`Ketik persis ${CONFIRMATION_TEXT}`}
              returnKeyType="done"
              onSubmitEditing={() => void submit()}
            />
            <Pressable
              onPress={() => setConfirmation(CONFIRMATION_TEXT)}
              accessibilityRole="button"
              accessibilityLabel="Isi otomatis frasa konfirmasi"
              className="self-start rounded-full border border-border/70 bg-muted/20 px-3 py-1 active:bg-muted/40">
              <Text variant="caption" className="font-medium text-foreground">
                Sentuh untuk mengisi: {CONFIRMATION_TEXT}
              </Text>
            </Pressable>
          </View>
          {error ? (
            <Text accessibilityRole="alert" className="text-sm text-destructive">
              {error}
            </Text>
          ) : null}
          <Button
            variant="destructive"
            className="min-h-12 mt-1"
            disabled={submitting || !password || !isConfirmed(confirmation) || !repository}
            onPress={() => void submit()}>
            {submitting ? <ActivityIndicator color="white" /> : <Text>Hapus akun</Text>}
          </Button>
        </View>

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
