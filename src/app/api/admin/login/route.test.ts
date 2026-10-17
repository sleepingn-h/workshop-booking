import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ADMIN_COOKIE, SESSION_TTL_MS, createSessionToken } from "@/lib/auth";
import { ERROR_MESSAGE } from "@/lib/types";

import { POST } from "./route";

const now = new Date("2026-10-17T03:00:00.123Z");
const url = "https://example.test/api/admin/login";
const password = "test-admin-password";

beforeEach(() => {
  vi.stubEnv("ADMIN_PASSWORD", password);
  vi.stubEnv("ADMIN_SESSION_SECRET", "test-session-secret");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("POST /api/admin/login", () => {
  it("기존 쿠키 없이 올바른 비밀번호로 로그인하면 12시간 서명 쿠키를 발급한다", async () => {
    const response = await POST(new Request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    const cookie = response.headers.get("Set-Cookie");
    expect(cookie).toContain(`${ADMIN_COOKIE}=${createSessionToken(now)}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain(`Expires=${new Date(now.getTime() + SESSION_TTL_MS).toUTCString()}`);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("무효한 기존 쿠키가 있어도 비밀번호가 맞으면 로그인한다", async () => {
    const response = await POST(new Request(url, {
      method: "POST",
      headers: { cookie: `${ADMIN_COOKIE}=invalid` },
      body: JSON.stringify({ password }),
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toContain(`${ADMIN_COOKIE}=${createSessionToken(now)}`);
  });

  it.each([
    { password: "wrong-password" },
    { password: "" },
    { password: ` ${password} ` },
    { password: 1234 },
    {},
    null,
  ])("잘못된 비밀번호 입력 %j는 쿠키와 힌트 없이 401로 반환한다", async (body) => {
    const response = await POST(new Request(url, { method: "POST", body: JSON.stringify(body) }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: "UNAUTHORIZED", message: "비밀번호가 올바르지 않습니다" },
    });
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(console.error).not.toHaveBeenCalled();
  });

  it.each(["ADMIN_PASSWORD", "ADMIN_SESSION_SECRET"])(
    "%s 미설정 여부를 로그인 실패 응답에 노출하지 않는다",
    async (name) => {
      vi.stubEnv(name, "");

      const response = await POST(new Request(url, { method: "POST", body: JSON.stringify({ password }) }));

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: { code: "UNAUTHORIZED", message: "비밀번호가 올바르지 않습니다" },
      });
      expect(response.headers.get("Set-Cookie")).toBeNull();
      expect(console.error).not.toHaveBeenCalled();
    },
  );

  it("잘못된 JSON은 쿠키 없이 400으로 반환한다", async () => {
    const response = await POST(new Request(url, { method: "POST", body: "{" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: ERROR_MESSAGE.VALIDATION_ERROR },
    });
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });
});
