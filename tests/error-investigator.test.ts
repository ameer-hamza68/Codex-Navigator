import { describe, expect, it } from "vitest";

import { extractErrorSignals, investigateRepositoryError } from "../src/search/error-investigator";
import { detectImportantFiles } from "../src/analysis/important-file-detector";
import { detectRepositoryTechnologies } from "../src/analysis/technology-detector";

describe("extractErrorSignals", () => {
  it("extracts paths, symbols, packages, ports, and error codes", () => {
    const signals = extractErrorSignals("TypeError EADDRINUSE at startServer (src/server.ts:12) node_modules/express/index.js localhost:3000");
    expect(signals.paths).toEqual(expect.arrayContaining(["src/server.ts", "node_modules/express/index.js"]));
    expect(signals.symbols).toEqual(expect.arrayContaining(["TypeError", "startServer"]));
    expect(signals.packages).toContain("express");
    expect(signals.ports).toContain("3000");
    expect(signals.errorCodes).toEqual(expect.arrayContaining(["TypeError", "EADDRINUSE"]));
  });
});

describe("investigateRepositoryError", () => {
  it("returns ranked files, guidance, and an explicit disclaimer", () => {
    const files = [{ path: "src/server.ts", content: "export function startServer() { return 3000; }" }];
    const technologies = detectRepositoryTechnologies(files);
    const importantFiles = detectImportantFiles(files, technologies);
    const result = investigateRepositoryError("EADDRINUSE at startServer src/server.ts:12 port 3000", files, technologies, importantFiles);
    expect(result.search.results[0]?.path).toBe("src/server.ts");
    expect(result.guidance.length).toBeGreaterThan(1);
    expect(result.disclaimer).toContain("not a guaranteed root cause");
  });
});
