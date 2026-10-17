import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "admin_session";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function createSessionToken(now: Date): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!process.env.ADMIN_PASSWORD || !secret) return "";

  const expires = now.getTime() + SESSION_TTL_MS;
  if (!Number.isSafeInteger(expires)) return "";

  const expiresAt = String(expires);
  const signature = createHmac("sha256", secret)
    .update(expiresAt)
    .digest("base64url");

  return `${expiresAt}.${signature}`;
}

export function verifySessionToken(
  token: string | undefined | null,
  now: Date,
): boolean {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!process.env.ADMIN_PASSWORD || !secret || !token) return false;

  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [expiresAt, signature] = parts;
  const expires = Number(expiresAt);
  const currentTime = now.getTime();
  if (
    !Number.isSafeInteger(expires) ||
    String(expires) !== expiresAt ||
    !Number.isFinite(currentTime) ||
    currentTime >= expires
  ) {
    return false;
  }

  const expected = Buffer.from(
    createHmac("sha256", secret).update(expiresAt).digest("base64url"),
  );
  const actual = Buffer.from(signature);

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function checkPassword(input: unknown): boolean {
  const password = process.env.ADMIN_PASSWORD;
  if (
    typeof input !== "string" ||
    !input ||
    !password ||
    !process.env.ADMIN_SESSION_SECRET
  ) {
    return false;
  }

  // 길이가 다른 입력도 같은 길이의 해시로 비교한다.
  return timingSafeEqual(
    createHash("sha256").update(input).digest(),
    createHash("sha256").update(password).digest(),
  );
}

export function isAdminRequest(request: Request, now: Date): boolean {
  const cookies = request.headers.get("cookie");
  if (!cookies) return false;

  for (const cookie of cookies.split(";")) {
    const separator = cookie.indexOf("=");
    if (separator === -1) continue;
    if (cookie.slice(0, separator).trim() !== ADMIN_COOKIE) continue;

    return verifySessionToken(cookie.slice(separator + 1).trim(), now);
  }

  return false;
}

export function sessionCookieOptions(now: Date): {
  httpOnly: true;
  secure: true;
  sameSite: "lax";
  path: "/";
  expires: Date;
} {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(now.getTime() + SESSION_TTL_MS),
  };
}
