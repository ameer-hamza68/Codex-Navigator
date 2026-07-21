import { describe, expect, it } from "vitest";

import {
  containsLikelySecret,
  filterRepositoryFile,
  isPathInsideRepository,
  normalizeRepositoryPath,
  type FileFilterLimits,
  type FileFilterUsage,
} from "../src/analysis/file-filter";

const limits: FileFilterLimits = {
  maxFiles: 2,
  maxFileSizeBytes: 100,
  maxTotalSourceSizeBytes: 150,
};

const emptyUsage: FileFilterUsage = {
  acceptedFiles: 0,
  acceptedSourceSizeBytes: 0,
};

describe("filterRepositoryFile", () => {
  it("allows ordinary source files", () => {
    expect(filterRepositoryFile({ path: "src/index.ts", sizeBytes: 80 }, emptyUsage, limits)).toEqual({
      included: true,
      normalizedPath: "src/index.ts",
    });
  });

  it("allows .env.example without allowing other environment files", () => {
    expect(filterRepositoryFile({ path: ".env.example", sizeBytes: 20 }, emptyUsage, limits).included).toBe(true);
    expect(filterRepositoryFile({ path: ".env", sizeBytes: 20 }, emptyUsage, limits)).toMatchObject({
      included: false,
      reason: "secret-file",
    });
    expect(filterRepositoryFile({ path: ".env.production", sizeBytes: 20 }, emptyUsage, limits)).toMatchObject({
      included: false,
      reason: "secret-file",
    });
  });

  it.each([
    ".git/config",
    "node_modules/pkg/index.js",
    ".next/server/app.js",
    "dist/index.js",
    "build/output.js",
    "coverage/report.json",
    "vendor/library.php",
    "Pods/Library/file.swift",
    "DerivedData/App/file.swift",
    "target/classes/App.class",
    "venv/lib/site.py",
    "src/__pycache__/module.pyc",
    ".cache/tool/result.txt",
    ".pytest_cache/state.json",
  ])("ignores files in generated, dependency, and cache folder %s", (filePath) => {
    expect(filterRepositoryFile({ path: filePath, sizeBytes: 10 }, emptyUsage, limits)).toMatchObject({
      included: false,
      reason: "ignored-folder",
    });
  });

  it.each([
    "credentials.json",
    "config/secrets.yml",
    "keys/id_rsa",
    "certs/server.pem",
    "certs/signing.p8",
    "keys/client.ppk",
    "android/release.keystore",
    "terraform/production.tfstate",
    "terraform/production.tfstate.backup",
    "config/service-account.json",
    "auth/private-key.txt",
  ])("rejects likely secret file %s", (filePath) => {
    expect(filterRepositoryFile({ path: filePath, sizeBytes: 10 }, emptyUsage, limits)).toMatchObject({
      included: false,
      reason: "secret-file",
    });
  });

  it.each(["logo.png", "demo.mp4", "source.zip", "program.exe", "font.woff2", "data.sqlite3"])(
    "rejects unsupported file type %s",
    (filePath) => {
      expect(filterRepositoryFile({ path: filePath, sizeBytes: 10 }, emptyUsage, limits)).toMatchObject({
        included: false,
        reason: "unsupported-binary-type",
      });
    },
  );

  it("rejects content detected as binary", () => {
    expect(filterRepositoryFile({ path: "unknown.dat", sizeBytes: 10, isBinary: true }, emptyUsage, limits)).toMatchObject({
      included: false,
      reason: "binary-content",
    });
  });

  it("enforces individual, file-count, and total-size limits", () => {
    expect(filterRepositoryFile({ path: "large.ts", sizeBytes: 101 }, emptyUsage, limits)).toMatchObject({
      included: false,
      reason: "file-too-large",
    });
    expect(
      filterRepositoryFile({ path: "third.ts", sizeBytes: 10 }, { acceptedFiles: 2, acceptedSourceSizeBytes: 20 }, limits),
    ).toMatchObject({ included: false, reason: "file-limit-reached" });
    expect(
      filterRepositoryFile({ path: "overflow.ts", sizeBytes: 60 }, { acceptedFiles: 1, acceptedSourceSizeBytes: 100 }, limits),
    ).toMatchObject({ included: false, reason: "total-size-limit-reached" });
  });
});

describe("containsLikelySecret", () => {
  it.each([
    "-----BEGIN OPENSSH PRIVATE KEY-----",
    `github_pat_${"a".repeat(50)}`,
    "AKIAIOSFODNN7EXAMPLE",
    `sk_live_${"a".repeat(24)}`,
  ])("detects high-confidence credential content", (content) => {
    expect(containsLikelySecret(content)).toBe(true);
  });

  it("does not reject ordinary placeholders", () => {
    expect(containsLikelySecret("API_KEY=replace-me\nTOKEN=example")).toBe(false);
  });
});

describe("normalizeRepositoryPath", () => {
  it("normalizes Windows separators and redundant relative segments", () => {
    expect(normalizeRepositoryPath(".\\src\\features//auth.ts")).toEqual({
      valid: true,
      path: "src/features/auth.ts",
    });
  });

  it.each(["../outside.ts", "src/../../outside.ts", "src\\..\\secret.ts"])(
    "rejects traversal attempt %s",
    (filePath) => {
      expect(normalizeRepositoryPath(filePath)).toEqual({
        valid: false,
        path: null,
        reason: "path-traversal",
      });
    },
  );

  it.each(["/etc/passwd", "C:\\Windows\\system.ini", "\\\\server\\share\\file.ts"])(
    "rejects absolute path %s",
    (filePath) => {
      expect(normalizeRepositoryPath(filePath)).toEqual({ valid: false, path: null, reason: "invalid-path" });
    },
  );
});

describe("isPathInsideRepository", () => {
  it("accepts descendants and rejects paths outside the root", () => {
    const root = "C:\\work\\repository";
    expect(isPathInsideRepository(root, "src\\index.ts")).toBe(true);
    expect(isPathInsideRepository(root, "..\\secret.txt")).toBe(false);
  });
});
