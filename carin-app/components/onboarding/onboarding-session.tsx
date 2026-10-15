import * as React from 'react';
import { useAuth } from '@/lib/auth/provider';

type OnboardingSessionValue = {
  allowDashboardForSession: (userId: string) => void;
  isBypassed: (userId: string) => boolean;
};

const OnboardingSessionContext = React.createContext<OnboardingSessionValue | null>(null);

export function OnboardingSessionProvider({ children }: { children: React.ReactNode }) {
  const { status, user } = useAuth();
  const bypassedUserId = React.useRef<string | null>(null);
  const [, refresh] = React.useReducer((version: number) => version + 1, 0);

  React.useEffect(() => {
    if (status !== 'authenticated' || (bypassedUserId.current && user?.id !== bypassedUserId.current)) {
      bypassedUserId.current = null;
    }
  }, [status, user?.id]);

  const allowDashboardForSession = React.useCallback(
    (userId: string) => {
      if (status === 'authenticated' && user?.id === userId) {
        bypassedUserId.current = userId;
        refresh();
      }
    },
    [status, user?.id]
  );
  const isBypassed = React.useCallback(
    (userId: string) =>
      status === 'authenticated' && user?.id === userId && bypassedUserId.current === userId,
    [status, user?.id]
  );
  const value = React.useMemo(
    () => ({ allowDashboardForSession, isBypassed }),
    [allowDashboardForSession, isBypassed]
  );

  return (
    <OnboardingSessionContext.Provider value={value}>{children}</OnboardingSessionContext.Provider>
  );
}

export function useOnboardingSession(): OnboardingSessionValue {
  const context = React.useContext(OnboardingSessionContext);
  if (!context) throw new Error('OnboardingSessionProvider is required');
  return context;
}
