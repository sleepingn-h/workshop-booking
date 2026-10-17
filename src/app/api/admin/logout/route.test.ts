import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ADMIN_COOKIE, SESSION_TTL_MS, createSessionToken } from "@/lib/auth";
import { ERROR_MESSAGE } from "@/lib/types";

import { POST } from "./route";

const now = new Date("2026-10-17T03:00:00.123Z");
const url = "https://example.test/api/admin/logout";

beforeEach(() => {
  vi.stubEnv("ADMIN_PASSWORD", "test-admin-password");
  vi.stubEnv("ADMIN_SESSION_SECRET", "test-session-secret");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("POST /api/admin/logout", () => {
  it("유효한 쿠키로 요청하면 같은 이름과 path의 쿠키를 과거로 만료시킨다", async () => {
    const request = new Request(url, {
      method: "POST",
      headers: { cookie: `${ADMIN_COOKIE}=${createSessionToken(now)}` },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    const cookie = response.headers.get("Set-Cookie");
    expect(cookie).toMatch(new RegExp(`^${ADMIN_COOKIE}=;`));
    expect(cookie).toContain("Path=/");
    const expires = cookie?.match(/Expires=([^;]+)/)?.[1];
    expect(expires).toBeDefined();
    expect(Date.parse(expires!)).toBeLessThan(now.getTime());
  });

  it.each([undefined, "theme=light", `${ADMIN_COOKIE}=invalid`])(
    "쿠키 %s가 없거나 유효하지 않으면 본문 파싱과 쿠키 변경 전에 401로 반환한다",
    async (cookie) => {
      const request = new Request(url, {
        method: "POST",
        headers: cookie ? { cookie } : undefined,
        body: "{",
      });
      const parse = vi.spyOn(request, "json");

      const response = await POST(request);

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: { code: "UNAUTHORIZED", message: ERROR_MESSAGE.UNAUTHORIZED },
      });
      expect(response.headers.get("Set-Cookie")).toBeNull();
      expect(parse).not.toHaveBeenCalled();
    },
  );

  it("만료 정각의 서명 쿠키는 로그아웃할 수 없다", async () => {
    const request = new Request(url, {
      method: "POST",
      headers: { cookie: `${ADMIN_COOKIE}=${createSessionToken(now)}` },
    });
    vi.setSystemTime(new Date(now.getTime() + SESSION_TTL_MS));

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });
});
