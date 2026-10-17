import { deleteSession, updateSession } from "@/lib/db";
import { jsonOk, readJson, requireAdmin, toErrorResponse } from "@/lib/http";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    requireAdmin(request);
    const { id } = await context.params;
    const body = await readJson(request);
    await updateSession(id, body);
    return jsonOk({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    requireAdmin(request);
    const { id } = await context.params;
    await deleteSession(id);
    return jsonOk({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
