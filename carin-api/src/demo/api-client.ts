import { createHash } from 'node:crypto';

export type DemoSeedEnvironment = {
  baseUrl: string;
  email: string;
  password: string;
  targetEmail: string;
  databaseUrl: string;
  appEnv: string;
  aiMode?: string;
};

type EnvironmentInput = Record<string, string | undefined>;
type Fetch = typeof fetch;

function required(env: EnvironmentInput, key: string): string {
  const value = env[key];
  if (!value?.trim()) throw new Error(`DEMO_ENV_MISSING:${key}`);
  return value;
}

export function demoCredentialConfigurationMessage(env: EnvironmentInput): string | null {
  const missing = ['DEMO_EMAIL', 'DEMO_PASSWORD'].filter((key) => !env[key]?.trim());
  if (!missing.length) return null;
  const names = missing.length === 2 ? 'DEMO_EMAIL dan DEMO_PASSWORD' : missing[0];
  return `Demo seed tidak dijalankan karena ${names} belum diatur. Tambahkan sebagai secrets untuk one-off job, lalu jalankan ulang node dist/scripts/demo-seed.js. Belum ada data yang diubah.`;
}

export function parseDemoSeedEnvironment(env: EnvironmentInput): DemoSeedEnvironment {
  const rawUrl = env.DEMO_API_URL?.trim() || required(env, 'BETTER_AUTH_URL');
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('DEMO_API_URL_INVALID');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('DEMO_API_URL_INVALID');
  }
  const email = required(env, 'DEMO_EMAIL');
  const targetEmail = env.DEMO_SEED_TARGET_EMAIL?.trim() || email;
  if (email !== targetEmail) throw new Error('DEMO_SEED_TARGET_MISMATCH');
  return {
    baseUrl: parsed.toString().replace(/\/$/, ''),
    email,
    password: required(env, 'DEMO_PASSWORD'),
    targetEmail,
    databaseUrl: required(env, 'DATABASE_URL'),
    appEnv: required(env, 'APP_ENV'),
    ...(env.AI_MODE ? { aiMode: env.AI_MODE } : {}),
  };
}

export function deriveIdempotencyKey(userId: string, version: string, seedKey: string, operation: string): string {
  const bytes = createHash('sha256')
    .update([userId, version, seedKey, operation].join('\0'))
    .digest()
    .subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function errorCode(responseBody: unknown): string {
  if (!responseBody || typeof responseBody !== 'object') return 'UNKNOWN_ERROR';
  const candidate = responseBody as { code?: unknown; error?: { code?: unknown } };
  const code = typeof candidate.code === 'string' ? candidate.code : candidate.error?.code;
  return typeof code === 'string' && /^[A-Z0-9_]{1,80}$/.test(code) ? code : 'UNKNOWN_ERROR';
}

export class DemoApiError extends Error {
  constructor(method: string, path: string, status: number, code: string) {
    super(`${method} ${path} failed (${status} ${code})`);
    this.name = 'DemoApiError';
  }
}

export class DemoApiClient {
  private readonly cookieJar = new Map<string, string>();

  constructor(private readonly baseUrl: string, private readonly fetchImpl: Fetch = fetch) {}

  absorbCookies(headers: Headers): void {
    const headerWithCookies = headers as Headers & { getSetCookie?: () => string[] };
    const cookies = headerWithCookies.getSetCookie?.() ?? (headers.get('set-cookie') ? [headers.get('set-cookie')!] : []);
    for (const setCookie of cookies) {
      const pair = setCookie.split(';', 1)[0];
      const separator = pair?.indexOf('=') ?? -1;
      if (separator <= 0) continue;
      const name = pair!.slice(0, separator);
      const value = pair!.slice(separator + 1);
      if (/max-age=0/i.test(setCookie) || /expires=Thu, 01 Jan 1970/i.test(setCookie)) this.cookieJar.delete(name);
      else this.cookieJar.set(name, value);
    }
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.cookieJar.size) headers.set('cookie', [...this.cookieJar].map(([name, value]) => `${name}=${value}`).join('; '));
    const response = await this.fetchImpl(new URL(path, this.baseUrl), { ...init, headers });
    this.absorbCookies(response.headers);
    if (!response.ok) {
      let body: unknown;
      try { body = await response.clone().json(); } catch { body = null; }
      throw new DemoApiError(init.method ?? 'GET', path, response.status, errorCode(body));
    }
    return response;
  }

  async json<T>(method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
    const headers = new Headers();
    if (body !== undefined) headers.set('content-type', 'application/json');
    if (idempotencyKey) headers.set('idempotency-key', idempotencyKey);
    const response = await this.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  async multipart<T>(path: string, body: FormData, idempotencyKey: string): Promise<T> {
    const response = await this.request(path, {
      method: 'POST',
      headers: { 'idempotency-key': idempotencyKey },
      body,
    });
    return response.json() as Promise<T>;
  }

  async getWithHeaders<T>(path: string): Promise<{ body: T; headers: Headers }> {
    const response = await this.request(path);
    return { body: await response.json() as T, headers: response.headers };
  }

  get<T>(path: string): Promise<T> { return this.json<T>('GET', path); }
  post<T>(path: string, body: unknown, idempotencyKey: string): Promise<T> {
    return this.json<T>('POST', path, body, idempotencyKey);
  }
  patch<T>(path: string, body: unknown, idempotencyKey: string): Promise<T> {
    return this.json<T>('PATCH', path, body, idempotencyKey);
  }
}

export async function signInDemoAccount(options: {
  baseUrl: string;
  email: string;
  password: string;
  fetchImpl?: Fetch;
}): Promise<DemoApiClient> {
  const client = new DemoApiClient(options.baseUrl, options.fetchImpl);
  const response = await (options.fetchImpl
    ? options.fetchImpl(new URL('/api/auth/sign-in/email', options.baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: options.email, password: options.password, rememberMe: true }),
    })
    : fetch(new URL('/api/auth/sign-in/email', options.baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: options.email, password: options.password, rememberMe: true }),
    }));
  client.absorbCookies(response.headers);
  if (!response.ok) {
    let body: unknown;
    try { body = await response.clone().json(); } catch { body = null; }
    throw new DemoApiError('POST', '/api/auth/sign-in/email', response.status, errorCode(body));
  }
  return client;
}
