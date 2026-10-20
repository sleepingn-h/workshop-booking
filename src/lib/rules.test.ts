import { describe, expect, it } from "vitest";

import {
  ALLOWED_IMAGE_TYPES,
  CONFIRMED_CANCEL_WINDOW_MS,
  IMAGE_MAX_BYTES,
  MAX_HEADCOUNT,
  MIN_HEADCOUNT,
  canApply,
  canCancelSession,
  canChangeCapacity,
  canChangeStartsAt,
  canDeleteClass,
  canDeleteSession,
  canTransition,
  customerCancelDeadline,
  isVisibleSession,
  nextBookableSession,
  normalizePhone,
  occupiedSeats,
  remainingSeats,
  validateBookingInput,
  validateClassInput,
  validateClassPatch,
  validateImage,
  validateLookupInput,
  validateSessionInput,
  validateSessionPatch,
} from "./rules";
import {
  AppError,
  BOOKING_STATUS_LABEL,
  ERROR_CODES,
  ERROR_HTTP_STATUS,
  ERROR_MESSAGE,
  SESSION_STATUS_LABEL,
  type Actor,
  type BookingAction,
  type BookingStatus,
} from "./types";

const startsAt = new Date("2026-10-21T14:00:00+09:00");
const now = new Date("2026-10-18T14:00:00+09:00");
const session = { status: "scheduled" as const, startsAt, capacity: 4, occupied: 0 };
const bookingInput = {
  sessionId: "session-1",
  headcount: 2,
  customerName: "김공방",
  phone: "01012345678",
};
const sessionInput = { startsAt: "2026-10-21T14:00:00+09:00", capacity: 4 };
const statuses: BookingStatus[] = ["pending", "confirmed", "rejected", "cancelled"];
const actions: BookingAction[] = ["confirm", "reject", "cancel"];
const actors: Actor[] = ["admin", "customer"];

describe("에러와 상태 계약", () => {
  it("SPEC의 에러 코드 전체에 HTTP 상태와 한국어 기본 문구를 제공한다", () => {
    const expected = {
      VALIDATION_ERROR: 400,
      INVALID_HEADCOUNT: 400,
      UNAUTHORIZED: 401,
      NOT_FOUND: 404,
      BOOKING_NOT_FOUND: 404,
      SESSION_FULL: 409,
      SESSION_CANCELLED: 409,
      SESSION_STARTED: 409,
      DUPLICATE_BOOKING: 409,
      INVALID_TRANSITION: 409,
      CANCEL_DEADLINE_PASSED: 409,
      CAPACITY_BELOW_OCCUPIED: 409,
      SESSION_HAS_BOOKINGS: 409,
      CLASS_HAS_SESSIONS: 409,
      MOCK_READ_ONLY: 503,
      INTERNAL_ERROR: 500,
    };

    expect(ERROR_CODES).toEqual(Object.keys(expected));
    expect(ERROR_HTTP_STATUS).toEqual(expected);
    expect(Object.keys(ERROR_MESSAGE)).toEqual(ERROR_CODES);
    expect(ERROR_MESSAGE.MOCK_READ_ONLY).toBe("목 데이터 모드에서는 변경할 수 없습니다.");
    for (const code of ERROR_CODES) {
      expect(ERROR_MESSAGE[code]).toMatch(/[가-힣]/);
    }
  });

  it("AppError는 기본 문구 또는 지정 문구와 필드 오류를 보존한다", () => {
    const error = new AppError("SESSION_FULL");
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("SESSION_FULL");
    expect(error.message).toBe(ERROR_MESSAGE.SESSION_FULL);

    const fieldErrors = { phone: "전화번호를 확인해 주세요." };
    const custom = new AppError("VALIDATION_ERROR", "입력을 확인해 주세요.", fieldErrors);
    expect(custom.message).toBe("입력을 확인해 주세요.");
    expect(custom.fieldErrors).toEqual(fieldErrors);
  });

  it("R-20 예약·회차 상태를 고객에게 표시할 한국어로 매핑한다", () => {
    expect(BOOKING_STATUS_LABEL).toEqual({
      pending: "승인 대기",
      confirmed: "참여 확정",
      rejected: "거절됨",
      cancelled: "취소됨",
    });
    expect(SESSION_STATUS_LABEL).toEqual({ scheduled: "예정", cancelled: "취소" });
  });
});

