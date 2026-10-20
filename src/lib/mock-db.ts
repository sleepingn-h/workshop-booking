import "server-only";

import {
  canTransition,
  customerCancelDeadline,
  isVisibleSession,
  nextBookableSession,
  normalizePhone,
  occupiedSeats,
  remainingSeats,
  validateLookupInput,
} from "./rules";
import {
  AppError,
  BOOKING_STATUS_LABEL,
  type AdminBooking,
  type AdminBookingList,
  type AdminClassDetail,
  type AdminClassSummary,
  type AdminSession,
  type BookingLookupResult,
  type ClassDetail,
  type ClassInfo,
  type ClassListInfo,
  type ClassSummary,
} from "./types";

type SampleClass = Readonly<Omit<AdminClassDetail, "sessions">>;
type SampleSession = Readonly<Omit<AdminSession, "occupied" | "bookingCount" | "pendingCount"> & { classId: string }>;
type SampleBooking = Readonly<Omit<AdminBooking, "classTitle" | "sessionStartsAt" | "sessionStatus">>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE_TIME = Date.now();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// schema.sql의 삽입 순서로 두어 고객 목록은 정순, 운영자 목록은 역순으로 표시한다.
const CLASSES: readonly SampleClass[] = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    title: "손으로 빚는 도자기 컵",
    description: "손으로 흙을 빚어 나만의 컵 하나를 완성해요. 완성품은 가마에 구운 뒤 3주 후에 찾아갈 수 있어요.",
    place: "가상 도자기 공방, 시연시 공방로 1 (가상 주소)",
    durationMinutes: 120,
    price: 45000,
    paymentMethod: "현장 결제",
    materials: "없음",
    contact: "010-0000-9001 (시연용 가상 번호)",
    imageUrl: "/samples/class-1.jpg",
    isPublished: true,
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    title: "나만의 가죽 카드 지갑",
    description: "가죽을 재단하고 손바느질해 카드 지갑을 만들어요. 원하면 이니셜을 새길 수 있어요.",
    place: "가상 가죽 공방, 시연시 공방로 2 (가상 주소)",
    durationMinutes: 150,
    price: 55000,
    paymentMethod: "현장 결제",
    materials: "없음",
    contact: "010-0000-9002 (시연용 가상 번호)",
    imageUrl: "/samples/class-2.jpg",
    isPublished: true,
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    title: "작은 꽃다발 만들기",
    description: "제철 꽃으로 작은 꽃다발을 만들어 바로 가져가요.",
    place: "가상 꽃 공방, 시연시 공방로 3 (가상 주소)",
    durationMinutes: 90,
    price: 0,
    paymentMethod: "결제 없음 (무료 클래스)",
    materials: "꽃을 담아 갈 가방",
    contact: "010-0000-9003 (시연용 가상 번호)",
    imageUrl: "/samples/class-3.jpg",
    isPublished: true,
  },
  {
    id: "10000000-0000-4000-8000-000000000004",
    title: "향을 고르는 캔들 클래스",
    description: "여러 향을 맡아 보고 골라 나만의 향초를 만들어요.",
    place: "가상 캔들 공방, 시연시 공방로 4 (가상 주소)",
    durationMinutes: 120,
    price: 40000,
    paymentMethod: "현장 결제",
    materials: "없음",
    contact: "010-0000-9004 (시연용 가상 번호)",
    imageUrl: "/samples/class-4.jpg",
    isPublished: false,
  },
];

// 모듈 로드 시 한 번만 계산한다. 조회 시각으로 샘플 일정을 옮기지 않는다.
const SESSIONS: readonly SampleSession[] = [
  {
    id: "20000000-0000-4000-8000-000000000001",
    classId: "10000000-0000-4000-8000-000000000001",
    startsAt: new Date(BASE_TIME + 4 * DAY).toISOString(),
    capacity: 6, status: "scheduled",
  },
  {
    id: "20000000-0000-4000-8000-000000000002",
    classId: "10000000-0000-4000-8000-000000000001",
    startsAt: new Date(BASE_TIME + 5 * DAY).toISOString(),
    capacity: 4, status: "scheduled",
  },
  {
    id: "20000000-0000-4000-8000-000000000003",
    classId: "10000000-0000-4000-8000-000000000001",
    startsAt: new Date(BASE_TIME + 20 * HOUR).toISOString(),
    capacity: 4, status: "scheduled",
  },
  {
    id: "20000000-0000-4000-8000-000000000004",
    classId: "10000000-0000-4000-8000-000000000001",
    startsAt: new Date(BASE_TIME - 2 * HOUR).toISOString(),
    capacity: 4, status: "scheduled",
  },
  {
    id: "20000000-0000-4000-8000-000000000005",
    classId: "10000000-0000-4000-8000-000000000001",
    startsAt: new Date(BASE_TIME + 6 * DAY).toISOString(),
    capacity: 4, status: "cancelled",
  },
  {
    id: "20000000-0000-4000-8000-000000000006",
    classId: "10000000-0000-4000-8000-000000000002",
    startsAt: new Date(BASE_TIME + 7 * DAY).toISOString(),
    capacity: 6, status: "scheduled",
  },
  {
    id: "20000000-0000-4000-8000-000000000007",
    classId: "10000000-0000-4000-8000-000000000004",
    startsAt: new Date(BASE_TIME + 6 * DAY).toISOString(),
    capacity: 4, status: "scheduled",
  },
];

