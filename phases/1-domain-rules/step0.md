# Step 0: domain-rules

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` (ADR-002, ADR-005, ADR-008)
- `/docs/PLAN.md` 6절(규칙 R-01~R-58), 8절(입력 기준)
- `/docs/SPEC.md` 1절(상태·도메인 모델), 3절(시각과 취소 가능 여부), 5절(에러 코드)
- `/vitest.config.mts`, `/package.json`, `/tsconfig.json` (`0-foundation` step 0 산출물)

## 작업

TDD로 진행한다. `src/lib/rules.test.ts`를 **먼저 별도 패치로** 작성하고(실패 확인), 그다음 `src/lib/rules.ts`를 작성한다. `src/lib/types.ts`는 TDD 가드 예외다.

### 1. `src/lib/types.ts` (타입·상수만, 로직 없음)

```ts
export type BookingStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled';
export type SessionStatus = 'scheduled' | 'cancelled';
export type BookingAction = 'confirm' | 'reject' | 'cancel';
export type Actor = 'admin' | 'customer';

export type ErrorCode =
  | 'VALIDATION_ERROR' | 'INVALID_HEADCOUNT' | 'UNAUTHORIZED' | 'NOT_FOUND' | 'BOOKING_NOT_FOUND'
  | 'SESSION_FULL' | 'SESSION_CANCELLED' | 'SESSION_STARTED' | 'DUPLICATE_BOOKING'
  | 'INVALID_TRANSITION' | 'CANCEL_DEADLINE_PASSED' | 'CAPACITY_BELOW_OCCUPIED'
  | 'SESSION_HAS_BOOKINGS' | 'CLASS_HAS_SESSIONS' | 'INTERNAL_ERROR';

export const ERROR_CODES: readonly ErrorCode[];               // 위 유니온의 전체 목록 (DB 에러 메시지 판별용)
export const ERROR_HTTP_STATUS: Record<ErrorCode, number>;    // SPEC 5절 표 그대로 (INTERNAL_ERROR = 500)
export const ERROR_MESSAGE: Record<ErrorCode, string>;        // 고객·운영자에게 보여줄 한국어 기본 문구
export const BOOKING_STATUS_LABEL: Record<BookingStatus, string>; // 승인 대기 · 참여 확정 · 거절됨 · 취소됨
export const SESSION_STATUS_LABEL: Record<SessionStatus, string>; // 예정 · 취소

export class AppError extends Error {
  constructor(public code: ErrorCode, message?: string, public fieldErrors?: Record<string, string>);
} // message 생략 시 ERROR_MESSAGE[code]

export type RuleResult = { ok: true } | { ok: false; code: ErrorCode };
export type FieldErrors<K extends string> = Partial<Record<K, string>>;
export type Validated<T, K extends string> =
  | { ok: true; value: T }
  | { ok: false; code: ErrorCode; fieldErrors: FieldErrors<K> };
```

이후 step이 쓰는 데이터 형태(DTO)도 여기 정의한다. 시각은 모두 ISO 8601 문자열(오프셋 포함)이다.

```ts
export type BookingInput = { sessionId: string; headcount: number; customerName: string; phone: string }; // phone은 정규화된 값
export type PublicSession = { id: string; startsAt: string; capacity: number; remaining: number };
export type ClassSummary = { id: string; title: string; description: string; imageUrl: string | null; nextSessionAt: string | null };
export type ClassDetail = { id: string; title: string; description: string; imageUrl: string | null; sessions: PublicSession[] };
export type CreateBookingResult = { code: string; status: 'pending' };
export type BookingLookupResult = {
  code: string; status: BookingStatus; headcount: number;
  class: { title: string; description: string };
  session: { startsAt: string; status: SessionStatus };
  canCancel: boolean; cancelDeadline: string | null;
};
export type AdminBooking = {
  id: string; code: string; status: BookingStatus; headcount: number; customerName: string; phone: string;
  classTitle: string; sessionId: string; sessionStartsAt: string; sessionStatus: SessionStatus;
};
export type AdminSessionOption = { id: string; classTitle: string; startsAt: string; status: SessionStatus };
export type AdminBookingList = { bookings: AdminBooking[]; sessions: AdminSessionOption[] };
export type AdminClassSummary = { id: string; title: string; isPublished: boolean; imageUrl: string | null; sessionCount: number };
export type AdminSession = { id: string; startsAt: string; capacity: number; status: SessionStatus; occupied: number; bookingCount: number };
export type AdminClassDetail = { id: string; title: string; description: string; imageUrl: string | null; isPublished: boolean; sessions: AdminSession[] };
```

### 2. `src/lib/rules.ts` (순수 함수)

상수: `MIN_HEADCOUNT = 1`, `MAX_HEADCOUNT = 4`, `CONFIRMED_CANCEL_WINDOW_MS = 24h`, `IMAGE_MAX_BYTES = 4 * 1024 * 1024`, `ALLOWED_IMAGE_TYPES = ['image/jpeg','image/png','image/webp']`.

```ts
export function normalizePhone(raw: string): string;                     // 공백·하이픈 제거
export function validateBookingInput(input: unknown):
  Validated<BookingInput, 'sessionId' | 'headcount' | 'customerName' | 'phone'>;
