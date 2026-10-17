import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ADMIN_COOKIE, createSessionToken } from "@/lib/auth";
import { deleteSession, updateSession } from "@/lib/db";
import { AppError, ERROR_MESSAGE, type ErrorCode } from "@/lib/types";

import { DELETE, PATCH } from "./route";

vi.mock("@/lib/db", () => ({ deleteSession: vi.fn(), updateSession: vi.fn() }));

const deleteSessionMock = vi.mocked(deleteSession);
const updateSessionMock = vi.mocked(updateSession);
const now = new Date("2026-10-17T03:00:00.123Z");
const id = "22222222-2222-4222-8222-222222222222";
const url = `https://example.test/api/admin/sessions/${id}`;
const context = () => ({ params: Promise.resolve({ id }) });
const input = { startsAt: "2026-10-20T12:00:00+09:00", capacity: 6 };

function authenticatedRequest(method = "PATCH", body?: string): Request {
  return new Request(url, {
    method,
    headers: { cookie: `${ADMIN_COOKIE}=${createSessionToken(now)}` },
    body: method === "PATCH" ? body ?? JSON.stringify(input) : undefined,
  });
}

beforeEach(() => {
  deleteSessionMock.mockReset();
  updateSessionMock.mockReset();
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

describe("/api/admin/sessions/[id]", () => {
  describe.each([{ method: "PATCH", handler: PATCH }, { method: "DELETE", handler: DELETE }])(
    "$method 인증과 공통 오류",
    ({ method, handler }) => {
      it.each([undefined, "theme=light", `${ADMIN_COOKIE}=invalid`])(
        "쿠키 %s가 없거나 무효하면 params·본문 파싱·DB 호출 전에 401로 반환한다",
        async (cookie) => {
          const request = new Request(url, {
            method,
            headers: cookie ? { cookie } : undefined,
            body: method === "PATCH" ? "{" : undefined,
          });
          const parse = vi.spyOn(request, "json");
          const readParams = vi.fn(() => Promise.resolve({ id }));

          const response = await handler(request, { get params() { return readParams(); } });

          expect(response.status).toBe(401);
          expect(await response.json()).toEqual({
            error: { code: "UNAUTHORIZED", message: ERROR_MESSAGE.UNAUTHORIZED },
          });
          expect(parse).not.toHaveBeenCalled();
          expect(readParams).not.toHaveBeenCalled();
          expect(deleteSessionMock).not.toHaveBeenCalled();
          expect(updateSessionMock).not.toHaveBeenCalled();
        },
      );

      it("DB의 NOT_FOUND는 404로 반환한다", async () => {
        updateSessionMock.mockRejectedValue(new AppError("NOT_FOUND"));
        deleteSessionMock.mockRejectedValue(new AppError("NOT_FOUND"));

        const response = await handler(authenticatedRequest(method), context());

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: { code: "NOT_FOUND", message: ERROR_MESSAGE.NOT_FOUND } });
      });

      it("예상치 못한 DB 예외는 원인 정보 없이 500으로 반환한다", async () => {
        updateSessionMock.mockRejectedValue(new Error("Database unavailable"));
        deleteSessionMock.mockRejectedValue(new Error("Database unavailable"));

        const response = await handler(authenticatedRequest(method), context());

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({
          error: { code: "INTERNAL_ERROR", message: ERROR_MESSAGE.INTERNAL_ERROR },
        });
        expect(console.error).toHaveBeenCalledOnce();
      });
    },
  );

  it.each([{ capacity: 6 }, { startsAt: input.startsAt }, input])(
    "R-40, R-44: PATCH는 id와 수정 본문 %j를 전달하고 200으로 반환한다",
    async (body) => {
      updateSessionMock.mockResolvedValue(undefined);

      const response = await PATCH(authenticatedRequest("PATCH", JSON.stringify(body)), context());

      expect(updateSessionMock).toHaveBeenCalledExactlyOnceWith(id, body);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
    },
  );

  it.each<{ code: ErrorCode; status: number; rule: string }>([
    { code: "CAPACITY_BELOW_OCCUPIED", status: 409, rule: "R-40" },
    { code: "SESSION_HAS_BOOKINGS", status: 409, rule: "R-44" },
    { code: "VALIDATION_ERROR", status: 400, rule: "R-46" },
  ])("$rule: PATCH의 $code 오류는 HTTP $status 응답으로 반환한다", async ({ code, status }) => {
    updateSessionMock.mockRejectedValue(new AppError(code));

    const response = await PATCH(authenticatedRequest(), context());

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: { code, message: ERROR_MESSAGE[code] } });
  });

  it("R-46: PATCH 입력 검증은 DB에 맡기고 필드 오류를 400으로 전달한다", async () => {
    const fields = { capacity: "정원은 1 이상의 정수로 입력해 주세요." };
    updateSessionMock.mockRejectedValue(new AppError("VALIDATION_ERROR", undefined, fields));

    const response = await PATCH(authenticatedRequest("PATCH", "null"), context());

    expect(updateSessionMock).toHaveBeenCalledExactlyOnceWith(id, null);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: ERROR_MESSAGE.VALIDATION_ERROR, fields },
    });
  });

  it("PATCH의 잘못된 JSON은 DB 호출 없이 400으로 반환한다", async () => {
    const response = await PATCH(authenticatedRequest("PATCH", "{"), context());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: ERROR_MESSAGE.VALIDATION_ERROR },
    });
    expect(updateSessionMock).not.toHaveBeenCalled();
  });

  it("R-43: DELETE는 id를 전달하고 200으로 반환한다", async () => {
    deleteSessionMock.mockResolvedValue(undefined);

    const response = await DELETE(authenticatedRequest("DELETE"), context());

    expect(deleteSessionMock).toHaveBeenCalledExactlyOnceWith(id);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("R-41: DELETE의 SESSION_HAS_BOOKINGS는 409로 반환한다", async () => {
    deleteSessionMock.mockRejectedValue(new AppError("SESSION_HAS_BOOKINGS"));

    const response = await DELETE(authenticatedRequest("DELETE"), context());

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: { code: "SESSION_HAS_BOOKINGS", message: ERROR_MESSAGE.SESSION_HAS_BOOKINGS },
    });
  });
});
