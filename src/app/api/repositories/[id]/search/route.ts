import { searchRepository } from "../../../../../search/repository-search";
import { getStoredRepository } from "../../../../../server/repository-store";

interface RouteContext { params: Promise<{ id: string }> }

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  const repository = getStoredRepository(id);
  if (repository === undefined) return Response.json({ error: { message: "Analysis not found or expired." } }, { status: 404 });
  const body: unknown = await request.json().catch(() => null);
  if (!isQuestionRequest(body)) return Response.json({ error: { message: "Enter a repository question." } }, { status: 400 });
  return Response.json(searchRepository(body.question, repository.indexedFiles, repository.analysis, repository.analysis.importantFiles));
}

function isQuestionRequest(value: unknown): value is { question: string } {
  return typeof value === "object" && value !== null && "question" in value && typeof value.question === "string" && value.question.trim().length > 0 && value.question.length <= 2_000;
}
