import "server-only";

import { isAdminRequest } from "./auth";
import { AppError, ERROR_HTTP_STATUS, ERROR_MESSAGE, type ErrorCode } from "./types";

export function jsonOk<T>(data: T, status = 200): Response {
  return Response.json(data, { status });
}

export function errorResponse(
  code: ErrorCode,
  message = ERROR_MESSAGE[code],
  status = ERROR_HTTP_STATUS[code],
): Response {
  return Response.json({ error: { code, message } }, { status });
}

export function toErrorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    return Response.json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.fieldErrors ? { fields: error.fieldErrors } : {}),
      },
    }, { status: ERROR_HTTP_STATUS[error.code] });
  }

  // 원본 객체에는 요청 본문·환경 변수 등이 붙어 있을 수 있어 기록하지 않는다.
  console.error(error instanceof Error
    ? { message: error.message, stack: error.stack }
    : { message: "Unknown error" });
  return errorResponse("INTERNAL_ERROR");
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError("VALIDATION_ERROR");
  }
}

export function requireAdmin(request: Request): void {
  if (!isAdminRequest(request, new Date())) throw new AppError("UNAUTHORIZED");
}
