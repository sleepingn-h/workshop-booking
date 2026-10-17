import { NextResponse, type NextRequest } from "next/server";

import { ADMIN_COOKIE, verifySessionToken } from "@/lib/auth";

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  if (pathname === "/admin/login" || pathname.startsWith("/admin/login/")) {
    return NextResponse.next();
  }

  const token = request.cookies.get(ADMIN_COOKIE)?.value;
  if (!verifySessionToken(token, new Date())) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*"] };
