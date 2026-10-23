export type BookingStatus = "pending" | "confirmed" | "rejected" | "cancelled";
export type SessionStatus = "scheduled" | "cancelled";
export type BookingAction = "confirm" | "reject" | "cancel";
export type Actor = "admin" | "customer";

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "INVALID_HEADCOUNT"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "BOOKING_NOT_FOUND"
  | "SESSION_FULL"
  | "SESSION_CANCELLED"
  | "SESSION_STARTED"
  | "DUPLICATE_BOOKING"
  | "INVALID_TRANSITION"
  | "CANCEL_DEADLINE_PASSED"
  | "CAPACITY_BELOW_OCCUPIED"
  | "SESSION_HAS_BOOKINGS"
  | "CLASS_HAS_SESSIONS"
  | "MOCK_READ_ONLY"
  | "INTERNAL_ERROR";

export const ERROR_CODES: readonly ErrorCode[] = [
  "VALIDATION_ERROR",
  "INVALID_HEADCOUNT",
  "UNAUTHORIZED",
  "NOT_FOUND",
  "BOOKING_NOT_FOUND",
  "SESSION_FULL",
  "SESSION_CANCELLED",
  "SESSION_STARTED",
  "DUPLICATE_BOOKING",
  "INVALID_TRANSITION",
  "CANCEL_DEADLINE_PASSED",
  "CAPACITY_BELOW_OCCUPIED",
  "SESSION_HAS_BOOKINGS",
  "CLASS_HAS_SESSIONS",
  "MOCK_READ_ONLY",
  "INTERNAL_ERROR",
];

export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
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

export const ERROR_MESSAGE: Record<ErrorCode, string> = {
  VALIDATION_ERROR: "입력 내용을 확인해 주세요.",
  INVALID_HEADCOUNT: "신청 인원은 1명부터 4명까지의 정수여야 합니다.",
  UNAUTHORIZED: "운영자 인증이 필요합니다.",
  NOT_FOUND: "요청한 정보를 찾을 수 없습니다.",
  BOOKING_NOT_FOUND: "예약을 찾을 수 없습니다.",
  SESSION_FULL: "남은 자리가 부족합니다.",
  SESSION_CANCELLED: "취소된 회차입니다.",
  SESSION_STARTED: "이미 시작한 회차입니다.",
  DUPLICATE_BOOKING: "같은 회차에 해당 전화번호로 신청한 활성 예약이 있습니다.",
  INVALID_TRANSITION: "현재 예약 상태에서는 요청한 동작을 처리할 수 없습니다.",
  CANCEL_DEADLINE_PASSED: "직접 취소할 수 있는 기한이 지났습니다. 공방에 문의해 주세요.",
  CAPACITY_BELOW_OCCUPIED: "정원을 현재 차지된 자리보다 적게 줄일 수 없습니다.",
  SESSION_HAS_BOOKINGS: "예약 이력이 있는 회차는 삭제하거나 시작 시각을 변경할 수 없습니다.",
  CLASS_HAS_SESSIONS: "회차가 있는 클래스는 삭제할 수 없습니다.",
  MOCK_READ_ONLY: "목 데이터 모드에서는 변경할 수 없습니다.",
  INTERNAL_ERROR: "처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
};

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  pending: "승인 대기",
  confirmed: "참여 확정",
  rejected: "거절됨",
  cancelled: "취소됨",
};

export const SESSION_STATUS_LABEL: Record<SessionStatus, string> = {
  scheduled: "예정",
  cancelled: "취소",
};

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message?: string,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message ?? ERROR_MESSAGE[code]);
  }
}

export type RuleResult = { ok: true } | { ok: false; code: ErrorCode };
export type FieldErrors<K extends string> = Partial<Record<K, string>>;
export type Validated<T, K extends string> =
  | { ok: true; value: T }
  | { ok: false; code: ErrorCode; fieldErrors: FieldErrors<K> };

export type BookingInput = {
  sessionId: string;
  headcount: number;
  customerName: string;
  phone: string;
};

// 클래스의 필수 안내 항목(R-53)이다. 소요 시간은 분, 비용은 1인 원 단위 정수다.
export type ClassInfo = {
  place: string;
  durationMinutes: number;
  price: number;
  paymentMethod: string;
  materials: string;
  contact: string;
};

// 소개(description)는 선택 입력이라 빈 문자열일 수 있다.
export type ClassInput = { title: string; description: string } & ClassInfo;

// 목록 한 줄에 쓰는 안내 항목이다.
export type ClassListInfo = Pick<ClassInfo, "place" | "durationMinutes" | "price">;

// DTO의 시각 필드는 모두 오프셋이 포함된 ISO 8601 문자열이다.
export type PublicSession = {
  id: string;
  startsAt: string;
  capacity: number;
  remaining: number;
};

export type ClassSummary = {
  id: string;
  title: string;
  description: string;
  imageUrl: string | null;
  // 신청 가능한 다음 회차(모두 마감이면 첫 회차)와 그 남은 자리. 표시할 회차가 없으면 둘 다 null이다.
  nextSessionAt: string | null;
  nextSessionRemaining: number | null;
} & ClassListInfo;

export type ClassDetail = {
  id: string;
  title: string;
  description: string;
  imageUrl: string | null;
  sessions: PublicSession[];
} & ClassInfo;

export type CreateBookingResult = { code: string; status: "pending" };

export type BookingLookupResult = {
  code: string;
  status: BookingStatus;
  headcount: number;
  // 신청자 이름·전화번호는 서버에서 가린 값이다(예: 이*윤, 010-****-7890).
  customer: { name: string; phone: string };
  // id는 상세 링크용이며 비공개 클래스는 상세가 404이므로 null이다.
  class: { id: string | null; title: string } & ClassInfo;
  session: { startsAt: string; status: SessionStatus };
  canCancel: boolean;
  cancelDeadline: string | null;
};

export type AdminBooking = {
  id: string;
  code: string;
  status: BookingStatus;
  headcount: number;
  customerName: string;
  phone: string;
  classTitle: string;
  sessionId: string;
  sessionStartsAt: string;
  sessionStatus: SessionStatus;
};

export type AdminSessionOption = {
  id: string;
  classTitle: string;
  startsAt: string;
  status: SessionStatus;
};

export type AdminBookingList = {
  bookings: AdminBooking[];
  sessions: AdminSessionOption[];
};

export type AdminClassSummary = {
  id: string;
  title: string;
  isPublished: boolean;
  imageUrl: string | null;
  // 시작 전이며 취소되지 않은 회차 수와, 모든 회차의 승인 대기 예약 건수다.
  upcomingSessionCount: number;
  pendingCount: number;
} & ClassListInfo;

export type AdminSession = {
  id: string;
  startsAt: string;
  capacity: number;
  status: SessionStatus;
  occupied: number;
  bookingCount: number;
  pendingCount: number;
};

export type AdminClassDetail = {
  id: string;
  title: string;
  description: string;
  imageUrl: string | null;
  isPublished: boolean;
  sessions: AdminSession[];
} & ClassInfo;
