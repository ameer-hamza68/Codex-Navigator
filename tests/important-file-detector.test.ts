import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { detectImportantFiles } from "../src/analysis/important-file-detector";
import {
  detectRepositoryTechnologies,
  type SafeRepositorySourceFile,
} from "../src/analysis/technology-detector";
import type { ImportantFileCategory } from "../src/domain/repository-analysis";

const FIXTURE_ROOT = path.resolve("tests/fixtures");

async function loadFixture(name: string): Promise<SafeRepositorySourceFile[]> {
  const root = path.join(FIXTURE_ROOT, name);
  const files: SafeRepositorySourceFile[] = [];
  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolutePath);
      else files.push({ path: path.relative(root, absolutePath).replaceAll("\\", "/"), content: await readFile(absolutePath, "utf8") });
    }
  }
  await walk(root);
  return files;
}

function findCategory(
  results: ReturnType<typeof detectImportantFiles>,
  category: ImportantFileCategory,
  filePath: string,
) {
  return results.find((result) => result.category === category && result.path === filePath);
}

describe("detectImportantFiles", () => {
  it("classifies Next.js conventions, API auth, services, CI, and deployment files", async () => {
    const files = await loadFixture("next-app");
    const results = detectImportantFiles(files, detectRepositoryTechnologies(files));

    expect(findCategory(results, "entry-point", "src/app/page.tsx")).toBeDefined();
    expect(findCategory(results, "api", "src/app/api/auth/route.ts")).toBeDefined();
    expect(findCategory(results, "authentication", "src/app/api/auth/route.ts")).toBeDefined();
    expect(findCategory(results, "services", "src/services/user-service.ts")).toBeDefined();
    expect(findCategory(results, "database", "prisma/schema.prisma")).toBeDefined();
    expect(findCategory(results, "ci", ".github/workflows/ci.yml")).toBeDefined();
    expect(findCategory(results, "deployment", "Dockerfile")).toBeDefined();
    expect(results.every((result) => result.score > 0 && result.evidence.length > 0 && result.explanation.length > 0)).toBe(true);
  });

  it("classifies Python entry, routing, database, API, and service files", async () => {
    const files = await loadFixture("python-api");
    const results = detectImportantFiles(files, detectRepositoryTechnologies(files));

    expect(findCategory(results, "entry-point", "main.py")).toBeDefined();
    expect(findCategory(results, "api", "main.py")).toBeDefined();
    expect(findCategory(results, "routing", "app/urls.py")).toBeDefined();
    expect(findCategory(results, "database", "app/models.py")).toBeDefined();
    expect(findCategory(results, "services", "app/services/authentication.py")).toBeDefined();
    expect(findCategory(results, "authentication", "app/services/authentication.py")).toBeDefined();
  });

  it("classifies SwiftUI entry, routing, authentication, persistence, and tests", async () => {
    const files = await loadFixture("multi-language");
    const results = detectImportantFiles(files, detectRepositoryTechnologies(files), {
      maxResults: 40,
      maxPerCategory: 6,
      minimumScore: 18,
    });

    expect(findCategory(results, "entry-point", "App.swift")).toBeDefined();
    expect(findCategory(results, "routing", "RootView.swift")).toBeDefined();
    expect(findCategory(results, "authentication", "Services/AuthService.swift")).toBeDefined();
    expect(findCategory(results, "database", "Models/User.swift")).toBeDefined();
    expect(findCategory(results, "test", "Tests/AppTests.swift")).toBeDefined();
  });

  it("uses deterministic explanations and enforces clutter limits", () => {
    const files = Array.from({ length: 10 }, (_, index) => ({
      path: `docs/guide-${index}.md`,
      content: `# Guide ${index}`,
    }));
    const technologies = detectRepositoryTechnologies(files);
    const first = detectImportantFiles(files, technologies, { maxResults: 3, maxPerCategory: 2, minimumScore: 18 });
    const second = detectImportantFiles(files, technologies, { maxResults: 3, maxPerCategory: 2, minimumScore: 18 });

    expect(first).toEqual(second);
    expect(first).toHaveLength(2);
    expect(first.every((result) => result.category === "documentation")).toBe(true);
  });

  it("uses technology results only as supporting evidence, not as a file match by itself", () => {
    const files = [{ path: "src/unrelated.ts", content: "export const value = 1;" }];
    const technologies = detectRepositoryTechnologies([
      ...files,
      { path: "package.json", content: JSON.stringify({ dependencies: { "next-auth": "1" } }) },
    ]);
    const results = detectImportantFiles(files, technologies);
    expect(results.find((result) => result.category === "authentication")).toBeUndefined();
  });

  it("ranks root README and manifest files above nested copies", () => {
    const files = [
      { path: "README.md", content: "# Project\nKeeps the login session and database schema in sync." },
      { path: "pyproject.toml", content: "[project]" },
      ...["a", "b", "c", "d"].flatMap((name) => [
        { path: `docs/${name}.md`, content: "# Docs" },
        { path: `examples/${name}/pyproject.toml`, content: "[project]" },
      ]),
    ];
    const results = detectImportantFiles(files, detectRepositoryTechnologies(files));
    const paths = results.map((result) => result.path);

    expect(paths).toContain("README.md");
    expect(paths).toContain("pyproject.toml");
    expect(results.find((result) => result.path === "README.md")?.evidence).toContainEqual({
      path: "README.md",
      detail: "Located at the repository root",
    });
    // Root location must not turn a passing keyword mention into an important file.
    expect(results.filter((result) => result.path === "README.md").map((result) => result.category)).toEqual(["documentation"]);
  });
});
