import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  canApply,
  canTransition,
  customerCancelDeadline,
  isVisibleSession,
  remainingSeats,
  validateBookingInput,
  validateLookupInput,
} from "./rules";
import {
  AppError,
  BOOKING_STATUS_LABEL,
  ERROR_CODES,
  type AdminBookingList,
  type BookingAction,
  type BookingLookupResult,
  type BookingStatus,
  type ClassDetail,
  type ClassSummary,
  type CreateBookingResult,
  type SessionStatus,
} from "./types";

type ClassRow = {
  id: string;
  title: string;
  description: string;
  image_url: string | null;
  is_published: boolean;
};

type SessionRow = {
  id: string;
  class_id: string;
  starts_at: string;
  capacity: number;
  status: SessionStatus;
};

type BookingRow = {
  id: string;
  code: string;
  session_id: string;
  headcount: number;
  phone: string;
  status: BookingStatus;
};

type SessionStatsRow = { session_id: string; occupied: number };
type AdminBookingRow = BookingRow & {
  customer_name: string;
  class_title: string;
  session_starts_at: string;
  session_status: SessionStatus;
};
type SessionOptionRow = {
  id: string;
  starts_at: string;
  status: SessionStatus;
  classes: { title: string };
};
type CustomerBooking = {
  booking: BookingRow;
  session: SessionRow;
  workshop: ClassRow;
};

const CLASS_COLUMNS = "id,title,description,image_url,is_published";
const SESSION_COLUMNS = "id,class_id,starts_at,capacity,status";
const BOOKING_COLUMNS = "id,code,session_id,headcount,phone,status";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let client: SupabaseClient | undefined;

function getClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new AppError("INTERNAL_ERROR");

  try {
    client = createClient(url, key, { auth: { persistSession: false } });
    return client;
  } catch {
    throw new AppError("INTERNAL_ERROR");
  }
}

function toAppError(error: { message?: string } | null): AppError {
  const code = ERROR_CODES.find((code) => code === error?.message);
  return new AppError(code ?? "INTERNAL_ERROR");
}

async function readClass(id: string): Promise<ClassRow | null> {
  const { data, error } = await getClient()
    .from("classes")
    .select(CLASS_COLUMNS)
    .eq("id", id)
    .returns<ClassRow[]>()
    .maybeSingle();
  if (error) throw toAppError(error);
  return data;
}

async function readSession(id: string): Promise<SessionRow | null> {
  const { data, error } = await getClient()
    .from("sessions")
    .select(SESSION_COLUMNS)
    .eq("id", id)
    .returns<SessionRow[]>()
    .maybeSingle();
  if (error) throw toAppError(error);
  return data;
}

function visibleSessions(rows: SessionRow[], now: Date): SessionRow[] {
  return rows
    .filter((row) => isVisibleSession({ status: row.status, startsAt: new Date(row.starts_at) }, now))
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}

async function readCustomerBooking(code: string, phoneLast4: string): Promise<CustomerBooking> {
  const { data: booking, error } = await getClient()
    .from("bookings")
    .select(BOOKING_COLUMNS)
    .eq("code", code)
    .returns<BookingRow[]>()
    .maybeSingle();
  if (error) throw toAppError(error);
  // 인증 실패 시 상태·기한을 판정하거나 관련 정보를 조회하지 않는다.
  if (!booking || booking.phone.slice(-4) !== phoneLast4) {
    throw new AppError("BOOKING_NOT_FOUND");
  }

  const session = await readSession(booking.session_id);
  if (!session) throw new AppError("BOOKING_NOT_FOUND");
  const workshop = await readClass(session.class_id);
  if (!workshop) throw new AppError("BOOKING_NOT_FOUND");
  return { booking, session, workshop };
}

function toBookingLookupResult(
  { booking, session, workshop }: CustomerBooking,
  now: Date,
): BookingLookupResult {
  const startsAt = new Date(session.starts_at);
  return {
    code: booking.code,
    status: booking.status,
    headcount: booking.headcount,
    class: { title: workshop.title, description: workshop.description },
    session: { startsAt: session.starts_at, status: session.status },
    canCancel: canTransition(booking.status, "cancel", "customer", { startsAt, now }).ok,
    cancelDeadline: customerCancelDeadline(booking.status, startsAt)?.toISOString() ?? null,
  };
}