describe("예약 입력", () => {
  it("R-12 신청 인원의 최솟값과 최댓값은 1과 4다", () => {
    expect(MIN_HEADCOUNT).toBe(1);
    expect(MAX_HEADCOUNT).toBe(4);
  });

  it.each(["010-1234-5678", " 010 1234 5678 ", "010\t1234\n5678"])(
    "R-16 전화번호 %j의 공백·하이픈을 제거한다",
    (phone) => expect(normalizePhone(phone)).toBe("01012345678"),
  );

  it("R-16 숫자 외의 문자를 임의로 제거하지 않는다", () => {
    expect(normalizePhone("+82 (10)1234.5678")).toBe("+82(10)1234.5678");
  });

  it.each([1, 2, 3, 4])("R-12 인원 %i명과 정규화된 신청 정보를 반환한다", (headcount) => {
    const input = { ...bookingInput, headcount, customerName: "  김 공방  ", phone: "010-1234-5678" };
    const original = { ...input };
    expect(validateBookingInput(input)).toEqual({
      ok: true,
      value: { ...bookingInput, headcount, customerName: "김 공방" },
    });
    expect(input).toEqual(original);
  });

  it("R-16 정규화 후 10자리 전화번호도 허용한다", () => {
    expect(validateBookingInput({ ...bookingInput, phone: "02-1234-5678" })).toEqual({
      ok: true,
      value: { ...bookingInput, phone: "0212345678" },
    });
  });

  it.each([0, 5, -1, 2.5, "2", null, undefined, NaN, Infinity])(
    "R-12 인원 오류 %j만 있으면 INVALID_HEADCOUNT와 필드 문구를 반환한다",
    (headcount) => {
      expect(validateBookingInput({ ...bookingInput, headcount })).toEqual({
        ok: false,
        code: "INVALID_HEADCOUNT",
        fieldErrors: { headcount: expect.stringMatching(/[가-힣]/) },
      });
    },
  );

  it.each([
    { sessionId: "" }, { sessionId: "  " }, { sessionId: 1 },
    { customerName: "  " }, { customerName: null }, { customerName: 123 },
    { phone: "010123456" }, { phone: "010123456789" }, { phone: "010.1234.5678" },
    { phone: "010abcd5678" }, { phone: 1012345678 },
  ])("R-12 R-16 잘못된 신청 필드 %j를 명시한다", (patch) => {
    expect(validateBookingInput({ ...bookingInput, ...patch })).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fieldErrors: { [Object.keys(patch)[0]]: expect.stringMatching(/[가-힣]/) },
    });
  });

  it("R-12 다른 입력 오류도 있으면 VALIDATION_ERROR와 모든 필드 오류를 반환한다", () => {
    expect(validateBookingInput({ sessionId: "", headcount: 5, customerName: " ", phone: "bad" })).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fieldErrors: {
        sessionId: expect.stringMatching(/[가-힣]/),
        headcount: expect.stringMatching(/[가-힣]/),
        customerName: expect.stringMatching(/[가-힣]/),
        phone: expect.stringMatching(/[가-힣]/),
      },
    });
  });

  it.each([null, undefined, [], "input", 2, true, {}])(
    "R-12 객체 형태가 잘못되거나 필수 값이 없는 %j를 거부한다",
    (input) => {
      expect(validateBookingInput(input)).toMatchObject({
        ok: false,
        code: "VALIDATION_ERROR",
        fieldErrors: {
          sessionId: expect.any(String), headcount: expect.any(String),
          customerName: expect.any(String), phone: expect.any(String),
        },
      });
    },
  );
});

