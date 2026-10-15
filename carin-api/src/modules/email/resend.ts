import { renderAuthEmail, type AuthEmailInput } from './templates.js';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const REQUEST_TIMEOUT_MS = 10_000;

export type ResendErrorCode = 'RESEND_SEND_FAILED' | 'RESEND_TIMEOUT';

export class ResendDeliveryError extends Error {
  readonly code: ResendErrorCode;
  readonly status?: number;

  constructor(code: ResendErrorCode, status?: number) {
    super(code);
    this.name = 'ResendDeliveryError';
    this.code = code;
    if (status !== undefined) this.status = status;
  }
}

type ResendSenderOptions = {
  apiKey: string;
  from: string;
  fetchImpl?: typeof fetch;
};

export function createResendSender({ apiKey, from, fetchImpl = fetch }: ResendSenderOptions): {
  send(input: AuthEmailInput, idempotencyKey: string): Promise<void>;
} {
  return {
    async send(input, idempotencyKey) {
      const email = renderAuthEmail(input);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const response = await fetchImpl(RESEND_ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify({
            from,
            to: [input.to],
            subject: email.subject,
            html: email.html,
            text: email.text,
          }),
          signal: controller.signal,
        });

        if (controller.signal.aborted) throw new ResendDeliveryError('RESEND_TIMEOUT');
        if (!response.ok) throw new ResendDeliveryError('RESEND_SEND_FAILED', response.status);
      } catch (error) {
        if (error instanceof ResendDeliveryError) throw error;
        throw new ResendDeliveryError(controller.signal.aborted ? 'RESEND_TIMEOUT' : 'RESEND_SEND_FAILED');
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
