import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

type Reply = {
  data: unknown;
  error: { message?: string } | null;
  beforeRead?: () => void;
};

// 쿼리를 실행하지 않고 테이블별 응답 큐와 체인 호출만 기록한다.
function mockSupabase() {
  const replies = new Map<string, Reply[]>();
  const queries: { table: string; chain: ReturnType<typeof queryChain> }[] = [];

  function queryChain(table: string) {
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      returns: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockReturnThis(),
      then(resolve: (value: Reply) => unknown, reject: (reason: unknown) => unknown) {
        const reply = replies.get(table)?.shift();
        if (!reply) {
          return Promise.reject(new Error(`응답이 준비되지 않은 조회: ${table}`)).then(resolve, reject);
        }
        reply.beforeRead?.();
        return Promise.resolve(reply).then(resolve, reject);
      },
    };
  }

  return {
    from: vi.fn((table: string) => {
      const chain = queryChain(table);
      queries.push({ table, chain });
      return chain;
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    queries,
    queue(table: string, data: unknown, error: Reply["error"] = null, beforeRead?: () => void) {
      const queue = replies.get(table) ?? [];
      queue.push({ data, error, beforeRead });
      replies.set(table, queue);
    },
  };
}

const now = new Date("2026-10-17T03:00:00.123Z");
const classId = "10000000-0000-4000-8000-000000000001";
const sessionId = "20000000-0000-4000-8000-000000000001";
const bookingId = "30000000-0000-4000-8000-000000000001";
const workshop = {
  id: classId,
  title: "도자기 컵",
  description: "장소: 공방\n문의처: 010-0000-9001",
  image_url: "/samples/class-1.jpg",
  is_published: true,
};
const session = {
  id: sessionId,
  class_id: classId,
  starts_at: "2026-10-21T03:00:00.123Z",
  capacity: 6,
  status: "scheduled",
};
const stats = { session_id: sessionId, occupied: 2, booking_count: 1 };
const booking = {
  id: bookingId,
  code: "BK-DEMO01",
  session_id: sessionId,
  headcount: 2,
  customer_name: "가상예약자",
  phone: "01000000001",
  status: "pending",
};
const input = { sessionId, headcount: 2, customerName: " 가상예약자 ", phone: "010-0000 0001" };
const credentials = { code: " bk-demo01 ", phoneLast4: "0001" };

let client: ReturnType<typeof mockSupabase>;
let db: typeof import("./db");
let rules: typeof import("./rules");
let AppError: typeof import("./types").AppError;

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("SUPABASE_URL", "https://workshop.example.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
  createClient.mockReset();
  client = mockSupabase();
  createClient.mockReturnValue(client);
  db = await import("./db");
  rules = await import("./rules");
  ({ AppError } = await import("./types"));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

function queueApplication(
  sessionPatch: Partial<typeof session> = {},
  classPatch: Partial<typeof workshop> = {},
  occupied = 2,
) {
  client.queue("sessions", { ...session, ...sessionPatch });
  client.queue("classes", { ...workshop, ...classPatch });
  client.queue("session_stats", { ...stats, occupied });
}

function queueLookup(
  bookingPatch: Partial<typeof booking> = {},
  sessionPatch: Partial<typeof session> = {},
  classPatch: Partial<typeof workshop> = {},
) {
  client.queue("bookings", { ...booking, ...bookingPatch });
  client.queue("sessions", { ...session, ...sessionPatch });
  client.queue("classes", { ...workshop, ...classPatch });
}

describe("Supabase 클라이언트와 에러 처리", () => {
  it("모듈을 불러올 때는 클라이언트를 만들지 않고 첫 호출부터 재사용한다", async () => {
    expect(createClient).not.toHaveBeenCalled();
    client.queue("classes", []);
    client.queue("classes", []);

    await db.listPublishedClasses();
    await db.listPublishedClasses();

    expect(createClient).toHaveBeenCalledExactlyOnceWith(
      "https://workshop.example.test",
      "test-service-role-key",
      { auth: { persistSession: false } },
    );
  });

  it.each([
    ["SUPABASE_URL", undefined],
    ["SUPABASE_URL", ""],
    ["SUPABASE_SERVICE_ROLE_KEY", undefined],
    ["SUPABASE_SERVICE_ROLE_KEY", ""],
  ])("%s가 %s이면 모듈 로드는 성공하고 호출 시 INTERNAL_ERROR를 던진다", async (key, value) => {
    vi.stubEnv(key, value);
    vi.resetModules();
    const missingEnvDb = await import("./db");

    await expect(missingEnvDb.listPublishedClasses()).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
    expect(createClient).not.toHaveBeenCalled();
    expect(client.from).not.toHaveBeenCalled();
  });

  it("클라이언트 초기화 오류의 원문을 노출하지 않는다", async () => {
    createClient.mockImplementation(() => { throw new Error("private configuration"); });

    await expect(db.listPublishedClasses()).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      message: "처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
    });
  });

  it("예상하지 못한 조회 에러를 INTERNAL_ERROR로 변환한다", async () => {
    client.queue("classes", null, { message: "private database detail" });

    await expect(db.listPublishedClasses()).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      message: "처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
    });
  });
});

