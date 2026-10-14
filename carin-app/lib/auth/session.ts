import type { AuthStatus } from './routes';

export type AuthSessionUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  name?: string;
};

export type AuthSession = {
  data: { user: AuthSessionUser } | null;
  error?: unknown | null;
};

export type AuthLifecycleState = {
  status: AuthStatus;
  user: AuthSessionUser | null;
  error?: unknown;
};

type Dependencies = {
  getSession: () => Promise<AuthSession>;
  setSessionUser: (userId: string | null) => Promise<void>;
  clearSession: () => Promise<void>;
  onState: (state: AuthLifecycleState) => void;
};

const RESTORATION_TIMEOUT_MS = 15_000;

function getSessionWithTimeout(getSession: Dependencies['getSession']): Promise<AuthSession> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Pemeriksaan sesi melewati batas waktu.')),
      RESTORATION_TIMEOUT_MS
    );

    void Promise.resolve()
      .then(getSession)
      .then(resolve, reject)
      .finally(() => clearTimeout(timeout));
  });
}

export function createAuthSessionLifecycle(deps: Dependencies) {
  let state: AuthLifecycleState = { status: 'loading', user: null };
  let requestGeneration = 0;
  let signOutInFlight: Promise<void> | null = null;

  const publish = (next: AuthLifecycleState) => {
    state = next;
    deps.onState(next);
  };

  async function restore() {
    const generation = ++requestGeneration;
    publish({ status: 'loading', user: state.user });
    try {
      const response = await getSessionWithTimeout(deps.getSession);
      if (generation !== requestGeneration) return;
      if (response.error) throw response.error;

      const user = response.data?.user;
      if (!user || user.emailVerified !== true) {
        await deps.clearSession();
        if (generation === requestGeneration) publish({ status: 'unauthenticated', user: null });
        return;
      }

      await deps.setSessionUser(user.id);
      if (generation === requestGeneration) publish({ status: 'authenticated', user });
    } catch (error) {
      if (generation === requestGeneration) {
        publish({ status: 'loading', user: state.user, error });
      }
    }
  }

  async function invalidateSession() {
    const generation = ++requestGeneration;
    if (signOutInFlight) {
      await signOutInFlight;
      if (generation === requestGeneration) publish({ status: 'unauthenticated', user: null });
      return;
    }
    try {
      await deps.clearSession();
    } catch {
      // The auth state must still close even if local persistence cleanup fails.
    }
    if (generation === requestGeneration) publish({ status: 'unauthenticated', user: null });
  }

  async function signOut(serverSignOut: () => Promise<unknown>) {
    const generation = ++requestGeneration;
    publish({ status: 'loading', user: state.user });
    let finishSignOut!: () => void;
    const signOutOperation = new Promise<void>((resolve) => {
      finishSignOut = resolve;
    });
    signOutInFlight = signOutOperation;
    try {
      await serverSignOut();
    } catch {
      // Always remove local scope and private UI after a logout attempt.
    }
    try {
      await deps.clearSession();
    } catch {
      // A cleanup error must not leave authenticated UI visible.
    }
    try {
      if (generation === requestGeneration) publish({ status: 'unauthenticated', user: null });
    } finally {
      finishSignOut();
      if (signOutInFlight === signOutOperation) signOutInFlight = null;
    }
  }

  return {
    restore,
    invalidateSession,
    signOut,
    getState: () => state,
  };
}
