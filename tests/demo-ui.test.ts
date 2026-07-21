import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";

import { ImportForm } from "../src/components/import-form";
import { RepositorySearchSection } from "../src/components/workspace/repository-search-section";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.stubGlobal("React", React);

afterAll(() => vi.unstubAllGlobals());

describe("demo repository UI", () => {
  it("renders a clearly labelled demo action", () => {
    const html = renderToStaticMarkup(React.createElement(ImportForm));
    expect(html).toContain("Demo Repository");
    expect(html).toContain("Try Demo Repository");
    expect(html).toContain("bundled Next.js task-management codebase");
  });

  it("renders all requested suggested questions", () => {
    const html = renderToStaticMarkup(React.createElement(RepositorySearchSection, { repositoryId: "demo" }));
    expect(html).toContain("Where is authentication implemented?");
    expect(html).toContain("How are tasks created?");
    expect(html).toContain("Where is the database schema?");
    expect(html).toContain("Which files might cause a Redis connection error?");
  });
});