describe("조회 입력", () => {
  it("R-30 예약번호를 trim·대문자화하고 뒷자리의 앞자리 0을 보존한다", () => {
    expect(validateLookupInput({ code: "  bk-7f3k2a  ", phoneLast4: "0123" })).toEqual({
      ok: true, value: { code: "BK-7F3K2A", phoneLast4: "0123" },
    });
  });

  it.each(["", "123", "12345", "12a4", " 0123", 1234, null])(
    "R-30 뒷자리 %j는 숫자 네 자리 문자열이 아니므로 거부한다",
    (phoneLast4) => {
      expect(validateLookupInput({ code: "BK-7F3K2A", phoneLast4 })).toEqual({
        ok: false, code: "VALIDATION_ERROR",
        fieldErrors: { phoneLast4: expect.stringMatching(/[가-힣]/) },
      });
    },
  );

  it.each(["", "  ", 1234, null])("R-30 예약번호 %j는 유효한 문자열이 아니므로 거부한다", (code) => {
    expect(validateLookupInput({ code, phoneLast4: "0123" })).toEqual({
      ok: false, code: "VALIDATION_ERROR", fieldErrors: { code: expect.stringMatching(/[가-힣]/) },
    });
  });

  it.each([null, undefined, [], "input", {}])("R-30 조회 입력 %j의 모든 오류를 반환한다", (input) => {
    expect(validateLookupInput(input)).toEqual({
      ok: false, code: "VALIDATION_ERROR",
      fieldErrors: { code: expect.any(String), phoneLast4: expect.any(String) },
    });
  });
});

describe("자리 계산과 신청", () => {
  it("R-01 R-03 승인 대기·확정 인원만 합산하고 거절·취소는 제외한다", () => {
    expect(occupiedSeats([
      { status: "pending", headcount: 3 }, { status: "confirmed", headcount: 2 },
      { status: "rejected", headcount: 4 }, { status: "cancelled", headcount: 1 },
    ])).toBe(5);
    expect(occupiedSeats([])).toBe(0);
  });

  it("R-02 남은 자리는 정원에서 점유 인원을 빼며 음수는 0으로 표시한다", () => {
    expect(remainingSeats(4, 0)).toBe(4);
    expect(remainingSeats(4, 3)).toBe(1);
    expect(remainingSeats(4, 4)).toBe(0);
    expect(remainingSeats(4, 5)).toBe(0);
  });

  it("R-01 R-11 정원 4명·대기 3명이면 1명만 추가 신청할 수 있다", () => {
    const occupied = occupiedSeats([{ status: "pending", headcount: 3 }]);
    expect(remainingSeats(4, occupied)).toBe(1);
    expect(canApply({ ...session, occupied }, 1, now)).toEqual({ ok: true });
    expect(canApply({ ...session, occupied }, 2, now)).toEqual({ ok: false, code: "SESSION_FULL" });
  });

  it("R-03 거절·취소하면 해당 인원만큼 다시 신청할 수 있다", () => {
    for (const status of ["rejected", "cancelled"] as const) {
      const occupied = occupiedSeats([{ status, headcount: 4 }]);
      expect(canApply({ ...session, occupied }, 4, now)).toEqual({ ok: true });
    }
  });

  it("R-11 만석이거나 점유 인원이 정원을 넘으면 신청할 수 없다", () => {
    for (const occupied of [4, 5]) {
      expect(canApply({ ...session, occupied }, 1, now)).toEqual({ ok: false, code: "SESSION_FULL" });
    }
  });

  it("R-13 취소된 회차 판정은 시작·인원·만석 판정보다 먼저다", () => {
    expect(canApply({ ...session, status: "cancelled", occupied: 4 }, 5, startsAt)).toEqual({
      ok: false, code: "SESSION_CANCELLED",
    });
  });

  it("R-14 시작 1ms 전에는 신청할 수 있다", () => {
    expect(canApply(session, 1, new Date(startsAt.getTime() - 1))).toEqual({ ok: true });
  });

  it.each([0, 1])("R-14 시작 정각 이후 %ims에는 인원·만석보다 먼저 거부한다", (offset) => {
    expect(canApply({ ...session, occupied: 4 }, 5, new Date(startsAt.getTime() + offset))).toEqual({
      ok: false, code: "SESSION_STARTED",
    });
  });

  it.each([0, 5, -1, 1.5, NaN, Infinity])("R-12 인원 %s는 자리 판정보다 먼저 거부한다", (headcount) => {
    expect(canApply({ ...session, occupied: 4 }, headcount, now)).toEqual({ ok: false, code: "INVALID_HEADCOUNT" });
  });
});

