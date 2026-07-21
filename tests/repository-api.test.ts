import { describe, expect, it } from "vitest";

import { POST } from "../src/app/api/repositories/route";
import {
  REPOSITORY_STORE_GLOBAL_KEY,
  type RepositoryStoreState,
} from "../src/server/repository-store";

describe("POST /api/repositories", () => {
  it("returns a typed friendly error for malformed JSON", async () => {
    const response = await POST(new Request("http://localhost/api/repositories", {
      method: "POST",
      body: "not-json",
      headers: { "content-type": "application/json" },
    }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: { code: "invalid-request", message: "Request body must be valid JSON." },
    });
  });

  it("returns a validation error without invoking Git for an unsafe URL", async () => {
    const response = await POST(new Request("http://localhost/api/repositories", {
      method: "POST",
      body: JSON.stringify({ url: "file:///C:/repository" }),
      headers: { "content-type": "application/json" },
    }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "invalid-repository" } });
  });

  it("rejects concurrent imports before starting another clone", async () => {
    const repositoryStoreGlobal = globalThis as typeof globalThis & {
      [REPOSITORY_STORE_GLOBAL_KEY]?: RepositoryStoreState;
    };
    const state = repositoryStoreGlobal[REPOSITORY_STORE_GLOBAL_KEY];
    if (state === undefined) throw new Error("Repository store was not initialized");
    state.importInProgress = true;
    try {
      const response = await POST(new Request("http://localhost/api/repositories", {
        method: "POST",
        body: JSON.stringify({ url: "https://github.com/example/repository" }),
        headers: { "content-type": "application/json" },
      }));
      expect(response.status).toBe(429);
      await expect(response.json()).resolves.toMatchObject({ error: { code: "import-in-progress" } });
    } finally {
      state.importInProgress = false;
    }
  });
});
