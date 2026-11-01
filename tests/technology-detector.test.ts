import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  detectRepositoryTechnologies,
  type SafeRepositorySourceFile,
} from "../src/analysis/technology-detector";

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

function names(results: readonly { name: string }[]): string[] {
  return results.map((result) => result.name);
}

describe("detectRepositoryTechnologies", () => {
  it("detects a Next.js project with evidence, tools, scripts, and entry points", async () => {
    const result = detectRepositoryTechnologies(await loadFixture("next-app"));

    expect(names(result.languages)).toContain("TypeScript");
    expect(names(result.frameworks)).toEqual(expect.arrayContaining(["Next.js", "React"]));
    expect(names(result.packageManagers)).toContain("pnpm");
    expect(names(result.testTools)).toContain("Vitest");
    expect(names(result.databaseTools)).toContain("Prisma");
    expect(names(result.authenticationTools)).toContain("Auth.js / NextAuth");
    expect(names(result.deploymentTools)).toContain("Docker");
    expect(names(result.ciTools)).toContain("GitHub Actions");
    expect(result.scripts).toEqual([
      { name: "dev", command: "next dev", sourcePath: "package.json" },
      { name: "test", command: "vitest run", sourcePath: "package.json" },
    ]);
    expect(names(result.entryPoints)).toContain("Next.js App Router entry");
    expect(result.frameworks.every((item) => item.evidence.length > 0)).toBe(true);
    expect(result.frameworks.find((item) => item.name === "Next.js")?.evidence).toContainEqual({
      path: "package.json",
      detail: "Dependency next",
    });
  });

  it("detects Python API dependencies case-insensitively", async () => {
    const result = detectRepositoryTechnologies(await loadFixture("python-api"));

    expect(names(result.languages)).toContain("Python");
    expect(names(result.frameworks)).toContain("FastAPI");
    expect(names(result.packageManagers)).toContain("pip");
    expect(names(result.testTools)).toContain("pytest");
    expect(names(result.databaseTools)).toContain("SQLAlchemy");
    expect(names(result.entryPoints)).toContain("Python entry");
  });

  it("detects all requested languages and content-based SwiftUI", async () => {
    const result = detectRepositoryTechnologies(await loadFixture("multi-language"));

    expect(names(result.languages)).toEqual(expect.arrayContaining([
      "JavaScript", "Swift", "Java", "Kotlin", "Go", "Rust", "PHP", "Ruby", "C#",
    ]));
    expect(names(result.frameworks)).toContain("SwiftUI");
    expect(names(result.packageManagers)).toContain("Swift Package Manager");
    expect(names(result.entryPoints)).toEqual(expect.arrayContaining([
      "Swift application entry", "Java/Kotlin application entry", "Go entry", "Rust entry",
      "PHP entry", "Ruby entry", "C# entry",
    ]));
  });

  it("does not infer frameworks from unrelated source files", () => {
    const result = detectRepositoryTechnologies([
      { path: "src/index.ts", content: "export const nextValue = 1;" },
      { path: "README.md", content: "This might use React someday." },
    ]);

    expect(result.frameworks).toEqual([]);
    expect(result.languages).toMatchObject([{ name: "TypeScript" }]);
  });

  it("ignores malformed manifests without throwing or inventing evidence", () => {
    const result = detectRepositoryTechnologies([{ path: "package.json", content: "{not json" }]);
    expect(result.frameworks).toEqual([]);
    expect(result.scripts).toEqual([]);
  });

  it("normalizes Windows-style paths before applying path rules", () => {
    const result = detectRepositoryTechnologies([
      { path: ".github\\workflows\\ci.yaml", content: "name: CI" },
      { path: "src\\app\\page.tsx", content: "export default function Page() {}" },
    ]);
    expect(names(result.ciTools)).toContain("GitHub Actions");
    expect(names(result.entryPoints)).toContain("Next.js App Router entry");
  });

  it("covers every requested framework with concrete dependency or source evidence", () => {
    const result = detectRepositoryTechnologies([
      {
        path: "package.json",
        content: JSON.stringify({
          dependencies: {
            next: "1", react: "1", vue: "1", "@angular/core": "1", express: "1", "@nestjs/core": "1",
          },
        }),
      },
      { path: "requirements.txt", content: "Django==5\nFlask==3\nfastapi==1" },
      { path: "Package.swift", content: "import PackageDescription" },
      { path: "Sources/App.swift", content: "import SwiftUI" },
      { path: "pom.xml", content: "<dependency><artifactId>spring-boot-starter-web</artifactId></dependency>" },
      { path: "composer.json", content: JSON.stringify({ require: { "laravel/framework": "^12" } }) },
    ]);

    expect(names(result.frameworks)).toEqual(expect.arrayContaining([
      "Next.js", "React", "Vue", "Angular", "Express", "NestJS", "Django", "Flask", "FastAPI",
      "SwiftUI", "Spring", "Laravel",
    ]));
    expect(result.frameworks.every((fact) => fact.evidence.length > 0)).toBe(true);
  });

  it("covers every requested package manager using manifest and lockfile evidence", () => {
    const result = detectRepositoryTechnologies([
      { path: "package-lock.json", content: "{}" },
      { path: "pnpm-lock.yaml", content: "lockfileVersion: '9.0'" },
      { path: "yarn.lock", content: "" },
      { path: "bun.lock", content: "" },
      { path: "requirements.txt", content: "flask" },
      { path: "pyproject.toml", content: "[tool.poetry]\nname = 'app'" },
      { path: "Package.swift", content: "import PackageDescription" },
      { path: "build.gradle.kts", content: "plugins {}" },
      { path: "pom.xml", content: "<project />" },
      { path: "Cargo.toml", content: "[package]\nname = 'app'" },
    ]);

    expect(names(result.packageManagers)).toEqual(expect.arrayContaining([
      "npm", "pnpm", "Yarn", "Bun", "pip", "Poetry", "Swift Package Manager", "Gradle", "Maven", "Cargo",
    ]));
    expect(result.packageManagers.every((fact) => fact.evidence.length > 0)).toBe(true);
  });

  it("does not report dev-only dependencies as the project's frameworks or databases", () => {
    const result = detectRepositoryTechnologies([
      {
        path: "package.json",
        content: JSON.stringify({ devDependencies: { express: "1", vitest: "1", sequelize: "1" } }),
      },
    ]);

    expect(names(result.frameworks)).not.toContain("Express");
    expect(names(result.databaseTools)).not.toContain("Sequelize");
    expect(names(result.testTools)).toContain("Vitest");
    expect(result.dependencies).toContainEqual({ name: "express", sourcePath: "package.json", dev: true });
  });

  it("lists dependencies once per manifest, preferring the runtime listing", () => {
    const result = detectRepositoryTechnologies([
      {
        path: "package.json",
        content: JSON.stringify({ peerDependencies: { react: "1" }, devDependencies: { react: "1", vitest: "1" } }),
      },
    ]);

    expect(result.dependencies).toEqual([
      { name: "react", sourcePath: "package.json", dev: false },
      { name: "vitest", sourcePath: "package.json", dev: true },
    ]);
  });

  it("reads PEP 621 pyproject dependency arrays without treating metadata keys as dependencies", () => {
    const result = detectRepositoryTechnologies([
      {
        path: "pyproject.toml",
        content: [
          "[project]",
          'name = "service"',
          'version = "1.0"',
          "dependencies = [",
          '  "fastapi>=0.110",',
          '  "uvicorn[standard]>=0.29",  # server',
          '  "SQLAlchemy",',
          "]",
          "",
          "[project.optional-dependencies]",
          'test = ["pytest>=8"]',
        ].join("\n"),
      },
      { path: "uv.lock", content: "version = 1" },
      { path: "app/models.py", content: "from sqlalchemy.orm import Mapped" },
    ]);

    expect(result.dependencies).toEqual([
      { name: "fastapi", sourcePath: "pyproject.toml", dev: false },
      { name: "uvicorn", sourcePath: "pyproject.toml", dev: false },
      { name: "sqlalchemy", sourcePath: "pyproject.toml", dev: false },
      { name: "pytest", sourcePath: "pyproject.toml", dev: true },
    ]);
    expect(names(result.frameworks)).toContain("FastAPI");
    expect(names(result.databaseTools)).toContain("SQLAlchemy");
    expect(names(result.databaseTools)).not.toContain("Django ORM");
    expect(names(result.testTools)).toContain("pytest");
    expect(names(result.packageManagers)).toContain("uv");
  });

  it("reads Poetry and Pipfile dependency tables and skips the python version key", () => {
    const result = detectRepositoryTechnologies([
      {
        path: "pyproject.toml",
        content: '[tool.poetry.dependencies]\npython = "^3.12"\ndjango = "^5"\n\n[tool.poetry.group.dev.dependencies]\npytest = "^8"',
      },
      { path: "Pipfile", content: '[packages]\nflask = "*"\n\n[dev-packages]\nblack = "*"' },
    ]);

    expect(result.dependencies).toEqual([
      { name: "django", sourcePath: "pyproject.toml", dev: false },
      { name: "pytest", sourcePath: "pyproject.toml", dev: true },
      { name: "flask", sourcePath: "Pipfile", dev: false },
      { name: "black", sourcePath: "Pipfile", dev: true },
    ]);
    expect(names(result.frameworks)).toEqual(expect.arrayContaining(["Django", "Flask"]));
  });
});
