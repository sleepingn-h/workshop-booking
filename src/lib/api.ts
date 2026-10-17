import { ERROR_CODES, ERROR_MESSAGE, type ErrorCode } from "./types";

export type ClientErrorCode = ErrorCode | "NETWORK_ERROR";

export class ApiError extends Error {
  constructor(
    public code: ClientErrorCode,
    message: string,
    public status: number,
    public fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(
  path: string,
  init?: Omit<RequestInit, "body"> & { json?: unknown; body?: BodyInit },
): Promise<T> {
  const { json, body, ...options } = init ?? {};
  const headers = new Headers(options.headers);
  let requestBody = body;

  if (json !== undefined) {
    requestBody = JSON.stringify(json);
    headers.set("Content-Type", "application/json");
  } else if (body instanceof FormData) {
    headers.delete("Content-Type");
  }

  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      headers,
      body: requestBody,
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError("NETWORK_ERROR", "네트워크 연결을 확인해 주세요.", 0);
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  if (response.ok && text === "") return undefined as T;

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ApiError("INTERNAL_ERROR", ERROR_MESSAGE.INTERNAL_ERROR, response.status);
  }

  if (response.ok) return data as T;

  if (data !== null && typeof data === "object" && "error" in data) {
    const error = data.error;
    if (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      "message" in error &&
      typeof error.message === "string"
    ) {
      const code = ERROR_CODES.find((code) => code === error.code);
      if (code) {
        const fields = "fields" in error && error.fields !== null &&
          typeof error.fields === "object" && !Array.isArray(error.fields) &&
          Object.values(error.fields).every((value) => typeof value === "string")
          ? error.fields as Record<string, string>
          : undefined;
        throw new ApiError(code, error.message, response.status, fields);
      }
    }
  }

  throw new ApiError("INTERNAL_ERROR", ERROR_MESSAGE.INTERNAL_ERROR, response.status);
}
