import { createBooking } from "@/lib/db";
import { jsonOk, readJson, toErrorResponse } from "@/lib/http";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJson(request);
    return jsonOk(await createBooking(body), 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
