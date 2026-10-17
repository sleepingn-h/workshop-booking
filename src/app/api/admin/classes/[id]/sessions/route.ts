import { createSession } from "@/lib/db";
import { jsonOk, readJson, requireAdmin, toErrorResponse } from "@/lib/http";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    requireAdmin(request);
    const { id } = await context.params;
    const body = await readJson(request);
    return jsonOk(await createSession(id, body), 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
