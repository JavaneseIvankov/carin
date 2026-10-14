import { describe, expect, it } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { readFileSync } from 'node:fs';
import { betterAuth } from 'better-auth';
import { openAPI } from 'better-auth/plugins';
import { authOptions } from '../../src/auth/options.js';

describe('pinned Better Auth 1.7.7 vendor schema', () => {
  it('exposes the expected mobile auth routes and validates their request bodies', async () => {
    const installed = JSON.parse(readFileSync(new URL('../../node_modules/better-auth/package.json', import.meta.url), 'utf8')) as { version: string };
    expect(installed.version).toBe('1.7.7');
    const schemaAuth = betterAuth({ ...authOptions, baseURL: 'http://127.0.0.1:3000', plugins: [...authOptions.plugins, openAPI()] });
    const schema = await schemaAuth.api.generateOpenAPISchema();
    const paths = schema.paths;
    const routes = [
      ['/sign-up/email', 'post', ['email', 'password', 'birthDate', 'acceptedTermsVersion', 'acceptedPrivacyVersion']],
      ['/sign-in/email', 'post', ['email', 'password']],
      ['/sign-out', 'post', []],
      ['/get-session', 'get', []],
      ['/send-verification-email', 'post', ['email']],
      ['/verify-email', 'get', []],
      ['/request-password-reset', 'post', ['email']],
      ['/reset-password', 'post', ['token', 'newPassword']],
    ] as const;
    const validBodies: Record<string, Record<string, unknown>> = {
      '/sign-up/email': {
        name: 'User', email: 'user@example.com', password: 'password123',
        birthDate: '1990-01-01', acceptedTermsVersion: '1', acceptedPrivacyVersion: '1',
        acceptedAt: '2026-10-14T00:00:00.000Z',
      },
      '/sign-in/email': { email: 'user@example.com', password: 'password123' },
      '/send-verification-email': { email: 'user@example.com' },
      '/request-password-reset': { email: 'user@example.com' },
      '/reset-password': { token: 'vendor-token', newPassword: 'replacement123' },
    };
    const ajv = new Ajv2020({ strict: false });
    for (const [path, method, fields] of routes) {
      const operation = paths[path]?.[method];
      expect(operation, `${method.toUpperCase()} ${path}`).toBeDefined();
      if (method === 'post' && fields.length) {
        const body = operation?.requestBody?.content['application/json'].schema;
        expect(body, `${path} JSON request body`).toBeDefined();
        for (const field of fields) expect(body?.properties).toHaveProperty(field);
        const validate = ajv.compile(body!);
        const invalidField = path === '/reset-password' ? 'newPassword' : 'email';
        const validBody = validBodies[path]!;
        expect(validate(validBody), `${path} valid body: ${JSON.stringify(validate.errors)}`).toBe(true);
        expect(validate({ ...validBody, [invalidField]: 42 })).toBe(false);
        expect(validate.errors).toEqual(expect.arrayContaining([
          expect.objectContaining({ instancePath: `/${invalidField}`, keyword: 'type' }),
        ]));
      }
    }
    expect(paths['/delete-user']?.post).toBeDefined();
  });
});
