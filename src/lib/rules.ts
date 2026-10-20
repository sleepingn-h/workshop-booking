import type {
  Actor,
  BookingAction,
  BookingInput,
  BookingStatus,
  FieldErrors,
  RuleResult,
  SessionStatus,
  Validated,
} from "./types";

export const MIN_HEADCOUNT = 1;
export const MAX_HEADCOUNT = 4;
export const CONFIRMED_CANCEL_WINDOW_MS = 24 * 60 * 60 * 1000;
export const IMAGE_MAX_BYTES = 4 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

type LookupInput = { code: string; phoneLast4: string };
type ClassInput = { title: string; description: string };
type ClassPatch = Partial<ClassInput> & { isPublished?: boolean };
type SessionInput = { startsAt: Date; capacity: number };

function inputRecord(input: unknown): Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}

function trimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function validHeadcount(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_HEADCOUNT && value <= MAX_HEADCOUNT;
}

function validCapacity(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

const STARTS_AT_REQUIRED = "시작 날짜와 시각을 입력해 주세요.";
const STARTS_AT_NOT_FUTURE = "지금보다 뒤의 시작 시각을 입력해 주세요.";

// 형식이 틀린 값과 지난 시각을 구분해, 운영자에게 구현 용어 없이 다음 행동을 안내한다.
function futureStartsAt(value: unknown, now: Date): { startsAt: Date } | { error: string } {
  const startsAt = parseStartsAt(value);
  if (!startsAt) return { error: STARTS_AT_REQUIRED };
  if (startsAt.getTime() <= now.getTime()) return { error: STARTS_AT_NOT_FUTURE };
  return { startsAt };
}

function parseStartsAt(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const parts = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts) return null;

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;

  const offset = parts[5];
  const offsetMinutes = offset === "Z"
    ? 0
    : (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4, 6))) * (offset[0] === "+" ? 1 : -1);
  const local = new Date(date.getTime() + offsetMinutes * 60 * 1000);
  // Date가 보정하는 없는 날짜나 24시를 원래 시각과의 왕복 비교로 거부한다.
  if (local.toISOString().slice(0, 19) !== `${parts[1]}T${parts[2]}:${parts[3] ?? "00"}`) return null;
  return date;
}

export function normalizePhone(raw: string): string {
  return raw.replace(/[\s-]/g, "");
}

export function validateBookingInput(
  input: unknown,
): Validated<BookingInput, keyof BookingInput> {
  const data = inputRecord(input);
  const sessionId = trimmedString(data.sessionId);
  const customerName = trimmedString(data.customerName);
  const phone = typeof data.phone === "string" ? normalizePhone(data.phone) : "";
  const headcount = typeof data.headcount === "number" ? data.headcount : NaN;
  const fieldErrors: FieldErrors<keyof BookingInput> = {};

  if (!sessionId) fieldErrors.sessionId = "회차를 선택해 주세요.";
  if (!validHeadcount(headcount)) fieldErrors.headcount = "인원은 1명부터 4명까지의 정수로 입력해 주세요.";
  if (!customerName) fieldErrors.customerName = "예약자 이름을 입력해 주세요.";
  if (!/^\d{10,11}$/.test(phone)) fieldErrors.phone = "전화번호는 숫자 10~11자리로 입력해 주세요.";

  if (Object.keys(fieldErrors).length > 0) {
    const onlyHeadcount = Object.keys(fieldErrors).length === 1 && fieldErrors.headcount !== undefined;
    return { ok: false, code: onlyHeadcount ? "INVALID_HEADCOUNT" : "VALIDATION_ERROR", fieldErrors };
  }
  return { ok: true, value: { sessionId, headcount, customerName, phone } };
}

export function validateLookupInput(
  input: unknown,
): Validated<LookupInput, keyof LookupInput> {
  const data = inputRecord(input);
  const code = trimmedString(data.code).toUpperCase();
  const phoneLast4 = typeof data.phoneLast4 === "string" ? data.phoneLast4 : "";
  const fieldErrors: FieldErrors<keyof LookupInput> = {};

  if (!code) fieldErrors.code = "예약번호를 입력해 주세요.";
  if (!/^\d{4}$/.test(phoneLast4)) fieldErrors.phoneLast4 = "전화번호 뒷자리 숫자 4자리를 입력해 주세요.";
  if (Object.keys(fieldErrors).length > 0) return { ok: false, code: "VALIDATION_ERROR", fieldErrors };
  return { ok: true, value: { code, phoneLast4 } };
}

