import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const now = new Date("2026-10-19T05:00:00.123Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const potteryId = "10000000-0000-4000-8000-000000000001";
const leatherId = "10000000-0000-4000-8000-000000000002";
const flowerId = "10000000-0000-4000-8000-000000000003";
const candleId = "10000000-0000-4000-8000-000000000004";
const potteryInfo = { place: "가상 도자기 공방, 시연시 공방로 1 (가상 주소)", durationMinutes: 120, price: 45000 };
const leatherInfo = { place: "가상 가죽 공방, 시연시 공방로 2 (가상 주소)", durationMinutes: 150, price: 55000 };
const flowerInfo = { place: "가상 꽃 공방, 시연시 공방로 3 (가상 주소)", durationMinutes: 90, price: 0 };
const candleInfo = { place: "가상 캔들 공방, 시연시 공방로 4 (가상 주소)", durationMinutes: 120, price: 40000 };
const sessionId = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const at = (offset: number) => new Date(now.getTime() + offset).toISOString();
const credentials = (n: number) => ({
  code: `BK-DEMO${String(n).padStart(2, "0")}`,
  phoneLast4: String(n).padStart(4, "0"),
});

let db: typeof import("./mock-db");
let rules: typeof import("./rules");
let AppError: typeof import("./types").AppError;

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  db = await import("./mock-db");
  rules = await import("./rules");
  ({ AppError } = await import("./types"));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("목 데이터 모드 플래그", () => {
  it("MOCK_DB=1이고 development일 때 켜진다", () => {
    vi.stubEnv("MOCK_DB", "1");
    vi.stubEnv("NODE_ENV", "development");
    expect(db.isMockDb()).toBe(true);
  });

  it.each([undefined, "", "0", "true"])("MOCK_DB=%j이면 꺼진다", (flag) => {
    vi.stubEnv("MOCK_DB", flag);
    vi.stubEnv("NODE_ENV", "development");
    expect(db.isMockDb()).toBe(false);
  });

  it("production에서는 MOCK_DB=1이어도 항상 꺼진다", () => {
    vi.stubEnv("MOCK_DB", "1");
    vi.stubEnv("NODE_ENV", "production");
    expect(db.isMockDb()).toBe(false);
  });

  it("모듈 로드 후에도 호출할 때마다 환경 변수를 읽는다", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("MOCK_DB", "1");
    expect(db.isMockDb()).toBe(true);
    vi.stubEnv("MOCK_DB", undefined);
    expect(db.isMockDb()).toBe(false);
    vi.stubEnv("MOCK_DB", "1");
    vi.stubEnv("NODE_ENV", "production");
    expect(db.isMockDb()).toBe(false);
  });

  it("Supabase 설정 누락으로 자동 활성화하지 않는다", () => {
    vi.stubEnv("SUPABASE_URL", undefined);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", undefined);
    vi.stubEnv("MOCK_DB", undefined);
    vi.stubEnv("NODE_ENV", "development");
    expect(db.isMockDb()).toBe(false);
    vi.stubEnv("MOCK_DB", "1");
    expect(db.isMockDb()).toBe(true);
  });
});

