# Step 1: api-public

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` ("얇은 Route Handler")
- `/docs/SPEC.md` 5절(공개 API, 에러 응답), 6절 route.ts 행
- `/lib/types.ts` (`1-domain-rules` step 0 — `AppError`, `ERROR_HTTP_STATUS`, `ERROR_MESSAGE`)
- `/lib/auth.ts` (`2-admin-auth` step 0 — `isAdminRequest`)
- `/lib/db.ts` (`3-database` step 1, 2 — `createBooking`, `lookupBooking`, `cancelBookingByCustomer` 시그니처)
- Next.js 16 Route Handler 규약: 동적 세그먼트의 두 번째 인자는 `{ params: Promise<{ ... }> }`이다. `node_modules/next/dist/docs/`가 있으면 확인하라.

## 작업

각 파일의 테스트를 **먼저 별도 패치로** 작성한 뒤 구현한다.

### 1. `src/lib/http.ts` (+ `src/lib/http.test.ts`)

```ts
import 'server-only';
export function jsonOk<T>(data: T, status?: number): Response;   // 기본 200
export function errorResponse(code: ErrorCode, message?: string, status?: number): Response; // { error: { code, message } }
export function toErrorResponse(error: unknown): Response;      // AppError → ERROR_HTTP_STATUS[code]; 그 외 → 500 INTERNAL_ERROR
export async function readJson(request: Request): Promise<unknown>; // 본문이 JSON이 아니면 AppError('VALIDATION_ERROR')
export function requireAdmin(request: Request): void;            // isAdminRequest(request, new Date())가 false면 AppError('UNAUTHORIZED')
```

- `toErrorResponse`는 `AppError`가 아닌 예외를 `console.error`로 남기되 메시지·스택만 남기고 요청 본문(전화번호 등)·환경 변수는 남기지 않는다. 응답에는 원인 정보를 넣지 않는다.
- `AppError.fieldErrors`가 있으면 응답의 `error.fields`로 함께 내려준다(화면이 필드 옆에 표시).
- 테스트: AppError 코드별 상태(400·401·404·409), 알 수 없는 예외 500, 잘못된 JSON → 400, `requireAdmin`이 유효 쿠키 통과·무효 쿠키 throw(`src/lib/auth`는 실제 모듈 + `vi.stubEnv` 또는 모킹 중 택1).

### 2. Route Handlers (각 폴더에 `route.test.ts`)

| 파일 | 동작 |
|---|---|
| `src/app/api/bookings/route.ts` | `POST`: `readJson` → `createBooking(body)` → `jsonOk(result, 201)` |
| `src/app/api/bookings/lookup/route.ts` | `POST`: `readJson` → `lookupBooking(body)` → 200 |
| `src/app/api/bookings/[code]/cancel/route.ts` | `POST`: `const { code } = await params` → `readJson` → `cancelBookingByCustomer(code, body)` → 200 |

- 모든 핸들러는 try/catch로 감싸 `toErrorResponse`로 응답한다. 입력 검증·규칙 판정은 `src/lib/db.ts`가 하므로 핸들러에서 다시 하지 않는다.
- 이 경로들은 동적이어야 한다(캐시 금지). POST 핸들러는 기본적으로 캐시되지 않으므로 추가 설정은 필요 없다.
- 테스트는 `vi.mock('@/lib/db')`로 db 함수를 모킹한다. 사례: 성공 201/200과 본문, db가 `AppError('SESSION_FULL')` → 409 `{ error: { code: 'SESSION_FULL' } }`, `BOOKING_NOT_FOUND` → 404, 잘못된 JSON → 400(db 미호출), 예상치 못한 예외 → 500, cancel이 경로의 `code`를 db에 넘김. 테스트 이름에 관련 규칙 ID(R-11, R-30 등)를 넣는다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
test -f src/app/api/bookings/route.test.ts && test -f src/app/api/bookings/lookup/route.test.ts && test -f "src/app/api/bookings/[code]/cancel/route.test.ts"
test ! -e src/app/api/classes
grep -q "server-only" src/lib/http.ts
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - Route Handler가 파싱·`db.ts` 호출·에러 변환만 하는가(얇은 핸들러)?
   - 클래스 목록·상세 조회 API(`/api/classes`)를 만들지 않았는가?
   - 고객 조회·취소가 POST body로 전화번호를 받는가(URL에 남기지 않음)?
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/4-api/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (`src/lib/http.ts` export 이름 포함)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- `GET /api/classes` 등 클래스 조회 API를 만들지 마라. 이유: AGENTS.md CRITICAL — 서버 컴포넌트가 `src/lib/db.ts`를 직접 호출한다.
- Route Handler에서 Supabase를 직접 호출하거나 규칙 함수를 다시 호출하지 마라. 이유: 처리 순서는 `src/lib/db.ts` 한 곳에 둔다(ADR-002).
- 전화번호 뒷자리를 쿼리스트링으로 받지 마라. 이유: SPEC 5절 — URL에 남지 않도록 POST body를 쓴다.
- 운영자 API를 만들지 마라. 이유: step 2, 3의 범위다.
- 기존 테스트를 깨뜨리지 마라