export function occupiedSeats(bookings: { status: BookingStatus; headcount: number }[]): number {
  return bookings.reduce((total, booking) => (
    booking.status === "pending" || booking.status === "confirmed"
      ? total + booking.headcount
      : total
  ), 0);
}

export function remainingSeats(capacity: number, occupied: number): number {
  return Math.max(0, capacity - occupied);
}

export function canApply(
  session: { status: SessionStatus; startsAt: Date; capacity: number; occupied: number },
  headcount: number,
  now: Date,
): RuleResult {
  if (session.status === "cancelled") return { ok: false, code: "SESSION_CANCELLED" };
  if (now.getTime() >= session.startsAt.getTime()) return { ok: false, code: "SESSION_STARTED" };
  if (!validHeadcount(headcount)) return { ok: false, code: "INVALID_HEADCOUNT" };
  if (headcount > remainingSeats(session.capacity, session.occupied)) return { ok: false, code: "SESSION_FULL" };
  return { ok: true };
}

export function canTransition(
  from: BookingStatus,
  action: BookingAction,
  actor: Actor,
  ctx: { startsAt: Date; now: Date },
): RuleResult {
  if (from === "rejected" || from === "cancelled") return { ok: false, code: "INVALID_TRANSITION" };

  if (actor === "customer") {
    if (action !== "cancel") return { ok: false, code: "INVALID_TRANSITION" };
    const deadline = customerCancelDeadline(from, ctx.startsAt);
    const withinDeadline = deadline !== null && (from === "pending"
      ? ctx.now.getTime() < deadline.getTime()
      : ctx.now.getTime() <= deadline.getTime());
    return withinDeadline ? { ok: true } : { ok: false, code: "CANCEL_DEADLINE_PASSED" };
  }

  if (action === "cancel") return { ok: true };
  if (from !== "pending") return { ok: false, code: "INVALID_TRANSITION" };
  if (action === "confirm" && ctx.now.getTime() >= ctx.startsAt.getTime()) return { ok: false, code: "SESSION_STARTED" };
  return { ok: true };
}

export function customerCancelDeadline(status: BookingStatus, startsAt: Date): Date | null {
  if (status === "pending") return new Date(startsAt.getTime());
  if (status === "confirmed") return new Date(startsAt.getTime() - CONFIRMED_CANCEL_WINDOW_MS);
  return null;
}

export function isVisibleSession(
  session: { status: SessionStatus; startsAt: Date },
  now: Date,
): boolean {
  return session.status === "scheduled" && now.getTime() < session.startsAt.getTime();
}

// 시작 순으로 정렬한 공개 회차에서 목록에 보여줄 다음 회차를 고른다.
export function nextBookableSession<T extends { remaining: number }>(sessions: readonly T[]): T | null {
  return sessions.find((session) => session.remaining > 0) ?? sessions[0] ?? null;
}

export function validateClassInput(input: unknown): Validated<ClassInput, keyof ClassInput> {
  const data = inputRecord(input);
  const title = trimmedString(data.title);
  const description = trimmedString(data.description);
  const fieldErrors: FieldErrors<keyof ClassInput> = {};

  if (!title) fieldErrors.title = "클래스 이름을 입력해 주세요.";
  if (typeof data.description !== "string") fieldErrors.description = "클래스 설명을 문자열로 입력해 주세요.";
  if (Object.keys(fieldErrors).length > 0) return { ok: false, code: "VALIDATION_ERROR", fieldErrors };
  return { ok: true, value: { title, description } };
}

