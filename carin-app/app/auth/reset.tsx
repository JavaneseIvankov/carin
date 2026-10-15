import { AuthScreen } from '@/components/auth/auth-screen';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { getAuthEnvironmentConfig } from '@/lib/auth/environment';
import { parsePasswordResetLink } from '@/lib/auth/links';
import { Href, useRouter } from 'expo-router';
import { useLinkingURL } from 'expo-linking';
import * as React from 'react';
import { View } from 'react-native';

const resetScheme = getAuthEnvironmentConfig(process.env.EXPO_PUBLIC_ENV ?? 'development').scheme;

export default function ResetLinkBridge() {
  const router = useRouter();
  const linkingUrl = useLinkingURL();
  const lastHandledUrl = React.useRef<string | null>(null);
  const parsedLink = React.useMemo(
    () => (linkingUrl ? parsePasswordResetLink(linkingUrl, resetScheme) : null),
    [linkingUrl]
  );

  React.useEffect(() => {
    if (!linkingUrl || !parsedLink || lastHandledUrl.current === linkingUrl) return;
    lastHandledUrl.current = linkingUrl;
    if (!parsedLink.valid) return;

    router.replace({
      pathname: '/reset-password',
      params: { token: parsedLink.token },
    } as Href);
  }, [linkingUrl, parsedLink, router]);

  if (parsedLink?.valid === false) {
    return (
      <AuthScreen
        title="Tautan tidak berlaku"
        description="Tautan pengaturan ulang tidak lengkap atau tidak cocok dengan lingkungan aplikasi ini.">
        <View className="gap-3">
          <Button onPress={() => router.replace('/forgot-password' as Href)}>
            <Text>Minta tautan baru</Text>
          </Button>
          <Button variant="outline" onPress={() => router.replace('/(auth)/sign-in' as Href)}>
            <Text>Kembali ke masuk</Text>
          </Button>
        </View>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title="Membuka tautan"
      description="Kami sedang memeriksa tautan pengaturan ulang kata sandi Anda.">
      <View className="gap-3">
        <Text className="text-center text-muted-foreground" accessibilityRole="text">
          Jika layar ini tidak berubah, minta tautan pengaturan ulang yang baru.
        </Text>
          <Button onPress={() => router.replace('/forgot-password' as Href)}>
          <Text>Minta tautan baru</Text>
        </Button>
      </View>
    </AuthScreen>
  );
}
