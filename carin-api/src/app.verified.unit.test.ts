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
});
