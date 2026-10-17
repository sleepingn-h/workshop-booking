import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ADMIN_COOKIE,
  SESSION_TTL_MS,
  checkPassword,
  createSessionToken,
  isAdminRequest,
  sessionCookieOptions,
  verifySessionToken,
} from "./auth";

const now = new Date("2026-10-17T03:00:00.123Z");
const twelveHours = 12 * 60 * 60 * 1000;
const password = "test-admin-password";
const secret = "test-session-secret";

beforeEach(() => {
  vi.stubEnv("ADMIN_PASSWORD", password);
  vi.stubEnv("ADMIN_SESSION_SECRET", secret);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("운영자 세션 토큰", () => {
  it("12시간 뒤 epoch 밀리초와 HMAC-SHA256 base64url 서명을 발급한다", () => {
    const expires = String(now.getTime() + twelveHours);
    const signature = createHmac("sha256", secret)
      .update(expires)
      .digest("base64url");

    expect(SESSION_TTL_MS).toBe(twelveHours);
    expect(createSessionToken(now)).toBe(`${expires}.${signature}`);
    expect(now.toISOString()).toBe("2026-10-17T03:00:00.123Z");
  });

  it("발급 직후 토큰은 유효하다", () => {
    expect(verifySessionToken(createSessionToken(now), now)).toBe(true);
  });

  it("만료 1밀리초 전까지 토큰은 유효하다", () => {
    const token = createSessionToken(now);

    expect(
      verifySessionToken(token, new Date(now.getTime() + twelveHours - 1)),
    ).toBe(true);
  });

  it.each([
    { label: "만료 정각", elapsed: twelveHours },
    { label: "만료 시각 이후", elapsed: twelveHours + 1 },
  ])("$label 토큰을 거부한다", ({ elapsed }) => {
    const token = createSessionToken(now);

    expect(verifySessionToken(token, new Date(now.getTime() + elapsed))).toBe(
      false,
    );
  });

  it("서명 한 글자를 변조한 토큰을 거부한다", () => {
    const [expires, signature] = createSessionToken(now).split(".");
    const changed = signature[0] === "A" ? "B" : "A";

    expect(
      verifySessionToken(`${expires}.${changed}${signature.slice(1)}`, now),
    ).toBe(false);
  });

  it("만료 시각을 연장해 변조한 토큰을 거부한다", () => {
    const [expires, signature] = createSessionToken(now).split(".");

    expect(
      verifySessionToken(`${Number(expires) + twelveHours}.${signature}`, now),
    ).toBe(false);
  });

  it("다른 secret으로 서명한 토큰을 거부한다", () => {
    const token = createSessionToken(now);
    vi.stubEnv("ADMIN_SESSION_SECRET", "another-test-secret");

    expect(verifySessionToken(token, now)).toBe(false);
  });

  it.each([
    { label: "undefined", token: undefined },
    { label: "null", token: null },
    { label: "빈 문자열", token: "" },
    { label: "점 없는 문자열", token: "not-a-token" },
    { label: "빈 토큰 구성 요소", token: "." },
    { label: "만료 시각 누락", token: ".signature" },
    { label: "서명 누락", token: "1792249200123." },
    { label: "구분자 추가", token: "1792249200123.signature.extra" },
  ])("$label 형식의 토큰을 거부한다", ({ token }) => {
    expect(verifySessionToken(token, now)).toBe(false);
  });

  it.each([
    { label: "숫자가 아닌 만료 시각", expires: "NaN" },
    { label: "무한대 만료 시각", expires: "Infinity" },
    { label: "소수 만료 시각", expires: "1792249200123.5" },
    { label: "지수 표기 만료 시각", expires: "1e15" },
    { label: "정확히 표현할 수 없는 만료 시각", expires: "9007199254740993" },
    { label: "공백이 붙은 만료 시각", expires: " 1792249200123" },
  ])("서명이 일치해도 $label 형식은 거부한다", ({ expires }) => {
    const signature = createHmac("sha256", secret)
      .update(expires)
      .digest("base64url");

    expect(verifySessionToken(`${expires}.${signature}`, now)).toBe(false);
  });

  it.each([
    { label: "짧은 서명", change: (value: string) => value.slice(0, -1) },
    { label: "긴 서명", change: (value: string) => `${value}A` },
    { label: "base64 패딩이 붙은 서명", change: (value: string) => `${value}=` },
    { label: "개행이 붙은 서명", change: (value: string) => `${value}\n` },
  ])("$label 토큰은 예외 없이 거부한다", ({ change }) => {
    const [expires, signature] = createSessionToken(now).split(".");

    expect(verifySessionToken(`${expires}.${change(signature)}`, now)).toBe(
      false,
    );
  });

  it("검증 시각이 유효하지 않으면 토큰을 거부한다", () => {
    expect(
      verifySessionToken(createSessionToken(now), new Date(Number.NaN)),
    ).toBe(false);
  });
});

describe("운영자 비밀번호", () => {
  it("환경 변수와 일치하는 비밀번호를 허용한다", () => {
    expect(checkPassword(password)).toBe(true);
  });

  it.each([
    { label: "같은 길이의 다른 문자열", input: "Test-admin-password" },
    { label: "짧은 문자열", input: "short" },
    { label: "긴 문자열", input: `${password}-longer` },
    { label: "앞뒤 공백이 붙은 문자열", input: ` ${password} ` },
    { label: "빈 문자열", input: "" },
    { label: "undefined", input: undefined },
    { label: "null", input: null },
    { label: "숫자", input: 1234 },
    { label: "불리언", input: true },
    { label: "객체", input: {} },
    { label: "배열", input: [password] },
  ])("$label 비밀번호는 예외 없이 거부한다", ({ input }) => {
    expect(checkPassword(input)).toBe(false);
  });

  it("유니코드 비밀번호도 UTF-8 값이 일치할 때만 허용한다", () => {
    vi.stubEnv("ADMIN_PASSWORD", "공방-테스트-비밀번호");

    expect(checkPassword("공방-테스트-비밀번호")).toBe(true);
    expect(checkPassword("공방-테스트-다른비밀번호")).toBe(false);
  });

  it("함수 호출 시점에 변경된 비밀번호를 사용한다", () => {
    vi.stubEnv("ADMIN_PASSWORD", "updated-test-password");

    expect(checkPassword(password)).toBe(false);
    expect(checkPassword("updated-test-password")).toBe(true);
  });
});

describe("운영자 인증 환경 변수", () => {
  it.each([
    { name: "ADMIN_PASSWORD", label: "미설정", value: undefined },
    { name: "ADMIN_PASSWORD", label: "빈 값", value: "" },
    { name: "ADMIN_SESSION_SECRET", label: "미설정", value: undefined },
    { name: "ADMIN_SESSION_SECRET", label: "빈 값", value: "" },
  ])("$name $label 시 로그인과 검증을 거부한다", ({ name, value }) => {
    const token = createSessionToken(now);
    const request = new Request("https://example.test/admin", {
      headers: { cookie: `${ADMIN_COOKIE}=${token}` },
    });
    vi.stubEnv(name, value);

    expect(checkPassword(password)).toBe(false);
    expect(verifySessionToken(token, now)).toBe(false);
    expect(isAdminRequest(request, now)).toBe(false);
    expect(createSessionToken(now)).toBe("");
  });
});

describe("운영자 요청 쿠키", () => {
  it("여러 쿠키 사이에서 admin_session 값만 찾아 검증한다", () => {
    const token = createSessionToken(now);
    const request = new Request("https://example.test/admin", {
      headers: {
        cookie: `theme=light; admin_session_extra=invalid; admin_session=${token}; preference=a=b`,
      },
    });

    expect(ADMIN_COOKIE).toBe("admin_session");
    expect(isAdminRequest(request, now)).toBe(true);
  });

  it.each([
    { label: "쿠키 헤더 누락", cookie: undefined },
    { label: "다른 쿠키만 존재", cookie: "theme=light" },
    { label: "이름이 일부만 일치", cookie: "admin_session_extra=invalid" },
    { label: "빈 세션 쿠키", cookie: "admin_session=" },
    { label: "등호 없는 세션 쿠키", cookie: "admin_session" },
    { label: "잘못된 토큰", cookie: "admin_session=invalid" },
  ])("$label 요청을 거부한다", ({ cookie }) => {
    const request = new Request("https://example.test/admin", {
      headers: cookie === undefined ? undefined : { cookie },
    });

    expect(isAdminRequest(request, now)).toBe(false);
  });

  it("요청에 전달된 시각이 만료 정각이면 거부한다", () => {
    const request = new Request("https://example.test/admin", {
      headers: { cookie: `${ADMIN_COOKIE}=${createSessionToken(now)}` },
    });

    expect(isAdminRequest(request, new Date(now.getTime() + twelveHours))).toBe(
      false,
    );
  });
});

describe("운영자 세션 쿠키 옵션", () => {
  it("보안 속성과 요청 시각 12시간 뒤의 만료 시각을 반환한다", () => {
    expect(sessionCookieOptions(now)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      expires: new Date(now.getTime() + twelveHours),
    });
    expect(now.toISOString()).toBe("2026-10-17T03:00:00.123Z");
  });
});
