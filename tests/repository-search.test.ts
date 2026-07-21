import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { detectImportantFiles } from "../src/analysis/important-file-detector";
import {
  detectRepositoryTechnologies,
  type SafeRepositorySourceFile,
} from "../src/analysis/technology-detector";
import { escapeHtml, searchRepository } from "../src/search/repository-search";

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

async function searchFixture(question: string) {
  const files = await loadFixture("next-app");
  const technologies = detectRepositoryTechnologies(files);
  const importantFiles = detectImportantFiles(files, technologies, { maxResults: 40, maxPerCategory: 8, minimumScore: 18 });
  return searchRepository(question, files, technologies, importantFiles);
}

describe("searchRepository", () => {
  it("finds authentication implementation", async () => {
    const response = await searchFixture("Where is authentication implemented?");
    expect(response.results[0]?.path).toBe("src/app/api/auth/route.ts");
    expect(response.results[0]?.reasons.join(" ")).toContain("authentication");
    expect(response.confidence).not.toBe("low");
  });

  it("finds the database schema", async () => {
    const response = await searchFixture("Where is the database schema?");
    expect(response.results[0]?.path).toBe("prisma/schema.prisma");
    expect(response.results[0]?.excerpts[0]?.startLine).toBe(1);
    expect(response.results[0]?.excerpts[0]?.endLine).toBeGreaterThanOrEqual(1);
  });

  it("finds files that handle API requests", async () => {
    const response = await searchFixture("Which files handle API requests?");
    expect(response.results[0]?.path).toBe("src/app/api/auth/route.ts");
    expect(response.results[0]?.reasons.some((reason) => reason.includes("category"))).toBe(true);
  });

  it("finds test files", async () => {
    const response = await searchFixture("Where are tests located?");
    expect(response.results[0]?.path).toBe("src/__tests__/auth.ts");
    expect(response.results[0]?.confidence).not.toBe("low");
  });

  it("returns an explicit low-confidence response when nothing is relevant", async () => {
    const response = await searchFixture("Where is the quantum telemetry reconciler?");
    expect(response).toMatchObject({
      confidence: "low",
      results: [],
      message: "No repository files had a meaningful lexical match for this question.",
    });
  });

  it("escapes repository-controlled paths and excerpt text", () => {
    const files = [{ path: "src/<script>.ts", content: "export const auth = '<script>alert(1)</script>';" }];
    const technologies = detectRepositoryTechnologies(files);
    const response = searchRepository("auth", files, technologies, []);
    expect(response.results[0]?.path).toBe("src/<script>.ts");
    expect(response.results[0]?.displayPath).toBe("src/&lt;script&gt;.ts");
    expect(response.results[0]?.excerpts[0]?.text).toContain("&lt;script&gt;");
    expect(escapeHtml("&<>'\"")).toBe("&amp;&lt;&gt;&#39;&quot;");
  });

  it("returns line-numbered excerpts around the strongest match", async () => {
    const response = await searchFixture("session token middleware");
    const excerpt = response.results[0]?.excerpts[0];
    expect(excerpt?.startLine).toBeGreaterThanOrEqual(1);
    expect(excerpt?.endLine).toBeGreaterThanOrEqual(excerpt?.startLine ?? 1);
  });
});
