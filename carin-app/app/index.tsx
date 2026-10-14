import { Redirect } from 'expo-router';
import { AuthRestorationState } from '@/components/auth/auth-gate';
import { useAuth } from '@/lib/auth/provider';
import { resolveIndexDestination } from '@/lib/auth/routes';

export default function Index() {
  const { status, error, retryRestoration } = useAuth();
  const destination = resolveIndexDestination(status);
  if (destination) return <Redirect href={destination} />;
  return <AuthRestorationState error={error} onRetry={() => void retryRestoration()} />;
}
