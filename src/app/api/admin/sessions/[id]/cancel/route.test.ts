import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ADMIN_COOKIE, createSessionToken } from "@/lib/auth";
import { cancelSession } from "@/lib/db";
import { AppError, ERROR_MESSAGE, type ErrorCode } from "@/lib/types";

import { POST } from "./route";

vi.mock("@/lib/db", () => ({ cancelSession: vi.fn() }));

const cancelSessionMock = vi.mocked(cancelSession);
const now = new Date("2026-10-17T03:00:00.123Z");
const id = "22222222-2222-4222-8222-222222222222";
const url = `https://example.test/api/admin/sessions/${id}/cancel`;
const context = () => ({ params: Promise.resolve({ id }) });

function authenticatedRequest(): Request {
  return new Request(url, {
    method: "POST",
    headers: { cookie: `${ADMIN_COOKIE}=${createSessionToken(now)}` },
  });
}

beforeEach(() => {
  cancelSessionMock.mockReset();
  vi.stubEnv("ADMIN_PASSWORD", "test-admin-password");
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

describe("POST /api/admin/sessions/[id]/cancel", () => {
  it.each([undefined, "theme=light", `${ADMIN_COOKIE}=invalid`])(
    "쿠키 %s가 없거나 무효하면 params·DB 호출 전에 401로 반환한다",
    async (cookie) => {
      const request = new Request(url, { method: "POST", headers: cookie ? { cookie } : undefined });
      const readParams = vi.fn(() => Promise.resolve({ id }));

      const response = await POST(request, { get params() { return readParams(); } });

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: { code: "UNAUTHORIZED", message: ERROR_MESSAGE.UNAUTHORIZED },
      });
      expect(readParams).not.toHaveBeenCalled();
      expect(cancelSessionMock).not.toHaveBeenCalled();
    },
  );

  it("R-42: 회차 id를 취소 DB 함수에 전달하고 200으로 반환한다", async () => {
    cancelSessionMock.mockResolvedValue(undefined);

    const response = await POST(authenticatedRequest(), context());

    expect(cancelSessionMock).toHaveBeenCalledExactlyOnceWith(id);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it.each<{ code: ErrorCode; status: number; rule: string }>([
    { code: "SESSION_CANCELLED", status: 409, rule: "R-45" },
    { code: "NOT_FOUND", status: 404, rule: "회차 없음" },
  ])("$rule: DB의 $code 오류는 HTTP $status 응답으로 반환한다", async ({ code, status }) => {
    cancelSessionMock.mockRejectedValue(new AppError(code));

    const response = await POST(authenticatedRequest(), context());

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: { code, message: ERROR_MESSAGE[code] } });
  });

  it("예상치 못한 DB 예외는 원인 정보 없이 500으로 반환한다", async () => {
    cancelSessionMock.mockRejectedValue(new Error("Database unavailable"));

    const response = await POST(authenticatedRequest(), context());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "INTERNAL_ERROR", message: ERROR_MESSAGE.INTERNAL_ERROR },
    });
    expect(console.error).toHaveBeenCalledOnce();
  });
});
