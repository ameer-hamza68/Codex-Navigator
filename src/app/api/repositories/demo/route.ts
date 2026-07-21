import { RepositoryImportError } from "../../../../import/repository-importer";
import { importAndStoreDemoRepository, toWorkspaceResponse } from "../../../../server/repository-store";

export async function POST(): Promise<Response> {
  try {
    const repository = await importAndStoreDemoRepository();
    return Response.json(toWorkspaceResponse(repository), { status: 201 });
  } catch (error) {
    if (error instanceof RepositoryImportError) {
      const status = error.code === "import-in-progress" ? 429 : 422;
      return Response.json({ error: { code: error.code, message: error.message } }, { status });
    }
    return Response.json(
      { error: { code: "internal-error", message: "The demo repository could not be analyzed." } },
      { status: 500 },
    );
  }
}
