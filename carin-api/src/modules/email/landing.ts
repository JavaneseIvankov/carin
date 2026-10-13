import type { Context, Hono } from 'hono';
import type { AppEnv } from '../../http/types.js';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return character;
    }
  });
}

function landingHtml(title: string, message: string, link?: { href: string; text: string }): string {
  const action = link
    ? `<p><a href="${escapeHtml(link.href)}">${escapeHtml(link.text)}</a></p>`
    : '';
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · Carin</title></head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>${action}</main></body></html>`;
}

function securePage(c: Context<AppEnv>, body: string, status: 200 | 400 = 200): Response {
  c.header('Cache-Control', 'no-store, max-age=0');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  return c.html(body, status);
}

export function registerEmailLandingRoutes(app: Hono<AppEnv>, appLinkScheme: string): void {
  app.get('/auth/verified', (c) => {
    const failed = c.req.query('error') !== undefined;
    return securePage(c, landingHtml(
      failed ? 'Tautan tidak berlaku' : 'Email terverifikasi',
      failed
        ? 'Tautan verifikasi tidak berlaku atau sudah kedaluwarsa. Minta tautan baru dari aplikasi Carin.'
        : 'Alamat email Anda sudah diverifikasi. Kembali ke aplikasi Carin untuk masuk.',
    ));
  });

  app.get('/auth/reset', (c) => {
    const token = c.req.query('token');
    if (!token || token.length > 2048) {
      return securePage(c, landingHtml(
        'Tautan tidak berlaku',
        'Tautan pengaturan ulang kata sandi tidak tersedia. Minta tautan baru dari aplikasi Carin.',
      ), 400);
    }
    const appLink = `${appLinkScheme}://auth/reset?token=${encodeURIComponent(token)}`;
    return securePage(c, landingHtml(
      'Atur ulang kata sandi',
      'Buka aplikasi Carin untuk memilih kata sandi baru. Jika Anda tidak meminta ini, abaikan email ini.',
      { href: appLink, text: 'Buka Carin' },
    ));
  });
}
