import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth/provider';
import { resolveIndexDestination } from '@/lib/auth/routes';

export default function Index() {
  const { status } = useAuth();
  const destination = resolveIndexDestination(status);
  if (destination) return <Redirect href={destination} />;
  return null;
}
