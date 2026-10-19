import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ADMIN_COOKIE, SESSION_TTL_MS, createSessionToken } from "./auth";
import { errorResponse, jsonOk, readJson, requireAdmin, toErrorResponse } from "./http";
import { AppError, ERROR_MESSAGE, type ErrorCode } from "./types";

const now = new Date("2026-10-17T03:00:00.123Z");
const url = "https://example.test/api/bookings";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("jsonOk", () => {
  it("기본 200 상태와 JSON 본문을 반환한다", async () => {
    const data = { code: "BK-TEST01", status: "pending" };

    const response = jsonOk(data);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(await response.json()).toEqual(data);
  });

  it("R-10: 지정한 201 상태와 신청 결과를 반환한다", async () => {
    const data = { code: "BK-TEST01", status: "pending" };

    const response = jsonOk(data, 201);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(data);
  });
});

describe("errorResponse", () => {
  it("R-11: 코드에 대응하는 기본 HTTP 상태와 메시지를 반환한다", async () => {
    const response = errorResponse("SESSION_FULL");

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: { code: "SESSION_FULL", message: ERROR_MESSAGE.SESSION_FULL },
    });
  });

  it("명시한 메시지와 상태를 기본값보다 우선한다", async () => {
    const response = errorResponse("VALIDATION_ERROR", "입력 형식을 확인해 주세요.", 422);

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: "입력 형식을 확인해 주세요." },
    });
  });
});

describe("toErrorResponse", () => {
  const cases: { code: ErrorCode; status: number; rule: string }[] = [
    { code: "VALIDATION_ERROR", status: 400, rule: "입력 검증" },
    { code: "INVALID_HEADCOUNT", status: 400, rule: "R-12" },
    { code: "UNAUTHORIZED", status: 401, rule: "운영자 인증" },
    { code: "NOT_FOUND", status: 404, rule: "R-52" },
    { code: "BOOKING_NOT_FOUND", status: 404, rule: "R-30" },
    { code: "SESSION_FULL", status: 409, rule: "R-11" },
    { code: "SESSION_CANCELLED", status: 409, rule: "R-13, R-45" },
    { code: "SESSION_STARTED", status: 409, rule: "R-14, R-22" },
    { code: "DUPLICATE_BOOKING", status: 409, rule: "R-16" },
    { code: "INVALID_TRANSITION", status: 409, rule: "R-20, R-21" },
    { code: "CANCEL_DEADLINE_PASSED", status: 409, rule: "R-31" },
    { code: "CAPACITY_BELOW_OCCUPIED", status: 409, rule: "R-40" },
    { code: "SESSION_HAS_BOOKINGS", status: 409, rule: "R-41, R-44" },
    { code: "CLASS_HAS_SESSIONS", status: 409, rule: "R-51" },
    { code: "MOCK_READ_ONLY", status: 503, rule: "목 모드 변경 거부" },
    { code: "INTERNAL_ERROR", status: 500, rule: "서버 오류" },
  ];

  it.each(cases)("$rule: $code AppError를 $status 응답으로 변환한다", async ({ code, status }) => {
    const response = toErrorResponse(new AppError(code));

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: { code, message: ERROR_MESSAGE[code] } });
    expect(console.error).not.toHaveBeenCalled();
  });

  it("AppError의 사용자 안내와 필드 오류를 error.fields로 전달한다", async () => {
    const fields = { customerName: "이름을 입력해 주세요.", phone: "전화번호를 확인해 주세요." };

    const response = toErrorResponse(new AppError("VALIDATION_ERROR", "입력을 확인해 주세요.", fields));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: "입력을 확인해 주세요.", fields },
    });
  });

  it("예상치 못한 Error는 500으로 숨기고 메시지·스택만 기록한다", async () => {
    const error = Object.assign(new Error("Database connection failed"), {
      body: { phone: "01000009999" },
      env: { ADMIN_PASSWORD: "private-password" },
      cause: { SUPABASE_SERVICE_ROLE_KEY: "private-key" },
    });

    const response = toErrorResponse(error);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "INTERNAL_ERROR", message: ERROR_MESSAGE.INTERNAL_ERROR },
    });
    expect(console.error).toHaveBeenCalledExactlyOnceWith({
      message: error.message,
      stack: error.stack,
    });
  });

  it.each([
    null,
    undefined,
    "01000009999 private-password",
    { message: "unexpected", body: { phone: "01000009999" }, env: { ADMIN_PASSWORD: "private-password" } },
  ])("Error가 아닌 예외 %j도 원본 값을 기록하지 않고 500으로 변환한다", async (error) => {
    const response = toErrorResponse(error);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "INTERNAL_ERROR", message: ERROR_MESSAGE.INTERNAL_ERROR },
    });
    expect(console.error).toHaveBeenCalledExactlyOnceWith({ message: "Unknown error" });
  });
});

describe("readJson", () => {
  it.each([{ phoneLast4: "0123" }, [1, 2], null, false, 0, "text"])(
    "JSON %j를 검증하거나 변형하지 않고 파싱한다",
    async (body) => {
      const request = new Request(url, { method: "POST", body: JSON.stringify(body) });

      await expect(readJson(request)).resolves.toEqual(body);
    },
  );

  it.each(["", "{", "not-json"])("잘못된 JSON %j는 VALIDATION_ERROR로 변환한다", async (body) => {
    const error = await readJson(new Request(url, { method: "POST", body })).catch((error: unknown) => error);

    expect(error).toBeInstanceOf(AppError);
    const response = toErrorResponse(error);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: ERROR_MESSAGE.VALIDATION_ERROR },
    });
    expect(console.error).not.toHaveBeenCalled();
  });
});

describe("requireAdmin", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_PASSWORD", "test-admin-password");
    vi.stubEnv("ADMIN_SESSION_SECRET", "test-session-secret");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
  });

  it("실제 서명으로 발급한 유효 쿠키를 허용한다", () => {
    const request = new Request(url, {
      headers: { cookie: `${ADMIN_COOKIE}=${createSessionToken(now)}` },
    });

    expect(requireAdmin(request)).toBeUndefined();
  });

  it.each([undefined, "theme=light", `${ADMIN_COOKIE}=invalid`])(
    "쿠키 %s가 없거나 유효하지 않으면 UNAUTHORIZED를 던진다",
    (cookie) => {
      const request = new Request(url, { headers: cookie ? { cookie } : undefined });

      expect(() => requireAdmin(request)).toThrow(AppError);
      expect(() => requireAdmin(request)).toThrow(expect.objectContaining({ code: "UNAUTHORIZED" }));
    },
  );

  it("만료 정각의 서명 쿠키를 거부한다", () => {
    const request = new Request(url, {
      headers: { cookie: `${ADMIN_COOKIE}=${createSessionToken(now)}` },
    });
    vi.setSystemTime(new Date(now.getTime() + SESSION_TTL_MS));

    expect(() => requireAdmin(request)).toThrow(expect.objectContaining({ code: "UNAUTHORIZED" }));
  });
});
