import { describe, expect, it } from "vitest";

import { POST as createDemoRepository } from "../src/app/api/repositories/demo/route";
import { GET as getRepository } from "../src/app/api/repositories/[id]/route";
import { POST as searchStoredRepository } from "../src/app/api/repositories/[id]/search/route";
import { DEMO_REPOSITORY } from "../src/demo/demo-repository-fixture";
import { analyzeRepositorySourceFiles } from "../src/import/repository-importer";
import { searchRepository } from "../src/search/repository-search";
import type { RepositoryWorkspaceResponse } from "../src/server/repository-store";

const REQUESTED_QUESTIONS = [
  "Where is authentication implemented?",
  "How are tasks created?",
  "Where is the database schema?",
  "Which files might cause a Redis connection error?",
] as const;

describe("demo repository", () => {
  it("contains the requested realistic Next.js application surfaces", () => {
    const paths = DEMO_REPOSITORY.files.map((file) => file.path);
    expect(paths).toEqual(expect.arrayContaining([
      "src/auth/config.ts",
      "src/app/dashboard/page.tsx",
      "src/app/api/tasks/route.ts",
      "prisma/schema.prisma",
      "src/services/task-service.ts",
      "tests/task-service.test.ts",
      "Dockerfile",
      "src/config/redis.ts",
    ]));
    expect(paths.filter((filePath) => filePath.toLowerCase().includes("redis"))).toEqual(["src/config/redis.ts"]);
  });

  it("derives a complete analysis and useful answers through the shared engine", async () => {
    const snapshot = await analyzeRepositorySourceFiles(DEMO_REPOSITORY.files);
    const { analysis } = snapshot;

    expect(analysis.files).toHaveLength(DEMO_REPOSITORY.files.length);
    expect(analysis.warnings).toEqual([]);
    expect(analysis.frameworks.map((item) => item.name)).toEqual(expect.arrayContaining(["Next.js", "React"]));
    expect(analysis.authenticationTools.map((item) => item.name)).toContain("Auth.js / NextAuth");
    expect(analysis.databaseTools.map((item) => item.name)).toContain("Prisma");
    expect(analysis.testTools.map((item) => item.name)).toContain("Vitest");
    expect(analysis.deploymentTools.map((item) => item.name)).toContain("Docker");
    expect(analysis.architecture.nodes.length).toBeGreaterThan(4);

    const results = Object.fromEntries(REQUESTED_QUESTIONS.map((question) => [
      question,
      searchRepository(question, snapshot.indexedFiles, analysis, analysis.importantFiles).results.map((result) => result.path),
    ]));
    expect(results[REQUESTED_QUESTIONS[0]]).toContain("src/auth/config.ts");
    expect(results[REQUESTED_QUESTIONS[1]]).toContain("src/app/api/tasks/route.ts");
    expect(results[REQUESTED_QUESTIONS[2]]?.[0]).toBe("prisma/schema.prisma");
    expect(results[REQUESTED_QUESTIONS[3]]).toContain("src/config/redis.ts");
  });

  it("creates a normal stored workspace without GitHub access", async () => {
    const createResponse = await createDemoRepository();
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json() as RepositoryWorkspaceResponse;
    expect(created.repository).toMatchObject({
      sourceType: "demo",
      sourceUrl: null,
      owner: "Demo Repository",
      name: "TaskFlow",
    });

    const workspaceResponse = await getRepository(
      new Request(`http://localhost/api/repositories/${created.repository.id}`),
      { params: Promise.resolve({ id: created.repository.id }) },
    );
    expect(workspaceResponse.status).toBe(200);

    const searchResponse = await searchStoredRepository(
      new Request(`http://localhost/api/repositories/${created.repository.id}/search`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: REQUESTED_QUESTIONS[3] }),
      }),
      { params: Promise.resolve({ id: created.repository.id }) },
    );
    expect(searchResponse.status).toBe(200);
    await expect(searchResponse.json()).resolves.toMatchObject({
      results: expect.arrayContaining([expect.objectContaining({ path: "src/config/redis.ts" })]),
    });
  });
});
