import { listAdminBookings } from "@/lib/db";
import { jsonOk, requireAdmin, toErrorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    requireAdmin(request);
    const params = new URL(request.url).searchParams;
    return jsonOk(await listAdminBookings({
      sessionId: params.get("sessionId") || null,
      status: params.get("status") || null,
      q: params.get("q") || null,
    }));
  } catch (error) {
    return toErrorResponse(error);
  }
}