describe("고객 클래스 조회", () => {
  it("R-52 R-53 공개 클래스만 삽입 순서로 표시하고 이름·장소·소요 시간·비용·이미지를 반환한다", () => {
    expect(db.mockListPublishedClasses(now)).toEqual([
      { id: potteryId, title: "손으로 빚는 도자기 컵", ...potteryInfo, imageUrl: "/samples/class-1.jpg" },
      { id: leatherId, title: "나만의 가죽 카드 지갑", ...leatherInfo, imageUrl: "/samples/class-2.jpg" },
    ]);
  });

  it("R-59 요청 시각에 예정 회차가 없어진 공개 클래스는 목록·상세에서 숨긴다", () => {
    const afterLeather = new Date(at(7 * DAY));
    expect(db.mockListPublishedClasses(new Date(at(6 * DAY))).map(({ id }) => id)).toEqual([leatherId]);
    expect(db.mockListPublishedClasses(afterLeather)).toEqual([]);
    expect(db.mockGetPublishedClass(potteryId, new Date(at(5 * DAY)))).toBeNull();
    expect(db.mockGetPublishedClass(leatherId, afterLeather)).toBeNull();
  });

  it("R-53 모든 샘플 클래스는 소개와 안내 항목이 클래스 입력 검증을 통과한다", () => {
    for (const { id } of db.mockListAdminClasses(now)) {
      const { title, description, place, durationMinutes, price, paymentMethod, materials, contact } = db.mockGetAdminClass(id, now);
      const input = { title, description, place, durationMinutes, price, paymentMethod, materials, contact };
      expect(description).not.toBe("");
      expect(rules.validateClassInput(input)).toEqual({ ok: true, value: input });
    }
  });

  it.each([candleId, flowerId, "10000000-0000-4000-8000-999999999999", "invalid-id"])(
    "R-52 R-59 비공개이거나 없는 클래스 %s의 고객 상세는 null이다",
    (id) => expect(db.mockGetPublishedClass(id, now)).toBeNull(),
  );

  it("R-01 R-02 R-11 R-54 시작·취소 회차를 숨기고 만석 회차를 포함해 시작 순서로 표시한다", () => {
    expect(db.mockGetPublishedClass(potteryId, now)).toMatchObject({
      id: potteryId,
      sessions: [
        { id: sessionId(3), startsAt: at(20 * HOUR), capacity: 4, remaining: 3 },
        { id: sessionId(1), startsAt: at(4 * DAY), capacity: 6, remaining: 4 },
        { id: sessionId(2), startsAt: at(5 * DAY), capacity: 4, remaining: 0 },
      ],
    });
  });

  it("R-01 R-02 R-03 거절·취소 인원은 가죽 회차의 자리를 차지하지 않는다", () => {
    expect(db.mockGetPublishedClass(leatherId, now)?.sessions).toEqual([
      { id: sessionId(6), startsAt: at(7 * DAY), capacity: 6, remaining: 5 },
    ]);
  });

  it("R-54 시스템 시각이 바뀌어도 회차 시각은 고정되고 판정은 인자 now를 따른다", () => {
    const original = db.mockGetPublishedClass(potteryId, now);
    vi.setSystemTime(at(30 * DAY));
    expect(db.mockGetPublishedClass(potteryId, now)).toEqual(original);
    const startsAt = new Date(at(20 * HOUR));
    expect(db.mockGetPublishedClass(potteryId, startsAt)?.sessions.map(({ id }) => id)).toEqual([
      sessionId(1), sessionId(2),
    ]);
  });

  it("R-01 R-02 R-54 자리 계산과 표시 판정에 기존 순수 규칙을 재사용한다", () => {
    const occupied = vi.spyOn(rules, "occupiedSeats");
    const remaining = vi.spyOn(rules, "remainingSeats");
    const visible = vi.spyOn(rules, "isVisibleSession");
    db.mockGetPublishedClass(potteryId, now);
    expect(occupied).toHaveBeenCalled();
    expect(remaining).toHaveBeenCalledWith(4, 4);
    expect(visible).toHaveBeenCalledWith({ status: "scheduled", startsAt: new Date(at(-2 * HOUR)) }, now);
  });
});