export function validateLookupInput(input: unknown):
  Validated<{ code: string; phoneLast4: string }, 'code' | 'phoneLast4'>;
export function occupiedSeats(bookings: { status: BookingStatus; headcount: number }[]): number; // R-01, R-03
export function remainingSeats(capacity: number, occupied: number): number;                      // R-02, 0 미만이면 0
export function canApply(
  session: { status: SessionStatus; startsAt: Date; capacity: number; occupied: number },
  headcount: number, now: Date,
): RuleResult;                                                            // R-11, R-12, R-13, R-14
export function canTransition(
  from: BookingStatus, action: BookingAction, actor: Actor, ctx: { startsAt: Date; now: Date },
): RuleResult;                                                            // R-20, R-21, R-22, R-31, R-32
export function customerCancelDeadline(status: BookingStatus, startsAt: Date): Date | null; // R-31
export function isVisibleSession(session: { status: SessionStatus; startsAt: Date }, now: Date): boolean; // R-54
export function validateClassInput(input: unknown): Validated<{ title: string; description: string }, 'title' | 'description'>;
export function validateClassPatch(input: unknown):
  Validated<{ title?: string; description?: string; isPublished?: boolean }, 'title' | 'description' | 'isPublished'>;
export function validateSessionInput(input: unknown, now: Date):
  Validated<{ startsAt: Date; capacity: number }, 'startsAt' | 'capacity'>;          // R-46
export function validateSessionPatch(input: unknown, now: Date):
  Validated<{ startsAt?: Date; capacity?: number }, 'startsAt' | 'capacity'>;