describe("예약 상태 전이", () => {
  const allowed = new Set([
    "pending/admin/confirm", "pending/admin/reject", "pending/admin/cancel",
    "confirmed/admin/cancel", "pending/customer/cancel", "confirmed/customer/cancel",
  ]);
  const cases = statuses.flatMap((from) => actors.flatMap((actor) => actions.map((action) => ({
    from, actor, action, allowed: allowed.has(`${from}/${actor}/${action}`),
  }))));

  it.each(cases)("R-20 시작 72시간 전 $from → $action ($actor), 허용=$allowed", ({ from, actor, action, allowed }) => {
    expect(canTransition(from, action, actor, { startsAt, now })).toEqual(
      allowed ? { ok: true } : { ok: false, code: "INVALID_TRANSITION" },
    );
  });

  it("R-22 시작 1ms 전에는 승인할 수 있다", () => {
    expect(canTransition("pending", "confirm", "admin", {
      startsAt, now: new Date(startsAt.getTime() - 1),
    })).toEqual({ ok: true });
  });

  it.each([0, 1])("R-22 시작 정각 이후 %ims에는 승인할 수 없다", (offset) => {
    expect(canTransition("pending", "confirm", "admin", {
      startsAt, now: new Date(startsAt.getTime() + offset),
    })).toEqual({ ok: false, code: "SESSION_STARTED" });
  });

  it("R-17 운영자는 시작 후 남은 승인 대기를 거절로 정리할 수 있다", () => {
    expect(canTransition("pending", "reject", "admin", { startsAt, now: startsAt })).toEqual({ ok: true });
  });

  it.each(["pending", "confirmed"] as const)("R-32 운영자는 시작 후에도 %s 예약을 취소할 수 있다", (from) => {
    expect(canTransition(from, "cancel", "admin", {
      startsAt, now: new Date(startsAt.getTime() + 1),
    })).toEqual({ ok: true });
  });

  it.each(["rejected", "cancelled"] as const)("R-21 최종 상태 %s에서는 시간 판정보다 먼저 모든 동작을 거부한다", (from) => {
    for (const actor of actors) {
      for (const action of actions) {
        expect(canTransition(from, action, actor, { startsAt, now: startsAt })).toEqual({
          ok: false, code: "INVALID_TRANSITION",
        });
      }
    }
  });

  it.each(["confirm", "reject"] as const)("R-20 고객은 시작 후에도 %s 동작의 기한 오류를 받지 않는다", (action) => {
    expect(canTransition("pending", action, "customer", { startsAt, now: startsAt })).toEqual({
      ok: false, code: "INVALID_TRANSITION",
    });
  });

  it("R-31 승인 대기는 시작 1ms 전까지 고객이 취소할 수 있다", () => {
    expect(canTransition("pending", "cancel", "customer", {
      startsAt, now: new Date(startsAt.getTime() - 1),
    })).toEqual({ ok: true });
  });

  it("R-31 승인 대기는 시작 정각에 고객이 취소할 수 없다", () => {
    expect(canTransition("pending", "cancel", "customer", { startsAt, now: startsAt })).toEqual({
      ok: false, code: "CANCEL_DEADLINE_PASSED",
    });
  });

  it("R-31 확정 예약은 시작 정확히 24시간 전에 고객이 취소할 수 있다", () => {
    expect(CONFIRMED_CANCEL_WINDOW_MS).toBe(86_400_000);
    expect(canTransition("confirmed", "cancel", "customer", {
      startsAt, now: new Date("2026-10-20T14:00:00+09:00"),
    })).toEqual({ ok: true });
  });

  it.each(["2026-10-20T14:00:00.001+09:00", "2026-10-20T15:00:00+09:00"])(
    "R-31 24시간 전보다 늦은 %s에는 확정 예약을 취소할 수 없다",
    (value) => {
      expect(canTransition("confirmed", "cancel", "customer", { startsAt, now: new Date(value) })).toEqual({
        ok: false, code: "CANCEL_DEADLINE_PASSED",
      });
    },
  );

  it("R-31 상태에 따른 취소 기한을 반환하며 전달한 Date를 변경하지 않는다", () => {
    const original = startsAt.getTime();
    expect(customerCancelDeadline("pending", startsAt)).toEqual(startsAt);
    expect(customerCancelDeadline("confirmed", startsAt)).toEqual(new Date("2026-10-20T14:00:00+09:00"));
    expect(customerCancelDeadline("rejected", startsAt)).toBeNull();
    expect(customerCancelDeadline("cancelled", startsAt)).toBeNull();
    expect(startsAt.getTime()).toBe(original);
  });
});

