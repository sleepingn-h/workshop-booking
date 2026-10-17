import { deleteClass, getAdminClass, updateClass } from "@/lib/db";
import { jsonOk, readJson, requireAdmin, toErrorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    requireAdmin(request);
    const { id } = await context.params;
    return jsonOk(await getAdminClass(id));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    requireAdmin(request);
    const { id } = await context.params;
    const body = await readJson(request);
    await updateClass(id, body);
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
    await deleteClass(id);
    return jsonOk({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
