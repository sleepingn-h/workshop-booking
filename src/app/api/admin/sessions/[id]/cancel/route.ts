import { cancelSession } from "@/lib/db";
import { jsonOk, requireAdmin, toErrorResponse } from "@/lib/http";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    requireAdmin(request);
    const { id } = await context.params;
    await cancelSession(id);
    return jsonOk({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
