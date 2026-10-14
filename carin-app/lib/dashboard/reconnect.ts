import type { RefetchOptions } from '@tanstack/react-query';
import type { Connectivity } from '@/lib/data/network';

type DashboardRefetch = (options?: RefetchOptions) => Promise<unknown>;

export function refetchDashboard(refetch: DashboardRefetch) {
  return refetch({ cancelRefetch: false });
}

export function shouldRefetchDashboardOnReconnect(
  previousConnectivity: Connectivity,
  nextConnectivity: Connectivity,
  homeIsFocused: boolean
) {
  return homeIsFocused && previousConnectivity === 'offline' && nextConnectivity === 'online';
}
