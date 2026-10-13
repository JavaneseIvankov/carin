import { AuthScreen } from '@/components/auth/auth-screen';
import { LegalCheckbox } from '@/components/auth/legal-checkbox';
import { LegalDocumentModal } from '@/components/auth/legal-document-modal';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/app/form-field';
import { Text } from '@/components/ui/text';
import type { LegalRegistry } from '@/lib/auth/legal';
import { loadLegalRegistry } from '@/lib/auth/legal';
import {
  isStaleLegalVersionError,
  validateRegistration,
  type RegistrationField,
} from '@/lib/auth/registration';
import { useAuth } from '@/lib/auth/provider';
import { Href, useRouter } from 'expo-router';
import * as React from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

const GENERIC_SIGNUP_ERROR = 'Pendaftaran belum berhasil. Periksa data Anda dan coba lagi.';
const STALE_VERSION_MESSAGE =
  'Versi dokumen telah berubah. Baca dan setujui kembali kedua dokumen terbaru sebelum mencoba lagi.';

function versionsMatch(left: LegalRegistry, right: LegalRegistry) {
  return (
    left.terms.version === right.terms.version && left.privacy.version === right.privacy.version
  );
}

export default function SignUpScreen() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [birthDate, setBirthDate] = React.useState('');
  const [registry, setRegistry] = React.useState<LegalRegistry | null>(null);
  const [isLoadingLegal, setIsLoadingLegal] = React.useState(true);
  const [legalLoadError, setLegalLoadError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [acceptedTerms, setAcceptedTerms] = React.useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Partial<Record<RegistrationField, string>>>(
    {}
  );
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [versionNotice, setVersionNotice] = React.useState<string | null>(null);
  const [activeDocument, setActiveDocument] = React.useState<'terms' | 'privacy' | null>(null);
  const registryRef = React.useRef<LegalRegistry | null>(null);
  const submitInFlight = React.useRef(false);

  const applyRegistry = React.useCallback((next: LegalRegistry, requireReacceptance = false) => {
    const previous = registryRef.current;
    const changed = previous !== null && !versionsMatch(previous, next);
    if (requireReacceptance || changed) {
      setAcceptedTerms(false);
      setAcceptedPrivacy(false);
      setVersionNotice(STALE_VERSION_MESSAGE);
    }
    registryRef.current = next;
    setRegistry(next);
    setLegalLoadError(null);
  }, []);

  const refreshRegistry = React.useCallback(
    async (requireReacceptance = false) => {
      try {
        const latest = await loadLegalRegistry();
        applyRegistry(latest, requireReacceptance);
        return latest;
      } catch {
        setLegalLoadError(
          'Dokumen persetujuan belum dapat dimuat. Periksa koneksi lalu coba lagi.'
        );
        return null;
      } finally {
        setIsLoadingLegal(false);
      }
    },
    [applyRegistry]
  );

  React.useEffect(() => {
    let active = true;
    void loadLegalRegistry()
      .then((latest) => {
        if (!active) return;
        registryRef.current = latest;
        setRegistry(latest);
      })
      .catch(() => {
        if (active) {
          setLegalLoadError(
            'Dokumen persetujuan belum dapat dimuat. Periksa koneksi lalu coba lagi.'
          );
        }
      })
      .finally(() => {
        if (active) setIsLoadingLegal(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const updateField = <Key extends RegistrationField>(key: Key, message?: string) => {
    setFieldErrors((current) => {
      const next = { ...current };
      if (message) next[key] = message;
      else delete next[key];
      return next;
    });
  };

  const submit = async () => {
    if (submitInFlight.current || !registry) return;
    setSubmitError(null);
    setFieldErrors({});
    const validation = validateRegistration({
      name,
      email,
      password,
      birthDate,
      acceptedTerms,
      acceptedPrivacy,
      termsVersion: registry.terms.version,
      privacyVersion: registry.privacy.version,
    });
    if (!validation.valid) {
      setFieldErrors(validation.errors);
      return;
    }

    submitInFlight.current = true;
    setIsSubmitting(true);
    try {
      const latest = await loadLegalRegistry();
      if (!versionsMatch(registry, latest)) {
        applyRegistry(latest);
        return;
      }

      const result = await signUp(validation.payload);
      if (result.error) {
        if (isStaleLegalVersionError(result.error)) {
          setAcceptedTerms(false);
          setAcceptedPrivacy(false);
          setVersionNotice(STALE_VERSION_MESSAGE);
          setIsLoadingLegal(true);
          await refreshRegistry(true);
          return;
        }
        setSubmitError(GENERIC_SIGNUP_ERROR);
        return;
      }

      router.replace({
        pathname: '/(auth)/verify-email',
        params: { email: validation.payload.email },
      } as Href);
    } catch {
      setSubmitError(GENERIC_SIGNUP_ERROR);
    } finally {
      submitInFlight.current = false;
      setIsSubmitting(false);
    }
  };

  const modalDocument = registry && activeDocument ? registry[activeDocument] : null;

  return (
    <AuthScreen
      title="Buat akun Carin"
      description="Isi data berikut untuk mulai menggunakan Carin.">
      <View className="gap-4">
        <FormField
          label="Nama (opsional)"
          value={name}
          onChangeText={setName}
          placeholder="Pengguna"
          autoComplete="name"
          textContentType="name"
          returnKeyType="next"
        />
        <FormField
          label="Email"
          value={email}
          onChangeText={setEmail}
          error={fieldErrors.email}
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
          onChangeText={setPassword}
          error={fieldErrors.password}
          placeholder="Minimal 8 karakter"
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          secureTextEntry
          returnKeyType="next"
        />
        <FormField
          label="Tanggal lahir"
          value={birthDate}
          onChangeText={setBirthDate}
          error={fieldErrors.birthDate}
          hint="Format YYYY-MM-DD. Pendaftaran tersedia untuk usia 18–50 tahun."
          placeholder="YYYY-MM-DD"
          keyboardType="numbers-and-punctuation"
          returnKeyType="done"
        />

        <View className="gap-3 border-t border-border pt-4">
          <Text className="font-semibold">Persetujuan wajib</Text>
          {isLoadingLegal && !registry ? (
            <View className="flex-row items-center gap-3 py-3">
              <ActivityIndicator accessibilityLabel="Memuat dokumen persetujuan" />
              <Text variant="muted">Memuat dokumen persetujuan terbaru…</Text>
            </View>
          ) : null}
          {legalLoadError ? (
            <View className="gap-2">
              <Text className="text-sm text-destructive" accessibilityRole="alert">
                {legalLoadError}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setIsLoadingLegal(true);
                  setLegalLoadError(null);
                  void refreshRegistry();
                }}>
                <Text className="font-semibold text-primary">Muat ulang dokumen</Text>
              </Pressable>
            </View>
          ) : null}
          {registry ? (
            <>
              {versionNotice ? (
                <Text
                  className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm"
                  accessibilityRole="alert">
                  {versionNotice}
                </Text>
              ) : null}
              <LegalCheckbox
                label="Syarat dan Ketentuan"
                version={registry.terms.version}
                checked={acceptedTerms}
                error={fieldErrors.acceptedTerms}
                onCheckedChange={(value) => {
                  setAcceptedTerms(value);
                  updateField('acceptedTerms');
                  if (value && acceptedPrivacy) setVersionNotice(null);
                }}
                onOpenDocument={() => setActiveDocument('terms')}
              />
              <LegalCheckbox
                label="Pemberitahuan Privasi"
                version={registry.privacy.version}
                checked={acceptedPrivacy}
                error={fieldErrors.acceptedPrivacy}
                onCheckedChange={(value) => {
                  setAcceptedPrivacy(value);
                  updateField('acceptedPrivacy');
                  if (value && acceptedTerms) setVersionNotice(null);
                }}
                onOpenDocument={() => setActiveDocument('privacy')}
              />
            </>
          ) : null}
        </View>

        {submitError ? (
          <Text className="text-sm text-destructive" accessibilityRole="alert">
            {submitError}
          </Text>
        ) : null}
        <Button
          size="lg"
          onPress={() => void submit()}
          disabled={isSubmitting || isLoadingLegal || !registry || !!legalLoadError}
          accessibilityLabel={isSubmitting ? 'Mendaftarkan akun' : 'Daftar'}>
          <Text>{isSubmitting ? 'Mendaftarkan…' : 'Daftar'}</Text>
        </Button>
        <Button
          variant="link"
          onPress={() => router.push('/(auth)/sign-in' as Href)}
          accessibilityLabel="Masuk ke akun Carin">
          <Text>Sudah punya akun? Masuk</Text>
        </Button>
      </View>
      <LegalDocumentModal document={modalDocument} onClose={() => setActiveDocument(null)} />
    </AuthScreen>
  );
}
