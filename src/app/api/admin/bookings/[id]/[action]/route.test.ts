import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ADMIN_COOKIE, createSessionToken } from "@/lib/auth";
import { changeBookingStatus } from "@/lib/db";
import { AppError, ERROR_MESSAGE, type BookingAction, type ErrorCode } from "@/lib/types";

import { POST } from "./route";

vi.mock("@/lib/db", () => ({ changeBookingStatus: vi.fn() }));

const changeBookingStatusMock = vi.mocked(changeBookingStatus);
const now = new Date("2026-10-17T03:00:00.123Z");
const id = "22222222-2222-4222-8222-222222222222";
const url = `https://example.test/api/admin/bookings/${id}`;
const context = (action: string) => ({ params: Promise.resolve({ id, action }) });

function authenticatedRequest(action = "confirm"): Request {
  return new Request(`${url}/${action}`, {
    method: "POST",
    headers: { cookie: `${ADMIN_COOKIE}=${createSessionToken(now)}` },
  });
}

beforeEach(() => {
  changeBookingStatusMock.mockReset();
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

describe("POST /api/admin/bookings/[id]/[action]", () => {
  it.each([undefined, "theme=light", `${ADMIN_COOKIE}=invalid`])(
    "쿠키 %s가 없거나 유효하지 않으면 params·본문 파싱·DB 호출 전에 401로 반환한다",
    async (cookie) => {
      const request = new Request(`${url}/approve`, {
        method: "POST",
        headers: cookie ? { cookie } : undefined,
        body: "{",
      });
      const parse = vi.spyOn(request, "json");
      const readParams = vi.fn(() => Promise.resolve({ id, action: "approve" }));

      const response = await POST(request, { get params() { return readParams(); } });

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: { code: "UNAUTHORIZED", message: ERROR_MESSAGE.UNAUTHORIZED },
      });
      expect(parse).not.toHaveBeenCalled();
      expect(readParams).not.toHaveBeenCalled();
      expect(changeBookingStatusMock).not.toHaveBeenCalled();
    },
  );

  it.each<{ action: BookingAction; rule: string }>([
    { action: "confirm", rule: "R-20, R-22" },
    { action: "reject", rule: "R-20" },
    { action: "cancel", rule: "R-20, R-32" },
  ])("$rule: $action 동작을 DB에 전달하고 200으로 반환한다", async ({ action }) => {
    changeBookingStatusMock.mockResolvedValue(undefined);

    const response = await POST(authenticatedRequest(action), context(action));

    expect(changeBookingStatusMock).toHaveBeenCalledExactlyOnceWith(id, action);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it.each(["approve", "CONFIRM", "toString"])("R-20: 허용하지 않는 동작 %s는 DB 호출 없이 404로 반환한다", async (action) => {
    const response = await POST(authenticatedRequest(action), context(action));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "NOT_FOUND", message: ERROR_MESSAGE.NOT_FOUND },
    });
    expect(changeBookingStatusMock).not.toHaveBeenCalled();
  });

  it.each<{ code: ErrorCode; status: number; rule: string }>([
    { code: "SESSION_STARTED", status: 409, rule: "R-22" },
    { code: "INVALID_TRANSITION", status: 409, rule: "R-20, R-21" },
    { code: "NOT_FOUND", status: 404, rule: "예약 없음" },
  ])("$rule: DB의 $code 오류를 $status로 반환한다", async ({ code, status }) => {
    changeBookingStatusMock.mockRejectedValue(new AppError(code));

    const response = await POST(authenticatedRequest(), context("confirm"));

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: { code, message: ERROR_MESSAGE[code] } });
  });

  it("예상치 못한 DB 예외는 원인 정보 없이 500으로 반환한다", async () => {
    changeBookingStatusMock.mockRejectedValue(new Error("Database unavailable"));

    const response = await POST(authenticatedRequest(), context("confirm"));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "INTERNAL_ERROR", message: ERROR_MESSAGE.INTERNAL_ERROR },
    });
    expect(console.error).toHaveBeenCalledOnce();
  });
});
