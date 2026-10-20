import "server-only";

import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  isMockDb,
  mockGetAdminClass,
  mockGetPublishedClass,
  mockListAdminBookings,
  mockListAdminClasses,
  mockListPublishedClasses,
  mockLookupBooking,
} from "./mock-db";
import {
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
  type AdminBookingList,
  type AdminClassDetail,
  type AdminClassSummary,
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
type AdminSessionStatsRow = SessionStatsRow & { booking_count: number };
type AdminClassRow = ClassRow & { sessions: Pick<SessionRow, "id" | "starts_at" | "status">[] };
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
  if (isMockDb()) return mockListPublishedClasses(now);
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
  const occupied = await readOccupied(visible.map((row) => row.id));
  return classes.map((row) => {
    const next = nextBookableSession(visible
      .filter((session) => session.class_id === row.id)
      .map((session) => ({
        startsAt: session.starts_at,
        remaining: remainingSeats(session.capacity, occupied.get(session.id) ?? 0),
      })));
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      imageUrl: row.image_url,
      nextSessionAt: next?.startsAt ?? null,
      nextSessionRemaining: next?.remaining ?? null,
    };
  });
}

async function readOccupied(sessionIds: string[]): Promise<Map<string, number>> {
  const occupied = new Map<string, number>();
  if (!sessionIds.length) return occupied;
  const { data: stats, error } = await getClient()
    .from("session_stats")
    .select("session_id,occupied")
    .in("session_id", sessionIds)
    .returns<SessionStatsRow[]>();
  if (error) throw toAppError(error);
  for (const row of stats ?? []) occupied.set(row.session_id, row.occupied);
  return occupied;
}

export async function getPublishedClass(id: string): Promise<ClassDetail | null> {
  const now = new Date();
  if (isMockDb()) return mockGetPublishedClass(id, now);
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
  const occupied = await readOccupied(visible.map((row) => row.id));

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
  if (isMockDb()) throw new AppError("MOCK_READ_ONLY");
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
  if (isMockDb()) return mockLookupBooking(input, now);
  const validated = validateLookupInput(input);
  if (!validated.ok) throw new AppError(validated.code, undefined, validated.fieldErrors);

  const { code, phoneLast4 } = validated.value;
  return toBookingLookupResult(await readCustomerBooking(code, phoneLast4), now);
}

export async function cancelBookingByCustomer(code: string, input: unknown): Promise<BookingLookupResult> {
  const now = new Date();
  if (isMockDb()) throw new AppError("MOCK_READ_ONLY");
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
  if (isMockDb()) return mockListAdminBookings(filter, now);
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
  if (isMockDb()) throw new AppError("MOCK_READ_ONLY");
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

async function readSessionStats(id: string): Promise<AdminSessionStatsRow> {
  const { data, error } = await getClient()
    .from("session_stats")
    .select("session_id,occupied,booking_count")
    .eq("session_id", id)
    .returns<AdminSessionStatsRow[]>()
    .maybeSingle();
  if (error) throw toAppError(error);
  if (!data) throw new AppError("NOT_FOUND");
  return data;
}

// 승인 대기는 처리할 일을 알리는 건수라 회차의 시작·취소 여부와 관계없이 센다.
async function countPendingBySession(sessionIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (sessionIds.length === 0) return counts;
  const { data, error } = await getClient()
    .from("bookings")
    .select("session_id")
    .eq("status", "pending")
    .in("session_id", sessionIds)
    .returns<{ session_id: string }[]>();
  if (error) throw toAppError(error);
  for (const row of data ?? []) counts.set(row.session_id, (counts.get(row.session_id) ?? 0) + 1);
  return counts;
}

async function removeImageBestEffort(path: string): Promise<void> {
  try {
    const { error } = await getClient().storage.from("class-images").remove([path]);
    if (error) throw toAppError(error);
  } catch {
    // DB에서 완료된 작업을 되돌리지 않고, 재정리에 필요한 경로만 기록한다.
    console.error(path);
  }
}

export async function listAdminClasses(): Promise<AdminClassSummary[]> {
  const now = new Date();
  if (isMockDb()) return mockListAdminClasses(now);
  const { data, error } = await getClient()
    .from("classes")
    .select(`${CLASS_COLUMNS},sessions(id,starts_at,status)`)
    .order("created_at", { ascending: false })
    .returns<AdminClassRow[]>();
  if (error) throw toAppError(error);
  const rows = data ?? [];
  const pendingBySession = await countPendingBySession(rows.flatMap((row) => row.sessions.map(({ id }) => id)));

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    isPublished: row.is_published,
    imageUrl: row.image_url,
    upcomingSessionCount: row.sessions
      .filter((session) => isVisibleSession({ status: session.status, startsAt: new Date(session.starts_at) }, now))
      .length,
    pendingCount: row.sessions.reduce((sum, session) => sum + (pendingBySession.get(session.id) ?? 0), 0),
  }));
}