describe("공개 회차", () => {
  it("R-54 시작 전 예정 회차만 표시하고 시작 정각·지난·취소 회차는 숨긴다", () => {
    expect(isVisibleSession(session, new Date(startsAt.getTime() - 1))).toBe(true);
    expect(isVisibleSession(session, startsAt)).toBe(false);
    expect(isVisibleSession(session, new Date(startsAt.getTime() + 1))).toBe(false);
    expect(isVisibleSession({ ...session, status: "cancelled" }, now)).toBe(false);
  });

  it("R-54 목록의 다음 회차는 시작 순으로 처음 남은 자리가 있는 회차이고, 모두 마감이면 첫 회차, 없으면 null이다", () => {
    const full = { id: "full", remaining: 0 };
    const open = { id: "open", remaining: 2 };
    const later = { id: "later", remaining: 5 };

    expect(nextBookableSession([full, open, later])).toBe(open);
    expect(nextBookableSession([full, { ...full, id: "full-2" }])).toBe(full);
    expect(nextBookableSession([])).toBeNull();
  });
});

describe("클래스 입력", () => {
  it("R-53 클래스 이름과 설명의 바깥 공백을 제거하고 내부 줄바꿈을 보존한다", () => {
    expect(validateClassInput({ title: "  도자기  ", description: "  장소: 서울\n준비물: 없음  " })).toEqual({
      ok: true, value: { title: "도자기", description: "장소: 서울\n준비물: 없음" },
    });
  });

  it("R-57 공개 전 안내를 준비하는 클래스는 빈 설명을 저장할 수 있다", () => {
    expect(validateClassInput({ title: "도자기", description: "" })).toEqual({
      ok: true, value: { title: "도자기", description: "" },
    });
  });

  it.each([null, undefined, [], "class", {}, { title: " ", description: 123 }])(
    "R-53 클래스 입력 %j의 잘못된 필드를 반환한다", (input) => {
      expect(validateClassInput(input)).toEqual({
        ok: false, code: "VALIDATION_ERROR",
        fieldErrors: { title: expect.any(String), description: expect.any(String) },
      });
    },
  );

  it.each([
    [{ title: "  찻잔  " }, { title: "찻잔" }],
    [{ description: " 새 안내 " }, { description: "새 안내" }],
    [{ description: "" }, { description: "" }],
    [{ isPublished: true }, { isPublished: true }],
    [{ isPublished: false }, { isPublished: false }],
  ])("R-52 R-58 클래스 부분 수정은 제공한 필드만 반환한다: %j", (input, value) => {
    expect(validateClassPatch(input)).toEqual({ ok: true, value });
  });

  it("R-58 클래스 부분 수정의 여러 필드 오류를 함께 반환한다", () => {
    expect(validateClassPatch({ title: " ", description: null, isPublished: "true" })).toEqual({
      ok: false, code: "VALIDATION_ERROR",
      fieldErrors: { title: expect.any(String), description: expect.any(String), isPublished: expect.any(String) },
    });
  });

  it("R-58 클래스 입력·수정에서 지원하지 않는 필드는 결과에 포함하지 않는다", () => {
    expect(validateClassInput({ title: "도자기", description: "안내", isPublished: true })).toEqual({
      ok: true, value: { title: "도자기", description: "안내" },
    });
    expect(validateClassPatch({ title: "도자기", id: "other" })).toEqual({ ok: true, value: { title: "도자기" } });
  });

  it.each([null, undefined, [], "patch", {}, { id: "other" }])("R-58 변경할 클래스 정보가 없는 %j는 거부한다", (input) => {
    expect(validateClassPatch(input)).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
  });
});