export function canChangeCapacity(newCapacity: number, occupied: number): RuleResult;       // R-40
export function canChangeStartsAt(bookingCount: number, newStartsAt: Date, now: Date): RuleResult; // R-44
export function canDeleteSession(bookingCount: number): RuleResult;                          // R-41, R-43
export function canCancelSession(status: SessionStatus): RuleResult;                         // R-45
export function canDeleteClass(sessionCount: number): RuleResult;                            // R-50, R-51
export function validateImage(file: { type: string; size: number }): RuleResult;
```

핵심 규칙(반드시 지킬 것):

- 입력 기준: 이름은 trim 후 비어 있으면 안 된다. 전화번호는 정규화 후 숫자 10~11자리다. 인원은 1~4의 **정수**다(문자열 `"2"`, `2.5`는 거부). `phoneLast4`는 정확히 숫자 4자리 **문자열**이다(`"0123"` 허용, 숫자 타입 거부). 예약번호는 trim·대문자화 후 비어 있지 않아야 한다.
- `validateBookingInput`: 인원 오류만 있으면 `INVALID_HEADCOUNT`, 그 밖의 오류가 하나라도 있으면 `VALIDATION_ERROR`. 어느 경우든 `fieldErrors`에 필드별 한국어 문구를 채운다. 반환하는 `value.phone`, `value.customerName`은 정규화·trim된 값이다.
- `canApply` 판정 순서: 취소된 회차(`SESSION_CANCELLED`) → `now >= startsAt`(`SESSION_STARTED`) → 인원 범위(`INVALID_HEADCOUNT`) → 남은 자리 부족(`SESSION_FULL`).
- `canTransition`:
  - admin `confirm`: `pending`에서만, `now < startsAt`일 때만(아니면 `SESSION_STARTED`).
  - admin `reject`: `pending`에서만.
  - admin `cancel`: `pending`·`confirmed`에서 시간 제한 없이.
  - customer는 `cancel`만 가능(다른 action은 `INVALID_TRANSITION`). `pending`은 `now < startsAt`, `confirmed`는 `now <= startsAt - 24h`(정확히 24시간 전 포함). 기한이 지나면 `CANCEL_DEADLINE_PASSED`.
  - `rejected`·`cancelled`에서의 모든 action은 `INVALID_TRANSITION`(R-21). 이 판정이 시간 판정보다 먼저다.
- `customerCancelDeadline`: `pending` → `startsAt`(이 시각 **전**까지), `confirmed` → `startsAt - 24h`(이 시각**까지**), 그 외 `null`.
- 회차 입력: `startsAt`은 오프셋이 포함된 ISO 문자열이어야 하며(`Z` 또는 `+09:00`) `now`보다 뒤여야 한다. 아니면 `VALIDATION_ERROR`. `capacity`는 1 이상의 정수.
- `canChangeStartsAt`: 예약 이력이 하나라도 있으면 `SESSION_HAS_BOOKINGS`, 새 시각이 `now` 이하이면 `VALIDATION_ERROR`.
- `validateImage`: 형식이 허용 목록 밖이거나 크기가 4MB 초과면 `VALIDATION_ERROR`(정확히 4MB 허용).
- 모든 함수는 현재 시각을 인자로만 받는다.

### 3. `src/lib/rules.test.ts`

- 테스트 이름에 규칙 ID를 넣는다. 예: `it('R-31 확정 예약은 시작 정확히 24시간 전에 고객이 취소할 수 있다')`.
- 시간 경계는 고정 `now`로 검증한다: 시작 1ms 전 / 시작 정각(신청·승인), 24시간 전 정각 / 24시간 전 + 1ms(확정 취소), 시작 1ms 전 / 정각(대기 취소).
- PLAN 7절 시나리오 중 규칙 함수로 판정 가능한 것(정원 4·대기 3 → 남은 1·2명 불가, 공백·하이픈 전화번호 정규화, 최종 상태 재승인 거부, 23시간 전 확정 취소 불가, 과거 회차 생성 불가, 정원 축소 불가, 이력 있는 회차 삭제·시각 변경 불가, 회차 있는 클래스 삭제 불가 등)을 모두 포함한다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
test -f src/lib/types.ts && test -f src/lib/rules.ts && test -f src/lib/rules.test.ts
! grep -nE "from ['\"](@supabase|next|@/lib/db|node:)" src/lib/rules.ts
! grep -nE "new Date\(\)|Date\.now\(" src/lib/rules.ts
for id in R-01 R-11 R-12 R-13 R-14 R-20 R-21 R-22 R-31 R-40 R-41 R-44 R-46 R-51; do grep -q "$id" src/lib/rules.test.ts || { echo "missing $id"; exit 1; }; done
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - `src/lib/rules.ts`가 DB·네트워크·현재 시각에 의존하지 않는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/1-domain-rules/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (export한 주요 함수·타입 이름 포함)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- `src/lib/rules.ts`에서 Supabase·Next·`fetch`·`process.env`·`new Date()`를 쓰지 마라. 이유: 규칙은 순수 함수여야 하며 시간 경계를 고정 `now`로 테스트한다(ADR-005).
- 테스트 파일보다 구현 파일을 먼저 만들지 마라. 이유: TDD 가드가 차단하며 프로젝트 개발 규칙이다.
- zod 등 검증 라이브러리를 추가하지 마라. 이유: ADR 기술 스택 밖의 의존성이며 입력 규칙이 단순하다.
- 예약번호 생성 함수를 만들지 마라. 이유: 예약번호는 `3-database` step 0의 SQL 함수가 충돌 시 재발급하며 생성한다.
- `src/lib/types.ts`에 로직(검증·계산)을 넣지 마라. 이유: 타입·상수 파일은 TDD 가드 예외이므로 로직이 들어가면 테스트 없이 구현하는 셈이 된다.
- 기존 테스트를 깨뜨리지 마라
