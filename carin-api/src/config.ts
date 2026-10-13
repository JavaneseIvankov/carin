export type AppConfig = {
  appEnv: 'dev' | 'staging' | 'prod';
  databaseUrl: string;
  port: number;
};

export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const appEnv = env.APP_ENV;
  if (appEnv !== 'dev' && appEnv !== 'staging' && appEnv !== 'prod') {
    throw new Error('APP_ENV must be dev, staging, or prod');
  }

  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a PostgreSQL URL');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname || parsed.pathname.length < 2) {
    throw new Error('DATABASE_URL must be a PostgreSQL URL with host and database');
  }

  const portString = env.PORT ?? '3000';
  const port = Number(portString);
  if (!/^\d+$/.test(portString) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer from 1 to 65535');
  }
  return { appEnv, databaseUrl, port };
}