describe("회차 입력", () => {
  it.each([
    "2026-10-21T14:00:00+09:00", "2026-10-21T05:00:00Z", "2026-10-21T01:00:00-04:00",
    "2026-10-21T05:00Z", "2026-10-21T05:00:00.000Z",
  ])("R-46 오프셋이 포함된 미래 ISO 시각 %s를 Date로 반환한다", (value) => {
    expect(validateSessionInput({ startsAt: value, capacity: 1 }, now)).toEqual({
      ok: true, value: { startsAt, capacity: 1 },
    });
  });

  it("R-46 ISO 소수 초를 허용하고 Date의 밀리초 정밀도로 반환한다", () => {
    expect(validateSessionInput({ startsAt: "2026-10-21T14:00:00.123456+09:00", capacity: 4 }, now)).toEqual({
      ok: true, value: { startsAt: new Date("2026-10-21T05:00:00.123Z"), capacity: 4 },
    });
  });

  it("R-46 미래 윤년의 유효한 날짜를 허용한다", () => {
    const value = "2028-02-29T14:00:00+09:00";
    expect(validateSessionInput({ startsAt: value, capacity: 4 }, now)).toEqual({
      ok: true, value: { startsAt: new Date(value), capacity: 4 },
    });
  });

  const invalidStartsAt = [
    "", "invalid", "2026-10-21", "2026-10-21T14:00:00", "2026-10-21T14:00",
    "2026-10-21 14:00:00+09:00", "2027-02-30T14:00:00Z", "2026-13-01T14:00:00Z",
    "2027-02-29T14:00:00+09:00", "2027-04-31T14:00:00-04:00",
    "2026-10-21T24:00:00Z", "2026-10-21T14:60:00Z", "2026-10-21T14:00:00+99:00",
    "2026-10-18T14:00:00+09:00", "2026-10-18T13:59:59.999+09:00",
    startsAt, 1, null, undefined,
  ];
  it.each(invalidStartsAt)("R-46 잘못되거나 현재·과거인 시각 %j는 생성·수정에서 거부한다", (value) => {
    for (const validate of [validateSessionInput, validateSessionPatch]) {
      expect(validate({ ...sessionInput, startsAt: value }, now)).toEqual({
        ok: false, code: "VALIDATION_ERROR", fieldErrors: { startsAt: expect.stringMatching(/[가-힣]/) },
      });
    }
  });

  it.each([0, -1, 1.5, "4", NaN, Infinity, null, undefined])("R-46 정원 %j는 양의 정수가 아니므로 거부한다", (capacity) => {
    for (const validate of [validateSessionInput, validateSessionPatch]) {
      expect(validate({ ...sessionInput, capacity }, now)).toEqual({
        ok: false, code: "VALIDATION_ERROR", fieldErrors: { capacity: expect.stringMatching(/[가-힣]/) },
      });
    }
  });

  it.each([
    ["", "시작 날짜와 시각을 입력해 주세요."],
    ["2026-10-21T14:00", "시작 날짜와 시각을 입력해 주세요."],
    ["2027-02-30T14:00:00Z", "시작 날짜와 시각을 입력해 주세요."],
    ["2026-10-18T14:00:00+09:00", "지금보다 뒤의 시작 시각을 입력해 주세요."],
    ["2026-10-17T14:00:00+09:00", "지금보다 뒤의 시작 시각을 입력해 주세요."],
  ])("R-46 시작 시각 %j의 거부 사유를 구현 용어 없이 다음 행동으로 안내한다", (value, message) => {
    for (const validate of [validateSessionInput, validateSessionPatch]) {
      expect(validate({ ...sessionInput, startsAt: value }, now)).toEqual({
        ok: false, code: "VALIDATION_ERROR", fieldErrors: { startsAt: message },
      });
    }
  });

  it("R-46 요청 시각보다 1ms 뒤의 회차는 생성할 수 있다", () => {
    const value = "2026-10-18T14:00:00.001+09:00";
    expect(validateSessionInput({ startsAt: value, capacity: 4 }, now)).toEqual({
      ok: true, value: { startsAt: new Date(value), capacity: 4 },
    });
  });

  it.each([null, undefined, [], "input", {}])("R-46 회차 입력 %j의 모든 필드 오류를 반환한다", (input) => {
    expect(validateSessionInput(input, now)).toEqual({
      ok: false, code: "VALIDATION_ERROR", fieldErrors: { startsAt: expect.any(String), capacity: expect.any(String) },
    });
  });

  it("R-44 R-46 부분 수정은 제공한 필드만 검증하고 소속 클래스는 반환하지 않는다", () => {
    expect(validateSessionPatch({ capacity: 8, classId: "other" }, now)).toEqual({ ok: true, value: { capacity: 8 } });
    expect(validateSessionPatch({ startsAt: sessionInput.startsAt }, now)).toEqual({ ok: true, value: { startsAt } });
    expect(validateSessionPatch(sessionInput, now)).toEqual({ ok: true, value: { startsAt, capacity: 4 } });
  });

  it.each([null, undefined, [], "patch", {}, { classId: "other" }])("R-46 변경할 회차 정보가 없는 %j는 거부한다", (input) => {
    expect(validateSessionPatch(input, now)).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
  });
});