describe("공개 클래스 조회", () => {
  it("R-52 R-54 공개 클래스의 다음 회차를 구하고 표시할 회차가 없으면 null이다", async () => {
    const emptyClass = { ...workshop, id: "10000000-0000-4000-8000-000000000002", image_url: null };
    client.queue("classes", [workshop, emptyClass]);
    client.queue("sessions", [
      { ...session, starts_at: "2026-10-22T03:00:00.123Z" },
      { ...session, starts_at: now.toISOString() },
      { ...session, starts_at: "2026-10-18T03:00:00.123Z", status: "cancelled" },
      session,
    ]);

    await expect(db.listPublishedClasses()).resolves.toEqual([
      { id: classId, title: workshop.title, description: workshop.description, imageUrl: workshop.image_url, nextSessionAt: session.starts_at },
      { id: emptyClass.id, title: workshop.title, description: workshop.description, imageUrl: null, nextSessionAt: null },
    ]);
    expect(client.queries[0].chain.eq).toHaveBeenCalledWith("is_published", true);
  });

  it("R-52 공개 클래스가 없으면 빈 목록을 반환한다", async () => {
    client.queue("classes", []);
    await expect(db.listPublishedClasses()).resolves.toEqual([]);
    expect(client.from).toHaveBeenCalledTimes(1);
  });

  it("R-52 UUID 형식이 아닌 상세 id는 DB 호출 없이 null이다", async () => {
    await expect(db.getPublishedClass("invalid-id")).resolves.toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });

  it.each([null, { ...workshop, is_published: false }])("R-52 없거나 비공개인 클래스 상세는 null이다", async (data) => {
    client.queue("classes", data);
    await expect(db.getPublishedClass(classId)).resolves.toBeNull();
    expect(client.from).toHaveBeenCalledTimes(1);
  });

  it("R-01 R-02 R-54 시작·취소 회차는 제외하고 남은 자리와 만석 회차를 시작 순으로 반환한다", async () => {
    const fullSessionId = "20000000-0000-4000-8000-000000000002";
    client.queue("classes", workshop);
    client.queue("sessions", [
      session,
      { ...session, starts_at: "2026-10-16T03:00:00.123Z" },
      { ...session, starts_at: now.toISOString() },
      { ...session, starts_at: "2026-10-18T03:00:00.123Z", status: "cancelled" },
      { ...session, id: fullSessionId, starts_at: "2026-10-20T03:00:00.123Z" },
    ]);
    client.queue("session_stats", [stats, { ...stats, session_id: fullSessionId, occupied: 6 }]);

    await expect(db.getPublishedClass(classId)).resolves.toEqual({
      id: classId, title: workshop.title, description: workshop.description, imageUrl: workshop.image_url,
      sessions: [
        { id: fullSessionId, startsAt: "2026-10-20T03:00:00.123Z", capacity: 6, remaining: 0 },
        { id: sessionId, startsAt: session.starts_at, capacity: 6, remaining: 4 },
      ],
    });
    expect(client.queries.find(({ table }) => table === "sessions")?.chain.eq).toHaveBeenCalledWith("class_id", classId);
  });

  it("R-54 표시할 회차가 없으면 클래스 안내와 빈 회차를 반환한다", async () => {
    client.queue("classes", workshop);
    client.queue("sessions", []);
    await expect(db.getPublishedClass(classId)).resolves.toMatchObject({ title: workshop.title, sessions: [] });
  });
});

