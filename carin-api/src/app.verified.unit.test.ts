import { describe, expect, it } from "vitest";
import { createVerifiedApp } from "./app.js";
import type { Database } from "./db/client.js";

describe("verified application composition", () => {
  it("mounts catalog condition search behind the verified session resolver", async () => {
    const app = createVerifiedApp({
      readiness: async () => true,
      db: {} as Database,
      resolveSession: async () => null,
    });

    const response = await app.request("/api/v1/catalog/conditions");

    expect(response.status).toBe(401);
  });

  it.each([
    '/api/v1/analysis-jobs',
    '/api/v1/analysis-jobs/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '/api/v1/analysis-results/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '/api/v1/scans',
    '/api/v1/scans/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '/api/v1/scans/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/corrections',
    '/api/v1/consumptions',
  ])('keeps C18 route %s behind the shared session resolver', async (path) => {
    const app = createVerifiedApp({
      readiness: async () => true,
      db: {} as Database,
      resolveSession: async () => null,
    });
    const isPost = path.endsWith('/analysis-jobs') || path.endsWith('/corrections');
    const response = await app.request(path, {
      method: isPost ? 'POST' : 'GET',
      headers: isPost ? { 'content-type': 'application/json', 'idempotency-key': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } : undefined,
      body: path.endsWith('/analysis-jobs')
        ? JSON.stringify({ photoId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })
        : path.endsWith('/corrections') ? JSON.stringify({}) : undefined,
    });
    expect(response.status).toBe(401);
  });
});
