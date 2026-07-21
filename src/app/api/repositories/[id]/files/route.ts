import { getStoredRepository } from "../../../../../server/repository-store";

interface RouteContext { params: Promise<{ id: string }> }

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  const repository = getStoredRepository(id);
  if (repository === undefined) return Response.json({ error: { message: "Analysis not found or expired." } }, { status: 404 });
  const requestedPath = new URL(request.url).searchParams.get("path");
  if (requestedPath === null) return Response.json({ error: { message: "A file path is required." } }, { status: 400 });
  const file = repository.indexedFiles.find((candidate) => candidate.path === requestedPath);
  if (file === undefined) return Response.json({ error: { message: "Safe indexed file not found." } }, { status: 404 });
  const lines = file.content.split(/\r?\n/u).slice(0, 120).map((text, index) => ({ number: index + 1, text }));
  return Response.json({ path: file.path, lines, truncated: file.content.split(/\r?\n/u).length > 120 });
}
