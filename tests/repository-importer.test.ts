import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cleanupExpiredImports,
  createRepositoryImporter,
  DEFAULT_REPOSITORY_IMPORT_LIMITS,
  fetchPublicGitHubRepositorySizeBytes,
} from "../src/import/repository-importer";
import type { RepositoryImporterDependencies, RepositoryImportError } from "../src/import/repository-importer";
import type { ProcessRunner } from "../src/import/process-runner";

const temporaryRoots: string[] = [];

function createTestRepositoryImporter(dependencies: Partial<RepositoryImporterDependencies>) {
  return createRepositoryImporter({
    loadRepositorySizeBytes: async () => 0,
    ...dependencies,
  });
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function makeTemporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "navigator-import-test-"));
  temporaryRoots.push(root);
  return root;
}

function successfulGitMock(files: Readonly<Record<string, string>>): ProcessRunner {
  return {
    run: vi.fn(async (_command, args) => {
      const checkoutPath = args.at(-1);
      if (checkoutPath === undefined) throw new Error("Missing checkout path");
      for (const [filePath, content] of Object.entries(files)) {
        const absolutePath = path.join(checkoutPath, ...filePath.split("/"));
        await mkdir(path.dirname(absolutePath), { recursive: true });
        await writeFile(absolutePath, content, "utf8");
      }
      await mkdir(path.join(checkoutPath, ".git"), { recursive: true });
      await writeFile(path.join(checkoutPath, ".git", "config"), "[core]", "utf8");
      return { exitCode: 0, stdout: "", stderr: "", timedOut: false };
    }),
  };
}

