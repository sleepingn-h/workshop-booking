import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { lookupBooking } from "@/lib/db";
import { AppError, ERROR_MESSAGE, type BookingLookupResult } from "@/lib/types";

import { POST } from "./route";

vi.mock("@/lib/db", () => ({ lookupBooking: vi.fn() }));

const lookupBookingMock = vi.mocked(lookupBooking);
const url = "https://example.test/api/bookings/lookup";
const input = { code: "BK-TEST01", phoneLast4: "0123" };
const result: BookingLookupResult = {
  code: input.code,
  status: "confirmed",
  headcount: 2,
  customer: { name: "가*자", phone: "010-****-0123" },
  class: { id: "10000000-0000-4000-8000-000000000001", title: "도자기 클래스", place: "가상 공방", durationMinutes: 120, price: 45000, paymentMethod: "현장 결제", materials: "없음", contact: "02-000-0000" },
  session: { startsAt: "2026-10-20T12:00:00+09:00", status: "scheduled" },
  canCancel: true,
  cancelDeadline: "2026-10-19T12:00:00+09:00",
};

beforeEach(() => {
  lookupBookingMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/bookings/lookup", () => {
  it("R-30, R-31: POST 본문의 예약번호·뒷자리를 전달하고 조회 결과를 200으로 반환한다", async () => {
    lookupBookingMock.mockResolvedValue(result);

    const response = await POST(new Request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }));

    expect(lookupBookingMock).toHaveBeenCalledExactlyOnceWith(input);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
  });

  it("R-30: BOOKING_NOT_FOUND는 상태·기한 정보 없이 동일한 404로 반환한다", async () => {
    lookupBookingMock.mockRejectedValue(new AppError("BOOKING_NOT_FOUND"));

    const response = await POST(new Request(url, { method: "POST", body: JSON.stringify(input) }));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "BOOKING_NOT_FOUND", message: ERROR_MESSAGE.BOOKING_NOT_FOUND },
    });
  });

  it("R-30: 조회 입력 검증은 DB 함수에 맡긴다", async () => {
    lookupBookingMock.mockRejectedValue(new AppError("VALIDATION_ERROR"));

    const response = await POST(new Request(url, { method: "POST", body: "null" }));

    expect(lookupBookingMock).toHaveBeenCalledExactlyOnceWith(null);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: ERROR_MESSAGE.VALIDATION_ERROR },
    });
  });

  it("잘못된 JSON은 DB를 호출하지 않고 400으로 반환한다", async () => {
    const response = await POST(new Request(url, { method: "POST", body: "not-json" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: ERROR_MESSAGE.VALIDATION_ERROR },
    });
    expect(lookupBookingMock).not.toHaveBeenCalled();
  });

  it("예상치 못한 DB 예외는 원인 정보 없이 500으로 반환한다", async () => {
    lookupBookingMock.mockRejectedValue(new Error("Database unavailable"));

    const response = await POST(new Request(url, { method: "POST", body: JSON.stringify(input) }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "INTERNAL_ERROR", message: ERROR_MESSAGE.INTERNAL_ERROR },
    });
    expect(console.error).toHaveBeenCalledOnce();
  });
});