const BOOKINGS: readonly SampleBooking[] = [
  {
    id: "30000000-0000-4000-8000-000000000001", code: "BK-DEMO01",
    sessionId: "20000000-0000-4000-8000-000000000001", headcount: 2,
    customerName: "가상예약자01", phone: "01000000001", status: "pending",
  },
  {
    id: "30000000-0000-4000-8000-000000000002", code: "BK-DEMO02",
    sessionId: "20000000-0000-4000-8000-000000000002", headcount: 2,
    customerName: "가상예약자02", phone: "01000000002", status: "pending",
  },
  {
    id: "30000000-0000-4000-8000-000000000003", code: "BK-DEMO03",
    sessionId: "20000000-0000-4000-8000-000000000002", headcount: 2,
    customerName: "가상예약자03", phone: "01000000003", status: "confirmed",
  },
  {
    id: "30000000-0000-4000-8000-000000000004", code: "BK-DEMO04",
    sessionId: "20000000-0000-4000-8000-000000000003", headcount: 1,
    customerName: "가상예약자04", phone: "01000000004", status: "confirmed",
  },
  {
    id: "30000000-0000-4000-8000-000000000005", code: "BK-DEMO05",
    sessionId: "20000000-0000-4000-8000-000000000004", headcount: 1,
    customerName: "가상예약자05", phone: "01000000005", status: "pending",
  },
  {
    id: "30000000-0000-4000-8000-000000000006", code: "BK-DEMO06",
    sessionId: "20000000-0000-4000-8000-000000000005", headcount: 1,
    customerName: "가상예약자06", phone: "01000000006", status: "rejected",
  },
  {
    id: "30000000-0000-4000-8000-000000000007", code: "BK-DEMO07",
    sessionId: "20000000-0000-4000-8000-000000000005", headcount: 2,
    customerName: "가상예약자07", phone: "01000000007", status: "cancelled",
  },
  {
    id: "30000000-0000-4000-8000-000000000008", code: "BK-DEMO08",
    sessionId: "20000000-0000-4000-8000-000000000006", headcount: 1,
    customerName: "가상예약자08", phone: "01000000008", status: "rejected",
  },
  {
    id: "30000000-0000-4000-8000-000000000009", code: "BK-DEMO09",
    sessionId: "20000000-0000-4000-8000-000000000006", headcount: 2,
    customerName: "가상예약자09", phone: "01000000009", status: "cancelled",
  },
  {
    id: "30000000-0000-4000-8000-000000000010", code: "BK-DEMO10",
    sessionId: "20000000-0000-4000-8000-000000000006", headcount: 1,
    customerName: "가상예약자10", phone: "01000000010", status: "pending",
  },
  {
    id: "30000000-0000-4000-8000-000000000011", code: "BK-DEMO11",
    sessionId: "20000000-0000-4000-8000-000000000007", headcount: 1,
    customerName: "가상예약자11", phone: "01000000011", status: "pending",
  },
];