export async function getAdminClass(id: string): Promise<AdminClassDetail> {
  const now = new Date();
  if (isMockDb()) return mockGetAdminClass(id, now);
  if (!UUID_PATTERN.test(id)) throw new AppError("NOT_FOUND");
  const workshop = await readClass(id);
  if (!workshop) throw new AppError("NOT_FOUND");

  const { data: sessions, error } = await getClient()
    .from("sessions")
    .select(SESSION_COLUMNS)
    .eq("class_id", id)
    .order("starts_at", { ascending: true })
    .returns<SessionRow[]>();
  if (error) throw toAppError(error);

  const statsBySession = new Map<string, AdminSessionStatsRow>();
  if (sessions?.length) {
    const { data: stats, error: statsError } = await getClient()
      .from("session_stats")
      .select("session_id,occupied,booking_count")
      .in("session_id", sessions.map((row) => row.id))
      .returns<AdminSessionStatsRow[]>();
    if (statsError) throw toAppError(statsError);
    for (const row of stats ?? []) statsBySession.set(row.session_id, row);
  }
  const pendingBySession = await countPendingBySession((sessions ?? []).map((row) => row.id));

  return {
    id: workshop.id,
    title: workshop.title,
    description: workshop.description,
    imageUrl: workshop.image_url,
    isPublished: workshop.is_published,
    sessions: (sessions ?? [])
      .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
      .map((row) => ({
        id: row.id,
        startsAt: row.starts_at,
        capacity: row.capacity,
        status: row.status,
        occupied: statsBySession.get(row.id)?.occupied ?? 0,
        bookingCount: statsBySession.get(row.id)?.booking_count ?? 0,
        pendingCount: pendingBySession.get(row.id) ?? 0,
      })),
  };
}

export async function createClass(input: unknown): Promise<{ id: string }> {
  const now = new Date();
  if (isMockDb()) throw new AppError("MOCK_READ_ONLY");
  void now;
  const validated = validateClassInput(input);
  if (!validated.ok) throw new AppError(validated.code, undefined, validated.fieldErrors);

  const { data, error } = await getClient()
    .from("classes")
    .insert(validated.value)
    .select("id")
    .returns<{ id: string }[]>()
    .maybeSingle();
  if (error) throw toAppError(error);
  if (!data) throw new AppError("INTERNAL_ERROR");
  return { id: data.id };
}

export async function updateClass(id: string, input: unknown): Promise<void> {
  const now = new Date();
  if (isMockDb()) throw new AppError("MOCK_READ_ONLY");
  void now;
  if (!UUID_PATTERN.test(id)) throw new AppError("NOT_FOUND");
  const validated = validateClassPatch(input);
  if (!validated.ok) throw new AppError(validated.code, undefined, validated.fieldErrors);
  const { title, description, isPublished } = validated.value;

  if (title !== undefined || description !== undefined) {
    const fields: { title?: string; description?: string } = {};
    if (title !== undefined) fields.title = title;
    if (description !== undefined) fields.description = description;
    const { data, error } = await getClient()
      .from("classes")
      .update(fields)
      .eq("id", id)
      .select("id")
      .returns<{ id: string }[]>()
      .maybeSingle();
    if (error) throw toAppError(error);
    if (!data) throw new AppError("NOT_FOUND");
  }

  if (isPublished !== undefined) {
    const { error } = await getClient().rpc("set_class_published", {
      p_class_id: id,
      p_is_published: isPublished,
    });
    if (error) throw toAppError(error);
  }
}

export async function deleteClass(id: string): Promise<void> {
  const now = new Date();
  if (isMockDb()) throw new AppError("MOCK_READ_ONLY");
  void now;
  if (!UUID_PATTERN.test(id)) throw new AppError("NOT_FOUND");
  const workshop = await readClass(id);
  if (!workshop) throw new AppError("NOT_FOUND");

  const { count, error } = await getClient()
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("class_id", id);
  if (error) throw toAppError(error);
  if (count === null) throw new AppError("INTERNAL_ERROR");
  const result = canDeleteClass(count);
  if (!result.ok) throw new AppError(result.code);

  const { data: imagePath, error: rpcError } = await getClient().rpc("delete_class", {
    p_class_id: id,
  });
  if (rpcError) throw toAppError(rpcError);
  if (imagePath) await removeImageBestEffort(imagePath);
}

