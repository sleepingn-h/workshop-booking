import { lookupBooking } from "@/lib/db";
import { jsonOk, readJson, toErrorResponse } from "@/lib/http";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJson(request);
    return jsonOk(await lookupBooking(body));
  } catch (error) {
    return toErrorResponse(error);
  }
}
