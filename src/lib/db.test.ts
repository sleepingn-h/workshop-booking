import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

type Reply = {
  data: unknown;
  error: { message?: string } | null;
  beforeRead?: () => void;
  count?: number | null;
};

// 쿼리를 실행하지 않고 테이블별 응답 큐와 체인 호출만 기록한다.
function mockSupabase() {
  const replies = new Map<string, Reply[]>();
  const queries: { table: string; chain: ReturnType<typeof queryChain> }[] = [];
  const bucket = {
    upload: vi.fn().mockResolvedValue({ data: null, error: null }),
    remove: vi.fn().mockResolvedValue({ data: null, error: null }),
    getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "https://images.example.test/new.jpg" } }),
  };

  function queryChain(table: string) {
    return {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
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
    storage: { from: vi.fn().mockReturnValue(bucket) },
    bucket,
    queries,
    queueCount(table: string, count: number) {
      const queue = replies.get(table) ?? [];
      queue.push({ data: null, error: null, count });
      replies.set(table, queue);
    },
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
let mockDb: typeof import("./mock-db");
let AppError: typeof import("./types").AppError;

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("MOCK_DB", undefined);
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("SUPABASE_URL", "https://workshop.example.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
  createClient.mockReset();
  client = mockSupabase();
  createClient.mockReturnValue(client);
  db = await import("./db");
  rules = await import("./rules");
  mockDb = await import("./mock-db");
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

describe("개발용 읽기 전용 목 모드 분기", () => {
  beforeEach(() => {
    vi.stubEnv("MOCK_DB", "1");
    vi.stubEnv("SUPABASE_URL", undefined);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", undefined);
  });

  const filter = { sessionId, status: "pending", q: " 가상예약자01 " };

  it.each([
    { name: "listPublishedClasses", call: () => db.listPublishedClasses(), spy: () => vi.spyOn(mockDb, "mockListPublishedClasses"), args: [] },
    { name: "getPublishedClass", call: () => db.getPublishedClass(classId), spy: () => vi.spyOn(mockDb, "mockGetPublishedClass"), args: [classId] },
    { name: "lookupBooking", call: () => db.lookupBooking(credentials), spy: () => vi.spyOn(mockDb, "mockLookupBooking"), args: [credentials] },
    { name: "listAdminBookings", call: () => db.listAdminBookings(filter), spy: () => vi.spyOn(mockDb, "mockListAdminBookings"), args: [filter] },
    { name: "listAdminClasses", call: () => db.listAdminClasses(), spy: () => vi.spyOn(mockDb, "mockListAdminClasses"), args: [] },
    { name: "getAdminClass", call: () => db.getAdminClass(classId), spy: () => vi.spyOn(mockDb, "mockGetAdminClass"), args: [classId] },
  ])("$name: Supabase 없이 같은 인자와 분기 전 요청 시각을 목 함수에 넘긴다", async ({ call, spy, args }) => {
    const delegate = spy();
    const isMockDb = mockDb.isMockDb;
    vi.spyOn(mockDb, "isMockDb").mockImplementation(() => {
      vi.setSystemTime("2026-10-25T00:00:00Z");
      return isMockDb();
    });

    const result = await call();

    expect(delegate).toHaveBeenCalledExactlyOnceWith(...args, now);
    expect(result).toBe(delegate.mock.results[0].value);
    expect(createClient).not.toHaveBeenCalled();
    expect(client.from).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it.each([
    { name: "createBooking", call: () => db.createBooking(input), invalidCall: () => db.createBooking({}) },
    { name: "cancelBookingByCustomer", call: () => db.cancelBookingByCustomer(credentials.code, { phoneLast4: "0001" }), invalidCall: () => db.cancelBookingByCustomer("", {}) },
    { name: "changeBookingStatus", call: () => db.changeBookingStatus(bookingId, "confirm"), invalidCall: () => db.changeBookingStatus("invalid-id", "confirm") },
    { name: "createClass", call: () => db.createClass({ title: "새 클래스", description: "안내" }), invalidCall: () => db.createClass({ title: " " }) },
    { name: "updateClass", call: () => db.updateClass(classId, { title: "수정" }), invalidCall: () => db.updateClass("invalid-id", {}) },
    { name: "deleteClass", call: () => db.deleteClass(classId), invalidCall: () => db.deleteClass("invalid-id") },
    { name: "uploadClassImage", call: () => db.uploadClassImage(classId, new File(["image"], "test.jpg", { type: "image/jpeg" })), invalidCall: () => db.uploadClassImage(classId, new File(["image"], "test.gif", { type: "image/gif" })) },
    { name: "createSession", call: () => db.createSession(classId, { startsAt: session.starts_at, capacity: 6 }), invalidCall: () => db.createSession(classId, { startsAt: now.toISOString(), capacity: 0 }) },
    { name: "updateSession", call: () => db.updateSession(sessionId, { capacity: 4 }), invalidCall: () => db.updateSession(sessionId, { capacity: 0 }) },
    { name: "deleteSession", call: () => db.deleteSession(sessionId), invalidCall: () => db.deleteSession("invalid-id") },
    { name: "cancelSession", call: () => db.cancelSession(sessionId), invalidCall: () => db.cancelSession("invalid-id") },
  ])("$name: 유효·무효 입력 모두 검증·DB·Storage 호출 전에 MOCK_READ_ONLY로 거부한다", async ({ call, invalidCall }) => {
    const validators = [
      "validateBookingInput", "validateLookupInput", "validateClassInput", "validateClassPatch",
      "validateImage", "validateSessionInput", "validateSessionPatch",
    ] as const;
    const validationSpies = validators.map((name) => vi.spyOn(rules, name));

    for (const attempt of [call, invalidCall]) {
      await expect(attempt()).rejects.toMatchObject({
        code: "MOCK_READ_ONLY",
        message: "목 데이터 모드에서는 변경할 수 없습니다.",
      });
    }

    for (const validate of validationSpies) expect(validate).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
    expect(client.from).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
    expect(client.storage.from).not.toHaveBeenCalled();
    expect(client.bucket.upload).not.toHaveBeenCalled();
    expect(client.bucket.remove).not.toHaveBeenCalled();
  });

  it("production에서는 MOCK_DB=1이어도 실제 조건에 따라 Supabase로 조회·저장한다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SUPABASE_URL", "https://workshop.example.test");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
    const delegate = vi.spyOn(mockDb, "mockListPublishedClasses");
    client.queue("classes", []);
    client.queue("classes", { id: classId });

    await expect(db.listPublishedClasses()).resolves.toEqual([]);
    await expect(db.createClass({ title: "새 클래스", description: "안내" })).resolves.toEqual({ id: classId });

    expect(delegate).not.toHaveBeenCalled();
    expect(createClient).toHaveBeenCalledExactlyOnceWith(
      "https://workshop.example.test",
      "test-service-role-key",
      { auth: { persistSession: false } },
    );
    expect(client.queries[1].chain.insert).toHaveBeenCalledWith({ title: "새 클래스", description: "안내" });
  });
});

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
  it("R-52 R-54 공개 클래스마다 신청 가능한 다음 회차와 남은 자리를, 모두 마감이면 첫 회차를, 없으면 null을 준다", async () => {
    const fullClass = { ...workshop, id: "10000000-0000-4000-8000-000000000003" };
    const emptyClass = { ...workshop, id: "10000000-0000-4000-8000-000000000002", image_url: null };
    const earlyFullId = "20000000-0000-4000-8000-000000000002";
    const laterId = "20000000-0000-4000-8000-000000000003";
    const onlyFullId = "20000000-0000-4000-8000-000000000004";
    client.queue("classes", [workshop, fullClass, emptyClass]);
    client.queue("sessions", [
      { ...session, id: laterId, starts_at: "2026-10-22T03:00:00.123Z" },
      { ...session, id: "20000000-0000-4000-8000-000000000005", starts_at: now.toISOString() },
      { ...session, id: "20000000-0000-4000-8000-000000000006", starts_at: "2026-10-18T03:00:00.123Z", status: "cancelled" },
      { ...session, id: earlyFullId, starts_at: "2026-10-19T03:00:00.123Z" },
      session,
      { ...session, id: onlyFullId, class_id: fullClass.id, starts_at: "2026-10-23T03:00:00.123Z" },
    ]);
    client.queue("session_stats", [
      stats,
      { ...stats, session_id: earlyFullId, occupied: 6 },
      { ...stats, session_id: onlyFullId, occupied: 6 },
    ]);

    await expect(db.listPublishedClasses()).resolves.toEqual([
      { id: classId, title: workshop.title, description: workshop.description, imageUrl: workshop.image_url, nextSessionAt: session.starts_at, nextSessionRemaining: 4 },
      { id: fullClass.id, title: workshop.title, description: workshop.description, imageUrl: workshop.image_url, nextSessionAt: "2026-10-23T03:00:00.123Z", nextSessionRemaining: 0 },
      { id: emptyClass.id, title: workshop.title, description: workshop.description, imageUrl: null, nextSessionAt: null, nextSessionRemaining: null },
    ]);
    expect(client.queries[0].chain.eq).toHaveBeenCalledWith("is_published", true);
    expect(client.queries.find(({ table }) => table === "session_stats")?.chain.in)
      .toHaveBeenCalledWith("session_id", [earlyFullId, sessionId, laterId, onlyFullId]);
  });

  it("R-54 표시할 회차가 없으면 남은 자리를 조회하지 않는다", async () => {
    client.queue("classes", [workshop]);
    client.queue("sessions", [{ ...session, status: "cancelled" }]);

    await expect(db.listPublishedClasses()).resolves.toEqual([
      expect.objectContaining({ id: classId, nextSessionAt: null, nextSessionRemaining: null }),
    ]);
    expect(client.queries.map(({ table }) => table)).toEqual(["classes", "sessions"]);
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

const sessionInput = { startsAt: session.starts_at, capacity: 6 };
const oldImagePath = `classes/${classId}/old.jpg`;

function queueSessionStats(patch: Partial<typeof stats> = {}) {
  client.queue("sessions", session);
  client.queue("session_stats", { ...stats, ...patch });
}

describe("운영자 카탈로그 입력과 대상 확인", () => {
  const idActions = [
    { name: "getAdminClass", table: "classes", call: (id: string) => db.getAdminClass(id) },
    { name: "updateClass", table: "classes", call: (id: string) => db.updateClass(id, { title: "수정" }) },
    { name: "deleteClass", table: "classes", call: (id: string) => db.deleteClass(id) },
    { name: "uploadClassImage", table: "classes", call: (id: string) => db.uploadClassImage(id, new File(["image"], "test.jpg", { type: "image/jpeg" })) },
    { name: "updateSession", table: "sessions", call: (id: string) => db.updateSession(id, { capacity: 4 }) },
    { name: "deleteSession", table: "sessions", call: (id: string) => db.deleteSession(id) },
    { name: "cancelSession", table: "sessions", call: (id: string) => db.cancelSession(id) },
  ];

  it.each([
    ...idActions,
    { name: "createSession", call: (id: string) => db.createSession(id, sessionInput) },
  ])("R-46 R-52 $name: 잘못된 UUID는 DB·Storage 호출 없이 NOT_FOUND이다", async ({ call }) => {
    await expect(call("not-a-uuid")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(createClient).not.toHaveBeenCalled();
    expect(client.from).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
    expect(client.storage.from).not.toHaveBeenCalled();
  });

  it.each(idActions)("R-46 R-52 $name: 대상이 없으면 NOT_FOUND이다", async ({ call, table }) => {
    client.queue(table, null);
    await expect(call(table === "classes" ? classId : sessionId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(client.rpc).not.toHaveBeenCalled();
    expect(client.storage.from).not.toHaveBeenCalled();
  });

  it.each([
    { name: "createClass", call: () => db.createClass({ title: " " }) },
    { name: "updateClass", call: () => db.updateClass(classId, { isPublished: "true" }) },
    { name: "updateSession", call: () => db.updateSession(sessionId, { capacity: 0 }) },
    { name: "updateSession classId", call: () => db.updateSession(sessionId, { classId }) },
  ])("R-46 R-57 $name: 잘못된 입력은 DB 호출 전에 필드 오류로 거부한다", async ({ call }) => {
    await expect(call()).rejects.toMatchObject({ code: "VALIDATION_ERROR", fieldErrors: expect.any(Object) });
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("운영자 클래스 조회와 저장", () => {
  it("R-17 R-52 R-54 비공개를 포함해 생성 시각 내림차순으로 조회하고 예정 회차 수와 승인 대기 건수를 반환한다", async () => {
    const privateClass = { ...workshop, id: "10000000-0000-4000-8000-000000000002", is_published: false, image_url: null };
    const at = (id: string, starts_at: string, status = "scheduled") => ({ id, starts_at, status });
    const sessions = [
      at(sessionId, session.starts_at),
      at("20000000-0000-4000-8000-000000000002", now.toISOString()),
      at("20000000-0000-4000-8000-000000000003", "2026-10-16T03:00:00Z"),
      at("20000000-0000-4000-8000-000000000004", "2026-10-25T03:00:00Z", "cancelled"),
    ];
    client.queue("classes", [
      { ...privateClass, sessions: [] },
      { ...workshop, sessions },
    ]);
    client.queue("bookings", [
      { session_id: sessionId },
      { session_id: sessionId },
      { session_id: "20000000-0000-4000-8000-000000000003" },
    ]);

    await expect(db.listAdminClasses()).resolves.toEqual([
      { id: privateClass.id, title: privateClass.title, isPublished: false, imageUrl: null, upcomingSessionCount: 0, pendingCount: 0 },
      { id: classId, title: workshop.title, isPublished: true, imageUrl: workshop.image_url, upcomingSessionCount: 1, pendingCount: 3 },
    ]);
    expect(client.queries[0].chain.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(client.queries[0].chain.eq).not.toHaveBeenCalled();
    expect(client.queries[0].chain.select).toHaveBeenCalledWith(expect.stringContaining("sessions(id,starts_at,status)"));
    expect(client.queries[1].chain.select).toHaveBeenCalledWith("session_id");
    expect(client.queries[1].chain.eq).toHaveBeenCalledWith("status", "pending");
    expect(client.queries[1].chain.in).toHaveBeenCalledWith("session_id", sessions.map(({ id }) => id));
  });

  it("R-52 클래스나 회차가 없으면 승인 대기를 조회하지 않는다", async () => {
    client.queue("classes", []);
    await expect(db.listAdminClasses()).resolves.toEqual([]);
    client.queue("classes", [{ ...workshop, sessions: [] }]);
    await expect(db.listAdminClasses()).resolves.toMatchObject([{ upcomingSessionCount: 0, pendingCount: 0 }]);
    expect(client.from.mock.calls).toEqual([["classes"], ["classes"]]);
  });

  it("R-01 R-17 R-41 R-52 시작·취소 회차도 시작 순서로 표시하고 점유 인원·전체 이력 수·승인 대기 건수를 구분한다", async () => {
    const pastSession = { ...session, id: "20000000-0000-4000-8000-000000000002", starts_at: "2026-10-16T03:00:00Z", status: "cancelled" };
    client.queue("classes", { ...workshop, is_published: false });
    client.queue("sessions", [session, pastSession]);
    client.queue("session_stats", [stats, { session_id: pastSession.id, occupied: 0, booking_count: 2 }]);
    client.queue("bookings", [{ session_id: sessionId }]);

    await expect(db.getAdminClass(classId)).resolves.toEqual({
      id: classId, title: workshop.title, description: workshop.description, imageUrl: workshop.image_url, isPublished: false,
      sessions: [
        { id: pastSession.id, startsAt: pastSession.starts_at, capacity: 6, status: "cancelled", occupied: 0, bookingCount: 2, pendingCount: 0 },
        { id: sessionId, startsAt: session.starts_at, capacity: 6, status: "scheduled", occupied: 2, bookingCount: 1, pendingCount: 1 },
      ],
    });
    expect(client.queries[1].chain.eq).toHaveBeenCalledWith("class_id", classId);
    expect(client.queries[1].chain.order).toHaveBeenCalledWith("starts_at", { ascending: true });
    const pending = client.queries.find(({ table }) => table === "bookings")!.chain;
    expect(pending.select).toHaveBeenCalledWith("session_id");
    expect(pending.eq).toHaveBeenCalledWith("status", "pending");
    expect(pending.in).toHaveBeenCalledWith("session_id", [sessionId, pastSession.id]);
  });

  it("R-50 회차가 없는 클래스는 빈 회차 목록을 반환한다", async () => {
    client.queue("classes", workshop);
    client.queue("sessions", []);
    await expect(db.getAdminClass(classId)).resolves.toMatchObject({ sessions: [] });
    expect(client.from.mock.calls).toEqual([["classes"], ["sessions"]]);
  });

  it("R-57 입력의 공개 여부를 무시하고 비공개 기본값으로 클래스를 만든다", async () => {
    client.queue("classes", { id: classId });

    await expect(db.createClass({ title: " 도자기 컵 ", description: " 안내 ", isPublished: true, is_published: true })).resolves.toEqual({ id: classId });
    expect(client.queries[0].chain.insert).toHaveBeenCalledExactlyOnceWith({ title: "도자기 컵", description: "안내" });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("R-58 이름·설명은 일반 update로 저장하고 검증된 필드만 보낸다", async () => {
    client.queue("classes", { id: classId });
    await expect(db.updateClass(classId, { title: " 새 이름 ", description: " 새 설명 ", image_path: "invalid" })).resolves.toBeUndefined();
    expect(client.queries[0].chain.update).toHaveBeenCalledExactlyOnceWith({ title: "새 이름", description: "새 설명" });
    expect(client.queries[0].chain.eq).toHaveBeenCalledWith("id", classId);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it.each([true, false])("R-52 공개 여부 %s는 일반 update 없이 set_class_published RPC로 저장한다", async (isPublished) => {
    await expect(db.updateClass(classId, { isPublished })).resolves.toBeUndefined();
    expect(client.rpc).toHaveBeenCalledExactlyOnceWith("set_class_published", { p_class_id: classId, p_is_published: isPublished });
    expect(client.from).not.toHaveBeenCalled();
  });

  it("R-52 R-58 함께 수정할 때 일반 update에서 공개 여부를 제외하고 RPC로 보낸다", async () => {
    client.queue("classes", { id: classId });
    await db.updateClass(classId, { title: "새 이름", isPublished: true });
    expect(client.queries[0].chain.update).toHaveBeenCalledExactlyOnceWith({ title: "새 이름" });
    expect(client.rpc).toHaveBeenCalledExactlyOnceWith("set_class_published", { p_class_id: classId, p_is_published: true });
  });

  it("R-51 회차가 있으면 삭제·비공개 RPC를 호출하지 않는다", async () => {
    client.queue("classes", workshop);
    client.queueCount("sessions", 1);
    await expect(db.deleteClass(classId)).rejects.toMatchObject({ code: "CLASS_HAS_SESSIONS" });
    expect(client.rpc).not.toHaveBeenCalled();
    expect(client.storage.from).not.toHaveBeenCalled();
    expect(client.queries[1].chain.eq).toHaveBeenCalledWith("class_id", classId);
  });

  it.each([null, oldImagePath])("R-50 클래스 삭제 후 RPC가 반환한 파일 경로 %s만 삭제한다", async (path) => {
    client.queue("classes", workshop);
    client.queueCount("sessions", 0);
    client.rpc.mockResolvedValue({ data: path, error: null });
    await expect(db.deleteClass(classId)).resolves.toBeUndefined();
    expect(client.rpc).toHaveBeenCalledExactlyOnceWith("delete_class", { p_class_id: classId });
    if (path) {
      expect(client.storage.from).toHaveBeenCalledWith("class-images");
      expect(client.bucket.remove).toHaveBeenCalledExactlyOnceWith([path]);
    } else {
      expect(client.storage.from).not.toHaveBeenCalled();
    }
  });

  it.each(["error", "throw"])("R-50 클래스 삭제 후 Storage 삭제 %s는 되돌리지 않고 경로만 로그에 남긴다", async (failure) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    client.queue("classes", workshop);
    client.queueCount("sessions", 0);
    client.rpc.mockResolvedValue({ data: oldImagePath, error: null });
    if (failure === "error") client.bucket.remove.mockResolvedValue({ data: null, error: { message: "private storage failure" } });
    else client.bucket.remove.mockRejectedValue(new Error("private storage failure"));

    await expect(db.deleteClass(classId)).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledExactlyOnceWith(oldImagePath);
  });

  it("R-51 잠금 후 회차가 발견되면 RPC 오류를 반환하고 Storage는 삭제하지 않는다", async () => {
    client.queue("classes", workshop);
    client.queueCount("sessions", 0);
    client.rpc.mockResolvedValue({ data: null, error: { message: "CLASS_HAS_SESSIONS" } });
    await expect(db.deleteClass(classId)).rejects.toMatchObject({ code: "CLASS_HAS_SESSIONS" });
    expect(client.bucket.remove).not.toHaveBeenCalled();
  });
});

describe("서버 클래스 이미지 업로드", () => {
  it.each([
    { type: "image/gif", size: 10 },
    { type: "image/jpeg", size: 4 * 1024 * 1024 + 1 },
  ])("이미지 형식·크기 %j가 잘못되면 DB·Storage를 호출하지 않는다", async ({ type, size }) => {
    const file = new File([new Uint8Array(size)], "image", { type });
    await expect(db.uploadClassImage(classId, file)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(createClient).not.toHaveBeenCalled();
    expect(client.bucket.upload).not.toHaveBeenCalled();
  });

  it.each([
    { type: "image/jpeg", ext: "jpg" },
    { type: "image/png", ext: "png" },
    { type: "image/webp", ext: "webp" },
  ])("R-58 $type: 파일명 대신 MIME과 UUID로 경로를 만들고 샘플 파일은 삭제하지 않는다", async ({ type, ext }) => {
    const file = new File(["image"], "../../untrusted.gif", { type });
    client.queue("classes", { image_path: null });
    client.queue("classes", { id: classId });

    await expect(db.uploadClassImage(classId, file)).resolves.toEqual({ imageUrl: "https://images.example.test/new.jpg" });
    const path = client.bucket.upload.mock.calls[0][0];
    expect(path).toMatch(new RegExp(`^classes/${classId}/[0-9a-f-]{36}\\.${ext}$`));
    expect(client.storage.from).toHaveBeenCalledWith("class-images");
    expect(client.bucket.upload).toHaveBeenCalledExactlyOnceWith(path, file, { contentType: type });
    expect(client.bucket.getPublicUrl).toHaveBeenCalledExactlyOnceWith(path);
    expect(client.queries[1].chain.update).toHaveBeenCalledExactlyOnceWith({ image_url: "https://images.example.test/new.jpg", image_path: path });
    expect(client.queries[1].chain.eq).toHaveBeenCalledWith("id", classId);
    expect(client.bucket.remove).not.toHaveBeenCalled();
  });

  it("R-58 교체한 URL·경로 저장이 성공한 뒤 기존 Storage 파일을 삭제한다", async () => {
    client.queue("classes", { image_path: oldImagePath });
    client.queue("classes", { id: classId }, null, () => expect(client.bucket.remove).not.toHaveBeenCalled());
    await db.uploadClassImage(classId, new File(["image"], "new.jpg", { type: "image/jpeg" }));
    expect(client.bucket.remove).toHaveBeenCalledExactlyOnceWith([oldImagePath]);
  });

  it.each([
    { message: "VALIDATION_ERROR", code: "VALIDATION_ERROR" },
    { message: "private storage failure", code: "INTERNAL_ERROR" },
  ])("Storage upload 오류 $message → $code: 에러를 변환하고 기존 파일은 유지한다", async ({ message, code }) => {
    client.queue("classes", { image_path: oldImagePath });
    client.bucket.upload.mockResolvedValue({ data: null, error: { message } });
    await expect(db.uploadClassImage(classId, new File(["image"], "new.jpg", { type: "image/jpeg" }))).rejects.toMatchObject({ code });
    expect(client.from).toHaveBeenCalledTimes(1);
    expect(client.bucket.getPublicUrl).not.toHaveBeenCalled();
    expect(client.bucket.remove).not.toHaveBeenCalled();
  });

  it("R-58 교체 후 기존 파일 삭제 오류도 AppError로 변환한다", async () => {
    client.queue("classes", { image_path: oldImagePath });
    client.queue("classes", { id: classId });
    client.bucket.remove.mockResolvedValue({ data: null, error: { message: "private cleanup failure" } });
    await expect(db.uploadClassImage(classId, new File(["image"], "new.jpg", { type: "image/jpeg" }))).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  });

  it("R-58 URL 저장 중 클래스가 사라지면 NOT_FOUND이고 기존 파일은 삭제하지 않는다", async () => {
    client.queue("classes", { image_path: oldImagePath });
    client.queue("classes", null);
    await expect(db.uploadClassImage(classId, new File(["image"], "new.jpg", { type: "image/jpeg" }))).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(client.bucket.remove).not.toHaveBeenCalledWith([oldImagePath]);
    expect(client.bucket.remove).toHaveBeenCalledExactlyOnceWith([client.bucket.upload.mock.calls[0][0]]);
  });

  it("R-58 URL 저장 실패는 원문 없이 반환하고 새 업로드만 정리한다", async () => {
    client.queue("classes", { image_path: oldImagePath });
    client.queue("classes", null, { message: "private update failure" });
    await expect(db.uploadClassImage(classId, new File(["image"], "new.jpg", { type: "image/jpeg" }))).rejects.toMatchObject({
      code: "INTERNAL_ERROR", message: "처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
    });
    expect(client.bucket.remove).toHaveBeenCalledExactlyOnceWith([client.bucket.upload.mock.calls[0][0]]);
  });
});

describe("운영자 회차 관리", () => {
  it.each([
    { startsAt: "2026-10-16T03:00:00Z", capacity: 4 },
    { startsAt: now.toISOString(), capacity: 4 },
    { startsAt: session.starts_at, capacity: 0 },
  ])("R-46 과거·시작 정각·잘못된 정원 %j는 DB 호출 전에 거부한다", async (input) => {
    await expect(db.createSession(classId, input)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(createClient).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("R-46 정상 생성은 같은 요청 시각을 입력 규칙과 RPC에 넘기고 id를 반환한다", async () => {
    const validate = vi.spyOn(rules, "validateSessionInput");
    client.rpc.mockImplementationOnce(async () => {
      vi.setSystemTime("2026-10-22T00:00:00Z");
      return { data: sessionId, error: null };
    });
    await expect(db.createSession(classId, sessionInput)).resolves.toEqual({ id: sessionId });
    expect(validate).toHaveBeenCalledExactlyOnceWith(sessionInput, now);
    expect(client.rpc).toHaveBeenCalledExactlyOnceWith("create_session", { p_class_id: classId, p_starts_at: session.starts_at, p_capacity: 6, p_now: now.toISOString() });
  });

  it("R-40 점유 인원보다 작은 정원은 RPC를 호출하지 않는다", async () => {
    queueSessionStats();
    await expect(db.updateSession(sessionId, { capacity: 1 })).rejects.toMatchObject({ code: "CAPACITY_BELOW_OCCUPIED" });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("R-40 점유 인원과 같은 정원은 행 잠금을 사용하는 RPC로 변경한다", async () => {
    queueSessionStats();
    await expect(db.updateSession(sessionId, { capacity: 2, classId: "다른 클래스" })).resolves.toBeUndefined();
    expect(client.rpc).toHaveBeenCalledExactlyOnceWith("update_session", { p_session_id: sessionId, p_starts_at: null, p_capacity: 2, p_now: now.toISOString() });
  });

  it("R-44 거절·취소만 있어 점유 인원이 0이어도 이력이 있으면 시각 변경을 거부한다", async () => {
    queueSessionStats({ occupied: 0, booking_count: 2 });
    await expect(db.updateSession(sessionId, { startsAt: "2026-10-22T03:00:00Z" })).rejects.toMatchObject({ code: "SESSION_HAS_BOOKINGS" });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("R-44 표현이 달라도 동일한 시각이면 이력 검사 없이 정원을 수정한다", async () => {
    const change = vi.spyOn(rules, "canChangeStartsAt");
    queueSessionStats();
    await db.updateSession(sessionId, { startsAt: "2026-10-21T12:00:00.123+09:00", capacity: 4 });
    expect(change).not.toHaveBeenCalled();
    expect(client.rpc).toHaveBeenCalledWith("update_session", { p_session_id: sessionId, p_starts_at: session.starts_at, p_capacity: 4, p_now: now.toISOString() });
  });

  it("R-44 조회 중 시각이 바뀌어도 입력 검증·시각 변경 규칙·RPC는 같은 진입 시각을 쓴다", async () => {
    const validate = vi.spyOn(rules, "validateSessionPatch");
    const change = vi.spyOn(rules, "canChangeStartsAt");
    client.queue("sessions", session, null, () => vi.setSystemTime("2026-10-25T00:00:00Z"));
    client.queue("session_stats", { ...stats, occupied: 0, booking_count: 0 });
    const patch = { startsAt: "2026-10-22T03:00:00Z" };
    await expect(db.updateSession(sessionId, patch)).resolves.toBeUndefined();
    expect(validate).toHaveBeenCalledExactlyOnceWith(patch, now);
    expect(change).toHaveBeenCalledExactlyOnceWith(0, new Date(patch.startsAt), now);
    expect(change.mock.calls[0][2]).toBe(validate.mock.calls[0][1]);
    expect(client.rpc).toHaveBeenCalledExactlyOnceWith("update_session", { p_session_id: sessionId, p_starts_at: "2026-10-22T03:00:00.000Z", p_capacity: null, p_now: now.toISOString() });
  });

  it("R-41 점유가 없어도 이력이 있으면 회차를 삭제할 수 없다", async () => {
    queueSessionStats({ occupied: 0, booking_count: 2 });
    await expect(db.deleteSession(sessionId)).rejects.toMatchObject({ code: "SESSION_HAS_BOOKINGS" });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("R-43 이력 없는 회차 삭제는 delete_session RPC로 처리한다", async () => {
    queueSessionStats({ occupied: 0, booking_count: 0 });
    await expect(db.deleteSession(sessionId)).resolves.toBeUndefined();
    expect(client.rpc).toHaveBeenCalledExactlyOnceWith("delete_session", { p_session_id: sessionId });
  });

  it("R-45 이미 취소된 회차는 다시 취소할 수 없다", async () => {
    client.queue("sessions", { ...session, status: "cancelled" });
    await expect(db.cancelSession(sessionId)).rejects.toMatchObject({ code: "SESSION_CANCELLED" });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("R-42 정상 회차 취소는 활성 예약도 함께 취소하는 cancel_session RPC로 처리한다", async () => {
    client.queue("sessions", session);
    await expect(db.cancelSession(sessionId)).resolves.toBeUndefined();
    expect(client.rpc).toHaveBeenCalledExactlyOnceWith("cancel_session", { p_session_id: sessionId });
  });

  it.each(["updateSession", "deleteSession"] as const)("R-41 R-44 %s에서 통계 조회가 사라지면 변경하지 않는다", async (action) => {
    client.queue("sessions", session);
    client.queue("session_stats", null);
    const result = action === "updateSession" ? db.updateSession(sessionId, { capacity: 4 }) : db.deleteSession(sessionId);
    await expect(result).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it.each([
    { action: "updateSession", code: "CAPACITY_BELOW_OCCUPIED", rule: "R-40" },
    { action: "deleteSession", code: "SESSION_HAS_BOOKINGS", rule: "R-41" },
    { action: "cancelSession", code: "SESSION_CANCELLED", rule: "R-45" },
    { action: "createSession", code: "NOT_FOUND", rule: "R-46" },
    { action: "updateClass", code: "NOT_FOUND", rule: "R-52" },
  ])("$rule $action: 저장 시점 RPC 오류 $code 반환", async ({ action, code }) => {
    client.rpc.mockResolvedValue({ data: null, error: { message: code } });
    let result: Promise<unknown>;
    if (action === "updateSession") {
      queueSessionStats();
      result = db.updateSession(sessionId, { capacity: 4 });
    } else if (action === "deleteSession") {
      queueSessionStats({ occupied: 0, booking_count: 0 });
      result = db.deleteSession(sessionId);
    } else if (action === "cancelSession") {
      client.queue("sessions", session);
      result = db.cancelSession(sessionId);
    } else if (action === "createSession") {
      result = db.createSession(classId, sessionInput);
    } else {
      result = db.updateClass(classId, { isPublished: true });
    }
    await expect(result).rejects.toMatchObject({ code });
  });
});
