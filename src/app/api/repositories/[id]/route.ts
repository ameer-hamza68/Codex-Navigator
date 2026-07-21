import { getStoredRepository, toWorkspaceResponse } from "../../../../server/repository-store";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  const repository = getStoredRepository(id);
  if (repository === undefined) {
    return Response.json({ error: { code: "repository-not-found", message: "This local analysis has expired or does not exist." } }, { status: 404 });
  }
  return Response.json(toWorkspaceResponse(repository));
}
