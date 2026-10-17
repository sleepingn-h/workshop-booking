import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiFetch, type ClientErrorCode } from "./api";
import { ERROR_MESSAGE } from "./types";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ApiError", () => {
  it("Error를 상속하고 code·message·status를 보존한다", () => {
    const code: ClientErrorCode = "NETWORK_ERROR";
    const error = new ApiError(code, "네트워크 연결을 확인해 주세요.", 0);

    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe(code);
    expect(error.message).toBe("네트워크 연결을 확인해 주세요.");
    expect(error.status).toBe(0);
  });
});

describe("apiFetch 요청", () => {
  it("옵션 없이 호출하면 동일 출처 쿠키와 함께 요청하고 JSON을 반환한다", async () => {
    const data = { bookings: [], sessions: [] };
    fetchMock.mockResolvedValue(Response.json(data));

    const result = await apiFetch<typeof data>("/api/admin/bookings");

    expect(result).toEqual(data);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "/api/admin/bookings",
      expect.objectContaining({ credentials: "same-origin" }),
    );
    const request = fetchMock.mock.calls[0][1]!;
    expect(new Headers(request.headers).has("Content-Type")).toBe(false);
    expect(request.body).toBeUndefined();
  });

  it("json을 직렬화하고 JSON 헤더를 설정하며 기존 요청 옵션을 유지한다", async () => {
    const json = { sessionId: "session-1", headcount: 2 };
    const controller = new AbortController();
    const headers = new Headers({
      "Content-Type": "text/plain",
      "X-Request-Id": "request-1",
    });
    fetchMock.mockResolvedValue(Response.json({ code: "BK-TEST01" }, { status: 201 }));

    await apiFetch("/api/bookings", {
      method: "POST",
      json,
      headers,
      signal: controller.signal,
      cache: "no-store",
    });

    const request = fetchMock.mock.calls[0][1]!;
    expect(request).toMatchObject({
      method: "POST",
      body: JSON.stringify(json),
      credentials: "same-origin",
      signal: controller.signal,
      cache: "no-store",
    });
    expect(request).not.toHaveProperty("json");
    const sentHeaders = new Headers(request.headers);
    expect(sentHeaders.get("Content-Type")).toBe("application/json");
    expect(sentHeaders.get("X-Request-Id")).toBe("request-1");
    expect(headers.get("Content-Type")).toBe("text/plain");
  });

  it.each([null, false, 0, ""])("json이 %j여도 JSON 본문으로 전송한다", async (json) => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await apiFetch("/api/bookings", { method: "POST", json });

    const request = fetchMock.mock.calls[0][1]!;
    expect(request.body).toBe(JSON.stringify(json));
    expect(new Headers(request.headers).get("Content-Type")).toBe("application/json");
  });

  it.each([undefined, { "Content-Type": "multipart/form-data" }])(
    "FormData는 그대로 보내고 브라우저가 Content-Type을 정하게 한다 (headers: %j)",
    async (headers) => {
      const body = new FormData();
      body.append("image", new File(["image"], "class.png", { type: "image/png" }));
      fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

      await apiFetch("/api/admin/classes/class-1/image", {
        method: "PUT",
        body,
        headers,
      });

      const request = fetchMock.mock.calls[0][1]!;
      expect(request.body).toBe(body);
      expect(new Headers(request.headers).has("Content-Type")).toBe(false);
      expect(request.credentials).toBe("same-origin");
    },
  );

  it("json이 없으면 일반 body와 호출자가 지정한 헤더를 유지한다", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await apiFetch("/api/bookings", {
      method: "POST",
      body: "request-body",
      headers: [["Content-Type", "text/plain"]],
    });

    const request = fetchMock.mock.calls[0][1]!;
    expect(request.body).toBe("request-body");
    expect(new Headers(request.headers).get("Content-Type")).toBe("text/plain");
  });

  it("호출자의 credentials 옵션과 관계없이 same-origin으로 전송한다", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await apiFetch("/api/admin/logout", { method: "POST", credentials: "omit" });

    expect(fetchMock.mock.calls[0][1]?.credentials).toBe("same-origin");
  });
});

