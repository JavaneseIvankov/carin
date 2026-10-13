import { AuthScreen } from '@/components/auth/auth-screen';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/auth/provider';
import { requireApiUrl } from '@/lib/config';
import { buildVerificationCallbackUrl } from '@/lib/auth/verification';
import { Href, useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import { Linking, View } from 'react-native';

const GENERIC_RESEND_MESSAGE =
  'Jika alamat ini dapat menerima verifikasi, email akan dikirim. Periksa kotak masuk dan folder spam.';
const CALLBACK_UNAVAILABLE_MESSAGE =
  'Permintaan kirim ulang belum dikirim karena alamat layanan harus memakai HTTPS. Periksa konfigurasi layanan Carin lalu coba lagi.';

export default function VerifyEmailScreen() {
  const params = useLocalSearchParams<{ email?: string | string[] }>();
  const router = useRouter();
  const { resendVerificationEmail } = useAuth();
  const [isResending, setIsResending] = React.useState(false);
  const [cooldownSeconds, setCooldownSeconds] = React.useState(0);
  const [resendFeedback, setResendFeedback] = React.useState<string | null>(null);
  const [emailAppUnavailable, setEmailAppUnavailable] = React.useState(false);
  const resendInFlight = React.useRef(false);
  const submittedEmail = Array.isArray(params.email)
    ? (params.email[0] ?? '')
    : (params.email ?? '');

  React.useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setTimeout(() => setCooldownSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldownSeconds]);

  const resend = async () => {
    if (resendInFlight.current || cooldownSeconds > 0 || !submittedEmail) return;
    let callbackURL: string | null = null;
    try {
      callbackURL = buildVerificationCallbackUrl(requireApiUrl());
    } catch {
      callbackURL = null;
    }
    if (!callbackURL) {
      setResendFeedback(CALLBACK_UNAVAILABLE_MESSAGE);
      return;
    }

    resendInFlight.current = true;
    setIsResending(true);
    setCooldownSeconds(60);
    setResendFeedback(GENERIC_RESEND_MESSAGE);
    try {
      await resendVerificationEmail({
        email: submittedEmail,
        callbackURL,
      });
    } catch {
      // Keep the same feedback for delivery failures and unknown account state.
    } finally {
      resendInFlight.current = false;
      setIsResending(false);
    }
  };

  const openEmail = async () => {
    setEmailAppUnavailable(false);
    try {
      await Linking.openURL(`mailto:${encodeURIComponent(submittedEmail)}`);
    } catch {
      setEmailAppUnavailable(true);
    }
  };

  return (
    <AuthScreen
      title="Periksa email Anda"
      description="Kami menerima pendaftaran dan mengirim instruksi verifikasi jika alamat ini dapat menerima email.">
      <View className="gap-5">
        {submittedEmail ? (
          <View className="rounded-lg border border-border bg-muted p-4">
            <Text className="text-center font-semibold">{submittedEmail}</Text>
          </View>
        ) : null}
        <Text className="text-center leading-6 text-muted-foreground">
          Buka tautan verifikasi di email untuk mengonfirmasi alamat. Tautan akan membuka halaman
          aman Carin. Anda perlu masuk setelah verifikasi; halaman ini tidak membuktikan alamat
          email telah diverifikasi.
        </Text>

        <Button size="lg" onPress={() => void openEmail()} disabled={!submittedEmail}>
          <Text>Buka email</Text>
        </Button>
        {emailAppUnavailable ? (
          <Text className="text-center text-sm text-muted-foreground" accessibilityRole="alert">
            Aplikasi email belum tersedia. Buka email Anda secara manual dan periksa juga folder
            spam.
          </Text>
        ) : null}

        <View className="items-center gap-2">
          <Button
            variant="link"
            onPress={() => void resend()}
            disabled={isResending || cooldownSeconds > 0 || !submittedEmail}
            accessibilityLabel={
              cooldownSeconds > 0
                ? `Kirim ulang email dalam ${cooldownSeconds} detik`
                : 'Kirim ulang email verifikasi'
            }>
            <Text>
              {isResending
                ? 'Mengirim…'
                : cooldownSeconds > 0
                  ? `Kirim ulang dalam ${cooldownSeconds} detik`
                  : 'Kirim ulang email verifikasi'}
            </Text>
          </Button>
          {resendFeedback ? (
            <Text
              className="text-center text-sm text-muted-foreground"
              accessibilityRole="text"
              accessibilityLiveRegion="polite">
              {resendFeedback}
            </Text>
          ) : null}
        </View>

        <Button variant="outline" onPress={() => router.replace('/(auth)/sign-in' as Href)}>
          <Text>Masuk ke Carin</Text>
        </Button>
      </View>
    </AuthScreen>
  );
}
