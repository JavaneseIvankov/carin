import { describe, expect, it } from 'vitest';
import { renderAuthEmail } from './templates.js';

describe('authentication email templates', () => {
  it('renders an Indonesian verification message with its destination', () => {
    const email = renderAuthEmail({
      kind: 'verification',
      to: 'ayu@example.com',
      url: 'https://carin.example/auth/verified?token=verify-token',
    });

    expect(email.subject).toBe('Verifikasi email Carin');
    expect(email.html).toContain('Verifikasi alamat email');
    expect(email.html).toContain('ayu@example.com');
    expect(email.html).toContain('https://carin.example/auth/verified?token=verify-token');
    expect(email.text).toContain('ayu@example.com');
    expect(email.text).toContain('https://carin.example/auth/verified?token=verify-token');
  });

  it('renders an Indonesian password reset message', () => {
    const email = renderAuthEmail({
      kind: 'password-reset',
      to: 'budi@example.com',
      url: 'https://carin.example/auth/reset?token=reset-token',
    });

    expect(email.subject).toBe('Atur ulang kata sandi Carin');
    expect(email.html).toContain('Atur ulang kata sandi');
    expect(email.text).toContain('Atur ulang kata sandi');
    expect(email.html).toContain('https://carin.example/auth/reset?token=reset-token');
  });

  it('escapes recipient and URL content in HTML', () => {
    const email = renderAuthEmail({
      kind: 'verification',
      to: 'ayu+<tag>&"@example.com',
      url: 'https://carin.example/verify?next="<script>&token=a&b',
    });

    expect(email.html).toContain('ayu+&lt;tag&gt;&amp;&quot;@example.com');
    expect(email.html).toContain('href="https://carin.example/verify?next=&quot;&lt;script&gt;&amp;token=a&amp;b"');
    expect(email.html).not.toContain('<script>');
  });
});