describe("고객 예약 조회", () => {
  it("R-30 R-33 BK-DEMO01의 조회 입력을 정규화하고 신청자 이름·전화번호를 가린 DTO를 반환한다", () => {
    expect(db.mockLookupBooking({ code: " bk-demo01 ", phoneLast4: "0001" }, now)).toEqual({
      code: "BK-DEMO01",
      status: "pending",
      headcount: 2,
      customer: { name: "가*****1", phone: "010-****-0001" },
      class: {
        id: potteryId,
        title: "손으로 빚는 도자기 컵",
        ...potteryInfo,
        paymentMethod: "현장 결제",
        materials: "없음",
        contact: "010-0000-9001 (시연용 가상 번호)",
      },
      session: { startsAt: at(4 * DAY), status: "scheduled" },
      canCancel: true,
      cancelDeadline: at(4 * DAY),
    });
  });

  it.each([
    { code: "BK-DEMO01", phoneLast4: "9999" },
    { code: "BK-MISSING", phoneLast4: "0001" },
  ])("R-30 불일치 정보 %j를 같은 오류로 거부하고 상태·기한을 판정하지 않는다", (input) => {
    const transition = vi.spyOn(rules, "canTransition");
    const deadline = vi.spyOn(rules, "customerCancelDeadline");
    expect(() => db.mockLookupBooking(input, now)).toThrowError(new AppError("BOOKING_NOT_FOUND"));
    expect(transition).not.toHaveBeenCalled();
    expect(deadline).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { code: "", phoneLast4: "0001" },
    { code: "BK-DEMO01", phoneLast4: "001" },
    { code: "BK-DEMO01", phoneLast4: 1 },
    { code: "BK-DEMO01", phoneLast4: "abcd" },
  ])("R-30 형식 오류 %j는 입력 규칙의 필드 오류를 보존한다", (input) => {
    expect(() => db.mockLookupBooking(input, now)).toThrowError(expect.objectContaining({
      code: "VALIDATION_ERROR", fieldErrors: expect.any(Object),
    }));
  });

  it("R-31 20시간 후 확정 예약은 취소 불가이고 5일 후 확정 예약은 가능하다", () => {
    expect(db.mockLookupBooking(credentials(4), now)).toMatchObject({ canCancel: false, cancelDeadline: at(-4 * HOUR) });
    expect(db.mockLookupBooking(credentials(3), now)).toMatchObject({ canCancel: true, cancelDeadline: at(4 * DAY) });
  });

  it("R-31 확정은 정확히 24시간 전까지, 승인 대기는 시작 직전까지만 취소 가능하다", () => {
    expect(db.mockLookupBooking(credentials(3), new Date(at(4 * DAY))).canCancel).toBe(true);
    expect(db.mockLookupBooking(credentials(3), new Date(now.getTime() + 4 * DAY + 1)).canCancel).toBe(false);
    expect(db.mockLookupBooking(credentials(1), new Date(now.getTime() + 4 * DAY - 1)).canCancel).toBe(true);
    expect(db.mockLookupBooking(credentials(1), new Date(at(4 * DAY))).canCancel).toBe(false);
  });

  it("R-21 R-31 R-33 시작한 승인 대기와 최종 상태는 직접 취소할 수 없다", () => {
    expect(db.mockLookupBooking(credentials(5), now)).toMatchObject({ status: "pending", canCancel: false, cancelDeadline: at(-2 * HOUR) });
    for (const n of [6, 7, 8, 9]) {
      expect(db.mockLookupBooking(credentials(n), now)).toMatchObject({ canCancel: false, cancelDeadline: null });
    }
  });

  it("R-30 R-59 예정 회차가 있는 공개 클래스만 상세 링크용 id를 주고, 없어지면 예약만 조회한다", () => {
    expect(db.mockLookupBooking(credentials(1), now)).toMatchObject({ class: { id: potteryId } });
    expect(db.mockLookupBooking(credentials(1), new Date(at(5 * DAY)))).toMatchObject({ code: "BK-DEMO01", class: { id: null, title: "손으로 빚는 도자기 컵" } });
  });

  it("R-42 R-52 비공개 클래스와 취소된 회차의 기존 예약을 조회할 수 있다", () => {
    expect(db.mockLookupBooking(credentials(11), now)).toMatchObject({
      class: { id: null, title: "향을 고르는 캔들 클래스" }, status: "pending", canCancel: true,
    });
    expect(db.mockLookupBooking(credentials(7), now)).toMatchObject({
      session: { status: "cancelled" }, status: "cancelled", canCancel: false,
    });
  });
});

