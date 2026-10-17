import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ADMIN_COOKIE, SESSION_TTL_MS, createSessionToken } from "@/lib/auth";

import { config, proxy } from "./proxy";

const now = new Date("2026-10-17T03:00:00.123Z");
const origin = "https://example.test";

beforeEach(() => {
  vi.stubEnv("ADMIN_PASSWORD", "test-admin-password");
  vi.stubEnv("ADMIN_SESSION_SECRET", "test-session-secret");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("운영자 페이지 proxy", () => {
  it.each(["/admin", "/admin/classes/abc", "/admin/login-extra"])(
    "%s 경로는 쿠키가 없으면 로그인으로 이동한다",
    (pathname) => {
      const response = proxy(new NextRequest(`${origin}${pathname}`));

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(`${origin}/admin/login`);
    },
  );

  it("다른 쿠키만 있으면 로그인으로 이동한다", () => {
    const request = new NextRequest(`${origin}/admin`, {
      headers: { cookie: "theme=light" },
    });

    const response = proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${origin}/admin/login`);
  });

  it("변조된 세션 쿠키는 로그인으로 이동한다", () => {
    const [expires, signature] = createSessionToken(now).split(".");
    const changed = signature[0] === "A" ? "B" : "A";
    const request = new NextRequest(`${origin}/admin`, {
      headers: {
        cookie: `${ADMIN_COOKIE}=${expires}.${changed}${signature.slice(1)}`,
      },
    });

    const response = proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${origin}/admin/login`);
  });

  it.each([
    { label: "만료 정각", elapsed: SESSION_TTL_MS },
    { label: "만료 이후", elapsed: SESSION_TTL_MS + 1 },
  ])("$label 세션 쿠키는 로그인으로 이동한다", ({ elapsed }) => {
    const request = new NextRequest(`${origin}/admin`, {
      headers: { cookie: `${ADMIN_COOKIE}=${createSessionToken(now)}` },
    });
    vi.setSystemTime(new Date(now.getTime() + elapsed));

    const response = proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${origin}/admin/login`);
  });

  it.each(["/admin", "/admin/classes/abc"])(
    "%s 경로는 유효한 세션 쿠키가 있으면 통과한다",
    (pathname) => {
      const request = new NextRequest(`${origin}${pathname}`, {
        headers: {
          cookie: `theme=light; ${ADMIN_COOKIE}=${createSessionToken(now)}`,
        },
      });

      const response = proxy(request);

      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.get("location")).toBeNull();
    },
  );

  it.each(["/admin/login", "/admin/login/", "/admin/login/help"])(
    "%s 경로는 쿠키가 없어도 통과한다",
    (pathname) => {
      const response = proxy(new NextRequest(`${origin}${pathname}`));

      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.get("location")).toBeNull();
    },
  );

  it("로그인 경로는 무효한 세션 쿠키가 있어도 통과한다", () => {
    const request = new NextRequest(`${origin}/admin/login`, {
      headers: { cookie: `${ADMIN_COOKIE}=invalid` },
    });

    const response = proxy(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
  });

  it("matcher는 /admin 이하만 보호하고 /api를 포함하지 않는다", () => {
    expect(config.matcher).toEqual(["/admin/:path*"]);
    expect(config.matcher.some((path) => path.includes("/api"))).toBe(false);
  });
});
