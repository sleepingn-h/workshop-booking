# Step 2: api-admin-bookings

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` ("운영자 인증", "얇은 Route Handler")
- `/docs/ADR.md` (ADR-006)
- `/docs/SPEC.md` 5절 어드민 API(로그인·로그아웃·예약 목록·상태 변경)
- `/lib/auth.ts` (`2-admin-auth` step 0), `/lib/http.ts` 및 `app/api/bookings/**/route.ts`와 테스트 (step 1 — 같은 패턴을 따르라)
- `/lib/db.ts` (`3-database` step 1 — `listAdminBookings`, `changeBookingStatus`)

## 작업

각 route의 테스트를 **먼저 별도 패치로** 작성한 뒤 구현한다.

| 파일 | 동작 |
|---|---|
| `app/api/admin/login/route.ts` | `POST { password }`: `checkPassword` 실패 → 401 `UNAUTHORIZED`(문구: 비밀번호가 올바르지 않습니다). 성공 → 200 `{ ok: true }` + `ADMIN_COOKIE`를 `createSessionToken(now)`, `sessionCookieOptions(now)`로 설정. 기존 쿠키 불필요. |
| `app/api/admin/logout/route.ts` | `POST`: `requireAdmin` → 쿠키 삭제(같은 이름·path, 만료 과거) → 200 `{ ok: true }`. 미인증 401. |
| `app/api/admin/bookings/route.ts` | `GET ?sessionId=&status=&q=`: `requireAdmin` → `listAdminBookings({ sessionId, status, q })` → 200 `AdminBookingList`. 빈 문자열 파라미터는 null로 취급. |
| `app/api/admin/bookings/[id]/[action]/route.ts` | `POST`: `requireAdmin` → `action`이 `confirm`·`reject`·`cancel`이 아니면 404 `NOT_FOUND`(db 미호출) → `changeBookingStatus(id, action)` → 200 `{ ok: true }`. |

핵심 규칙:

- 운영자 API는 **인증 확인이 가장 먼저**다. 미인증이면 본문 파싱·db 호출 전에 401을 반환한다.
- 쿠키는 `NextResponse`의 `cookies.set`으로 설정한다. 옵션은 `httpOnly`·`secure`·`sameSite: 'lax'`·`path: '/'`·12시간 만료(SPEC 5절).
- GET 목록은 요청마다 최신이어야 한다. `export const dynamic = 'force-dynamic'`을 두거나 요청 객체를 읽어 동적으로 만든다.
- 로그인 실패 응답에 비밀번호 힌트·환경 변수 상태(미설정 여부)를 넣지 않는다.

테스트(`vi.mock('@/lib/db')`, 인증은 `vi.stubEnv` + `createSessionToken`으로 유효 쿠키를 만들어 Cookie 헤더로 전달):

- 로그인: 올바른 비밀번호 → 200 + `Set-Cookie`에 `HttpOnly`·`Secure`·`SameSite=lax`, 틀린 비밀번호 → 401·쿠키 없음.
- 로그아웃: 인증 시 쿠키 삭제 헤더, 미인증 401.
- 예약 목록: 미인증 401(db 미호출), 쿼리 파라미터 전달, `VALIDATION_ERROR` → 400.
- 상태 변경: 허용하지 않는 action(`approve`) → 404, `R-22` `SESSION_STARTED` → 409, `R-21` `INVALID_TRANSITION` → 409, 미인증 401.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
for f in login logout bookings "bookings/[id]/[action]"; do test -f "app/api/admin/$f/route.test.ts" || { echo "missing test $f"; exit 1; }; done
grep -q "requireAdmin" app/api/admin/bookings/route.ts && grep -q "requireAdmin" "app/api/admin/bookings/[id]/[action]/route.ts"
! grep -rn "PATCH" app/api/admin/bookings
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 상태 변경이 `PATCH { status }`가 아니라 동작별 엔드포인트인가?
   - 모든 운영자 API(로그인 제외)가 `requireAdmin`으로 시작하는가?
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/4-api/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- `PATCH /api/admin/bookings/:id { status }` 형태를 만들지 마라. 이유: AGENTS.md — 동작별 엔드포인트로 나눈다.
- 로그인 시도 횟수 제한·세션 테이블 등을 추가하지 마라. 이유: ADR-006 범위 밖이며 MVP에 포함되지 않는다.
- 비밀번호·토큰을 로그에 남기지 마라. 이유: AGENTS.md CRITICAL.
- 클래스·회차 관리 API를 만들지 마라. 이유: step 3의 범위다.
- 기존 테스트를 깨뜨리지 마라
