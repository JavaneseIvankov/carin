export type Session = {
  userId: string;
  emailVerified: boolean;
  /** Better Auth session row ID, needed for session-scoped idempotency. */
  sessionId?: string;
};

export type AppEnv = {
  Variables: {
    requestId: string;
    session: Session;
  };
};
