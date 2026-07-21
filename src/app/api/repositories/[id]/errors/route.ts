import { investigateRepositoryError } from "../../../../../search/error-investigator";
import { getStoredRepository } from "../../../../../server/repository-store";

interface RouteContext { params: Promise<{ id: string }> }

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  const repository = getStoredRepository(id);
  if (repository === undefined) return Response.json({ error: { message: "Analysis not found or expired." } }, { status: 404 });
  const body: unknown = await request.json().catch(() => null);
  if (!isErrorRequest(body)) return Response.json({ error: { message: "Paste an error message to investigate." } }, { status: 400 });
  return Response.json(investigateRepositoryError(body.error, repository.indexedFiles, repository.analysis, repository.analysis.importantFiles));
}

function isErrorRequest(value: unknown): value is { error: string } {
  return typeof value === "object" && value !== null && "error" in value && typeof value.error === "string" && value.error.trim().length > 0 && value.error.length <= 20_000;
}