describe("예약 신청", () => {
  it("R-10 R-14 R-15 진입 시각을 규칙과 RPC에 같이 넘기며 조회 중 시각이 바뀌어도 유지한다", async () => {
    const apply = vi.spyOn(rules, "canApply");
    client.queue("sessions", session, null, () => vi.setSystemTime("2026-10-22T00:00:00Z"));
    client.queue("classes", workshop);
    client.queue("session_stats", stats);
    client.rpc.mockResolvedValue({ data: "BK-7F3K2A", error: null });

    await expect(db.createBooking(input)).resolves.toEqual({ code: "BK-7F3K2A", status: "pending" });
    expect(apply).toHaveBeenCalledExactlyOnceWith({ status: "scheduled", startsAt: new Date(session.starts_at), capacity: 6, occupied: 2 }, 2, now);
    expect(client.rpc).toHaveBeenCalledExactlyOnceWith("create_booking", {
      p_session_id: sessionId, p_headcount: 2, p_customer_name: "가상예약자", p_phone: "01000000001", p_now: now.toISOString(),
    });
  });

  it("R-12 인원 5명은 필드 오류와 INVALID_HEADCOUNT를 반환하고 DB를 호출하지 않는다", async () => {
    await expect(db.createBooking({ ...input, headcount: 5 })).rejects.toMatchObject({ code: "INVALID_HEADCOUNT", fieldErrors: { headcount: expect.any(String) } });
    expect(createClient).not.toHaveBeenCalled();
    expect(client.from).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("R-10 잘못된 이름과 전화번호는 필드 오류를 반환하고 DB를 호출하지 않는다", async () => {
    await expect(db.createBooking({ ...input, customerName: " ", phone: "invalid" })).rejects.toMatchObject({ code: "VALIDATION_ERROR", fieldErrors: { customerName: expect.any(String), phone: expect.any(String) } });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("R-11 조회한 남은 자리가 부족하면 RPC를 호출하지 않는다", async () => {
    queueApplication({}, {}, 5);
    await expect(db.createBooking(input)).rejects.toMatchObject({ code: "SESSION_FULL" });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it.each([
    { patch: { status: "cancelled" }, code: "SESSION_CANCELLED", rule: "R-13" },
    { patch: { starts_at: now.toISOString() }, code: "SESSION_STARTED", rule: "R-14" },
  ])("$rule 신청 불가 회차는 $code이며 RPC를 호출하지 않는다", async ({ patch, code }) => {
    queueApplication(patch);
    await expect(db.createBooking(input)).rejects.toMatchObject({ code });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("R-52 비공개 클래스 회차에는 신청할 수 없다", async () => {
    queueApplication({}, { is_published: false });
    await expect(db.createBooking(input)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("R-52 없는 회차에는 신청할 수 없다", async () => {
    client.queue("sessions", null);
    await expect(db.createBooking(input)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it.each([
    { message: "DUPLICATE_BOOKING", code: "DUPLICATE_BOOKING", rule: "R-16" },
    { message: "SESSION_FULL", code: "SESSION_FULL", rule: "R-11 R-15" },
    { message: "NOT_FOUND", code: "NOT_FOUND", rule: "R-52" },
    { message: "private RPC failure", code: "INTERNAL_ERROR", rule: "R-15" },
  ])("$rule RPC 오류 $message를 AppError($code)로 변환한다", async ({ message, code }) => {
    queueApplication();
    client.rpc.mockResolvedValue({ data: null, error: { message } });
    const error = await db.createBooking(input).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code });
    if (code === "INTERNAL_ERROR") expect(error).not.toHaveProperty("message", message);
  });
});

describe("고객 예약 조회와 취소", () => {
  it.each(["lookup", "cancel"])('R-30 %s 입력 형식이 잘못되면 DB를 호출하지 않는다', async (action) => {
    const result = action === "lookup"
      ? db.lookupBooking({ ...credentials, phoneLast4: 1 })
      : db.cancelBookingByCustomer(credentials.code, { phoneLast4: 1 });
    await expect(result).rejects.toMatchObject({ code: "VALIDATION_ERROR", fieldErrors: { phoneLast4: expect.any(String) } });
    expect(createClient).not.toHaveBeenCalled();
  });

  it.each(["lookup", "cancel"])('R-30 %s에서 없는 번호와 뒷자리 불일치는 같은 오류이고 상태·기한을 노출하지 않는다', async (action) => {
    const transition = vi.spyOn(rules, "canTransition");
    const deadline = vi.spyOn(rules, "customerCancelDeadline");
    const errors: unknown[] = [];
    for (const data of [null, { ...booking, phone: "01099999999", status: "confirmed" }]) {
      client.queue("bookings", data);
      const result = action === "lookup"
        ? db.lookupBooking(credentials)
        : db.cancelBookingByCustomer(credentials.code, { phoneLast4: "0001" });
      const error = await result.catch((error: unknown) => error);
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ code: "BOOKING_NOT_FOUND", message: "예약을 찾을 수 없습니다." });
      expect(Object.keys(error as object).sort()).toEqual(["code", "fieldErrors"]);
      errors.push(error);
    }
    expect(String(errors[0])).toBe(String(errors[1]));
    expect(transition).not.toHaveBeenCalled();
    expect(deadline).not.toHaveBeenCalled();
    expect(client.from.mock.calls).toEqual([["bookings"], ["bookings"]]);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("R-30 R-52 R-58 비공개 클래스의 최신 설명을 반환하며 전화번호·내부 id를 포함하지 않는다", async () => {
    queueLookup({}, {}, { is_published: false, description: "변경된 설명과 문의처" });
    await expect(db.lookupBooking(credentials)).resolves.toEqual({
      code: booking.code, status: "pending", headcount: 2,
      class: { title: workshop.title, description: "변경된 설명과 문의처" },
      session: { startsAt: session.starts_at, status: "scheduled" },
      canCancel: true, cancelDeadline: session.starts_at,
    });
    expect(client.queries[0].chain.eq).toHaveBeenCalledWith("code", "BK-DEMO01");
  });

  it("R-30 R-42 R-54 취소된 숨김 회차의 최종 예약도 조회할 수 있다", async () => {
    queueLookup({ status: "cancelled" }, { status: "cancelled", starts_at: "2026-10-16T00:00:00Z" });
    await expect(db.lookupBooking(credentials)).resolves.toMatchObject({ status: "cancelled", session: { status: "cancelled" }, canCancel: false, cancelDeadline: null });
  });

  it("R-31 시작 23시간 전 확정 예약은 조회 시 직접 취소 불가이며 취소 RPC를 호출하지 않는다", async () => {
    const starts_at = new Date(now.getTime() + 23 * 60 * 60 * 1000).toISOString();
    queueLookup({ status: "confirmed" }, { starts_at });
    queueLookup({ status: "confirmed" }, { starts_at });
    await expect(db.lookupBooking(credentials)).resolves.toMatchObject({
      canCancel: false,
      cancelDeadline: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
    });
    await expect(db.cancelBookingByCustomer(credentials.code, { phoneLast4: "0001" })).rejects.toMatchObject({ code: "CANCEL_DEADLINE_PASSED" });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("R-03 R-31 정확히 24시간 전 취소 후 같은 요청 시각으로 갱신된 예약을 조회한다", async () => {
    const starts_at = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const transition = vi.spyOn(rules, "canTransition");
    queueLookup({ status: "confirmed" }, { starts_at });
    queueLookup({ status: "cancelled" }, { starts_at }, { description: "취소 후 최신 설명" });
    client.rpc.mockImplementationOnce(async () => {
      vi.setSystemTime("2026-10-25T00:00:00Z");
      return { data: null, error: null };
    });

    await expect(db.cancelBookingByCustomer(credentials.code, { phoneLast4: "0001" })).resolves.toMatchObject({ status: "cancelled", canCancel: false, cancelDeadline: null, class: { description: "취소 후 최신 설명" } });
    expect(client.rpc).toHaveBeenCalledExactlyOnceWith("customer_cancel_booking", { p_code: "BK-DEMO01", p_phone_last4: "0001", p_now: now.toISOString() });
    expect(transition.mock.calls).toHaveLength(2);
    expect(transition.mock.calls[0][3].now).toEqual(now);
    expect(transition.mock.calls[1][3].now).toBe(transition.mock.calls[0][3].now);
    expect(client.from.mock.calls.filter(([table]) => table === "bookings")).toHaveLength(2);
  });

  it("R-31 조회 중 시작 시각을 지나도 요청 시각으로 승인 대기 예약을 취소한다", async () => {
    const starts_at = new Date(now.getTime() + 1).toISOString();
    client.queue("bookings", booking, null, () => vi.setSystemTime("2026-10-22T00:00:00Z"));
    client.queue("sessions", { ...session, starts_at });
    client.queue("classes", workshop);
    queueLookup({ status: "cancelled" }, { starts_at });

    await expect(db.cancelBookingByCustomer(credentials.code, { phoneLast4: "0001" })).resolves.toMatchObject({ status: "cancelled" });
    expect(client.rpc).toHaveBeenCalledWith("customer_cancel_booking", expect.objectContaining({ p_now: now.toISOString() }));
  });

  it.each(["rejected", "cancelled"])('R-20 R-21 %s 예약은 다시 취소하지 않는다', async (status) => {
    queueLookup({ status });
    await expect(db.cancelBookingByCustomer(credentials.code, { phoneLast4: "0001" })).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("R-20 R-31 취소 저장 시점의 오류를 반환하고 성공 결과를 만들지 않는다", async () => {
    queueLookup();
    client.rpc.mockResolvedValue({ data: null, error: { message: "INVALID_TRANSITION" } });
    await expect(db.cancelBookingByCustomer(credentials.code, { phoneLast4: "0001" })).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    expect(client.from.mock.calls.filter(([table]) => table === "bookings")).toHaveLength(1);
  });
});

describe("운영자 예약 목록과 상태 변경", () => {
  it("R-19 q를 RPC 인자로 보내고 필터와 무관한 전체 회차를 시작 순으로 반환한다", async () => {
    const q = "가상,phone.eq.010-0000-0001%_";
    client.rpc.mockResolvedValue({ data: [{
      id: bookingId, code: booking.code, status: "pending", headcount: 2,
      customer_name: booking.customer_name, phone: booking.phone, class_title: workshop.title,
      session_id: sessionId, session_starts_at: session.starts_at, session_status: "scheduled",
    }], error: null });
    client.queue("sessions", [
      { ...session, classes: { title: workshop.title } },
      { ...session, id: "20000000-0000-4000-8000-000000000002", starts_at: "2026-10-16T00:00:00Z", status: "cancelled", classes: { title: "비공개 클래스" } },
    ]);

    await expect(db.listAdminBookings({ sessionId, status: "pending", q })).resolves.toEqual({
      bookings: [{ id: bookingId, code: booking.code, status: "pending", headcount: 2, customerName: booking.customer_name, phone: booking.phone, classTitle: workshop.title, sessionId, sessionStartsAt: session.starts_at, sessionStatus: "scheduled" }],
      sessions: [
        { id: "20000000-0000-4000-8000-000000000002", classTitle: "비공개 클래스", startsAt: "2026-10-16T00:00:00Z", status: "cancelled" },
        { id: sessionId, classTitle: workshop.title, startsAt: session.starts_at, status: "scheduled" },
      ],
    });
    expect(client.rpc).toHaveBeenCalledExactlyOnceWith("admin_list_bookings", { p_session_id: sessionId, p_status: "pending", p_q: q });
    expect(client.queries[0].chain.eq).not.toHaveBeenCalled();
    expect(client.queries[0].chain.in).not.toHaveBeenCalled();
  });

  it("R-19 선택하지 않은 필터는 null로 전달하고 빈 결과를 반환한다", async () => {
    client.rpc.mockResolvedValue({ data: [], error: null });
    client.queue("sessions", []);
    await expect(db.listAdminBookings({})).resolves.toEqual({ bookings: [], sessions: [] });
    expect(client.rpc).toHaveBeenCalledWith("admin_list_bookings", { p_session_id: null, p_status: null, p_q: null });
  });

  it.each([{ status: "invalid" }, { status: "" }, { sessionId: "not-a-uuid" }, { sessionId: "" }])("R-19 잘못된 필터 %j는 DB 호출 없이 거부한다", async (filter) => {
    await expect(db.listAdminBookings(filter)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(createClient).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("R-19 목록 RPC 오류를 AppError로 변환한다", async () => {
    client.rpc.mockResolvedValue({ data: null, error: { message: "private list failure" } });
    await expect(db.listAdminBookings({})).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  });

  it("R-22 시작 시각 정각에는 승인하지 않는다", async () => {
    client.queue("bookings", booking);
    client.queue("sessions", { ...session, starts_at: now.toISOString() });
    await expect(db.changeBookingStatus(bookingId, "confirm")).rejects.toMatchObject({ code: "SESSION_STARTED" });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("R-20 R-22 승인 조회 중 시작 시각을 지나도 진입 시각을 규칙과 RPC에 전달한다", async () => {
    const transition = vi.spyOn(rules, "canTransition");
    const startsAt = new Date(now.getTime() + 1);
    client.queue("bookings", booking, null, () => vi.setSystemTime("2026-10-22T00:00:00Z"));
    client.queue("sessions", { ...session, starts_at: startsAt.toISOString() });
    await expect(db.changeBookingStatus(bookingId, "confirm")).resolves.toBeUndefined();
    expect(transition).toHaveBeenCalledExactlyOnceWith("pending", "confirm", "admin", { startsAt, now });
    expect(client.rpc).toHaveBeenCalledExactlyOnceWith("admin_set_booking_status", { p_booking_id: bookingId, p_action: "confirm", p_now: now.toISOString() });
  });

  it.each(["rejected", "cancelled"])('R-20 R-21 최종 상태 %s를 승인하지 않는다', async (status) => {
    client.queue("bookings", { ...booking, status });
    client.queue("sessions", session);
    await expect(db.changeBookingStatus(bookingId, "confirm")).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it.each(["reject", "cancel"] as const)("R-17 R-32 시작한 회차에서도 운영자 %s는 가능하다", async (action) => {
    client.queue("bookings", booking);
    client.queue("sessions", { ...session, starts_at: "2026-10-16T00:00:00Z" });
    await expect(db.changeBookingStatus(bookingId, action)).resolves.toBeUndefined();
    expect(client.rpc).toHaveBeenCalledWith("admin_set_booking_status", { p_booking_id: bookingId, p_action: action, p_now: now.toISOString() });
  });

  it("R-20 예약이 없으면 NOT_FOUND이다", async () => {
    client.queue("bookings", null);
    await expect(db.changeBookingStatus(bookingId, "confirm")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("R-20 저장 시점 상태 변경 오류를 반환한다", async () => {
    client.queue("bookings", booking);
    client.queue("sessions", session);
    client.rpc.mockResolvedValue({ data: null, error: { message: "INVALID_TRANSITION" } });
    await expect(db.changeBookingStatus(bookingId, "confirm")).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });
});
