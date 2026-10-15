import { AuthScreen } from '@/components/auth/auth-screen';
import { FormField } from '@/components/app/form-field';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/auth/provider';
import { classifySignInError } from '@/lib/auth/flows';
import { resolvePostSignInDestination } from '@/lib/auth/routes';
import { Href, useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import { View } from 'react-native';

const INVALID_CREDENTIALS_MESSAGE =
  'Email atau kata sandi tidak sesuai. Periksa kembali lalu coba lagi.';
const UNVERIFIED_EMAIL_MESSAGE =
  'Email belum diverifikasi. Buka instruksi verifikasi atau kirim ulang email terlebih dahulu.';

export default function SignInScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ next?: string | string[] }>();
  const { signIn } = useAuth();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [emailError, setEmailError] = React.useState<string | null>(null);
  const [passwordError, setPasswordError] = React.useState<string | null>(null);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [canResendVerification, setCanResendVerification] = React.useState(false);
  const submitInFlight = React.useRef(false);

  const submit = async () => {
    if (submitInFlight.current) return;
    setSubmitError(null);
    setCanResendVerification(false);
    const normalizedEmail = email.trim();
    const nextEmailError = !normalizedEmail ? 'Masukkan alamat email Anda.' : null;
    const nextPasswordError = !password ? 'Masukkan kata sandi Anda.' : null;
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    if (nextEmailError || nextPasswordError) return;

    submitInFlight.current = true;
    setIsSubmitting(true);
    try {
      const result = await signIn({ email: normalizedEmail, password });
      if (result.error) {
        const failure = classifySignInError(result.error);
        setSubmitError(
          failure === 'unverified-email' ? UNVERIFIED_EMAIL_MESSAGE : INVALID_CREDENTIALS_MESSAGE
        );
        setCanResendVerification(failure === 'unverified-email');
        return;
      }

      // The provider resolves only after its server session restoration and cache-scope transition.
      router.replace((resolvePostSignInDestination(params.next) ?? '/(tabs)') as Href);
    } catch {
      setSubmitError(INVALID_CREDENTIALS_MESSAGE);
    } finally {
      submitInFlight.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <AuthScreen title="Masuk ke Carin" description="Masuk untuk melanjutkan ke akun Anda.">
      <View className="gap-4">
        <FormField
          label="Email"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setEmailError(null);
          }}
          error={emailError ?? undefined}
          placeholder="nama@email.com"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          autoCorrect={false}
          returnKeyType="next"
        />
        <FormField
          label="Kata sandi"
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            setPasswordError(null);
          }}
          error={passwordError ?? undefined}
          placeholder="Kata sandi Anda"
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          secureTextEntry
          returnKeyType="done"
          onSubmitEditing={() => void submit()}
        />

        {submitError ? (
          <Text className="text-sm text-destructive" accessibilityRole="alert">
            {submitError}
          </Text>
        ) : null}
        {canResendVerification ? (
          <Button
            variant="outline"
            onPress={() =>
              router.replace({
                pathname: '/(auth)/verify-email',
                params: { email: email.trim() },
              } as Href)
            }>
            <Text>Kirim ulang email verifikasi</Text>
          </Button>
        ) : null}

        <Button variant="tactile" disabled={isSubmitting} onPress={() => void submit()}>
          <Text>{isSubmitting ? 'Memeriksa…' : 'Masuk'}</Text>
        </Button>
        <Button variant="link" onPress={() => router.push('/forgot-password' as Href)}>
          <Text>Lupa kata sandi?</Text>
        </Button>
        <View className="flex-row items-center justify-center gap-1">
          <Text variant="muted">Belum memiliki akun?</Text>
          <Button variant="link" onPress={() => router.push('/(auth)/sign-up' as Href)}>
            <Text>Buat akun</Text>
          </Button>
        </View>
      </View>
    </AuthScreen>
  );
}
