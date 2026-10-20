import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ADMIN_COOKIE, createSessionToken } from "@/lib/auth";
import { deleteClass, getAdminClass, updateClass } from "@/lib/db";
import { AppError, ERROR_MESSAGE, type AdminClassDetail } from "@/lib/types";

import { DELETE, GET, PATCH } from "./route";

vi.mock("@/lib/db", () => ({ deleteClass: vi.fn(), getAdminClass: vi.fn(), updateClass: vi.fn() }));

const deleteClassMock = vi.mocked(deleteClass);
const getAdminClassMock = vi.mocked(getAdminClass);
const updateClassMock = vi.mocked(updateClass);
const now = new Date("2026-10-17T03:00:00.123Z");
const id = "11111111-1111-4111-8111-111111111111";
const url = `https://example.test/api/admin/classes/${id}`;
const context = () => ({ params: Promise.resolve({ id }) });
const input = { title: "수정한 클래스", description: "변경된 안내", isPublished: false };

function authenticatedRequest(method = "GET", body?: string): Request {
  return new Request(url, {
    method,
    headers: { cookie: `${ADMIN_COOKIE}=${createSessionToken(now)}` },
    body,
  });
}

beforeEach(() => {
  deleteClassMock.mockReset();
  getAdminClassMock.mockReset();
  updateClassMock.mockReset();
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

describe("/api/admin/classes/[id]", () => {
  describe.each([
    { method: "GET", handler: GET },
    { method: "PATCH", handler: PATCH },
    { method: "DELETE", handler: DELETE },
  ])("$method 인증과 공통 오류", ({ method, handler }) => {
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
        expect(deleteClassMock).not.toHaveBeenCalled();
        expect(getAdminClassMock).not.toHaveBeenCalled();
        expect(updateClassMock).not.toHaveBeenCalled();
      },
    );

    it("DB의 NOT_FOUND는 404로 반환한다", async () => {
      getAdminClassMock.mockRejectedValue(new AppError("NOT_FOUND"));
      updateClassMock.mockRejectedValue(new AppError("NOT_FOUND"));
      deleteClassMock.mockRejectedValue(new AppError("NOT_FOUND"));

      const response = await handler(authenticatedRequest(method, method === "PATCH" ? JSON.stringify(input) : undefined), context());

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: { code: "NOT_FOUND", message: ERROR_MESSAGE.NOT_FOUND } });
    });

    it("예상치 못한 DB 예외는 원인 정보 없이 500으로 반환한다", async () => {
      getAdminClassMock.mockRejectedValue(new Error("Database unavailable"));
      updateClassMock.mockRejectedValue(new Error("Database unavailable"));
      deleteClassMock.mockRejectedValue(new Error("Database unavailable"));

      const response = await handler(authenticatedRequest(method, method === "PATCH" ? JSON.stringify(input) : undefined), context());

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: { code: "INTERNAL_ERROR", message: ERROR_MESSAGE.INTERNAL_ERROR },
      });
      expect(console.error).toHaveBeenCalledOnce();
    });
  });

  it("R-52: GET은 비공개 클래스와 회차 상세를 200으로 반환한다", async () => {
    const result: AdminClassDetail = {
      id,
      ...input,
      imageUrl: null,
      sessions: [{
        id: "22222222-2222-4222-8222-222222222222",
        startsAt: "2026-10-20T12:00:00+09:00",
        capacity: 4,
        status: "scheduled",
        occupied: 2,
        bookingCount: 1,
        pendingCount: 1,
      }],
    };
    getAdminClassMock.mockResolvedValue(result);

    const response = await GET(authenticatedRequest(), context());

    expect(getAdminClassMock).toHaveBeenCalledExactlyOnceWith(id);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
  });

  it("R-52, R-58: PATCH는 id와 본문을 전달하고 200으로 반환한다", async () => {
    updateClassMock.mockResolvedValue(undefined);

    const response = await PATCH(authenticatedRequest("PATCH", JSON.stringify(input)), context());

    expect(updateClassMock).toHaveBeenCalledExactlyOnceWith(id, input);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("PATCH 입력 검증은 DB에 맡기고 필드 오류를 400으로 전달한다", async () => {
    const fields = { title: "클래스 이름을 입력해 주세요." };
    updateClassMock.mockRejectedValue(new AppError("VALIDATION_ERROR", undefined, fields));

    const response = await PATCH(authenticatedRequest("PATCH", "null"), context());

    expect(updateClassMock).toHaveBeenCalledExactlyOnceWith(id, null);
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
    expect(updateClassMock).not.toHaveBeenCalled();
  });

  it("R-50: DELETE는 id를 전달하고 200으로 반환한다", async () => {
    deleteClassMock.mockResolvedValue(undefined);

    const response = await DELETE(authenticatedRequest("DELETE"), context());

    expect(deleteClassMock).toHaveBeenCalledExactlyOnceWith(id);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("R-51: DELETE의 CLASS_HAS_SESSIONS는 409로 반환한다", async () => {
    deleteClassMock.mockRejectedValue(new AppError("CLASS_HAS_SESSIONS"));

    const response = await DELETE(authenticatedRequest("DELETE"), context());

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: { code: "CLASS_HAS_SESSIONS", message: ERROR_MESSAGE.CLASS_HAS_SESSIONS },
    });
  });
});
