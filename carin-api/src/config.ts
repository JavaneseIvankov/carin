import { isIP } from 'node:net';

export type AppConfig = {
  appEnv: 'dev' | 'staging' | 'prod';
  aiMode: 'real' | 'fixture';
  databaseUrl: string;
  port: number;
  aiServiceUrl?: string;
  aiServiceKey?: string;
  aiServiceAllowedHosts: string[];
};

/**
 * AI is an internal service. Hostnames must be explicitly private/internal;
 * an environment allowlist alone must never make a public host acceptable.
 */
export function isInternalHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (
    normalized === 'localhost' ||
    normalized === 'ai-service' ||
    normalized.endsWith('.internal')
  ) {
    return true;
  }

  const ip = normalized.replace(/^\[|\]$/g, '');
  const version = isIP(ip);
  if (version === 4) {
    const octets = ip.split('.').map(Number);
    const [first, second] = octets;
    return first === 10 || first === 127 ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168);
  }
  if (version === 6) {
    return ip === '::1' || /^(fc|fd)/.test(ip);
  }
  return false;
}

export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const appEnv = env.APP_ENV;
  if (appEnv !== 'dev' && appEnv !== 'staging' && appEnv !== 'prod') {
    throw new Error('APP_ENV must be dev, staging, or prod');
  }

  const aiMode = env.AI_MODE ?? 'real';
  if (aiMode !== 'real' && aiMode !== 'fixture') throw new Error('AI_MODE must be real or fixture');
  if (aiMode === 'fixture' && appEnv !== 'dev') {
    throw new Error('AI_MODE=fixture is permitted only when APP_ENV=dev');
  }

  const aiServiceAllowedHosts = (env.AI_SERVICE_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  if (aiServiceAllowedHosts.includes('*')) throw new Error('AI service host allowlist must name exact hosts');
  if (aiServiceAllowedHosts.some((host) => !isInternalHost(host))) {
    throw new Error('AI service host allowlist must contain internal hosts');
  }
  const aiServiceUrl = env.AI_SERVICE_URL;
  const aiServiceKey = env.AI_SERVICE_KEY;
  if (aiServiceUrl || aiServiceKey || aiServiceAllowedHosts.length > 0) {
    if (!aiServiceUrl || !aiServiceKey?.trim() || aiServiceAllowedHosts.length === 0) {
      throw new Error('Real AI service configuration requires URL, key, and host allowlist');
    }
    let parsedAiUrl: URL;
    try {
      parsedAiUrl = new URL(aiServiceUrl);
    } catch {
      throw new Error('AI_SERVICE_URL must be a valid internal URL');
    }
    if (
      !['http:', 'https:'].includes(parsedAiUrl.protocol) || parsedAiUrl.username || parsedAiUrl.password ||
      parsedAiUrl.search || parsedAiUrl.hash || /[?#]/.test(aiServiceUrl) ||
      !isInternalHost(parsedAiUrl.hostname) || !aiServiceAllowedHosts.includes(parsedAiUrl.hostname.toLowerCase())
    ) {
      throw new Error('AI_SERVICE_URL must use an approved internal host without credentials, query, or fragment');
    }
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
  return {
    appEnv,
    aiMode,
    databaseUrl,
    port,
    aiServiceAllowedHosts,
    ...(aiServiceUrl ? { aiServiceUrl } : {}),
    ...(aiServiceKey ? { aiServiceKey } : {}),
  };
}
