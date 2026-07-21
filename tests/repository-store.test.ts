import { afterEach, describe, expect, it, vi } from "vitest";

import type { RepositoryAnalysis } from "../src/domain/repository-analysis";
import type { RepositoryImportSnapshot } from "../src/import/repository-importer";
import type { RepositoryStoreState, StoredRepository } from "../src/server/repository-store";

const GLOBAL_KEY = "__codexNavigatorLiteRepositoryStoreV2" as const;
type RepositoryStoreGlobal = typeof globalThis & { [GLOBAL_KEY]?: RepositoryStoreState };

const EMPTY_ANALYSIS: RepositoryAnalysis = {
  files: [],
  tree: [],
  importantFiles: [],
  languages: [],
  frameworks: [],
  packageManagers: [],
  testTools: [],
  databaseTools: [],
  authenticationTools: [],
  deploymentTools: [],
  ciTools: [],
  scripts: [],
  entryPoints: [],
  architecture: {
    mermaid: "flowchart LR",
    explanation: "No supported architecture signals were detected.",
    nodes: [],
    edges: [],
    fallback: true,
  },
  warnings: [],
};

afterEach(() => {
  (globalThis as RepositoryStoreGlobal)[GLOBAL_KEY] = undefined;
  vi.resetModules();
});

describe("repository store lifecycle", () => {
  it("retains analyses when the module is reloaded during development", async () => {
    const firstModule = await import("../src/server/repository-store");
    const state = (globalThis as RepositoryStoreGlobal)[GLOBAL_KEY];
    expect(state).toBeDefined();
    const record: StoredRepository = {
      id: "persistent-analysis",
      sourceType: "github",
      sourceUrl: "https://github.com/example/repository",
      owner: "example",
      name: "repository",
      createdAt: new Date().toISOString(),
      analysis: EMPTY_ANALYSIS,
      indexedFiles: [],
    };
    state?.repositories.set(record.id, record);

    vi.resetModules();
    const reloadedModule = await import("../src/server/repository-store");

    expect(reloadedModule.getStoredRepository(record.id)).toEqual(record);
    expect(firstModule.REPOSITORY_STORE_GLOBAL_KEY).toBe(reloadedModule.REPOSITORY_STORE_GLOBAL_KEY);
  });

  it("allows only one repository import at a time", async () => {
    const store = await import("../src/server/repository-store");
    const state = (globalThis as RepositoryStoreGlobal)[GLOBAL_KEY];
    if (state === undefined) throw new Error("Repository store was not initialized");
    let finishImport: ((snapshot: RepositoryImportSnapshot) => void) | undefined;
    state.importSnapshot = vi.fn(() => new Promise<RepositoryImportSnapshot>((resolve) => {
      finishImport = resolve;
    }));

    const firstImport = store.importAndStoreRepository("https://github.com/example/repository");
    await Promise.resolve();

    await expect(store.importAndStoreRepository("https://github.com/example/second"))
      .rejects.toMatchObject({ code: "import-in-progress" });

    finishImport?.({ analysis: EMPTY_ANALYSIS, indexedFiles: [] });
    await expect(firstImport).resolves.toMatchObject({ owner: "example", name: "repository" });
    expect(state.importInProgress).toBe(false);
  });
});
