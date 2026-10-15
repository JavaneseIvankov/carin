import { Redirect } from 'expo-router';
import { AuthRestorationState } from '@/components/auth/auth-restoration-state';
import { useOnboardingSession } from '@/components/onboarding/onboarding-session';
import { useAppRead } from '@/lib/api/query';
import { useAuth } from '@/lib/auth/provider';
import { getRootRouteEntry } from '@/lib/auth/root-route-access';
import { onboardingGateStateFromQuery } from '@/lib/onboarding/routes';

export default function Index() {
  const { status, error, user, retryRestoration, invalidateSession } = useAuth();
  const { isBypassed } = useOnboardingSession();
  const onboardingQuery = useAppRead('getOnboarding', {}, { enabled: status === 'authenticated' });
  const onboardingState = onboardingGateStateFromQuery(onboardingQuery);
  const entry = getRootRouteEntry(
    status,
    onboardingState,
    Boolean(user?.id && isBypassed(user.id))
  );

  if (entry.type === 'redirect') return <Redirect href={entry.href} />;

  const isRestoringAuth = entry.reason === 'auth';
  return (
    <AuthRestorationState
      loadingLabel={isRestoringAuth ? 'Memulihkan sesi' : 'Memeriksa pengenalan Carin'}
      error={isRestoringAuth ? error : undefined}
      onRetry={isRestoringAuth ? () => void retryRestoration() : () => void onboardingQuery.refetch()}
      onSignIn={
        isRestoringAuth && error !== undefined
          ? () => void invalidateSession()
          : undefined
      }
    />
  );
}
