import { AuthScreen } from '@/components/auth/auth-screen';
import { FormField } from '@/components/app/form-field';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/auth/provider';
import { completePasswordReset, validatePasswordReset } from '@/lib/auth/flows';
import { Href, useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import { View } from 'react-native';

const RESET_FAILURE_MESSAGE =
  'Tautan tidak berlaku, sudah digunakan, atau kedaluwarsa. Minta tautan pengaturan ulang yang baru.';

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{
    token?: string | string[];
    linkError?: string | string[];
  }>();
  const router = useRouter();
  const { resetPassword, signOut } = useAuth();
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmation, setConfirmation] = React.useState('');
  const [passwordError, setPasswordError] = React.useState<string | null>(null);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const submitInFlight = React.useRef(false);
  const token =
    typeof params.token === 'string' && params.token.length > 0 && params.token.length <= 2048
      ? params.token
      : null;
  const hasValidLink = token !== null && params.linkError === undefined;

  const submit = async () => {
    if (submitInFlight.current || !token || !hasValidLink) return;
    setPasswordError(null);
    setSubmitError(null);
    const validation = validatePasswordReset(newPassword, confirmation);
    if (!validation.valid) {
      setPasswordError(validation.error);
      return;
    }

    submitInFlight.current = true;
    setIsSubmitting(true);
    try {
      const outcome = await completePasswordReset(resetPassword, signOut, token, newPassword);
      if (outcome === 'success') {
        router.replace('/(auth)/sign-in' as Href);
      } else {
        setSubmitError(RESET_FAILURE_MESSAGE);
      }
    } finally {
      submitInFlight.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <AuthScreen
      title="Buat kata sandi baru"
      description={
        hasValidLink
          ? 'Pilih kata sandi baru untuk akun Carin Anda.'
          : 'Tautan pengaturan ulang tidak dapat digunakan. Minta email pengaturan ulang yang baru.'
      }>
      <View className="gap-4">
        {hasValidLink ? (
          <>
            <FormField
              label="Kata sandi baru"
              value={newPassword}
              onChangeText={(value) => {
                setNewPassword(value);
                setPasswordError(null);
                setSubmitError(null);
              }}
              placeholder="8–128 karakter"
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              secureTextEntry
              returnKeyType="next"
            />
            <FormField
              label="Ulangi kata sandi baru"
              value={confirmation}
              onChangeText={(value) => {
                setConfirmation(value);
                setPasswordError(null);
                setSubmitError(null);
              }}
              error={passwordError ?? undefined}
              placeholder="Ketik ulang kata sandi"
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={() => void submit()}
            />
            {submitError ? (
              <Text className="text-sm text-destructive" accessibilityRole="alert">
                {submitError}
              </Text>
            ) : null}
            <Button variant="tactile" disabled={isSubmitting} onPress={() => void submit()}>
              <Text>{isSubmitting ? 'Menyimpan…' : 'Simpan kata sandi baru'}</Text>
            </Button>
          </>
        ) : null}
        {!hasValidLink || submitError ? (
          <Button onPress={() => router.replace('/forgot-password' as Href)}>
            <Text>Minta tautan baru</Text>
          </Button>
        ) : null}
        <Button variant="outline" onPress={() => router.replace('/(auth)/sign-in' as Href)}>
          <Text>Kembali ke masuk</Text>
        </Button>
      </View>
    </AuthScreen>
  );
}
