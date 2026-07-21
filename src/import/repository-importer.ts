import { lstat, mkdir, mkdtemp, open, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { containsLikelySecret, filterRepositoryFile, type FileFilterLimits, type FileFilterUsage } from "../analysis/file-filter";
import { generateArchitectureDiagram } from "../analysis/architecture-diagram";
import { detectImportantFiles } from "../analysis/important-file-detector";
import { detectRepositoryTechnologies, LANGUAGE_RULES, type SafeRepositorySourceFile } from "../analysis/technology-detector";
import type { RepositoryAnalysis, RepositoryFile, RepositoryTreeNode } from "../domain/repository-analysis";
import { validatePublicGitHubUrl, type GitHubRepositoryLocation } from "./github-url";
import { nodeProcessRunner, type ProcessRunner } from "./process-runner";

export interface RepositoryImportLimits extends FileFilterLimits {
  cloneTimeoutMs: number;
  maxRepositorySizeBytes: number;
  maxRepositoryFiles: number;
}

export interface RepositoryImporterDependencies {
  processRunner: ProcessRunner;
  temporaryRoot: string;
  now: () => number;
  environment: Readonly<Record<string, string | undefined>>;
  loadRepositorySizeBytes: (location: GitHubRepositoryLocation, timeoutMs: number) => Promise<number>;
}

export interface RepositoryImportSnapshot {
  analysis: RepositoryAnalysis;
  indexedFiles: SafeRepositorySourceFile[];
}

export interface RepositorySourceFile {
  path: string;
  content: string;
}

export type RepositoryImportErrorCode =
  | "invalid-repository"
  | "import-in-progress"
  | "private-repository"
  | "repository-not-found"
  | "repository-too-large"
  | "repository-metadata-unavailable"
  | "clone-timeout"
  | "git-unavailable"
  | "clone-failed"
  | "processing-failed";

export class RepositoryImportError extends Error {
  constructor(
    public readonly code: RepositoryImportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RepositoryImportError";
  }
}

export const DEFAULT_REPOSITORY_IMPORT_LIMITS: Readonly<RepositoryImportLimits> = {
  cloneTimeoutMs: 60_000,
  maxRepositorySizeBytes: 100 * 1024 * 1024,
  maxRepositoryFiles: 20_000,
  maxFiles: 10_000,
  maxFileSizeBytes: 512 * 1024,
  maxTotalSourceSizeBytes: 50 * 1024 * 1024,
};

const MINIMUM_STALE_IMPORT_AGE_MS = 5 * 60_000;

export function createRepositoryImporter(
  dependencies: Partial<RepositoryImporterDependencies> = {},
) {
  const importSnapshot = createRepositorySnapshotImporter(dependencies);
  return async function importRepository(
    repositoryUrl: string,
    limits: Readonly<RepositoryImportLimits> = DEFAULT_REPOSITORY_IMPORT_LIMITS,
  ): Promise<RepositoryAnalysis> {
    return (await importSnapshot(repositoryUrl, limits)).analysis;
  };
}

export function createRepositorySnapshotImporter(
  dependencies: Partial<RepositoryImporterDependencies> = {},
) {
  const resolvedDependencies: RepositoryImporterDependencies = {
    processRunner: dependencies.processRunner ?? nodeProcessRunner,
    temporaryRoot: dependencies.temporaryRoot ?? path.join(os.tmpdir(), "codex-navigator-lite", "imports"),
    now: dependencies.now ?? Date.now,
    environment: dependencies.environment ?? process.env,
    loadRepositorySizeBytes: dependencies.loadRepositorySizeBytes ?? fetchPublicGitHubRepositorySizeBytes,
  };

  return async function importRepositorySnapshot(
    repositoryUrl: string,
    limits: Readonly<RepositoryImportLimits> = DEFAULT_REPOSITORY_IMPORT_LIMITS,
  ): Promise<RepositoryImportSnapshot> {
    const validation = validatePublicGitHubUrl(repositoryUrl);
    if (!validation.valid) {
      throw new RepositoryImportError("invalid-repository", validation.message);
    }

    const metadataTimeoutMs = Math.min(Math.max(1, limits.cloneTimeoutMs), 30_000);
    let reportedRepositorySizeBytes: number;
    try {
      reportedRepositorySizeBytes = await resolvedDependencies.loadRepositorySizeBytes(
        validation.location,
        metadataTimeoutMs,
      );
    } catch (error) {
      if (error instanceof RepositoryImportError) throw error;
      throw new RepositoryImportError(
        "repository-metadata-unavailable",
        "The public repository size could not be verified safely. Try again shortly.",
      );
    }
    if (!Number.isSafeInteger(reportedRepositorySizeBytes) || reportedRepositorySizeBytes < 0) {
      throw new RepositoryImportError(
        "repository-metadata-unavailable",
        "The public repository returned invalid size metadata.",
      );
    }
    if (reportedRepositorySizeBytes > limits.maxRepositorySizeBytes) {
      throw new RepositoryImportError(
        "repository-too-large",
        "The repository exceeds the configured size limit.",
      );
    }

    await cleanupExpiredImports(
      resolvedDependencies.temporaryRoot,
      Math.max(MINIMUM_STALE_IMPORT_AGE_MS, limits.cloneTimeoutMs * 2),
      resolvedDependencies.now,
    );
    await mkdir(resolvedDependencies.temporaryRoot, { recursive: true });
    const workspace = await mkdtemp(path.join(resolvedDependencies.temporaryRoot, "import-"));
    const checkoutPath = path.join(workspace, "repository");
    const emptyHooksPath = path.join(workspace, "empty-hooks");
    const emptyGitConfigPath = path.join(workspace, "empty-gitconfig");
    await mkdir(emptyHooksPath);
    await writeFile(emptyGitConfigPath, "", "utf8");

    try {
      let result;
      try {
        result = await resolvedDependencies.processRunner.run(
          "git",
          [
            "-c", `core.hooksPath=${emptyHooksPath}`,
            "-c", "credential.helper=",
            "clone",
            "--depth", "1",
            "--single-branch",
            "--no-tags",
            "--no-recurse-submodules",
            validation.location.cloneUrl,
            checkoutPath,
          ],
          {
            cwd: workspace,
            timeoutMs: limits.cloneTimeoutMs,
            env: createSafeGitEnvironment(resolvedDependencies.environment, emptyGitConfigPath),
          },
        );
      } catch (error) {
        if (isMissingExecutableError(error)) {
          throw new RepositoryImportError("git-unavailable", "Git is not installed or is unavailable on the application PATH.");
        }
        throw error;
      }

      if (result.timedOut) {
        throw new RepositoryImportError("clone-timeout", "The repository clone took too long and was stopped.");
      }
      if (result.exitCode !== 0) {
        throw classifyCloneFailure(result.stderr);
      }

      return await analyzeCheckout(checkoutPath, limits);
    } catch (error) {
      if (error instanceof RepositoryImportError) throw error;
      throw new RepositoryImportError("processing-failed", "The repository could not be processed safely.");
    } finally {
      try {
        await removeImportWorkspace(workspace);
      } catch {
        // A later import will retry cleanup through cleanupExpiredImports.
      }
    }
  };
}

export const importPublicGitHubRepository = createRepositoryImporter();

export async function analyzeRepositorySourceFiles(
  files: readonly RepositorySourceFile[],
  limits: Readonly<RepositoryImportLimits> = DEFAULT_REPOSITORY_IMPORT_LIMITS,
): Promise<RepositoryImportSnapshot> {
  const candidates: RepositoryContentCandidate[] = [];
  let totalBytes = 0;
  for (const file of files) {
    const contentBuffer = Buffer.from(file.content, "utf8");
    totalBytes += contentBuffer.byteLength;
    if (files.length > limits.maxRepositoryFiles || totalBytes > limits.maxRepositorySizeBytes) {
      throw new RepositoryImportError(
        "repository-too-large",
        "The repository exceeds the configured size or file-count limit.",
      );
    }
    candidates.push({
      path: file.path,
      sizeBytes: contentBuffer.byteLength,
      isBinary: isLikelyBinary(contentBuffer.subarray(0, 8_192)),
      readContent: async () => file.content,
    });
  }
  return analyzeContentCandidates(candidates, limits);
}

export async function cleanupExpiredImports(
  temporaryRoot: string,
  maximumAgeMs: number,
  now: () => number = Date.now,
): Promise<number> {
  let entries;
  try {
    entries = await readdir(temporaryRoot, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return 0;
    throw error;
  }

  let removed = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("import-")) continue;
    const entryPath = path.join(temporaryRoot, entry.name);
    const metadata = await stat(entryPath);
    if (now() - metadata.mtimeMs > maximumAgeMs) {
      await removeImportWorkspace(entryPath);
      removed += 1;
    }
  }
  return removed;
}

