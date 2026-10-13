import * as React from 'react';
import { authClient } from './client';
import {
  createAuthSessionLifecycle,
  type AuthLifecycleState,
  type AuthSessionUser,
} from './session';
import { useAppData } from '@/lib/data/provider';

export type SignInInput = Parameters<typeof authClient.signIn.email>[0];
export type SignUpInput = {
  name: string;
  email: string;
  password: string;
  birthDate: string;
  acceptedTermsVersion: string;
  acceptedPrivacyVersion: string;
};
export type ResendVerificationInput = Parameters<typeof authClient.sendVerificationEmail>[0];
export type PasswordResetRequestInput = Parameters<typeof authClient.requestPasswordReset>[0];
export type PasswordResetInput = Parameters<typeof authClient.resetPassword>[0];

type AuthContextValue = AuthLifecycleState & {
  retryRestoration: () => Promise<void>;
  invalidateSession: () => Promise<void>;
  signIn: (input: SignInInput) => ReturnType<typeof authClient.signIn.email>;
  signOut: () => Promise<void>;
  signUp: (input: SignUpInput) => ReturnType<typeof authClient.signUp.email>;
  resendVerificationEmail: (
    input: ResendVerificationInput
  ) => ReturnType<typeof authClient.sendVerificationEmail>;
  requestPasswordReset: (
    input: PasswordResetRequestInput
  ) => ReturnType<typeof authClient.requestPasswordReset>;
  resetPassword: (input: PasswordResetInput) => ReturnType<typeof authClient.resetPassword>;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setSessionUser, clearSession } = useAppData();
  const [state, setState] = React.useState<AuthLifecycleState>({
    status: 'loading',
    user: null,
  });
  const [lifecycle] = React.useState(() =>
    createAuthSessionLifecycle({
      getSession: () => authClient.getSession(),
      setSessionUser,
      clearSession,
      onState: setState,
    })
  );

  React.useEffect(() => {
    void lifecycle.restore();
  }, [lifecycle]);

  const signIn = React.useCallback(
    async (input: SignInInput) => {
      const result = await authClient.signIn.email(input);
      if (!result.error) await lifecycle.restore();
      return result;
    },
    [lifecycle]
  );
  const signOut = React.useCallback(
    () => lifecycle.signOut(async () => authClient.signOut()),
    [lifecycle]
  );
  const signUp = React.useCallback(
    (input: SignUpInput) =>
      authClient.signUp.email(input as Parameters<typeof authClient.signUp.email>[0]),
    []
  );
  const resendVerificationEmail = React.useCallback(
    (input: ResendVerificationInput) => authClient.sendVerificationEmail(input),
    []
  );
  const requestPasswordReset = React.useCallback(
    (input: PasswordResetRequestInput) => authClient.requestPasswordReset(input),
    []
  );
  const resetPassword = React.useCallback(
    (input: PasswordResetInput) => authClient.resetPassword(input),
    []
  );
  const retryRestoration = React.useCallback(() => lifecycle.restore(), [lifecycle]);
  const invalidateSession = React.useCallback(() => lifecycle.invalidateSession(), [lifecycle]);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      ...state,
      retryRestoration,
      invalidateSession,
      signIn,
      signOut,
      signUp,
      resendVerificationEmail,
      requestPasswordReset,
      resetPassword,
    }),
    [
      state,
      retryRestoration,
      invalidateSession,
      signIn,
      signOut,
      signUp,
      resendVerificationEmail,
      requestPasswordReset,
      resetPassword,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error('AuthProvider is required');
  return context;
}

export type { AuthSessionUser };
