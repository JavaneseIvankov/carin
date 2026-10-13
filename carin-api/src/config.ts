import { isIP } from 'node:net';

export type AppConfig = {
  appEnv: 'dev' | 'staging' | 'prod';
  aiMode: 'real' | 'fixture';
  databaseUrl: string;
  port: number;
  betterAuthSecret?: string;
  betterAuthUrl?: string;
  authTrustedOrigins?: string[];
  appLinkScheme?: string;
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

  const betterAuthSecret = env.BETTER_AUTH_SECRET?.trim();
  const betterAuthUrl = env.BETTER_AUTH_URL?.trim();
  if (env.BETTER_AUTH_TRUSTED_ORIGINS?.trim()) {
    throw new Error('BETTER_AUTH_TRUSTED_ORIGINS is not supported; configure AUTH_TRUSTED_ORIGINS instead');
  }
  const authTrustedOrigins = (env.AUTH_TRUSTED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const appLinkScheme = env.APP_LINK_SCHEME?.trim().toLowerCase();
  const authSettingsPresent = Boolean(betterAuthSecret || betterAuthUrl || authTrustedOrigins.length || appLinkScheme);
  if (authSettingsPresent && (!betterAuthSecret || !betterAuthUrl || !authTrustedOrigins.length || !appLinkScheme)) {
    throw new Error('BETTER_AUTH_SECRET, BETTER_AUTH_URL, AUTH_TRUSTED_ORIGINS, and APP_LINK_SCHEME must be configured together');
  }
  if (betterAuthSecret && betterAuthSecret.length < 32) {
    throw new Error('BETTER_AUTH_SECRET must be at least 32 characters');
  }
  if (betterAuthUrl) {
    let parsedAuthUrl: URL;
    try {
      parsedAuthUrl = new URL(betterAuthUrl);
    } catch {
      throw new Error('BETTER_AUTH_URL must be a valid HTTP(S) URL');
    }
    if (!['http:', 'https:'].includes(parsedAuthUrl.protocol) || parsedAuthUrl.username || parsedAuthUrl.password || parsedAuthUrl.search || parsedAuthUrl.hash) {
      throw new Error('BETTER_AUTH_URL must use HTTP(S) without credentials, query, or fragment');
    }
    if (appEnv !== 'dev' && parsedAuthUrl.protocol !== 'https:') {
      throw new Error('BETTER_AUTH_URL must use HTTPS outside dev');
    }
  }
  if (appLinkScheme && (!/^[a-z][a-z0-9+.-]*$/.test(appLinkScheme) || ['http', 'https'].includes(appLinkScheme))) {
    throw new Error('APP_LINK_SCHEME must be a valid URI scheme');
  }
  const normalizedTrustedOrigins = authTrustedOrigins.map((origin) => {
    if (origin.includes('*')) {
      throw new Error('AUTH_TRUSTED_ORIGINS entries must be exact HTTP(S) origins or app schemes');
    }
    if (/^[a-z][a-z0-9+.-]*:\/\/$/i.test(origin)) return origin.toLowerCase();
    let parsedOrigin: URL;
    try {
      parsedOrigin = new URL(origin);
    } catch {
      throw new Error('AUTH_TRUSTED_ORIGINS entries must be exact HTTP(S) origins or app schemes');
    }
    if (
      !['http:', 'https:'].includes(parsedOrigin.protocol) || !parsedOrigin.hostname ||
      parsedOrigin.username || parsedOrigin.password || parsedOrigin.pathname !== '/' ||
      parsedOrigin.search || parsedOrigin.hash
    ) {
      throw new Error('AUTH_TRUSTED_ORIGINS entries must be exact HTTP(S) origins or app schemes');
    }
    if (appEnv !== 'dev' && parsedOrigin.protocol !== 'https:') {
      throw new Error('AUTH_TRUSTED_ORIGINS web origins must use HTTPS outside dev');
    }
    return parsedOrigin.origin;
  });
  if (appLinkScheme && !normalizedTrustedOrigins.includes(`${appLinkScheme}://`)) {
    throw new Error('AUTH_TRUSTED_ORIGINS must include APP_LINK_SCHEME');
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
    ...(betterAuthSecret && betterAuthUrl ? {
      betterAuthSecret,
      betterAuthUrl,
      authTrustedOrigins: normalizedTrustedOrigins,
      appLinkScheme: appLinkScheme!,
    } : {}),
    ...(aiServiceUrl ? { aiServiceUrl } : {}),
    ...(aiServiceKey ? { aiServiceKey } : {}),
  };
}