async function analyzeCheckout(
  checkoutPath: string,
  limits: Readonly<RepositoryImportLimits>,
): Promise<RepositoryImportSnapshot> {
  const diskEntries = await collectDiskEntries(checkoutPath, limits);
  const candidates: RepositoryContentCandidate[] = [];
  for (const entry of diskEntries) {
    if (entry.relativePath === ".git" || entry.relativePath.startsWith(".git/")) continue;
    const prefix = await readPrefix(entry.absolutePath, Math.min(entry.sizeBytes, 8_192));
    candidates.push({
      path: entry.relativePath,
      sizeBytes: entry.sizeBytes,
      isBinary: isLikelyBinary(prefix),
      readContent: async () => readFile(entry.absolutePath, "utf8"),
    });
  }
  return analyzeContentCandidates(candidates, limits);
}

interface RepositoryContentCandidate {
  path: string;
  sizeBytes: number;
  isBinary: boolean;
  readContent: () => Promise<string>;
}

async function analyzeContentCandidates(
  candidates: readonly RepositoryContentCandidate[],
  limits: Readonly<RepositoryImportLimits>,
): Promise<RepositoryImportSnapshot> {
  const safeFiles: SafeRepositorySourceFile[] = [];
  const repositoryFiles: RepositoryFile[] = [];
  const usage: FileFilterUsage = { acceptedFiles: 0, acceptedSourceSizeBytes: 0 };
  const skippedReasons = new Map<string, number>();

  for (const candidate of candidates) {
    const filterResult = filterRepositoryFile(
      { path: candidate.path, sizeBytes: candidate.sizeBytes, isBinary: candidate.isBinary },
      usage,
      limits,
    );
    if (!filterResult.included) {
      skippedReasons.set(filterResult.reason, (skippedReasons.get(filterResult.reason) ?? 0) + 1);
      continue;
    }

    const content = await candidate.readContent();
    if (containsLikelySecret(content)) {
      skippedReasons.set("secret-content", (skippedReasons.get("secret-content") ?? 0) + 1);
      continue;
    }
    usage.acceptedFiles += 1;
    usage.acceptedSourceSizeBytes += candidate.sizeBytes;
    safeFiles.push({ path: filterResult.normalizedPath, content });
    repositoryFiles.push(toRepositoryFile(filterResult.normalizedPath, candidate.sizeBytes, content));
  }

  const technologies = detectRepositoryTechnologies(safeFiles);
  const importantFiles = detectImportantFiles(safeFiles, technologies);
  const architecture = generateArchitectureDiagram(safeFiles, technologies, importantFiles);
  const warnings = [...skippedReasons.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([reason, count]) => `Skipped ${count} ${count === 1 ? "file" : "files"}: ${reason}.`);

  const analysis: RepositoryAnalysis = {
    files: repositoryFiles,
    tree: buildRepositoryTree(repositoryFiles),
    importantFiles,
    languages: technologies.languages,
    frameworks: technologies.frameworks,
    packageManagers: technologies.packageManagers,
    testTools: technologies.testTools,
    databaseTools: technologies.databaseTools,
    authenticationTools: technologies.authenticationTools,
    deploymentTools: technologies.deploymentTools,
    ciTools: technologies.ciTools,
    scripts: technologies.scripts,
    entryPoints: technologies.entryPoints,
    architecture,
    warnings,
  };
  return { analysis, indexedFiles: safeFiles };
}

