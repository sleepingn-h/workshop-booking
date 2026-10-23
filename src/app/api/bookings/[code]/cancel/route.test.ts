import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cancelBookingByCustomer } from "@/lib/db";
import { AppError, ERROR_MESSAGE, type BookingLookupResult, type ErrorCode } from "@/lib/types";

import { POST } from "./route";

vi.mock("@/lib/db", () => ({ cancelBookingByCustomer: vi.fn() }));

const cancelBookingMock = vi.mocked(cancelBookingByCustomer);
const code = "BK-TEST01";
const url = `https://example.test/api/bookings/${code}/cancel`;
const input = { phoneLast4: "0123" };
const context = () => ({ params: Promise.resolve({ code }) });
const result: BookingLookupResult = {
  code,
  status: "cancelled",
  headcount: 2,
  customer: { name: "가*자", phone: "010-****-0123" },
  class: { id: "10000000-0000-4000-8000-000000000001", title: "도자기 클래스", place: "가상 공방", durationMinutes: 120, price: 45000, paymentMethod: "현장 결제", materials: "없음", contact: "02-000-0000" },
  session: { startsAt: "2026-10-20T12:00:00+09:00", status: "scheduled" },
  canCancel: false,
  cancelDeadline: null,
};

beforeEach(() => {
  cancelBookingMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/bookings/[code]/cancel", () => {
  it("R-30, R-31: 비동기 params의 code와 POST 본문의 뒷자리를 전달하고 취소 결과를 200으로 반환한다", async () => {
    cancelBookingMock.mockResolvedValue(result);

    const response = await POST(new Request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }), context());

    expect(cancelBookingMock).toHaveBeenCalledExactlyOnceWith(code, input);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
  });

  it("R-30: 본문에 다른 예약번호가 있어도 경로의 code를 DB에 전달한다", async () => {
    const body = { ...input, code: "BK-OTHER1" };
    cancelBookingMock.mockResolvedValue(result);

    const response = await POST(new Request(url, { method: "POST", body: JSON.stringify(body) }), context());

    expect(response.status).toBe(200);
    expect(cancelBookingMock).toHaveBeenCalledExactlyOnceWith(code, body);
  });

  it.each<{ errorCode: ErrorCode; status: number; rule: string }>([
    { errorCode: "BOOKING_NOT_FOUND", status: 404, rule: "R-30" },
    { errorCode: "CANCEL_DEADLINE_PASSED", status: 409, rule: "R-31" },
    { errorCode: "INVALID_TRANSITION", status: 409, rule: "R-20, R-21" },
  ])("$rule: DB의 $errorCode 오류를 $status로 변환한다", async ({ errorCode, status }) => {
    cancelBookingMock.mockRejectedValue(new AppError(errorCode));

    const response = await POST(new Request(url, { method: "POST", body: JSON.stringify(input) }), context());

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({
      error: { code: errorCode, message: ERROR_MESSAGE[errorCode] },
    });
  });

  it("R-30: 취소 인증 입력 검증은 DB 함수에 맡긴다", async () => {
    cancelBookingMock.mockRejectedValue(new AppError("VALIDATION_ERROR"));

    const response = await POST(new Request(url, { method: "POST", body: "null" }), context());

    expect(cancelBookingMock).toHaveBeenCalledExactlyOnceWith(code, null);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: ERROR_MESSAGE.VALIDATION_ERROR },
    });
  });

  it("잘못된 JSON은 DB를 호출하지 않고 400으로 반환한다", async () => {
    const response = await POST(new Request(url, { method: "POST", body: "{" }), context());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: ERROR_MESSAGE.VALIDATION_ERROR },
    });
    expect(cancelBookingMock).not.toHaveBeenCalled();
  });

  it("예상치 못한 DB 예외는 원인 정보 없이 500으로 반환한다", async () => {
    cancelBookingMock.mockRejectedValue(new Error("Database unavailable"));

    const response = await POST(new Request(url, { method: "POST", body: JSON.stringify(input) }), context());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "INTERNAL_ERROR", message: ERROR_MESSAGE.INTERNAL_ERROR },
    });
    expect(console.error).toHaveBeenCalledOnce();
  });
});
