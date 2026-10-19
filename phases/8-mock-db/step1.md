# Step 1: db-mock-switch

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/PLAN.md` 9절 "개발용 목 데이터 모드"
- `/docs/SPEC.md` 3절 "개발용 목 데이터 모드", 5절 "에러 응답"의 `MOCK_READ_ONLY`, 6절 자동 테스트 표의 `src/lib/db.ts (목 모드 분기)` 행, 7절 환경 변수 `MOCK_DB`
- `/docs/ADR.md` ADR-012
- `src/lib/mock-db.ts`, `src/lib/mock-db.test.ts` (step 0 — `isMockDb`와 조회 함수 6개)
- `src/lib/db.ts`, `src/lib/db.test.ts` (Supabase 모킹 방식, 요청 시각 고정 테스트 패턴)
- `src/lib/types.ts` (`ErrorCode`·`ERROR_CODES`·`ERROR_HTTP_STATUS`·`ERROR_MESSAGE`), `src/lib/http.ts`
- `.env.example`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

`src/lib/db.test.ts`에 목 모드 테스트를 **먼저 별도 패치로** 추가한 뒤 구현한다.

### 1. 오류 코드 `MOCK_READ_ONLY` (`src/lib/types.ts`)

- `ErrorCode`·`ERROR_CODES`에 추가, `ERROR_HTTP_STATUS.MOCK_READ_ONLY = 503`, `ERROR_MESSAGE.MOCK_READ_ONLY = "목 데이터 모드에서는 변경할 수 없습니다."`.
- `http.ts`의 응답 변환은 이 표를 그대로 쓰므로 수정이 필요 없으면 건드리지 않는다. 기존에 에러 코드 목록 전체를 검사하는 테스트가 있으면 새 코드를 반영한다.

### 2. `src/lib/db.ts` 분기

- 조회 함수 6개(`listPublishedClasses`·`getPublishedClass`·`lookupBooking`·`listAdminBookings`·`listAdminClasses`·`getAdminClass`): 진입 시 기존처럼 `const now = new Date()`를 먼저 읽고, 바로 다음에 `if (isMockDb()) return mockXxx(..., now);`로 위임한다. 목 모드에서는 `getClient()`를 호출하지 않는다.
- 변경 함수 11개(`createBooking`·`cancelBookingByCustomer`·`changeBookingStatus`·`createClass`·`updateClass`·`deleteClass`·`uploadClassImage`·`createSession`·`updateSession`·`deleteSession`·`cancelSession`): 진입 시 `isMockDb()`이면 입력 검증·DB 호출 전에 `throw new AppError("MOCK_READ_ONLY")`. 요청 시각 수집 규약(진입 시 `now`를 한 번 읽음)은 유지한다.
- 목 모드가 아닐 때 기존 동작은 그대로다. `getClient()`의 환경 변수 누락 처리(`INTERNAL_ERROR`)도 바꾸지 않는다.

### 3. `.env.example`

- 기존 형식(주석 한 줄 + `이름=`)으로 `MOCK_DB=` 항목 추가. 주석: `# 1이면 개발 서버에서 읽기 전용 목 데이터 모드 사용 (production에서는 무시)`.

### 테스트 (`src/lib/db.test.ts`)

- `vi.stubEnv("MOCK_DB", "1")`(NODE_ENV는 test)에서 조회 함수 6개가 각각 `createClient`를 호출하지 않고 `mock-db.ts`의 대응 함수에 같은 인자와, 고정한 시스템 시각과 같은 `now`를 넘기는지(`vi.mock("./mock-db", ...)` 또는 `vi.spyOn`).
- 같은 조건에서 변경 함수 11개가 모두 `MOCK_READ_ONLY`로 거부하고 `createClient`·RPC를 호출하지 않는지(`it.each` 가능).
- `MOCK_DB=1`이어도 `NODE_ENV=production`이면 기존 Supabase 경로를 탄다(모킹한 `isMockDb`가 아니라 실제 조건을 쓰는 경우) — 또는 `isMockDb`를 모킹했다면 false일 때 기존 경로를 타는지 확인한다.
- 각 테스트 뒤 `vi.unstubAllEnvs()`로 원복해 기존 테스트에 영향을 주지 않는다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
grep -q 'MOCK_READ_ONLY: 503' src/lib/types.ts
grep -q 'isMockDb' src/lib/db.ts
test "$(grep -c 'MOCK_READ_ONLY' src/lib/db.ts)" -ge 11
grep -q '^MOCK_DB=$' .env.example
git diff --quiet HEAD -- src/components/ui/ supabase/schema.sql src/lib/auth.ts
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 목 모드에서 조회는 Supabase 클라이언트를 만들지 않고, 변경은 검증·DB 호출 전에 `MOCK_READ_ONLY`로 거부하는가?
   - 요청 시각을 진입 시 한 번 읽어 목 함수에 넘기는가?
   - production에서는 목 모드가 적용되지 않는가?
   - 에러 응답 형식 `{ error: { code, message } }`와 503 상태가 Route Handler를 통해 그대로 나가는가?
3. 가능하면 `.env.local` 없이 `MOCK_DB=1 ADMIN_PASSWORD=x ADMIN_SESSION_SECRET=y npx next dev -p 3100`으로 띄워 `curl -s -o /dev/null -w '%{http_code}' localhost:3100/`가 200, `curl -s -X POST localhost:3100/api/bookings -H 'content-type: application/json' -d '{}'`가 `MOCK_READ_ONLY`를 반환하는지 확인하고 서버를 종료한다. 포트 3000은 사용자가 쓰고 있을 수 있으니 쓰지 마라.
4. 결과에 따라 `phases/8-mock-db/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- Supabase 환경 변수가 없을 때 자동으로 목 모드로 전환하지 마라. 이유: ADR-012 — 명시적 플래그로만 켠다.
- 목 모드에서 변경을 메모리에 반영하지 마라. 이유: PLAN 9절 — 읽기 전용이며 예약 저장의 원본은 Postgres 하나다.
- `auth.ts`에 목 모드 분기나 기본 비밀번호를 넣지 마라. 이유: 운영자 로그인은 목 모드에서도 `.env.local`의 `ADMIN_PASSWORD`·`ADMIN_SESSION_SECRET`을 쓰기로 결정했다.
- Route Handler·컴포넌트에 목 모드 분기를 넣지 마라. 이유: 분기는 `db.ts` 한 곳에 둔다(ARCHITECTURE "패턴").
- `.env.local`을 만들거나 수정하지 마라. 이유: 사용자의 로컬 비밀 설정 파일이다.
- 기존 테스트를 깨뜨리지 마라