export function validateClassPatch(input: unknown): Validated<ClassPatch, keyof ClassPatch> {
  const data = inputRecord(input);
  const value: ClassPatch = {};
  const fieldErrors: FieldErrors<keyof ClassPatch> = {};

  if ("title" in data) {
    const title = trimmedString(data.title);
    if (!title) fieldErrors.title = "클래스 이름을 입력해 주세요.";
    else value.title = title;
  }
  if ("description" in data) {
    if (typeof data.description !== "string") fieldErrors.description = "클래스 설명을 문자열로 입력해 주세요.";
    else value.description = data.description.trim();
  }
  if ("isPublished" in data) {
    if (typeof data.isPublished !== "boolean") fieldErrors.isPublished = "공개 여부는 참 또는 거짓으로 입력해 주세요.";
    else value.isPublished = data.isPublished;
  }
  if (Object.keys(value).length === 0 && Object.keys(fieldErrors).length === 0) {
    fieldErrors.title = "변경할 클래스 정보를 입력해 주세요.";
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, code: "VALIDATION_ERROR", fieldErrors };
  return { ok: true, value };
}

export function validateSessionInput(
  input: unknown,
  now: Date,
): Validated<SessionInput, keyof SessionInput> {
  const data = inputRecord(input);
  const startsAt = futureStartsAt(data.startsAt, now);
  const fieldErrors: FieldErrors<keyof SessionInput> = {};

  if ("error" in startsAt) fieldErrors.startsAt = startsAt.error;
  if (!validCapacity(data.capacity)) fieldErrors.capacity = "정원은 1 이상의 정수로 입력해 주세요.";
  if ("error" in startsAt || !validCapacity(data.capacity)) return { ok: false, code: "VALIDATION_ERROR", fieldErrors };
  return { ok: true, value: { startsAt: startsAt.startsAt, capacity: data.capacity } };
}

export function validateSessionPatch(
  input: unknown,
  now: Date,
): Validated<Partial<SessionInput>, keyof SessionInput> {
  const data = inputRecord(input);
  const value: Partial<SessionInput> = {};
  const fieldErrors: FieldErrors<keyof SessionInput> = {};

  if ("startsAt" in data) {
    const startsAt = futureStartsAt(data.startsAt, now);
    if ("error" in startsAt) fieldErrors.startsAt = startsAt.error;
    else value.startsAt = startsAt.startsAt;
  }
  if ("capacity" in data) {
    if (!validCapacity(data.capacity)) fieldErrors.capacity = "정원은 1 이상의 정수로 입력해 주세요.";
    else value.capacity = data.capacity;
  }
  if (Object.keys(value).length === 0 && Object.keys(fieldErrors).length === 0) {
    fieldErrors.startsAt = "변경할 회차 정보를 입력해 주세요.";
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, code: "VALIDATION_ERROR", fieldErrors };
  return { ok: true, value };
}

export function canChangeCapacity(newCapacity: number, occupied: number): RuleResult {
  if (!validCapacity(newCapacity)) return { ok: false, code: "VALIDATION_ERROR" };
  if (newCapacity < occupied) return { ok: false, code: "CAPACITY_BELOW_OCCUPIED" };
  return { ok: true };
}

export function canChangeStartsAt(bookingCount: number, newStartsAt: Date, now: Date): RuleResult {
  if (bookingCount > 0) return { ok: false, code: "SESSION_HAS_BOOKINGS" };
  if (!Number.isFinite(newStartsAt.getTime()) || newStartsAt.getTime() <= now.getTime()) return { ok: false, code: "VALIDATION_ERROR" };
  return { ok: true };
}

export function canDeleteSession(bookingCount: number): RuleResult {
  return bookingCount > 0 ? { ok: false, code: "SESSION_HAS_BOOKINGS" } : { ok: true };
}

export function canCancelSession(status: SessionStatus): RuleResult {
  return status === "cancelled" ? { ok: false, code: "SESSION_CANCELLED" } : { ok: true };
}

export function canDeleteClass(sessionCount: number): RuleResult {
  return sessionCount > 0 ? { ok: false, code: "CLASS_HAS_SESSIONS" } : { ok: true };
}

export function validateImage(file: { type: string; size: number }): RuleResult {
  return ALLOWED_IMAGE_TYPES.includes(file.type) && file.size <= IMAGE_MAX_BYTES
    ? { ok: true }
    : { ok: false, code: "VALIDATION_ERROR" };
}
