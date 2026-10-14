import { AuthScreen } from '@/components/auth/auth-screen';
import { FormField } from '@/components/app/form-field';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/auth/provider';
import { buildPasswordResetLandingUrl } from '@/lib/auth/links';
import {
  PASSWORD_RESET_REQUEST_CONFIRMATION,
  requestPasswordResetPrivately,
} from '@/lib/auth/flows';
import { requireApiUrl } from '@/lib/config';
import { Href, useRouter } from 'expo-router';
import * as React from 'react';
import { View } from 'react-native';

const SERVICE_UNAVAILABLE_MESSAGE =
  'Permintaan belum dapat dikirim. Periksa koneksi lalu coba lagi.';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = React.useState('');
  const [emailError, setEmailError] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const submitInFlight = React.useRef(false);

  const submit = async () => {
    if (submitInFlight.current) return;
    setFeedback(null);
    const normalizedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setEmailError('Masukkan alamat email yang valid.');
      return;
    }
    setEmailError(null);

    let redirectTo: string | null = null;
    try {
      redirectTo = buildPasswordResetLandingUrl(requireApiUrl());
    } catch {
      redirectTo = null;
    }
    if (!redirectTo) {
      setFeedback(SERVICE_UNAVAILABLE_MESSAGE);
      return;
    }

    submitInFlight.current = true;
    setIsSubmitting(true);
    try {
      const response = await requestPasswordResetPrivately(requestPasswordReset, {
        email: normalizedEmail,
        redirectTo,
      });
      setFeedback(response);
    } finally {
      submitInFlight.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <AuthScreen
      title="Atur ulang kata sandi"
      description="Masukkan email akun Anda. Jika alamat tersebut terdaftar, kami akan mengirim tautan pengaturan ulang.">
      <View className="gap-4">
        <FormField
          label="Email"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setEmailError(null);
            setFeedback(null);
          }}
          error={emailError ?? undefined}
          placeholder="nama@email.com"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={() => void submit()}
        />
        {feedback ? (
          <Text
            className="text-sm text-muted-foreground"
            accessibilityRole="text"
            accessibilityLiveRegion="polite">
            {feedback === PASSWORD_RESET_REQUEST_CONFIRMATION
              ? feedback
              : SERVICE_UNAVAILABLE_MESSAGE}
          </Text>
        ) : null}
        <Button size="lg" disabled={isSubmitting} onPress={() => void submit()}>
          <Text>{isSubmitting ? 'Mengirim…' : 'Kirim tautan reset'}</Text>
        </Button>
        <Button variant="outline" onPress={() => router.replace('/(auth)/sign-in' as Href)}>
          <Text>Kembali ke masuk</Text>
        </Button>
      </View>
    </AuthScreen>
  );
}
