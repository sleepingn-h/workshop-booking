import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createBooking } from "@/lib/db";
import { AppError, ERROR_MESSAGE, type CreateBookingResult, type ErrorCode } from "@/lib/types";

import { POST } from "./route";

vi.mock("@/lib/db", () => ({ createBooking: vi.fn() }));

const createBookingMock = vi.mocked(createBooking);
const url = "https://example.test/api/bookings";
const input = {
  sessionId: "11111111-1111-4111-8111-111111111111",
  headcount: 2,
  customerName: " 김고객 ",
  phone: "010-1234-5678",
};

beforeEach(() => {
  createBookingMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/bookings", () => {
  it("R-10: 본문을 그대로 DB 함수에 전달하고 승인 대기 예약번호를 201로 반환한다", async () => {
    const result: CreateBookingResult = { code: "BK-TEST01", status: "pending" };
    createBookingMock.mockResolvedValue(result);

    const response = await POST(new Request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }));

    expect(createBookingMock).toHaveBeenCalledExactlyOnceWith(input);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(result);
  });

  it.each<{ code: ErrorCode; status: number; rule: string }>([
    { code: "SESSION_FULL", status: 409, rule: "R-11" },
    { code: "INVALID_HEADCOUNT", status: 400, rule: "R-12" },
    { code: "DUPLICATE_BOOKING", status: 409, rule: "R-16" },
    { code: "NOT_FOUND", status: 404, rule: "R-52" },
    { code: "MOCK_READ_ONLY", status: 503, rule: "목 모드 변경 거부" },
  ])("$rule: DB의 $code 오류를 $status로 변환한다", async ({ code, status }) => {
    createBookingMock.mockRejectedValue(new AppError(code));

    const response = await POST(new Request(url, { method: "POST", body: JSON.stringify(input) }));

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: { code, message: ERROR_MESSAGE[code] } });
  });

  it("입력 검증은 DB 함수에 맡기고 필드 오류를 전달한다", async () => {
    const fields = { customerName: "이름을 입력해 주세요." };
    createBookingMock.mockRejectedValue(new AppError("VALIDATION_ERROR", undefined, fields));

    const response = await POST(new Request(url, { method: "POST", body: "null" }));

    expect(createBookingMock).toHaveBeenCalledExactlyOnceWith(null);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: ERROR_MESSAGE.VALIDATION_ERROR, fields },
    });
  });

  it("잘못된 JSON은 DB를 호출하지 않고 400으로 반환한다", async () => {
    const response = await POST(new Request(url, { method: "POST", body: "{" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: ERROR_MESSAGE.VALIDATION_ERROR },
    });
    expect(createBookingMock).not.toHaveBeenCalled();
  });

  it("예상치 못한 DB 예외는 원인 정보 없이 500으로 반환한다", async () => {
    createBookingMock.mockRejectedValue(new Error("Database unavailable"));

    const response = await POST(new Request(url, { method: "POST", body: JSON.stringify(input) }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "INTERNAL_ERROR", message: ERROR_MESSAGE.INTERNAL_ERROR },
    });
    expect(console.error).toHaveBeenCalledOnce();
  });
});
