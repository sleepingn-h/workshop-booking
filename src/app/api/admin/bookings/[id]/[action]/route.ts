import { changeBookingStatus } from "@/lib/db";
import { errorResponse, jsonOk, requireAdmin, toErrorResponse } from "@/lib/http";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; action: string }> },
): Promise<Response> {
  try {
    requireAdmin(request);
    const { id, action } = await context.params;
    if (action !== "confirm" && action !== "reject" && action !== "cancel") {
      return errorResponse("NOT_FOUND");
    }
    await changeBookingStatus(id, action);
    return jsonOk({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