describe("createRepositoryImporter", () => {
  it("uses safe shallow clone arguments, analyzes the checkout, and cleans up", async () => {
    const temporaryRoot = await makeTemporaryRoot();
    const processRunner = successfulGitMock({
      "package.json": JSON.stringify({ dependencies: { next: "1", react: "1" }, scripts: { dev: "next dev" } }),
      "src/app/page.tsx": "export default function Page() { return <main>Hello</main>; }",
      ".env": "TOKEN=secret",
      ".env.example": "TOKEN=example",
      "notes.txt": `github_pat_${"a".repeat(50)}`,
    });
    const importer = createTestRepositoryImporter({
      processRunner,
      temporaryRoot,
      environment: {
        PATH: process.env.PATH,
        GIT_ASKPASS: "malicious-askpass",
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_GLOBAL: "malicious-global-config",
      },
    });

    const analysis = await importer("https://github.com/example/public-repository");

    expect(analysis.frameworks.map((item) => item.name)).toEqual(expect.arrayContaining(["Next.js", "React"]));
    expect(analysis.files.map((file) => file.path)).toEqual(expect.arrayContaining(["package.json", "src/app/page.tsx", ".env.example"]));
    expect(analysis.files.map((file) => file.path)).not.toContain(".env");
    expect(analysis.files.map((file) => file.path)).not.toContain("notes.txt");
    expect(analysis.warnings).toContain("Skipped 1 file: secret-file.");
    expect(analysis.warnings).toContain("Skipped 1 file: secret-content.");

    const run = vi.mocked(processRunner.run);
    expect(run).toHaveBeenCalledOnce();
    const [command, args, options] = run.mock.calls[0] ?? [];
    expect(command).toBe("git");
    expect(args).toEqual(expect.arrayContaining([
      "clone", "--depth", "1", "--single-branch", "--no-tags", "--no-recurse-submodules",
      "https://github.com/example/public-repository.git",
    ]));
    expect(args?.some((argument) => argument.startsWith("core.hooksPath="))).toBe(true);
    expect(args).toEqual(expect.arrayContaining(["-c", "credential.helper="]));
    expect(options?.env.GIT_TERMINAL_PROMPT).toBe("0");
    expect(options?.env.GIT_LFS_SKIP_SMUDGE).toBe("1");
    expect(options?.env.GIT_ASKPASS).toBe("");
    expect(options?.env.GIT_CONFIG_COUNT).toBeUndefined();
    expect(options?.env.GIT_CONFIG_GLOBAL).toContain("empty-gitconfig");
    expect(options?.env.GIT_CONFIG_NOSYSTEM).toBe("1");
    expect(await readdir(temporaryRoot)).toEqual([]);
  });

  it("rejects invalid URLs before invoking Git", async () => {
    const temporaryRoot = await makeTemporaryRoot();
    const processRunner: ProcessRunner = { run: vi.fn() };
    const importer = createTestRepositoryImporter({ processRunner, temporaryRoot });

    await expect(importer("file:///C:/secret")).rejects.toMatchObject({ code: "invalid-repository" });
    expect(processRunner.run).not.toHaveBeenCalled();
  });

  it.each([
    ["authentication failed", "private-repository"],
    ["fatal: repository 'https://github.com/example/missing.git/' not found", "repository-not-found"],
  ])("maps Git failure %s to %s", async (stderr, code) => {
    const temporaryRoot = await makeTemporaryRoot();
    const processRunner: ProcessRunner = {
      run: vi.fn(async () => ({ exitCode: 128, stdout: "", stderr, timedOut: false })),
    };
    const importer = createTestRepositoryImporter({ processRunner, temporaryRoot });
    await expect(importer("https://github.com/example/repository")).rejects.toMatchObject({ code });
    expect(await readdir(temporaryRoot)).toEqual([]);
  });

  it("returns a friendly timeout error and cleans up", async () => {
    const temporaryRoot = await makeTemporaryRoot();
    const processRunner: ProcessRunner = {
      run: vi.fn(async () => ({ exitCode: 1, stdout: "", stderr: "", timedOut: true })),
    };
    const importer = createTestRepositoryImporter({ processRunner, temporaryRoot });
    await expect(importer("https://github.com/example/repository", {
      ...DEFAULT_REPOSITORY_IMPORT_LIMITS,
      cloneTimeoutMs: 25,
    })).rejects.toMatchObject({ code: "clone-timeout" });
    expect(await readdir(temporaryRoot)).toEqual([]);
  });

  it.each([
    ["size", { maxRepositorySizeBytes: 5, maxRepositoryFiles: 100 }],
    ["file count", { maxRepositorySizeBytes: 1000, maxRepositoryFiles: 1 }],
  ])("enforces the repository %s limit", async (_label, limitOverrides) => {
    const temporaryRoot = await makeTemporaryRoot();
    const importer = createTestRepositoryImporter({
      processRunner: successfulGitMock({ "one.ts": "export const one = 1;", "two.ts": "export const two = 2;" }),
      temporaryRoot,
    });
    await expect(importer("https://github.com/example/repository", {
      ...DEFAULT_REPOSITORY_IMPORT_LIMITS,
      ...limitOverrides,
    })).rejects.toMatchObject({ code: "repository-too-large" });
    expect(await readdir(temporaryRoot)).toEqual([]);
  });

  it("reports Git being unavailable", async () => {
    const temporaryRoot = await makeTemporaryRoot();
    const processRunner: ProcessRunner = {
      run: vi.fn(async () => { throw Object.assign(new Error("spawn git ENOENT"), { code: "ENOENT" }); }),
    };
    const importer = createTestRepositoryImporter({ processRunner, temporaryRoot });
    await expect(importer("https://github.com/example/repository")).rejects.toEqual(
      expect.objectContaining<Partial<RepositoryImportError>>({ code: "git-unavailable" }),
    );
  });

  it("rejects a repository reported as too large before invoking Git", async () => {
    const temporaryRoot = await makeTemporaryRoot();
    const processRunner: ProcessRunner = { run: vi.fn() };
    const loadRepositorySizeBytes = vi.fn(async () => 101);
    const importer = createTestRepositoryImporter({ processRunner, temporaryRoot, loadRepositorySizeBytes });

    await expect(importer("https://github.com/example/repository", {
      ...DEFAULT_REPOSITORY_IMPORT_LIMITS,
      maxRepositorySizeBytes: 100,
    })).rejects.toMatchObject({ code: "repository-too-large" });
    expect(loadRepositorySizeBytes).toHaveBeenCalledOnce();
    expect(processRunner.run).not.toHaveBeenCalled();
  });

  it("removes stale crashed workspaces before starting an import", async () => {
    const temporaryRoot = await makeTemporaryRoot();
    const staleWorkspace = path.join(temporaryRoot, "import-crashed");
    await mkdir(staleWorkspace);
    await utimes(staleWorkspace, new Date(0), new Date(0));
    const importer = createTestRepositoryImporter({
      processRunner: successfulGitMock({ "index.ts": "export const value = 1;" }),
      temporaryRoot,
      now: () => 1_000_000,
    });

    await importer("https://github.com/example/repository");

    expect(await readdir(temporaryRoot)).toEqual([]);
  });
});

describe("fetchPublicGitHubRepositorySizeBytes", () => {
  it("reads GitHub's reported KiB size without sending repository credentials", async () => {
    const fetchImplementation = vi.fn(async () => new Response(JSON.stringify({ size: 123 }), { status: 200 }));

    await expect(fetchPublicGitHubRepositorySizeBytes(
      { owner: "example", repository: "public-repository", cloneUrl: "https://github.com/example/public-repository.git" },
      1_000,
      fetchImplementation,
    )).resolves.toBe(123 * 1024);

    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://api.github.com/repos/example/public-repository",
      expect.objectContaining({ redirect: "follow" }),
    );
  });
});

describe("cleanupExpiredImports", () => {
  it("removes only expired import workspaces", async () => {
    const temporaryRoot = await makeTemporaryRoot();
    const oldImport = path.join(temporaryRoot, "import-old");
    const freshImport = path.join(temporaryRoot, "import-fresh");
    const unrelated = path.join(temporaryRoot, "keep-me");
    await Promise.all([mkdir(oldImport), mkdir(freshImport), mkdir(unrelated)]);
    await utimes(oldImport, new Date(0), new Date(0));

    expect(await cleanupExpiredImports(temporaryRoot, 1_000, () => 10_000)).toBe(1);
    expect(await readdir(temporaryRoot)).toEqual(expect.arrayContaining(["import-fresh", "keep-me"]));
    expect(await readdir(temporaryRoot)).not.toContain("import-old");
  });
});
