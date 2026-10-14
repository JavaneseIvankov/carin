import { afterEach, describe, expect, it, vi } from 'vitest';
import { createResendSender } from './resend.js';

const input = {
  kind: 'verification' as const,
  to: 'ayu@example.com',
  url: 'https://carin.example/auth/verified?token=private-token',
};

afterEach(() => {
  vi.useRealTimers();
});

describe('Resend sender', () => {
  it('posts the rendered email with authorization and a stable idempotency key', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 202 }));
    const sender = createResendSender({ apiKey: 'test-api-key', from: 'Carin <auth@carin.example>', fetchImpl });

    await sender.send(input, 'delivery-uuid-123');

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-api-key');
    expect(new Headers(init?.headers).get('idempotency-key')).toBe('delivery-uuid-123');
    expect(JSON.parse(String(init?.body))).toEqual({
      from: 'Carin <auth@carin.example>',
      to: ['ayu@example.com'],
      subject: 'Verifikasi email Carin',
      html: expect.stringContaining('private-token'),
      text: expect.stringContaining('private-token'),
    });
  });

  it('aborts a provider request after ten seconds and returns a fixed timeout error', async () => {
    vi.useFakeTimers();
    let wasAborted = false;
    const fetchImpl = vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        wasAborted = true;
        reject(new DOMException('request contains private data', 'AbortError'));
      }, { once: true });
    }));
    const sender = createResendSender({ apiKey: 'test-api-key', from: 'auth@carin.example', fetchImpl });

    const result = sender.send(input, 'delivery-uuid-123');
    const rejected = expect(result).rejects.toMatchObject({
      code: 'RESEND_TIMEOUT',
      message: 'RESEND_TIMEOUT',
    });
    await vi.advanceTimersByTimeAsync(10_000);

    await rejected;
    expect(wasAborted).toBe(true);
  });

  it.each([400, 503])('returns a sanitized fixed-code error with HTTP status %s', async (status) => {
    const responseBody = 'provider echoed private-token and ayu@example.com';
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(responseBody, { status }));
    const sender = createResendSender({ apiKey: 'test-api-key', from: 'auth@carin.example', fetchImpl });

    let thrown: unknown;
    try {
      await sender.send(input, 'delivery-uuid-123');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({ code: 'RESEND_SEND_FAILED', message: 'RESEND_SEND_FAILED', status });
    expect(thrown).not.toBeInstanceOf(Response);
    expect(String(thrown)).not.toContain('private-token');
    expect(String(thrown)).not.toContain('ayu@example.com');
    expect(String(thrown)).not.toContain(responseBody);
  });

  it('sanitizes network errors that may contain the request URL or recipient', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error('https://api.resend.com private-token ayu@example.com'));
    const sender = createResendSender({ apiKey: 'test-api-key', from: 'auth@carin.example', fetchImpl });

    await expect(sender.send(input, 'delivery-uuid-123')).rejects.toMatchObject({
      code: 'RESEND_SEND_FAILED',
      message: 'RESEND_SEND_FAILED',
    });
  });
});