interface DiskEntry {
  absolutePath: string;
  relativePath: string;
  sizeBytes: number;
}

async function collectDiskEntries(
  root: string,
  limits: Pick<RepositoryImportLimits, "maxRepositoryFiles" | "maxRepositorySizeBytes">,
): Promise<DiskEntry[]> {
  const entries: DiskEntry[] = [];
  let totalBytes = 0;

  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      const metadata = await lstat(absolutePath);
      if (metadata.isSymbolicLink() || metadata.isDirectory() && isWindowsReparsePoint(metadata.mode)) continue;
      if (metadata.isDirectory()) {
        await walk(absolutePath);
        continue;
      }
      if (!metadata.isFile()) continue;
      entries.push({
        absolutePath,
        relativePath: path.relative(root, absolutePath).replaceAll("\\", "/"),
        sizeBytes: metadata.size,
      });
      totalBytes += metadata.size;
      if (entries.length > limits.maxRepositoryFiles || totalBytes > limits.maxRepositorySizeBytes) {
        throw new RepositoryImportError(
          "repository-too-large",
          "The repository exceeds the configured size or file-count limit.",
        );
      }
    }
  }

  await walk(root);
  return entries;
}

async function readPrefix(filePath: string, length: number): Promise<Buffer> {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

function isLikelyBinary(buffer: Buffer): boolean {
  if (buffer.includes(0)) return true;
  if (buffer.length === 0) return false;
  let suspicious = 0;
  for (const byte of buffer) {
    if (byte < 7 || byte > 13 && byte < 32) suspicious += 1;
  }
  return suspicious / buffer.length > 0.1;
}

function toRepositoryFile(filePath: string, sizeBytes: number, content: string): RepositoryFile {
  const extension = path.posix.extname(filePath).toLowerCase() || null;
  const language = LANGUAGE_RULES.find((rule) => extension !== null && rule.extensions.includes(extension))?.name ?? null;
  return {
    path: filePath,
    sizeBytes,
    extension,
    language,
    lineCount: content.length === 0 ? 0 : content.split(/\r?\n/u).length,
  };
}

function buildRepositoryTree(files: readonly RepositoryFile[]): RepositoryTreeNode[] {
  const root: RepositoryTreeNode[] = [];
  for (const file of files) {
    const segments = file.path.split("/");
    let children = root;
    let currentPath = "";
    segments.forEach((segment, index) => {
      currentPath = currentPath === "" ? segment : `${currentPath}/${segment}`;
      const type = index === segments.length - 1 ? "file" : "directory";
      let node = children.find((candidate) => candidate.name === segment && candidate.type === type);
      if (node === undefined) {
        node = { name: segment, path: currentPath, type, ...(type === "directory" ? { children: [] } : {}) };
        children.push(node);
      }
      children = node.children ?? [];
    });
  }
  sortTree(root);
  return root;
}

function sortTree(nodes: RepositoryTreeNode[]): void {
  nodes.sort((left, right) => {
    if (left.type !== right.type) return left.type === "directory" ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
  nodes.forEach((node) => { if (node.children !== undefined) sortTree(node.children); });
}

function classifyCloneFailure(stderr: string): RepositoryImportError {
  const normalized = stderr.toLowerCase();
  if (normalized.includes("authentication failed") || normalized.includes("could not read username")) {
    return new RepositoryImportError("private-repository", "The repository appears to be private. Only public repositories are supported.");
  }
  if (normalized.includes("repository not found") || normalized.includes("not found")) {
    return new RepositoryImportError("repository-not-found", "The public repository could not be found. Check the owner and repository name.");
  }
  return new RepositoryImportError("clone-failed", "Git could not clone this repository. Confirm that it is public and reachable.");
}

function isMissingExecutableError(error: unknown): boolean {
  return isNodeError(error) && error.code === "ENOENT";
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function isWindowsReparsePoint(mode: number): boolean {
  return process.platform === "win32" && (mode & 0o160000) === 0o160000;
}

export function createSafeGitEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
  emptyGitConfigPath: string,
): NodeJS.ProcessEnv {
  const nodeEnvironment = environment.NODE_ENV;
  const safeEnvironment: NodeJS.ProcessEnv = {
    NODE_ENV: nodeEnvironment === "development" || nodeEnvironment === "test" ? nodeEnvironment : "production",
  };
  for (const [name, value] of Object.entries(environment)) {
    if (name !== "NODE_ENV" && !name.toUpperCase().startsWith("GIT_")) safeEnvironment[name] = value;
  }
  return {
    ...safeEnvironment,
    GIT_ASKPASS: "",
    GIT_CONFIG_GLOBAL: emptyGitConfigPath,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_LFS_SKIP_SMUDGE: "1",
    GIT_TERMINAL_PROMPT: "0",
  };
}

export async function fetchPublicGitHubRepositorySizeBytes(
  location: GitHubRepositoryLocation,
  timeoutMs: number,
  fetchImplementation: typeof fetch = fetch,
): Promise<number> {
  let response: Response;
  try {
    response = await fetchImplementation(
      `https://api.github.com/repos/${encodeURIComponent(location.owner)}/${encodeURIComponent(location.repository)}`,
      {
        headers: {
          accept: "application/vnd.github+json",
          "user-agent": "codex-navigator-lite",
        },
        redirect: "error",
        signal: AbortSignal.timeout(Math.min(Math.max(1, timeoutMs), 30_000)),
      },
    );
  } catch {
    throw new RepositoryImportError(
      "repository-metadata-unavailable",
      "GitHub repository metadata could not be reached safely. Try again shortly.",
    );
  }

  if (response.status === 404) {
    throw new RepositoryImportError(
      "repository-not-found",
      "The public repository could not be found. Check the owner and repository name.",
    );
  }
  if (!response.ok) {
    throw new RepositoryImportError(
      "repository-metadata-unavailable",
      "GitHub repository metadata is temporarily unavailable. Try again shortly.",
    );
  }

  const metadata: unknown = await response.json().catch(() => null);
  if (
    typeof metadata !== "object" || metadata === null || !("size" in metadata) ||
    typeof metadata.size !== "number" || !Number.isSafeInteger(metadata.size) || metadata.size < 0 ||
    metadata.size > Math.floor(Number.MAX_SAFE_INTEGER / 1024)
  ) {
    throw new RepositoryImportError(
      "repository-metadata-unavailable",
      "The public repository returned invalid size metadata.",
    );
  }
  return metadata.size * 1024;
}

async function removeImportWorkspace(workspace: string): Promise<void> {
  await rm(workspace, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
