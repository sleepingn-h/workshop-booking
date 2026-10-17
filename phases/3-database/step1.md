# Step 1: db-bookings

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` ("처리 순서는 src/lib/db.ts", "요청 시각", 데이터 흐름)
- `/docs/ADR.md` (ADR-002, ADR-003, ADR-005, ADR-009)
- `/docs/SPEC.md` 3절, 5절(응답 내용·에러 코드), 6절 `src/lib/db.ts` 행
- `/lib/types.ts`, `/lib/rules.ts` (`1-domain-rules` step 0)
- `/supabase/schema.sql` (step 0 — 테이블·뷰 `session_stats`·RPC 시그니처와 에러 규약)

## 작업

`src/lib/db.test.ts`를 **먼저 별도 패치로** 작성한 뒤 `src/lib/db.ts`를 구현한다. 이 step은 공개 조회와 예약 관련 함수만 만든다. 클래스·회차 관리 함수는 step 2에서 같은 파일에 추가한다.

### 공통 (`src/lib/db.ts`)

```ts
import 'server-only';
function getClient(): SupabaseClient;   // 내부 함수. 첫 호출 시 SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY로 생성해 캐시. auth.persistSession: false
function toAppError(error: { message?: string } | null): AppError; // message가 ERROR_CODES에 있으면 그 코드, 아니면 INTERNAL_ERROR
```

- 모든 export 함수는 **진입 직후, DB 조회 전에** `const now = new Date()`를 한 번 읽고, 규칙 함수의 `now`와 RPC의 `p_now`(`now.toISOString()`)에 같은 값을 넘긴다.
- 입력 검증(규칙 함수)이 실패하면 DB를 호출하지 않고 `throw new AppError(code, undefined, fieldErrors)`.
- 처리 순서: 조회 → 규칙 확인 → RPC 저장. RPC가 저장 시점에 다시 확인하므로 조회 결과만으로 변경을 확정하지 않는다.
- 환경 변수가 없으면 호출 시점에 `INTERNAL_ERROR`를 던진다(모듈 로드 시 던지지 않음 — 빌드가 환경 변수 없이 통과해야 한다).

### export 함수

```ts
export async function listPublishedClasses(): Promise<ClassSummary[]>;
export async function getPublishedClass(id: string): Promise<ClassDetail | null>;
export async function createBooking(input: unknown): Promise<CreateBookingResult>;
export async function lookupBooking(input: unknown): Promise<BookingLookupResult>;
export async function cancelBookingByCustomer(code: string, input: unknown): Promise<BookingLookupResult>;
export async function listAdminBookings(filter: { sessionId?: string | null; status?: string | null; q?: string | null }): Promise<AdminBookingList>;
export async function changeBookingStatus(id: string, action: BookingAction): Promise<void>;
```

- `listPublishedClasses`: 공개 클래스만. `nextSessionAt`은 `isVisibleSession`을 통과한 회차 중 가장 이른 시작 시각(없으면 null).
- `getPublishedClass`: 비공개·없음이면 `null`(페이지가 404 처리). id가 uuid 형식이 아니면 DB 호출 없이 `null`. 회차는 `isVisibleSession`으로 거른 뒤 시작 시각 오름차순, `remaining = remainingSeats(capacity, occupied)`(occupied는 `session_stats`).
- `createBooking`: `validateBookingInput` → 회차·클래스·`session_stats` 조회(없거나 비공개 → `NOT_FOUND`) → `canApply` → `rpc('create_booking', {..., p_now})` → `{ code, status: 'pending' }`.
- `lookupBooking`: `validateLookupInput` → 예약번호로 예약·회차·클래스 조회 → 예약이 없거나 `phone`의 뒤 4자리가 다르면 `BOOKING_NOT_FOUND`(어느 값이 틀렸는지 구분 금지, 인증 실패 시 상태·기한 정보 미노출). 성공 시 `canCancel = canTransition(status, 'cancel', 'customer', {startsAt, now}).ok`, `cancelDeadline = customerCancelDeadline(...)?.toISOString() ?? null`. 응답에 전체 전화번호를 넣지 않는다. 비공개 클래스·숨겨진 회차의 예약도 조회된다.
- `cancelBookingByCustomer`: `validateLookupInput({ code, phoneLast4 })` → 같은 방식으로 인증 → `canTransition(..., 'customer', ...)` 실패 시 해당 코드로 throw → `rpc('customer_cancel_booking', {..., p_now})` → 갱신된 조회 결과를 반환(같은 `now` 사용).
- `listAdminBookings`: `status`가 주어졌는데 `BookingStatus`가 아니거나 `sessionId`가 uuid가 아니면 `VALIDATION_ERROR`. `rpc('admin_list_bookings', ...)`로 예약을, 별도 조회로 전체 회차 선택지(`AdminSessionOption[]`, 필터와 무관하게 전체, 시작 시각 오름차순)를 가져온다. `q`를 PostgREST `.or()`/`.filter()` 문자열에 직접 넣지 않는다.
- `changeBookingStatus`: 예약·회차 조회(없으면 `NOT_FOUND`) → `canTransition(status, action, 'admin', {startsAt, now})` → `rpc('admin_set_booking_status', {..., p_now})`.
- 컬럼명(snake_case) → DTO(camelCase) 변환은 이 파일 안에서 한다.

### `src/lib/db.test.ts`

- `vi.mock('@supabase/supabase-js')`로 `createClient`를 모킹한다. 쿼리 빌더 체인(`from().select().eq()...`)과 `rpc`를 흉내 내는 작은 테스트 헬퍼를 테스트 파일 안에 둔다.
- `vi.useFakeTimers(); vi.setSystemTime(...)`으로 시각을 고정한다.
- 필수 사례(테스트 이름에 규칙 ID 포함):
  - `R-14`/`R-15` createBooking이 RPC에 고정 시각과 같은 `p_now`를 넘긴다.
  - `R-12` 인원 5 → DB 호출 0회, `INVALID_HEADCOUNT`.
  - `R-11` 조회 결과 남은 자리 부족 → RPC 미호출, `SESSION_FULL`.
  - `R-16` RPC가 `{ message: 'DUPLICATE_BOOKING' }` 에러 → `AppError('DUPLICATE_BOOKING')`.
  - 알 수 없는 RPC 에러 → `INTERNAL_ERROR`.
  - `R-52` 비공개 클래스 회차 신청 → `NOT_FOUND`, getPublishedClass → null.
  - `R-54` getPublishedClass가 시작한 회차·취소 회차를 제외한다.
  - `R-30` 뒷자리 불일치와 예약번호 없음이 같은 `BOOKING_NOT_FOUND`이고 상태·기한을 포함하지 않는다.
  - `R-31` 시작 23시간 전 확정 예약 조회 → `canCancel: false`, 고객 취소 → RPC 미호출, `CANCEL_DEADLINE_PASSED`.
  - `R-22` 시작한 회차 승인 → RPC 미호출, `SESSION_STARTED`.
  - `R-19` listAdminBookings가 q를 RPC 인자로 전달한다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
grep -q "server-only" src/lib/db.ts
grep -q "p_now" src/lib/db.ts
! grep -n "\.or(" src/lib/db.ts
! grep -nE "^const .*createClient\(" src/lib/db.ts
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - Service·Repository 계층이나 메모리 저장소를 만들지 않았는가?
   - 요청 시각을 함수 진입 시 한 번만 읽는가? 규칙 함수와 RPC에 같은 값을 넘기는가?
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/3-database/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (export 함수명, 테스트 헬퍼 위치 포함)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 실제 Supabase에 접속하는 테스트를 만들지 마라. 이유: ADR-004 — 실제 DB 자동 테스트는 두지 않는다.
- `src/lib/db.ts` 밖에 Service·Repository·저장소 추상화를 만들지 마라. 이유: ADR-002.
- Supabase 클라이언트를 모듈 최상단에서 생성하지 마라. 이유: 환경 변수 없이 `npm run build`가 통과해야 한다.
- 고객 조회 응답에 전체 전화번호·내부 id를 넣지 마라. 이유: 개인정보 최소 노출. 운영자 목록에만 전체 전화번호를 제공한다.
- 검색어 `q`를 PostgREST 필터 문자열에 보간하지 마라. 이유: 필터 문법 주입이 가능하다. RPC 인자로 넘긴다.
- 클래스·회차 관리 함수와 이미지 업로드를 이 step에서 만들지 마라. 이유: step 2의 범위다.
- 기존 테스트를 깨뜨리지 마라
