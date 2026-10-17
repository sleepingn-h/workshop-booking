import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ADMIN_COOKIE, createSessionToken } from "@/lib/auth";
import { createSession } from "@/lib/db";
import { AppError, ERROR_MESSAGE, type ErrorCode } from "@/lib/types";

import { POST } from "./route";

vi.mock("@/lib/db", () => ({ createSession: vi.fn() }));

const createSessionMock = vi.mocked(createSession);
const now = new Date("2026-10-17T03:00:00.123Z");
const id = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const url = `https://example.test/api/admin/classes/${id}/sessions`;
const context = () => ({ params: Promise.resolve({ id }) });
const input = { startsAt: "2026-10-20T12:00:00+09:00", capacity: 4 };

function authenticatedRequest(body = JSON.stringify(input)): Request {
  return new Request(url, {
    method: "POST",
    headers: { cookie: `${ADMIN_COOKIE}=${createSessionToken(now)}` },
    body,
  });
}

beforeEach(() => {
  createSessionMock.mockReset();
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

describe("POST /api/admin/classes/[id]/sessions", () => {
  it.each([undefined, "theme=light", `${ADMIN_COOKIE}=invalid`])(
    "쿠키 %s가 없거나 무효하면 params·본문 파싱·DB 호출 전에 401로 반환한다",
    async (cookie) => {
      const request = new Request(url, {
        method: "POST",
        headers: cookie ? { cookie } : undefined,
        body: "{",
      });
      const parse = vi.spyOn(request, "json");
      const readParams = vi.fn(() => Promise.resolve({ id }));

      const response = await POST(request, { get params() { return readParams(); } });

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: { code: "UNAUTHORIZED", message: ERROR_MESSAGE.UNAUTHORIZED },
      });
      expect(parse).not.toHaveBeenCalled();
      expect(readParams).not.toHaveBeenCalled();
      expect(createSessionMock).not.toHaveBeenCalled();
    },
  );

  it("R-46: 소속 클래스 id와 본문을 전달하고 회차 id를 201로 반환한다", async () => {
    createSessionMock.mockResolvedValue({ id: sessionId });

    const response = await POST(authenticatedRequest(), context());

    expect(createSessionMock).toHaveBeenCalledExactlyOnceWith(id, input);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: sessionId });
  });

  it.each<{ code: ErrorCode; status: number; rule: string }>([
    { code: "VALIDATION_ERROR", status: 400, rule: "R-46" },
    { code: "NOT_FOUND", status: 404, rule: "클래스 없음" },
  ])("$rule: DB의 $code 오류는 HTTP $status 응답으로 반환한다", async ({ code, status }) => {
    createSessionMock.mockRejectedValue(new AppError(code));

    const response = await POST(authenticatedRequest(), context());

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: { code, message: ERROR_MESSAGE[code] } });
  });

  it("R-46: 입력 검증은 DB에 맡기고 필드 오류를 400으로 전달한다", async () => {
    const fields = { startsAt: "미래 시작 시각을 입력해 주세요." };
    createSessionMock.mockRejectedValue(new AppError("VALIDATION_ERROR", undefined, fields));

    const response = await POST(authenticatedRequest("null"), context());

    expect(createSessionMock).toHaveBeenCalledExactlyOnceWith(id, null);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: ERROR_MESSAGE.VALIDATION_ERROR, fields },
    });
  });

  it("잘못된 JSON은 DB 호출 없이 400으로 반환한다", async () => {
    const response = await POST(authenticatedRequest("{"), context());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: ERROR_MESSAGE.VALIDATION_ERROR },
    });
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("예상치 못한 DB 예외는 원인 정보 없이 500으로 반환한다", async () => {
    createSessionMock.mockRejectedValue(new Error("Database unavailable"));

    const response = await POST(authenticatedRequest(), context());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "INTERNAL_ERROR", message: ERROR_MESSAGE.INTERNAL_ERROR },
    });
    expect(console.error).toHaveBeenCalledOnce();
  });
});
