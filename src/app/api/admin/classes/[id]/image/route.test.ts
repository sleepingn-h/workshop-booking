// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ADMIN_COOKIE, createSessionToken } from "@/lib/auth";
import { uploadClassImage } from "@/lib/db";
import { AppError, ERROR_MESSAGE, type ErrorCode } from "@/lib/types";

import { PUT } from "./route";

vi.mock("@/lib/db", () => ({ uploadClassImage: vi.fn() }));

const uploadClassImageMock = vi.mocked(uploadClassImage);
const now = new Date("2026-10-17T03:00:00.123Z");
const id = "11111111-1111-4111-8111-111111111111";
const url = `https://example.test/api/admin/classes/${id}/image`;
const context = () => ({ params: Promise.resolve({ id }) });
const result = { imageUrl: "https://images.example.test/new.jpg" };

function authenticatedRequest(body: BodyInit): Request {
  return new Request(url, {
    method: "PUT",
    headers: { cookie: `${ADMIN_COOKIE}=${createSessionToken(now)}` },
    body,
  });
}

function imageForm(file = new File(["image"], "class.jpg", { type: "image/jpeg" })): FormData {
  const form = new FormData();
  form.set("image", file);
  return form;
}

beforeEach(() => {
  uploadClassImageMock.mockReset();
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

describe("PUT /api/admin/classes/[id]/image", () => {
  it.each([undefined, "theme=light", `${ADMIN_COOKIE}=invalid`])(
    "쿠키 %s가 없거나 무효하면 params·FormData 파싱·DB 호출 전에 401로 반환한다",
    async (cookie) => {
      const request = new Request(url, {
        method: "PUT",
        headers: cookie ? { cookie } : undefined,
        body: "invalid multipart",
      });
      const parse = vi.spyOn(request, "formData");
      const readParams = vi.fn(() => Promise.resolve({ id }));

      const response = await PUT(request, { get params() { return readParams(); } });

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: { code: "UNAUTHORIZED", message: ERROR_MESSAGE.UNAUTHORIZED },
      });
      expect(parse).not.toHaveBeenCalled();
      expect(readParams).not.toHaveBeenCalled();
      expect(uploadClassImageMock).not.toHaveBeenCalled();
    },
  );

  it("FormData의 image File을 그대로 DB에 전달하고 imageUrl을 200으로 반환한다", async () => {
    const file = new File(["image"], "class.jpg", { type: "image/jpeg" });
    const form = imageForm(file);
    const request = authenticatedRequest(form);
    vi.spyOn(request, "formData").mockResolvedValue(form);
    uploadClassImageMock.mockResolvedValue(result);

    const response = await PUT(request, context());

    expect(uploadClassImageMock).toHaveBeenCalledExactlyOnceWith(id, file);
    expect(uploadClassImageMock.mock.calls[0][1]).toBe(file);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
  });

  it("실제 multipart 본문을 파싱해 파일 내용·이름·형식을 DB에 전달한다", async () => {
    uploadClassImageMock.mockResolvedValue(result);

    const response = await PUT(authenticatedRequest(imageForm()), context());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
    expect(uploadClassImageMock).toHaveBeenCalledExactlyOnceWith(id, expect.any(File));
    const file = uploadClassImageMock.mock.calls[0][1];
    expect(file.name).toBe("class.jpg");
    expect(file.type).toBe("image/jpeg");
    expect(await file.text()).toBe("image");
  });

  it.each(["missing", "string"])("image 필드가 %s이면 DB 호출 없이 400으로 반환한다", async (kind) => {
    const form = new FormData();
    if (kind === "string") form.set("image", "class.jpg");

    const response = await PUT(authenticatedRequest(form), context());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: ERROR_MESSAGE.VALIDATION_ERROR },
    });
    expect(uploadClassImageMock).not.toHaveBeenCalled();
  });

  it("잘못된 multipart 본문은 DB 호출 없이 400으로 반환한다", async () => {
    const response = await PUT(authenticatedRequest("invalid multipart"), context());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: ERROR_MESSAGE.VALIDATION_ERROR },
    });
    expect(uploadClassImageMock).not.toHaveBeenCalled();
  });

  it.each([
    new File(["image"], "class.gif", { type: "image/gif" }),
    new File([new Uint8Array(4 * 1024 * 1024 + 1)], "large.jpg", { type: "image/jpeg" }),
  ])("이미지 형식·크기 검증은 DB에 맡기고 400으로 반환한다: $name", async (file) => {
    const form = imageForm(file);
    const request = authenticatedRequest(form);
    vi.spyOn(request, "formData").mockResolvedValue(form);
    uploadClassImageMock.mockRejectedValue(new AppError("VALIDATION_ERROR"));

    const response = await PUT(request, context());

    expect(uploadClassImageMock).toHaveBeenCalledExactlyOnceWith(id, file);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: ERROR_MESSAGE.VALIDATION_ERROR },
    });
  });

  it.each<{ code: ErrorCode; status: number }>([
    { code: "NOT_FOUND", status: 404 },
    { code: "INTERNAL_ERROR", status: 500 },
  ])("DB의 $code 오류는 HTTP $status 응답으로 반환한다", async ({ code, status }) => {
    uploadClassImageMock.mockRejectedValue(new AppError(code));

    const response = await PUT(authenticatedRequest(imageForm()), context());

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: { code, message: ERROR_MESSAGE[code] } });
  });

  it("예상치 못한 DB 예외는 원인 정보 없이 500으로 반환한다", async () => {
    uploadClassImageMock.mockRejectedValue(new Error("Storage unavailable"));

    const response = await PUT(authenticatedRequest(imageForm()), context());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "INTERNAL_ERROR", message: ERROR_MESSAGE.INTERNAL_ERROR },
    });
    expect(console.error).toHaveBeenCalledOnce();
  });
});