describe("apiFetch 응답", () => {
  it("201 응답의 JSON을 반환한다", async () => {
    const data = { code: "BK-TEST01", status: "pending" };
    fetchMock.mockResolvedValue(Response.json(data, { status: 201 }));

    await expect(apiFetch("/api/bookings", { method: "POST" })).resolves.toEqual(data);
  });

  it("204 응답은 undefined를 반환한다", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(apiFetch<void>("/api/admin/logout", { method: "POST" })).resolves.toBeUndefined();
  });

  it("200 응답의 본문이 비어 있으면 undefined를 반환한다", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 200 }));

    await expect(apiFetch<void>("/api/admin/logout", { method: "POST" })).resolves.toBeUndefined();
  });

  it("JSON null 응답은 undefined 대신 null을 반환한다", async () => {
    fetchMock.mockResolvedValue(Response.json(null));

    await expect(apiFetch<null>("/api/admin/bookings")).resolves.toBeNull();
  });

  it("비 2xx의 error를 ApiError로 바꾸고 서버 메시지와 HTTP 상태를 보존한다", async () => {
    const message = "예약자 이름을 입력해 주세요.";
    fetchMock.mockResolvedValue(Response.json(
      { error: { code: "VALIDATION_ERROR", message } },
      { status: 400 },
    ));

    const error = await apiFetch("/api/bookings", { method: "POST" }).catch((error: unknown) => error);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "VALIDATION_ERROR", message, status: 400 });
  });

  it("R-11: 409 SESSION_FULL을 해당 code·message·status의 ApiError로 변환한다", async () => {
    fetchMock.mockResolvedValue(Response.json(
      { error: { code: "SESSION_FULL", message: ERROR_MESSAGE.SESSION_FULL } },
      { status: 409 },
    ));

    const error = await apiFetch("/api/bookings", { method: "POST" }).catch((error: unknown) => error);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: "SESSION_FULL",
      message: ERROR_MESSAGE.SESSION_FULL,
      status: 409,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    { label: "HTML", body: "<html>Bad Gateway</html>" },
    { label: "깨진 JSON", body: '{"error":' },
    { label: "빈 본문", body: "" },
    { label: "null", body: "null" },
    { label: "error 누락", body: "{}" },
    { label: "error가 null", body: '{"error":null}' },
    { label: "code 누락", body: '{"error":{"message":"상세 오류"}}' },
    { label: "message 누락", body: '{"error":{"code":"INTERNAL_ERROR"}}' },
    { label: "숫자 message", body: '{"error":{"code":"INTERNAL_ERROR","message":500}}' },
    { label: "알 수 없는 code", body: '{"error":{"code":"UNKNOWN","message":"상세 오류"}}' },
    { label: "객체 프로토타입 이름 code", body: '{"error":{"code":"toString","message":"상세 오류"}}' },
  ])("비 2xx의 $label 본문은 INTERNAL_ERROR로 변환한다", async ({ body }) => {
    fetchMock.mockResolvedValue(new Response(body, { status: 502 }));

    const error = await apiFetch("/api/admin/bookings").catch((error: unknown) => error);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: "INTERNAL_ERROR",
      message: ERROR_MESSAGE.INTERNAL_ERROR,
      status: 502,
    });
  });

  it.each([new TypeError("Failed to fetch"), new Error("connection failed")])(
    "fetch 자체가 실패하면 NETWORK_ERROR와 status 0으로 변환한다 (%s)",
    async (cause) => {
      fetchMock.mockRejectedValue(cause);

      const error = await apiFetch("/api/admin/bookings").catch((error: unknown) => error);

      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        code: "NETWORK_ERROR",
        message: "네트워크 연결을 확인해 주세요.",
        status: 0,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
});
