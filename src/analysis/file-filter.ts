import path from "node:path";

export interface FileFilterLimits {
  maxFiles: number;
  maxFileSizeBytes: number;
  maxTotalSourceSizeBytes: number;
}

export interface FileFilterUsage {
  acceptedFiles: number;
  acceptedSourceSizeBytes: number;
}

export interface FileCandidate {
  path: string;
  sizeBytes: number;
  isBinary?: boolean;
}

export type FileExclusionReason =
  | "invalid-path"
  | "path-traversal"
  | "ignored-folder"
  | "secret-file"
  | "secret-content"
  | "unsupported-binary-type"
  | "binary-content"
  | "invalid-size"
  | "file-too-large"
  | "file-limit-reached"
  | "total-size-limit-reached";

export type FileFilterResult =
  | { included: true; normalizedPath: string }
  | {
      included: false;
      normalizedPath: string | null;
      reason: FileExclusionReason;
    };

export const DEFAULT_FILE_FILTER_LIMITS: Readonly<FileFilterLimits> = {
  maxFiles: 10_000,
  maxFileSizeBytes: 512 * 1024,
  maxTotalSourceSizeBytes: 50 * 1024 * 1024,
};

const IGNORED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
  "coverage",
  "vendor",
  "pods",
  "deriveddata",
  "target",
  "venv",
  ".venv",
  "__pycache__",
  "cache",
  ".cache",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
]);

const UNSUPPORTED_EXTENSIONS = new Set([
  // Images
  ".avif", ".bmp", ".gif", ".heic", ".ico", ".jpeg", ".jpg", ".png",
  ".psd", ".tif", ".tiff", ".webp",
  // Audio and video
  ".aac", ".avi", ".flac", ".m4a", ".m4v", ".mkv", ".mov", ".mp3",
  ".mp4", ".mpeg", ".mpg", ".ogg", ".wav", ".webm",
  // Archives and compressed data
  ".7z", ".bz2", ".dmg", ".gz", ".iso", ".jar", ".rar", ".tar", ".tgz",
  ".war", ".xz", ".zip",
  // Executables, compiled output, and object files
  ".a", ".app", ".bin", ".class", ".com", ".dll", ".dylib", ".exe",
  ".lib", ".msi", ".o", ".obj", ".pyc", ".pyd", ".so", ".wasm",
  // Fonts
  ".eot", ".otf", ".ttf", ".woff", ".woff2",
  // Databases
  ".db", ".db3", ".mdb", ".sqlite", ".sqlite3",
]);

const SECRET_EXTENSIONS = new Set([
  ".cer", ".crt", ".der", ".jks", ".key", ".kdbx", ".keystore", ".p12", ".p8", ".pem", ".pfx", ".ppk",
]);

const SECRET_EXACT_NAMES = new Set([
  ".netrc",
  ".npmrc",
  ".pypirc",
  "credentials",
  "credentials.json",
  "credentials.yml",
  "credentials.yaml",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
  "id_rsa",
  "secrets.json",
  "secrets.yml",
  "secrets.yaml",
]);

const SECRET_CONTENT_PATTERNS: readonly RegExp[] = [
  /-----BEGIN (?:DSA |EC |OPENSSH |PGP |RSA )?PRIVATE KEY-----/u,
  /\bgh[pousr]_[a-zA-Z0-9]{36,}\b/u,
  /\bgithub_pat_[a-zA-Z0-9_]{50,}\b/u,
  /\bAKIA[A-Z0-9]{16}\b/u,
  /\bAIza[a-zA-Z0-9_-]{35}\b/u,
  /\bsk_live_[a-zA-Z0-9]{16,}\b/u,
  /\bxox[baprs]-[a-zA-Z0-9-]{10,}\b/u,
];

export type NormalizedRepositoryPath =
  | { valid: true; path: string }
  | { valid: false; path: null; reason: "invalid-path" | "path-traversal" };