export async function listPublishedClasses(): Promise<ClassSummary[]> {
  const now = new Date();
  const { data: classes, error } = await getClient()
    .from("classes")
    .select(CLASS_COLUMNS)
    .eq("is_published", true)
    .order("created_at", { ascending: true })
    .returns<ClassRow[]>();
  if (error) throw toAppError(error);
  if (!classes?.length) return [];

  const { data: sessions, error: sessionsError } = await getClient()
    .from("sessions")
    .select(SESSION_COLUMNS)
    .in("class_id", classes.map((row) => row.id))
    .order("starts_at", { ascending: true })
    .returns<SessionRow[]>();
  if (sessionsError) throw toAppError(sessionsError);

  const visible = visibleSessions(sessions ?? [], now);
  return classes.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    imageUrl: row.image_url,
    nextSessionAt: visible.find((session) => session.class_id === row.id)?.starts_at ?? null,
  }));
}

export async function getPublishedClass(id: string): Promise<ClassDetail | null> {
  const now = new Date();
  if (!UUID_PATTERN.test(id)) return null;

  const workshop = await readClass(id);
  if (!workshop?.is_published) return null;

  const { data: sessions, error } = await getClient()
    .from("sessions")
    .select(SESSION_COLUMNS)
    .eq("class_id", id)
    .order("starts_at", { ascending: true })
    .returns<SessionRow[]>();
  if (error) throw toAppError(error);

  const visible = visibleSessions(sessions ?? [], now);
  const occupied = new Map<string, number>();
  if (visible.length) {
    const { data: stats, error: statsError } = await getClient()
      .from("session_stats")
      .select("session_id,occupied")
      .in("session_id", visible.map((row) => row.id))
      .returns<SessionStatsRow[]>();
    if (statsError) throw toAppError(statsError);
    for (const row of stats ?? []) occupied.set(row.session_id, row.occupied);
  }

  return {
    id: workshop.id,
    title: workshop.title,
    description: workshop.description,
    imageUrl: workshop.image_url,
    sessions: visible.map((row) => ({
      id: row.id,
      startsAt: row.starts_at,
      capacity: row.capacity,
      remaining: remainingSeats(row.capacity, occupied.get(row.id) ?? 0),
    })),
  };
}

export async function createBooking(input: unknown): Promise<CreateBookingResult> {
  const now = new Date();
  const validated = validateBookingInput(input);
  if (!validated.ok) throw new AppError(validated.code, undefined, validated.fieldErrors);
  const { sessionId, headcount, customerName, phone } = validated.value;
  if (!UUID_PATTERN.test(sessionId)) throw new AppError("NOT_FOUND");

  const session = await readSession(sessionId);
  if (!session) throw new AppError("NOT_FOUND");
  const workshop = await readClass(session.class_id);
  if (!workshop?.is_published) throw new AppError("NOT_FOUND");

  const { data: stats, error: statsError } = await getClient()
    .from("session_stats")
    .select("session_id,occupied")
    .eq("session_id", sessionId)
    .returns<SessionStatsRow[]>()
    .maybeSingle();
  if (statsError) throw toAppError(statsError);
  if (!stats) throw new AppError("NOT_FOUND");

  const result = canApply({
    status: session.status,
    startsAt: new Date(session.starts_at),
    capacity: session.capacity,
    occupied: stats.occupied,
  }, headcount, now);
  if (!result.ok) throw new AppError(result.code);

  const { data: code, error } = await getClient().rpc("create_booking", {
    p_session_id: sessionId,
    p_headcount: headcount,
    p_customer_name: customerName,
    p_phone: phone,
    p_now: now.toISOString(),
  });
  if (error) throw toAppError(error);
  if (typeof code !== "string" || !code) throw new AppError("INTERNAL_ERROR");
  return { code, status: "pending" };
}