describe("회차·클래스 관리 판정", () => {
  it("R-40 정원을 점유 인원 미만으로 줄일 수 없고 같거나 크면 허용한다", () => {
    expect(canChangeCapacity(2, 3)).toEqual({ ok: false, code: "CAPACITY_BELOW_OCCUPIED" });
    expect(canChangeCapacity(3, 3)).toEqual({ ok: true });
    expect(canChangeCapacity(4, 3)).toEqual({ ok: true });
  });

  it.each([0, -1, 1.5, NaN, Infinity])("R-46 정원 변경 %s도 양의 정수여야 한다", (capacity) => {
    expect(canChangeCapacity(capacity, 0)).toEqual({ ok: false, code: "VALIDATION_ERROR" });
  });

  it("R-41 R-43 예약 이력이 없을 때만 회차를 삭제한다", () => {
    expect(canDeleteSession(0)).toEqual({ ok: true });
    expect(canDeleteSession(1)).toEqual({ ok: false, code: "SESSION_HAS_BOOKINGS" });
  });

  it("R-44 취소·거절을 포함한 이력이 있으면 시간 오류보다 먼저 변경을 거부한다", () => {
    expect(canChangeStartsAt(1, startsAt, now)).toEqual({ ok: false, code: "SESSION_HAS_BOOKINGS" });
    expect(canChangeStartsAt(1, now, now)).toEqual({ ok: false, code: "SESSION_HAS_BOOKINGS" });
  });

  it("R-44 예약 이력이 없으면 미래 시각으로만 바꿀 수 있다", () => {
    expect(canChangeStartsAt(0, new Date(now.getTime() + 1), now)).toEqual({ ok: true });
    for (const value of [now, new Date(now.getTime() - 1), new Date(NaN)]) {
      expect(canChangeStartsAt(0, value, now)).toEqual({ ok: false, code: "VALIDATION_ERROR" });
    }
  });

  it("R-45 예정 회차만 취소할 수 있으며 취소된 회차는 다시 취소할 수 없다", () => {
    expect(canCancelSession("scheduled")).toEqual({ ok: true });
    expect(canCancelSession("cancelled")).toEqual({ ok: false, code: "SESSION_CANCELLED" });
  });

  it("R-50 R-51 회차가 없는 클래스만 삭제할 수 있다", () => {
    expect(canDeleteClass(0)).toEqual({ ok: true });
    expect(canDeleteClass(1)).toEqual({ ok: false, code: "CLASS_HAS_SESSIONS" });
  });
});

describe("이미지 검증", () => {
  it("JPEG·PNG·WebP만 허용하고 최대 크기는 4MB다", () => {
    expect(ALLOWED_IMAGE_TYPES).toEqual(["image/jpeg", "image/png", "image/webp"]);
    expect(IMAGE_MAX_BYTES).toBe(4 * 1024 * 1024);
  });

  it.each(["image/jpeg", "image/png", "image/webp"])("%s는 정확히 4MB까지 허용한다", (type) => {
    expect(validateImage({ type, size: 4 * 1024 * 1024 })).toEqual({ ok: true });
  });

  it.each(["image/gif", "image/svg+xml", "application/octet-stream", ""])("허용하지 않는 형식 %s는 거부한다", (type) => {
    expect(validateImage({ type, size: 1024 })).toEqual({ ok: false, code: "VALIDATION_ERROR" });
  });

  it("4MB보다 1바이트 큰 이미지는 거부한다", () => {
    expect(validateImage({ type: "image/png", size: 4 * 1024 * 1024 + 1 })).toEqual({ ok: false, code: "VALIDATION_ERROR" });
  });
});