describe("운영자 예약 목록", () => {
  it("R-19 회차 시작·생성·ID 순으로 11건을 반환하고 전체 회차 선택지를 유지한다", () => {
    const result = db.mockListAdminBookings({}, now);
    expect(result.bookings.map(({ code }) => code)).toEqual([
      "BK-DEMO05", "BK-DEMO04", "BK-DEMO01", "BK-DEMO02", "BK-DEMO03",
      "BK-DEMO06", "BK-DEMO07", "BK-DEMO11", "BK-DEMO08", "BK-DEMO09", "BK-DEMO10",
    ]);
    expect(result.sessions.map(({ id }) => id)).toEqual([4, 3, 1, 2, 5, 7, 6].map(sessionId));
    expect(result.sessions.find(({ id }) => id === sessionId(5))?.status).toBe("cancelled");
    expect(result.sessions.find(({ id }) => id === sessionId(7))?.classTitle).toBe("향을 고르는 캔들 클래스");
  });

  it.each([
    [1, 1, 2, "pending"], [2, 2, 2, "pending"], [3, 2, 2, "confirmed"],
    [4, 3, 1, "confirmed"], [5, 4, 1, "pending"], [6, 5, 1, "rejected"],
    [7, 5, 2, "cancelled"], [8, 6, 1, "rejected"], [9, 6, 2, "cancelled"],
    [10, 6, 1, "pending"], [11, 7, 1, "pending"],
  ] as const)("R-19 R-30 샘플 %i의 예약번호·인원·이름·전화번호·상태·소속 회차를 유지한다", (n, session, headcount, status) => {
    const code = credentials(n).code;
    expect(db.mockListAdminBookings({}, now).bookings.find((row) => row.code === code)).toMatchObject({
      id: `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
      code, sessionId: sessionId(session), headcount, status,
      customerName: `가상예약자${String(n).padStart(2, "0")}`,
      phone: `0100000${String(n).padStart(4, "0")}`,
    });
    expect(db.mockLookupBooking(credentials(n), now)).toMatchObject({ code, headcount, status });
  });

  it("R-19 상태·회차·검색 필터를 함께 적용해도 회차 선택지는 줄지 않는다", () => {
    const result = db.mockListAdminBookings({ status: "pending", sessionId: sessionId(2), q: "예약자" }, now);
    expect(result.bookings.map(({ code }) => code)).toEqual(["BK-DEMO02"]);
    expect(result.sessions).toEqual(db.mockListAdminBookings({}, now).sessions);
    expect(db.mockListAdminBookings({ status: "confirmed" }, now).bookings.map(({ code }) => code)).toEqual(["BK-DEMO04", "BK-DEMO03"]);
    expect(db.mockListAdminBookings({ sessionId: sessionId(6) }, now).bookings.map(({ code }) => code)).toEqual(["BK-DEMO08", "BK-DEMO09", "BK-DEMO10"]);
  });

  it.each([" 가상예약자01 ", "010-0000-0001", " 010 0000 0001 "])("R-19 이름 부분 일치 또는 정규화한 전체 전화번호 %j로 검색한다", (q) => {
    expect(db.mockListAdminBookings({ q }, now).bookings.map(({ code }) => code)).toEqual(["BK-DEMO01"]);
  });

  it.each(["0001", "%", "_", "\\", "없는예약자"])("R-19 검색 %j는 전화번호 부분 일치나 LIKE 특수 문자로 확장되지 않는다", (q) => {
    expect(db.mockListAdminBookings({ q }, now).bookings).toEqual([]);
  });

  it("R-19 null·생략·빈 검색은 전체 목록이고 없는 회차는 빈 예약 목록이다", () => {
    const all = db.mockListAdminBookings({}, now);
    expect(db.mockListAdminBookings({ sessionId: null, status: null, q: null }, now)).toEqual(all);
    expect(db.mockListAdminBookings({ q: " \t " }, now)).toEqual(all);
    const missing = db.mockListAdminBookings({ sessionId: sessionId(999) }, now);
    expect(missing.bookings).toEqual([]);
    expect(missing.sessions).toEqual(all.sessions);
  });

  it.each([{ status: "invalid" }, { status: "" }, { status: "toString" }, { sessionId: "invalid-id" }, { sessionId: "" }])(
    "R-19 잘못된 필터 %j는 VALIDATION_ERROR다",
    (filter) => expect(() => db.mockListAdminBookings(filter, now)).toThrowError(new AppError("VALIDATION_ERROR")),
  );
});

describe("운영자 클래스 조회", () => {
  it("R-17 R-52 R-53 R-54 비공개 포함 4개 클래스를 최신 순으로 반환하고 장소·소요 시간·비용과 예정 회차·승인 대기를 센다", () => {
    expect(db.mockListAdminClasses(now)).toEqual([
      { id: candleId, title: "향을 고르는 캔들 클래스", ...candleInfo, imageUrl: "/samples/class-4.jpg", isPublished: false, upcomingSessionCount: 1, pendingCount: 1 },
      { id: flowerId, title: "작은 꽃다발 만들기", ...flowerInfo, imageUrl: "/samples/class-3.jpg", isPublished: false, upcomingSessionCount: 0, pendingCount: 0 },
      { id: leatherId, title: "나만의 가죽 카드 지갑", ...leatherInfo, imageUrl: "/samples/class-2.jpg", isPublished: true, upcomingSessionCount: 1, pendingCount: 1 },
      { id: potteryId, title: "손으로 빚는 도자기 컵", ...potteryInfo, imageUrl: "/samples/class-1.jpg", isPublished: true, upcomingSessionCount: 3, pendingCount: 3 },
    ]);
  });

  it("R-54 예정 회차는 요청 시각 기준으로 시작 전 회차만 센다", () => {
    expect(db.mockListAdminClasses(new Date(now.getTime() + 21 * HOUR)).at(-1)).toMatchObject({ upcomingSessionCount: 2, pendingCount: 3 });
  });

  it("R-01 R-17 R-41 시작·취소 회차를 포함하고 점유 인원·전체 예약 이력·승인 대기를 구분한다", () => {
    expect(db.mockGetAdminClass(potteryId, now).sessions).toEqual([
      { id: sessionId(4), startsAt: at(-2 * HOUR), capacity: 4, status: "scheduled", occupied: 1, bookingCount: 1, pendingCount: 1 },
      { id: sessionId(3), startsAt: at(20 * HOUR), capacity: 4, status: "scheduled", occupied: 1, bookingCount: 1, pendingCount: 0 },
      { id: sessionId(1), startsAt: at(4 * DAY), capacity: 6, status: "scheduled", occupied: 2, bookingCount: 1, pendingCount: 1 },
      { id: sessionId(2), startsAt: at(5 * DAY), capacity: 4, status: "scheduled", occupied: 4, bookingCount: 2, pendingCount: 1 },
      { id: sessionId(5), startsAt: at(6 * DAY), capacity: 4, status: "cancelled", occupied: 0, bookingCount: 2, pendingCount: 0 },
    ]);
    expect(db.mockGetAdminClass(leatherId, now).sessions[0]).toMatchObject({ occupied: 1, bookingCount: 3, pendingCount: 1 });
    expect(db.mockGetAdminClass(flowerId, now).sessions).toEqual([]);
    expect(db.mockGetAdminClass(candleId, now)).toMatchObject({ isPublished: false, sessions: [{ occupied: 1, bookingCount: 1, pendingCount: 1 }] });
  });

  it.each(["invalid-id", "10000000-0000-4000-8000-999999999999"])(
    "R-52 없는 운영자 클래스 %s는 NOT_FOUND다",
    (id) => expect(() => db.mockGetAdminClass(id, now)).toThrowError(new AppError("NOT_FOUND")),
  );
});

describe("읽기 전용 샘플의 반환값 격리", () => {
  it("R-52 고객 목록의 배열과 항목을 바꿔도 다음 조회에 영향이 없다", () => {
    const expected = db.mockListPublishedClasses(now);
    const result = db.mockListPublishedClasses(now);
    expect(result).not.toBe(expected);
    expect(result[0]).not.toBe(expected[0]);
    result[0].title = "변경";
    result.pop();
    expect(db.mockListPublishedClasses(now)).toEqual(expected);
  });

  it("R-54 고객 상세의 회차를 바꿔도 다음 조회에 영향이 없다", () => {
    const expected = db.mockGetPublishedClass(potteryId, now)!;
    const result = db.mockGetPublishedClass(potteryId, now)!;
    expect(result).not.toBe(expected);
    expect(result.sessions).not.toBe(expected.sessions);
    expect(result.sessions[0]).not.toBe(expected.sessions[0]);
    result.description = "변경";
    result.sessions[0].remaining = 999;
    result.sessions.pop();
    expect(db.mockGetPublishedClass(potteryId, now)).toEqual(expected);
  });

  it("R-30 예약 조회의 중첩 클래스·회차를 바꿔도 샘플이 유지된다", () => {
    const expected = db.mockLookupBooking(credentials(1), now);
    const result = db.mockLookupBooking(credentials(1), now);
    expect(result).not.toBe(expected);
    expect(result.class).not.toBe(expected.class);
    expect(result.session).not.toBe(expected.session);
    result.status = "cancelled";
    result.class.title = "변경";
    result.session.status = "cancelled";
    expect(db.mockLookupBooking(credentials(1), now)).toEqual(expected);
  });

  it("R-19 운영자 예약·선택지 배열과 항목을 바꿔도 다음 조회에 영향이 없다", () => {
    const expected = db.mockListAdminBookings({}, now);
    const result = db.mockListAdminBookings({}, now);
    expect(result).not.toBe(expected);
    expect(result.bookings).not.toBe(expected.bookings);
    expect(result.bookings[0]).not.toBe(expected.bookings[0]);
    expect(result.sessions).not.toBe(expected.sessions);
    expect(result.sessions[0]).not.toBe(expected.sessions[0]);
    result.bookings[0].phone = "변경";
    result.sessions[0].status = "cancelled";
    result.bookings.pop();
    result.sessions.pop();
    expect(db.mockListAdminBookings({}, now)).toEqual(expected);
  });

  it("R-52 운영자 클래스 목록을 바꿔도 다음 조회에 영향이 없다", () => {
    const expected = db.mockListAdminClasses(now);
    const result = db.mockListAdminClasses(now);
    expect(result).not.toBe(expected);
    expect(result[0]).not.toBe(expected[0]);
    result[0].isPublished = true;
    result.pop();
    expect(db.mockListAdminClasses(now)).toEqual(expected);
  });

  it("R-41 R-52 운영자 상세의 회차·정원을 바꿔도 샘플이 유지된다", () => {
    const expected = db.mockGetAdminClass(potteryId, now);
    const result = db.mockGetAdminClass(potteryId, now);
    expect(result).not.toBe(expected);
    expect(result.sessions).not.toBe(expected.sessions);
    expect(result.sessions[0]).not.toBe(expected.sessions[0]);
    result.title = "변경";
    result.sessions[0].capacity = 999;
    result.sessions.pop();
    expect(db.mockGetAdminClass(potteryId, now)).toEqual(expected);
  });
});
