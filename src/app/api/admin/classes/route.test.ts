import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ADMIN_COOKIE, createSessionToken } from "@/lib/auth";
import { createClass, listAdminClasses } from "@/lib/db";
import { AppError, ERROR_MESSAGE, type AdminClassSummary } from "@/lib/types";

import { GET, POST } from "./route";

vi.mock("@/lib/db", () => ({ createClass: vi.fn(), listAdminClasses: vi.fn() }));

const createClassMock = vi.mocked(createClass);
const listAdminClassesMock = vi.mocked(listAdminClasses);
const now = new Date("2026-10-17T03:00:00.123Z");
const url = "https://example.test/api/admin/classes";
const id = "11111111-1111-4111-8111-111111111111";
const input = { title: " 도자기 클래스 ", description: "장소·비용·준비물·문의 안내" };

function authenticatedRequest(method = "GET", body?: string): Request {
  return new Request(url, {
    method,
    headers: { cookie: `${ADMIN_COOKIE}=${createSessionToken(now)}` },
    body,
  });
}

beforeEach(() => {
  createClassMock.mockReset();
  listAdminClassesMock.mockReset();
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

describe("/api/admin/classes", () => {
  describe.each([{ method: "GET", handler: GET }, { method: "POST", handler: POST }])(
    "$method 인증",
    ({ method, handler }) => {
      it.each([undefined, "theme=light", `${ADMIN_COOKIE}=invalid`])(
        "쿠키 %s가 없거나 무효하면 본문 파싱·DB 호출 전에 401로 반환한다",
        async (cookie) => {
          const request = new Request(url, {
            method,
            headers: cookie ? { cookie } : undefined,
            body: method === "POST" ? "{" : undefined,
          });
          const parse = vi.spyOn(request, "json");

          const response = await handler(request);

          expect(response.status).toBe(401);
          expect(await response.json()).toEqual({
            error: { code: "UNAUTHORIZED", message: ERROR_MESSAGE.UNAUTHORIZED },
          });
          expect(parse).not.toHaveBeenCalled();
          expect(createClassMock).not.toHaveBeenCalled();
          expect(listAdminClassesMock).not.toHaveBeenCalled();
        },
      );
    },
  );

  it("R-52: GET은 공개·비공개 클래스를 classes에 담아 200으로 반환한다", async () => {
    const classes: AdminClassSummary[] = [true, false].map((isPublished) => ({
      id: isPublished ? id : "22222222-2222-4222-8222-222222222222",
      title: "도자기 클래스",
      imageUrl: null,
      isPublished,
      sessionCount: 2,
    }));
    listAdminClassesMock.mockResolvedValue(classes);

    const response = await GET(authenticatedRequest());

    expect(listAdminClassesMock).toHaveBeenCalledExactlyOnceWith();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ classes });
  });

  it("GET의 빈 목록은 200과 빈 classes로 반환한다", async () => {
    listAdminClassesMock.mockResolvedValue([]);

    const response = await GET(authenticatedRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ classes: [] });
  });

  it("R-57: POST 본문을 DB에 전달하고 생성한 id를 201로 반환한다", async () => {
    createClassMock.mockResolvedValue({ id });

    const response = await POST(authenticatedRequest("POST", JSON.stringify(input)));

    expect(createClassMock).toHaveBeenCalledExactlyOnceWith(input);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id });
  });

  it("POST 입력 검증은 DB에 맡기고 필드 오류를 400으로 전달한다", async () => {
    const fields = { title: "클래스 이름을 입력해 주세요." };
    createClassMock.mockRejectedValue(new AppError("VALIDATION_ERROR", undefined, fields));

    const response = await POST(authenticatedRequest("POST", "null"));

    expect(createClassMock).toHaveBeenCalledExactlyOnceWith(null);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: ERROR_MESSAGE.VALIDATION_ERROR, fields },
    });
  });

  it("POST의 잘못된 JSON은 DB 호출 없이 400으로 반환한다", async () => {
    const response = await POST(authenticatedRequest("POST", "{"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: ERROR_MESSAGE.VALIDATION_ERROR },
    });
    expect(createClassMock).not.toHaveBeenCalled();
  });

  it.each([{ method: "GET", handler: GET }, { method: "POST", handler: POST }])(
    "$method: 예상치 못한 DB 예외는 원인 정보 없이 500으로 반환한다",
    async ({ method, handler }) => {
      listAdminClassesMock.mockRejectedValue(new Error("Database unavailable"));
      createClassMock.mockRejectedValue(new Error("Database unavailable"));

      const response = await handler(authenticatedRequest(method, method === "POST" ? JSON.stringify(input) : undefined));

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: { code: "INTERNAL_ERROR", message: ERROR_MESSAGE.INTERNAL_ERROR },
      });
      expect(console.error).toHaveBeenCalledOnce();
    },
  );
});
