import { NextResponse } from "next/server";

import { ADMIN_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { requireAdmin, toErrorResponse } from "@/lib/http";

export async function POST(request: Request): Promise<Response> {
  try {
    requireAdmin(request);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(ADMIN_COOKIE, "", {
      ...sessionCookieOptions(new Date()),
      expires: new Date(0),
    });
    return response;
  } catch (error) {
    return toErrorResponse(error);
  }
}
