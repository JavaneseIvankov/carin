import { WelcomeCarousel } from '@/components/onboarding/welcome-carousel';
import { resolvePostSignInDestination } from '@/lib/auth/routes';
import type { Href } from 'expo-router';
import { useLocalSearchParams, useRouter } from 'expo-router';

export default function WelcomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const returnTo = Array.isArray(params.returnTo) ? null : params.returnTo;
  const destination = resolvePostSignInDestination(returnTo) ?? undefined;

  const startProfile = () => {
    router.push(
      {
        pathname: '/(onboarding)/health-profile',
        params: {
          mode: 'onboarding',
          ...(destination ? { returnTo: destination } : {}),
        },
      } as Href
    );
  };

  return <WelcomeCarousel onStartProfile={startProfile} />;
}
