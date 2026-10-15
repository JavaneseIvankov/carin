import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';

describe('auth email landing pages', () => {
  const app = createApp({ readiness: async () => true, appLinkScheme: 'carin' });

  it('renders a fixed app deep link and protective headers for reset tokens', async () => {
    const response = await app.request('/auth/reset?token=a%2B%26%22&callback=https%3A%2F%2Fevil.example');
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(body).toContain('carin://auth/reset?token=a%2B%26%22');
    expect(body).not.toContain('evil.example');
  });

  it('returns a generic safe page when the reset token is missing', async () => {
    const response = await app.request('/auth/reset?callback=https%3A%2F%2Fevil.example');
    const body = await response.text();
    expect(response.status).toBe(400);
    expect(body).not.toContain('evil.example');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('shows only a generic verification result and never forwards arbitrary callbacks', async () => {
    const response = await app.request('/auth/verified?error=invalid_token&callback=https%3A%2F%2Fevil.example');
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain('Tautan tidak berlaku');
    expect(body).not.toContain('evil.example');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  });
});
