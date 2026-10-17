import { NextResponse } from "next/server";

import { ADMIN_COOKIE, checkPassword, createSessionToken, sessionCookieOptions } from "@/lib/auth";
import { errorResponse, readJson, toErrorResponse } from "@/lib/http";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJson(request);
    const password = body && typeof body === "object" && "password" in body
      ? body.password
      : undefined;
    if (!checkPassword(password)) {
      return errorResponse("UNAUTHORIZED", "비밀번호가 올바르지 않습니다");
    }

    const now = new Date();
    const response = NextResponse.json({ ok: true });
    response.cookies.set(ADMIN_COOKIE, createSessionToken(now), sessionCookieOptions(now));
    return response;
  } catch (error) {
    return toErrorResponse(error);
  }
}