export async function uploadClassImage(id: string, file: File): Promise<{ imageUrl: string }> {
  const now = new Date();
  if (isMockDb()) throw new AppError("MOCK_READ_ONLY");
  void now;
  if (!UUID_PATTERN.test(id)) throw new AppError("NOT_FOUND");
  const result = validateImage({ type: file.type, size: file.size });
  if (!result.ok) throw new AppError(result.code);

  const { data: workshop, error } = await getClient()
    .from("classes")
    .select("image_path")
    .eq("id", id)
    .returns<{ image_path: string | null }[]>()
    .maybeSingle();
  if (error) throw toAppError(error);
  if (!workshop) throw new AppError("NOT_FOUND");

  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[file.type];
  const path = `classes/${id}/${randomUUID()}.${ext}`;
  const bucket = getClient().storage.from("class-images");
  const { error: uploadError } = await bucket.upload(path, file, { contentType: file.type });
  if (uploadError) throw toAppError(uploadError);
  const { data: { publicUrl: imageUrl } } = bucket.getPublicUrl(path);

  const { data: updated, error: updateError } = await getClient()
    .from("classes")
    .update({ image_url: imageUrl, image_path: path })
    .eq("id", id)
    .select("id")
    .returns<{ id: string }[]>()
    .maybeSingle();
  if (updateError || !updated) {
    await removeImageBestEffort(path);
    throw updateError ? toAppError(updateError) : new AppError("NOT_FOUND");
  }

  if (workshop.image_path) {
    const { error: removeError } = await bucket.remove([workshop.image_path]);
    if (removeError) throw toAppError(removeError);
  }
  return { imageUrl };
}

export async function createSession(classId: string, input: unknown): Promise<{ id: string }> {
  const now = new Date();
  if (isMockDb()) throw new AppError("MOCK_READ_ONLY");
  if (!UUID_PATTERN.test(classId)) throw new AppError("NOT_FOUND");
  const validated = validateSessionInput(input, now);
  if (!validated.ok) throw new AppError(validated.code, undefined, validated.fieldErrors);
  const { startsAt, capacity } = validated.value;

  const { data: id, error } = await getClient().rpc("create_session", {
    p_class_id: classId,
    p_starts_at: startsAt.toISOString(),
    p_capacity: capacity,
    p_now: now.toISOString(),
  });
  if (error) throw toAppError(error);
  if (typeof id !== "string" || !UUID_PATTERN.test(id)) throw new AppError("INTERNAL_ERROR");
  return { id };
}

export async function updateSession(id: string, input: unknown): Promise<void> {
  const now = new Date();
  if (isMockDb()) throw new AppError("MOCK_READ_ONLY");
  if (!UUID_PATTERN.test(id)) throw new AppError("NOT_FOUND");
  const validated = validateSessionPatch(input, now);
  if (!validated.ok) throw new AppError(validated.code, undefined, validated.fieldErrors);
  const { startsAt, capacity } = validated.value;
  const session = await readSession(id);
  if (!session) throw new AppError("NOT_FOUND");
  const stats = await readSessionStats(id);

  if (capacity !== undefined) {
    const result = canChangeCapacity(capacity, stats.occupied);
    if (!result.ok) throw new AppError(result.code);
  }
  if (startsAt !== undefined && startsAt.getTime() !== Date.parse(session.starts_at)) {
    const result = canChangeStartsAt(stats.booking_count, startsAt, now);
    if (!result.ok) throw new AppError(result.code);
  }

  const { error } = await getClient().rpc("update_session", {
    p_session_id: id,
    p_starts_at: startsAt?.toISOString() ?? null,
    p_capacity: capacity ?? null,
    p_now: now.toISOString(),
  });
  if (error) throw toAppError(error);
}

export async function deleteSession(id: string): Promise<void> {
  const now = new Date();
  if (isMockDb()) throw new AppError("MOCK_READ_ONLY");
  void now;
  if (!UUID_PATTERN.test(id)) throw new AppError("NOT_FOUND");
  const session = await readSession(id);
  if (!session) throw new AppError("NOT_FOUND");
  const stats = await readSessionStats(id);
  const result = canDeleteSession(stats.booking_count);
  if (!result.ok) throw new AppError(result.code);

  const { error } = await getClient().rpc("delete_session", { p_session_id: id });
  if (error) throw toAppError(error);
}

export async function cancelSession(id: string): Promise<void> {
  const now = new Date();
  if (isMockDb()) throw new AppError("MOCK_READ_ONLY");
  void now;
  if (!UUID_PATTERN.test(id)) throw new AppError("NOT_FOUND");
  const session = await readSession(id);
  if (!session) throw new AppError("NOT_FOUND");
  const result = canCancelSession(session.status);
  if (!result.ok) throw new AppError(result.code);

  const { error } = await getClient().rpc("cancel_session", { p_session_id: id });
  if (error) throw toAppError(error);
}
