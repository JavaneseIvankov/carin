import type { Connectivity } from '@/lib/data/network';

export function shouldRefetchDashboardOnReconnect(
  previousConnectivity: Connectivity,
  nextConnectivity: Connectivity,
  homeIsFocused: boolean
) {
  return homeIsFocused && previousConnectivity === 'offline' && nextConnectivity === 'online';
}
