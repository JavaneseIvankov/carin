export type PasswordResetLinkResult =
  { valid: true; token: string } | { valid: false; reason: 'invalid-link' };

export function buildPasswordResetLandingUrl(apiBaseUrl: string): string | null {
  try {
    const api = new URL(apiBaseUrl);
    if (api.protocol !== 'https:' || !api.hostname || api.username || api.password) return null;
    return new URL('/auth/reset', api.origin).toString();
  } catch {
    return null;
  }
}

export function parsePasswordResetLink(
  value: string,
  expectedScheme: string
): PasswordResetLinkResult {
  if (!/^[a-z][a-z0-9+.-]*$/i.test(expectedScheme)) {
    return { valid: false, reason: 'invalid-link' };
  }

  try {
    const rawRoute = value.match(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*(\/[^?#]*)?(?:\?[^#]*)?$/i);
    if (rawRoute?.[1] !== '/reset') return { valid: false, reason: 'invalid-link' };

    const url = new URL(value);
    const params = [...url.searchParams.entries()];
    const tokenValues = url.searchParams.getAll('token');
    const hasOnlyToken = params.length === 1 && params[0]?.[0] === 'token';
    const token = tokenValues[0];

    if (
      url.protocol !== `${expectedScheme.toLowerCase()}:` ||
      url.hostname !== 'auth' ||
      url.pathname !== '/reset' ||
      url.username ||
      url.password ||
      url.port ||
      url.hash ||
      !hasOnlyToken ||
      tokenValues.length !== 1 ||
      !token ||
      token.length > 2048
    ) {
      return { valid: false, reason: 'invalid-link' };
    }

    return { valid: true, token };
  } catch {
    return { valid: false, reason: 'invalid-link' };
  }
}
