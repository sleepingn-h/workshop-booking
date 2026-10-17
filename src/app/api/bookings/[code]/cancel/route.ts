import { cancelBookingByCustomer } from "@/lib/db";
import { jsonOk, readJson, toErrorResponse } from "@/lib/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  try {
    const { code } = await params;
    const body = await readJson(request);
    return jsonOk(await cancelBookingByCustomer(code, body));
  } catch (error) {
    return toErrorResponse(error);
  }
}
