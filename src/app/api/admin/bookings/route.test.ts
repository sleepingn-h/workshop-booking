import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ADMIN_COOKIE, createSessionToken } from "@/lib/auth";
import { listAdminBookings } from "@/lib/db";
import { AppError, ERROR_MESSAGE, type AdminBookingList } from "@/lib/types";

import { GET } from "./route";

vi.mock("@/lib/db", () => ({ listAdminBookings: vi.fn() }));

const listAdminBookingsMock = vi.mocked(listAdminBookings);
const now = new Date("2026-10-17T03:00:00.123Z");
const url = "https://example.test/api/admin/bookings";
const sessionId = "11111111-1111-4111-8111-111111111111";
const result: AdminBookingList = {
  bookings: [{
    id: "22222222-2222-4222-8222-222222222222",
    code: "BK-TEST01",
    status: "pending",
    headcount: 2,
    customerName: "김고객",
    phone: "01012345678",
    classTitle: "도자기 클래스",
    sessionId,
    sessionStartsAt: "2026-10-20T12:00:00+09:00",
    sessionStatus: "scheduled",
  }],
  sessions: [{
    id: sessionId,
    classTitle: "도자기 클래스",
    startsAt: "2026-10-20T12:00:00+09:00",
    status: "scheduled",
  }],
};

function authenticatedRequest(query = ""): Request {
  return new Request(`${url}${query}`, {
    headers: { cookie: `${ADMIN_COOKIE}=${createSessionToken(now)}` },
  });
}

beforeEach(() => {
  listAdminBookingsMock.mockReset();
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

describe("GET /api/admin/bookings", () => {
  it.each([undefined, "theme=light", `${ADMIN_COOKIE}=invalid`])(
    "쿠키 %s가 없거나 유효하지 않으면 쿼리 파싱·DB 호출 전에 401로 반환한다",
    async (cookie) => {
      const request = new Request(`${url}?status=invalid`, { headers: cookie ? { cookie } : undefined });
      const readUrl = vi.spyOn(request, "url", "get");

      const response = await GET(request);

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: { code: "UNAUTHORIZED", message: ERROR_MESSAGE.UNAUTHORIZED },
      });
      expect(readUrl).not.toHaveBeenCalled();
      expect(listAdminBookingsMock).not.toHaveBeenCalled();
    },
  );

  it.each(["김 고객", "010-1234-5678"])(
    "R-19: 회차·상태·검색어 %s를 전달하고 예약과 회차 선택지를 200으로 반환한다",
    async (q) => {
      listAdminBookingsMock.mockResolvedValue(result);
      const query = new URLSearchParams({ sessionId, status: "pending", q });

      const response = await GET(authenticatedRequest(`?${query}`));

      expect(listAdminBookingsMock).toHaveBeenCalledExactlyOnceWith({ sessionId, status: "pending", q });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(result);
    },
  );

  it.each(["", "?sessionId=&status=&q="])("빠진 값과 빈 문자열 쿼리 %s는 null로 전달한다", async (query) => {
    const empty: AdminBookingList = { bookings: [], sessions: [] };
    listAdminBookingsMock.mockResolvedValue(empty);

    const response = await GET(authenticatedRequest(query));

    expect(listAdminBookingsMock).toHaveBeenCalledExactlyOnceWith({ sessionId: null, status: null, q: null });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(empty);
  });

  it("필터 검증은 DB 함수에 맡기고 VALIDATION_ERROR를 400으로 반환한다", async () => {
    listAdminBookingsMock.mockRejectedValue(new AppError("VALIDATION_ERROR"));

    const response = await GET(authenticatedRequest("?status=invalid"));

    expect(listAdminBookingsMock).toHaveBeenCalledExactlyOnceWith({ sessionId: null, status: "invalid", q: null });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: ERROR_MESSAGE.VALIDATION_ERROR },
    });
  });

  it("예상치 못한 DB 예외는 원인 정보 없이 500으로 반환한다", async () => {
    listAdminBookingsMock.mockRejectedValue(new Error("Database unavailable"));

    const response = await GET(authenticatedRequest());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "INTERNAL_ERROR", message: ERROR_MESSAGE.INTERNAL_ERROR },
    });
    expect(console.error).toHaveBeenCalledOnce();
  });
});