/** Converts a safe repository-relative path to forward slashes. */
export function normalizeRepositoryPath(input: string): NormalizedRepositoryPath {
  if (input.length === 0 || input.includes("\0")) {
    return { valid: false, path: null, reason: "invalid-path" };
  }

  const withForwardSlashes = input.replaceAll("\\", "/");
  if (
    withForwardSlashes.startsWith("/") ||
    withForwardSlashes.startsWith("//") ||
    /^[a-zA-Z]:\//u.test(withForwardSlashes)
  ) {
    return { valid: false, path: null, reason: "invalid-path" };
  }

  const segments = withForwardSlashes.split("/");
  if (segments.includes("..")) {
    return { valid: false, path: null, reason: "path-traversal" };
  }

  const normalized = segments.filter((segment) => segment !== "" && segment !== ".").join("/");
  if (normalized.length === 0 || normalized === ".") {
    return { valid: false, path: null, reason: "invalid-path" };
  }

  return { valid: true, path: normalized };
}

export function isPathInsideRepository(repositoryRoot: string, candidatePath: string): boolean {
  const resolvedRoot = path.resolve(repositoryRoot);
  const resolvedCandidate = path.resolve(resolvedRoot, candidatePath);
  const relative = path.relative(resolvedRoot, resolvedCandidate);

  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export function filterRepositoryFile(
  candidate: FileCandidate,
  usage: Readonly<FileFilterUsage>,
  limits: Readonly<FileFilterLimits> = DEFAULT_FILE_FILTER_LIMITS,
): FileFilterResult {
  const normalized = normalizeRepositoryPath(candidate.path);
  if (!normalized.valid) {
    return { included: false, normalizedPath: null, reason: normalized.reason };
  }

  const segments = normalized.path.toLowerCase().split("/");
  const directorySegments = segments.slice(0, -1);
  if (directorySegments.some(isIgnoredDirectory)) {
    return { included: false, normalizedPath: normalized.path, reason: "ignored-folder" };
  }

  const fileName = segments.at(-1) ?? "";
  if (isSecretFileName(fileName)) {
    return { included: false, normalizedPath: normalized.path, reason: "secret-file" };
  }

  const extension = path.posix.extname(fileName);
  if (UNSUPPORTED_EXTENSIONS.has(extension)) {
    return { included: false, normalizedPath: normalized.path, reason: "unsupported-binary-type" };
  }

  if (candidate.isBinary === true) {
    return { included: false, normalizedPath: normalized.path, reason: "binary-content" };
  }

  if (!Number.isSafeInteger(candidate.sizeBytes) || candidate.sizeBytes < 0) {
    return { included: false, normalizedPath: normalized.path, reason: "invalid-size" };
  }

  if (candidate.sizeBytes > limits.maxFileSizeBytes) {
    return { included: false, normalizedPath: normalized.path, reason: "file-too-large" };
  }

  if (usage.acceptedFiles >= limits.maxFiles) {
    return { included: false, normalizedPath: normalized.path, reason: "file-limit-reached" };
  }

  if (usage.acceptedSourceSizeBytes + candidate.sizeBytes > limits.maxTotalSourceSizeBytes) {
    return { included: false, normalizedPath: normalized.path, reason: "total-size-limit-reached" };
  }

  return { included: true, normalizedPath: normalized.path };
}

function isIgnoredDirectory(segment: string): boolean {
  return IGNORED_DIRECTORIES.has(segment) || segment.endsWith("cache") || segment.endsWith("_cache");
}

function isSecretFileName(fileName: string): boolean {
  if (fileName === ".env.example") {
    return false;
  }

  if (fileName === ".env" || fileName.startsWith(".env.")) {
    return true;
  }

  if (
    SECRET_EXACT_NAMES.has(fileName) ||
    SECRET_EXTENSIONS.has(path.posix.extname(fileName)) ||
    fileName.endsWith(".tfstate") ||
    fileName.endsWith(".tfstate.backup")
  ) {
    return true;
  }

  return (
    /^(?:credentials?|secrets?)(?:[._-]|$)/u.test(fileName) ||
    /^service[-_.]?account(?:[._-]|$)/u.test(fileName) ||
    /(?:^|[._-])private[-_.]?key(?:[._-]|$)/u.test(fileName)
  );
}

export function containsLikelySecret(content: string): boolean {
  return SECRET_CONTENT_PATTERNS.some((pattern) => pattern.test(content));
}
