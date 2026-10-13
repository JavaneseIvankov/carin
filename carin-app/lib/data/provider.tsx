import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import * as React from 'react';
import { apiEnvironment } from '@/lib/config';
import { clearScopedData, sameScope, type DataScope } from './scope';
import type { Connectivity } from './network';

type DataContextValue = {
  scope: DataScope | null;
  connectivity: Connectivity;
  setSessionUser: (userId: string | null) => Promise<void>;
  clearSession: () => Promise<void>;
  isCurrentScope: (scope: DataScope) => boolean;
};

const DataContext = React.createContext<DataContextValue | null>(null);
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [scope, setScope] = React.useState<DataScope | null>(null);
  const [connectivity, setConnectivity] = React.useState<Connectivity>('unknown');
  const scopeRef = React.useRef(scope);
  const transitionRef = React.useRef(0);
  const cleanupRef = React.useRef<Promise<void>>(Promise.resolve());

  React.useEffect(
    () =>
      NetInfo.addEventListener((state) => {
        const next =
          state.isConnected === false || state.isInternetReachable === false
            ? 'offline'
            : state.isConnected === true
              ? 'online'
              : 'unknown';
        setConnectivity(next);
        onlineManager.setOnline(next !== 'offline');
      }),
    []
  );

  const setSessionUser = React.useCallback(async (userId: string | null) => {
    const next = userId ? { environment: apiEnvironment.name, userId } : null;
    if (sameScope(scopeRef.current, next)) return cleanupRef.current;
    const transition = ++transitionRef.current;
    const departing = scopeRef.current;
    scopeRef.current = null;
    setScope(null);
    const cleanup = clearScopedData(departing, queryClient, AsyncStorage);
    cleanupRef.current = Promise.all([cleanupRef.current.catch(() => {}), cleanup]).then(() => {});
    await cleanupRef.current;
    if (transition === transitionRef.current) {
      scopeRef.current = next;
      setScope(next);
    }
  }, []);

  const value = React.useMemo<DataContextValue>(
    () => ({
      scope,
      connectivity,
      setSessionUser,
      clearSession: () => setSessionUser(null),
      isCurrentScope: (candidate) => sameScope(scopeRef.current, candidate),
    }),
    [scope, connectivity, setSessionUser]
  );

  return (
    <QueryClientProvider client={queryClient}>
      <DataContext.Provider value={value}>{children}</DataContext.Provider>
    </QueryClientProvider>
  );
}

export function useAppData() {
  const context = React.useContext(DataContext);
  if (!context) throw new Error('AppDataProvider is required');
  return context;
}