function sessionsForClass(id: string): SampleSession[] {
  return SESSIONS.filter((session) => session.classId === id)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

function visibleSessions(id: string, now: Date): SampleSession[] {
  return sessionsForClass(id).filter((session) =>
    isVisibleSession({ status: session.status, startsAt: new Date(session.startsAt) }, now));
}

function listInfo(workshop: SampleClass): ClassListInfo {
  return { place: workshop.place, durationMinutes: workshop.durationMinutes, price: workshop.price };
}

function classInfo(workshop: SampleClass): ClassInfo {
  return { ...listInfo(workshop), paymentMethod: workshop.paymentMethod, materials: workshop.materials, contact: workshop.contact };
}

function bookingsForSession(id: string): SampleBooking[] {
  return BOOKINGS.filter((booking) => booking.sessionId === id);
}

export function isMockDb(): boolean {
  return process.env.MOCK_DB === "1" && process.env.NODE_ENV !== "production";
}

export function mockListPublishedClasses(now: Date): ClassSummary[] {
  return CLASSES.filter((workshop) => workshop.isPublished).map((workshop) => {
    const next = nextBookableSession(publicSessions(workshop.id, now));
    return {
      id: workshop.id,
      title: workshop.title,
      description: workshop.description,
      ...listInfo(workshop),
      imageUrl: workshop.imageUrl,
      nextSessionAt: next?.startsAt ?? null,
      nextSessionRemaining: next?.remaining ?? null,
    };
  });
}

function publicSessions(id: string, now: Date): ClassDetail["sessions"] {
  return visibleSessions(id, now).map((session) => ({
    id: session.id,
    startsAt: session.startsAt,
    capacity: session.capacity,
    remaining: remainingSeats(session.capacity, occupiedSeats(bookingsForSession(session.id))),
  }));
}

export function mockGetPublishedClass(id: string, now: Date): ClassDetail | null {
  const workshop = CLASSES.find((workshop) => workshop.id === id && workshop.isPublished);
  if (!workshop) return null;

  return {
    id: workshop.id,
    title: workshop.title,
    description: workshop.description,
    ...classInfo(workshop),
    imageUrl: workshop.imageUrl,
    sessions: publicSessions(id, now),
  };
}

export function mockLookupBooking(input: unknown, now: Date): BookingLookupResult {
  const validated = validateLookupInput(input);
  if (!validated.ok) throw new AppError(validated.code, undefined, validated.fieldErrors);

  const { code, phoneLast4 } = validated.value;
  const booking = BOOKINGS.find((booking) => booking.code === code);
  if (!booking || booking.phone.slice(-4) !== phoneLast4) throw new AppError("BOOKING_NOT_FOUND");

  // 샘플의 소속 관계는 schema.sql과 같으며 공개 여부와 관계없이 조회한다.
  const session = SESSIONS.find((session) => session.id === booking.sessionId)!;
  const workshop = CLASSES.find((workshop) => workshop.id === session.classId)!;
  const startsAt = new Date(session.startsAt);
  return {
    code: booking.code,
    status: booking.status,
    headcount: booking.headcount,
    class: { title: workshop.title, description: workshop.description, ...classInfo(workshop) },
    session: { startsAt: session.startsAt, status: session.status },
    canCancel: canTransition(booking.status, "cancel", "customer", { startsAt, now }).ok,
    cancelDeadline: customerCancelDeadline(booking.status, startsAt)?.toISOString() ?? null,
  };
}

export function mockListAdminBookings(
  filter: { sessionId?: string | null; status?: string | null; q?: string | null },
  now: Date,
): AdminBookingList {
  // 운영자 조회에는 시간 판정이 없지만 db.ts와 같은 요청 시각을 받는다.
  void now;
  const { sessionId = null, status = null, q = null } = filter;
  if ((status !== null && !Object.hasOwn(BOOKING_STATUS_LABEL, status)) ||
      (sessionId !== null && !UUID_PATTERN.test(sessionId))) {
    throw new AppError("VALIDATION_ERROR");
  }

  const query = q?.trim() ?? "";
  const phone = normalizePhone(query);
  return {
    bookings: BOOKINGS.filter((booking) =>
      (sessionId === null || booking.sessionId === sessionId) &&
      (status === null || booking.status === status) &&
      (!query || booking.customerName.toLowerCase().includes(query.toLowerCase()) || booking.phone === phone))
      .map((booking) => {
        const session = SESSIONS.find((session) => session.id === booking.sessionId)!;
        const workshop = CLASSES.find((workshop) => workshop.id === session.classId)!;
        return {
          ...booking,
          classTitle: workshop.title,
          sessionStartsAt: session.startsAt,
          sessionStatus: session.status,
        };
      })
      // SQL 샘플의 created_at은 같은 트랜잭션 시각이므로 동률은 ID로 정렬한다.
      .sort((a, b) => Date.parse(a.sessionStartsAt) - Date.parse(b.sessionStartsAt) || a.id.localeCompare(b.id)),
    sessions: [...SESSIONS]
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
      .map((session) => ({
        id: session.id,
        classTitle: CLASSES.find((workshop) => workshop.id === session.classId)!.title,
        startsAt: session.startsAt,
        status: session.status,
      })),
  };
}

function pendingCount(bookings: SampleBooking[]): number {
  return bookings.filter((booking) => booking.status === "pending").length;
}

export function mockListAdminClasses(now: Date): AdminClassSummary[] {
  return [...CLASSES].reverse().map((workshop) => ({
    id: workshop.id,
    title: workshop.title,
    ...listInfo(workshop),
    isPublished: workshop.isPublished,
    imageUrl: workshop.imageUrl,
    upcomingSessionCount: visibleSessions(workshop.id, now).length,
    pendingCount: pendingCount(sessionsForClass(workshop.id).flatMap((session) => bookingsForSession(session.id))),
  }));
}

export function mockGetAdminClass(id: string, now: Date): AdminClassDetail {
  void now;
  const workshop = CLASSES.find((workshop) => workshop.id === id);
  if (!workshop) throw new AppError("NOT_FOUND");

  return {
    ...workshop,
    sessions: sessionsForClass(id).map((session) => {
      const bookings = bookingsForSession(session.id);
      return {
        id: session.id,
        startsAt: session.startsAt,
        capacity: session.capacity,
        status: session.status,
        occupied: occupiedSeats(bookings),
        bookingCount: bookings.length,
        pendingCount: pendingCount(bookings),
      };
    }),
  };
}
