import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { generateArchitectureDiagram, sanitizeMermaidLabel } from "../src/analysis/architecture-diagram";
import { detectImportantFiles } from "../src/analysis/important-file-detector";
import { detectRepositoryTechnologies, type SafeRepositorySourceFile } from "../src/analysis/technology-detector";

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

async function diagramFor(name: string) {
  const files = await loadFixture(name);
  const technologies = detectRepositoryTechnologies(files);
  const importantFiles = detectImportantFiles(files, technologies, { maxResults: 40, maxPerCategory: 8, minimumScore: 18 });
  return generateArchitectureDiagram(files, technologies, importantFiles);
}

function kinds(diagram: Awaited<ReturnType<typeof diagramFor>>) {
  return diagram.nodes.map((node) => node.kind);
}

describe("generateArchitectureDiagram", () => {
  it("creates an evidence-backed Next.js full-stack diagram", async () => {
    const diagram = await diagramFor("next-app");
    expect(kinds(diagram)).toEqual(expect.arrayContaining([
      "client", "frontend", "routes", "api", "services", "authentication", "database", "tests", "delivery",
    ]));
    expect(diagram.nodes).toHaveLength(9);
    expect(diagram.nodes.every((node) => node.kind === "client" || node.evidence.length > 0)).toBe(true);
    expect(diagram.mermaid).toMatch(/^flowchart LR/u);
    expect(diagram.explanation).toContain("Detected components:");
    expect(diagram.fallback).toBe(false);
  });

  it("does not invent backend components for a frontend-only React project", async () => {
    const diagram = await diagramFor("react-frontend");
    expect(kinds(diagram)).toEqual(["client", "frontend"]);
    expect(diagram.mermaid).toContain("uses");
    expect(diagram.mermaid).not.toContain("API Routes");
    expect(diagram.mermaid).not.toContain("Database");
  });

  it("creates a Python API diagram without a frontend", async () => {
    const diagram = await diagramFor("python-api");
    expect(kinds(diagram)).toEqual(expect.arrayContaining(["routes", "api", "services", "authentication", "database"]));
    expect(kinds(diagram)).not.toContain("client");
    expect(kinds(diagram)).not.toContain("frontend");
  });

  it("creates a SwiftUI client diagram only from observed components", async () => {
    const diagram = await diagramFor("swiftui-app");
    expect(kinds(diagram)).toEqual(expect.arrayContaining(["client", "frontend", "routes"]));
    expect(kinds(diagram)).not.toContain("api");
    expect(kinds(diagram)).not.toContain("database");
  });

  it("falls back to a sanitized folder-level diagram for unclear repositories", () => {
    const files = [
      { path: "odd<script>/notes.txt", content: "plain text" },
      { path: "misc/value.txt", content: "unknown format" },
    ];
    const technologies = detectRepositoryTechnologies(files);
    const diagram = generateArchitectureDiagram(files, technologies, []);
    expect(diagram.fallback).toBe(true);
    expect(kinds(diagram)).toEqual(["repository", "folder", "folder"]);
    expect(diagram.mermaid).not.toContain("<script>");
    expect(diagram.explanation).toContain("Architecture was unclear");
  });

  it("sanitizes Mermaid labels and enforces the node limit", () => {
    expect(sanitizeMermaidLabel('bad"]\nclick n0 callback %%')).toBe("bad click n0 callback");
    const files = Array.from({ length: 20 }, (_, index) => ({ path: `folder-${index}/file.txt`, content: "plain" }));
    const technologies = detectRepositoryTechnologies(files);
    const diagram = generateArchitectureDiagram(files, technologies, [], { maxNodes: 10, maxFallbackFolders: 20 });
    expect(diagram.nodes.length).toBeLessThanOrEqual(10);
  });

  it("is deterministic", async () => {
    expect(await diagramFor("next-app")).toEqual(await diagramFor("next-app"));
  });
});
