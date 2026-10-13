export type Session = {
  userId: string;
  emailVerified: boolean;
};

export type AppEnv = {
  Variables: {
    requestId: string;
    session: Session;
  };
};
