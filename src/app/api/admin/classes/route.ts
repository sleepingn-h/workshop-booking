import { createClass, listAdminClasses } from "@/lib/db";
import { jsonOk, readJson, requireAdmin, toErrorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    requireAdmin(request);
    return jsonOk({ classes: await listAdminClasses() });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    requireAdmin(request);
    const body = await readJson(request);
    return jsonOk(await createClass(body), 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