export async function lookupBooking(input: unknown): Promise<BookingLookupResult> {
  const now = new Date();
  const validated = validateLookupInput(input);
  if (!validated.ok) throw new AppError(validated.code, undefined, validated.fieldErrors);

  const { code, phoneLast4 } = validated.value;
  return toBookingLookupResult(await readCustomerBooking(code, phoneLast4), now);
}

export async function cancelBookingByCustomer(code: string, input: unknown): Promise<BookingLookupResult> {
  const now = new Date();
  const phoneLast4 = typeof input === "object" && input !== null && "phoneLast4" in input
    ? input.phoneLast4
    : undefined;
  const validated = validateLookupInput({ code, phoneLast4 });
  if (!validated.ok) throw new AppError(validated.code, undefined, validated.fieldErrors);

  const credentials = validated.value;
  const current = await readCustomerBooking(credentials.code, credentials.phoneLast4);
  const result = canTransition(current.booking.status, "cancel", "customer", {
    startsAt: new Date(current.session.starts_at), now,
  });
  if (!result.ok) throw new AppError(result.code);

  const { error } = await getClient().rpc("customer_cancel_booking", {
    p_code: credentials.code,
    p_phone_last4: credentials.phoneLast4,
    p_now: now.toISOString(),
  });
  if (error) throw toAppError(error);

  const updated = await readCustomerBooking(credentials.code, credentials.phoneLast4);
  return toBookingLookupResult(updated, now);
}

export async function listAdminBookings(filter: {
  sessionId?: string | null;
  status?: string | null;
  q?: string | null;
}): Promise<AdminBookingList> {
  const now = new Date();
  // 목록은 시간 판정이 없지만 모든 공개 함수의 요청 시각 수집 규약을 따른다.
  void now;
  const { sessionId = null, status = null, q = null } = filter;
  if ((status !== null && !Object.hasOwn(BOOKING_STATUS_LABEL, status)) ||
      (sessionId !== null && !UUID_PATTERN.test(sessionId))) {
    throw new AppError("VALIDATION_ERROR");
  }

  const { data: bookings, error } = await getClient().rpc("admin_list_bookings", {
    p_session_id: sessionId,
    p_status: status,
    p_q: q,
  });
  if (error) throw toAppError(error);
  const bookingRows: AdminBookingRow[] = bookings ?? [];

  const { data: sessions, error: sessionsError } = await getClient()
    .from("sessions")
    .select("id,starts_at,status,classes(title)")
    .order("starts_at", { ascending: true })
    .returns<SessionOptionRow[]>();
  if (sessionsError) throw toAppError(sessionsError);

  return {
    bookings: bookingRows.map((row) => ({
      id: row.id,
      code: row.code,
      status: row.status,
      headcount: row.headcount,
      customerName: row.customer_name,
      phone: row.phone,
      classTitle: row.class_title,
      sessionId: row.session_id,
      sessionStartsAt: row.session_starts_at,
      sessionStatus: row.session_status,
    })),
    sessions: (sessions ?? [])
      .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
      .map((row) => ({
        id: row.id,
        classTitle: row.classes.title,
        startsAt: row.starts_at,
        status: row.status,
      })),
  };
}

export async function changeBookingStatus(id: string, action: BookingAction): Promise<void> {
  const now = new Date();
  if (!UUID_PATTERN.test(id)) throw new AppError("NOT_FOUND");
  const { data: booking, error } = await getClient()
    .from("bookings")
    .select(BOOKING_COLUMNS)
    .eq("id", id)
    .returns<BookingRow[]>()
    .maybeSingle();
  if (error) throw toAppError(error);
  if (!booking) throw new AppError("NOT_FOUND");
  const session = await readSession(booking.session_id);
  if (!session) throw new AppError("NOT_FOUND");

  const result = canTransition(booking.status, action, "admin", {
    startsAt: new Date(session.starts_at), now,
  });
  if (!result.ok) throw new AppError(result.code);

  const { error: rpcError } = await getClient().rpc("admin_set_booking_status", {
    p_booking_id: id,
    p_action: action,
    p_now: now.toISOString(),
  });
  if (rpcError) throw toAppError(rpcError);
}
