import { randomUUID } from "node:crypto";

import { DEMO_REPOSITORY } from "../demo/demo-repository-fixture";
import type { RepositoryAnalysis } from "../domain/repository-analysis";
import { validatePublicGitHubUrl } from "../import/github-url";
import {
  analyzeRepositorySourceFiles,
  createRepositorySnapshotImporter,
  RepositoryImportError,
  type RepositoryImportSnapshot,
} from "../import/repository-importer";

export interface StoredRepository {
  id: string;
  sourceType: "github" | "demo";
  sourceUrl: string | null;
  owner: string;
  name: string;
  createdAt: string;
  analysis: RepositoryAnalysis;
  indexedFiles: RepositoryImportSnapshot["indexedFiles"];
}

export interface RepositoryWorkspaceResponse {
  repository: {
    id: string;
    sourceType: "github" | "demo";
    sourceUrl: string | null;
    owner: string;
    name: string;
    createdAt: string;
  };
  analysis: RepositoryAnalysis;
}

const MAX_STORED_REPOSITORIES = 5;
const STORE_TTL_MS = 6 * 60 * 60 * 1_000;

export interface RepositoryStoreState {
  repositories: Map<string, StoredRepository>;
  importSnapshot: ReturnType<typeof createRepositorySnapshotImporter>;
  importInProgress: boolean;
}

export const REPOSITORY_STORE_GLOBAL_KEY = "__codexNavigatorLiteRepositoryStoreV2" as const;

type RepositoryStoreGlobal = typeof globalThis & {
  [REPOSITORY_STORE_GLOBAL_KEY]?: RepositoryStoreState;
};

const repositoryStoreGlobal = globalThis as RepositoryStoreGlobal;
const storeState = repositoryStoreGlobal[REPOSITORY_STORE_GLOBAL_KEY] ?? {
  repositories: new Map<string, StoredRepository>(),
  importSnapshot: createRepositorySnapshotImporter(),
  importInProgress: false,
};
repositoryStoreGlobal[REPOSITORY_STORE_GLOBAL_KEY] = storeState;
const { repositories } = storeState;

export async function importAndStoreRepository(sourceUrl: string): Promise<StoredRepository> {
  removeExpiredRepositories();
  const validation = validatePublicGitHubUrl(sourceUrl);
  if (!validation.valid) throw new RepositoryImportError("invalid-repository", validation.message);
  return runExclusiveImport(async () => {
    const snapshot = await storeState.importSnapshot(sourceUrl);
    return storeSnapshot({
      sourceType: "github",
      sourceUrl: validation.location.cloneUrl.replace(/\.git$/u, ""),
      owner: validation.location.owner,
      name: validation.location.repository,
    }, snapshot);
  });
}

export async function importAndStoreDemoRepository(): Promise<StoredRepository> {
  removeExpiredRepositories();
  return runExclusiveImport(async () => {
    const snapshot = await analyzeRepositorySourceFiles(DEMO_REPOSITORY.files);
    return storeSnapshot({
      sourceType: "demo",
      sourceUrl: null,
      owner: "Demo Repository",
      name: "TaskFlow",
    }, snapshot);
  });
}

async function runExclusiveImport<T>(work: () => Promise<T>): Promise<T> {
  if (storeState.importInProgress) {
    throw new RepositoryImportError(
      "import-in-progress",
      "Another repository import is already running. Wait for it to finish and try again.",
    );
  }

  storeState.importInProgress = true;
  try {
    return await work();
  } finally {
    storeState.importInProgress = false;
  }
}

function storeSnapshot(
  metadata: Pick<StoredRepository, "sourceType" | "sourceUrl" | "owner" | "name">,
  snapshot: RepositoryImportSnapshot,
): StoredRepository {
  const record: StoredRepository = {
    id: randomUUID(),
    ...metadata,
    createdAt: new Date().toISOString(),
    analysis: snapshot.analysis,
    indexedFiles: snapshot.indexedFiles,
  };
  repositories.set(record.id, record);
  trimStore();
  return record;
}

export function getStoredRepository(id: string): StoredRepository | undefined {
  removeExpiredRepositories();
  return repositories.get(id);
}

export function toWorkspaceResponse(record: StoredRepository): RepositoryWorkspaceResponse {
  return {
    repository: {
      id: record.id,
      sourceType: record.sourceType,
      sourceUrl: record.sourceUrl,
      owner: record.owner,
      name: record.name,
      createdAt: record.createdAt,
    },
    analysis: record.analysis,
  };
}

function removeExpiredRepositories(now = Date.now()): void {
  for (const [id, repository] of repositories) {
    if (now - Date.parse(repository.createdAt) > STORE_TTL_MS) repositories.delete(id);
  }
}

function trimStore(): void {
  while (repositories.size > MAX_STORED_REPOSITORIES) {
    const oldestId = repositories.keys().next().value as string | undefined;
    if (oldestId === undefined) return;
    repositories.delete(oldestId);
  }
}
