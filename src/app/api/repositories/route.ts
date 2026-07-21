import { RepositoryImportError } from "../../../import/repository-importer";
import { importAndStoreRepository, toWorkspaceResponse } from "../../../server/repository-store";

interface ImportRepositoryRequest {
  url: string;
}

interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("invalid-request", "Request body must be valid JSON.", 400);
  }
  if (!isImportRepositoryRequest(body)) {
    return errorResponse("invalid-request", "Request body must contain a repository URL.", 400);
  }

  try {
    const repository = await importAndStoreRepository(body.url);
    return Response.json(toWorkspaceResponse(repository), { status: 201 });
  } catch (error) {
    if (error instanceof RepositoryImportError) {
      const status = error.code === "invalid-repository" ? 400
        : error.code === "import-in-progress" ? 429
        : error.code === "repository-too-large" ? 413
          : error.code === "clone-timeout" ? 408
            : error.code === "repository-metadata-unavailable" ? 503
            : error.code === "private-repository" || error.code === "repository-not-found" ? 404
              : 422;
      return errorResponse(error.code, error.message, status);
    }
    return errorResponse("internal-error", "The repository could not be imported.", 500);
  }
}

function isImportRepositoryRequest(value: unknown): value is ImportRepositoryRequest {
  return typeof value === "object" && value !== null && "url" in value && typeof value.url === "string";
}

function errorResponse(code: string, message: string, status: number): Response {
  const body: ApiErrorResponse = { error: { code, message } };
  return Response.json(body, { status });
}
