# Step 3: api-admin-catalog

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` ("이미지는 운영자 API 경유", "얇은 Route Handler")
- `/docs/ADR.md` (ADR-011)
- `/docs/SPEC.md` 5절 어드민 API 표(클래스·회차·이미지)
- `/lib/http.ts` (step 1), `app/api/admin/**/route.ts`와 테스트 (step 2 — 같은 패턴을 따르라)
- `/lib/db.ts` (`3-database` step 2 — 클래스·회차·이미지 함수)

## 작업

각 route의 테스트를 **먼저 별도 패치로** 작성한 뒤 구현한다. 모든 핸들러는 `requireAdmin`을 가장 먼저 호출하고 `toErrorResponse`로 에러를 변환한다.

| 파일 | 메서드 → db 함수 → 응답 |
|---|---|
| `app/api/admin/classes/route.ts` | `GET` → `listAdminClasses()` → `{ classes }` / `POST` → `createClass(body)` → 201 `{ id }` |
| `app/api/admin/classes/[id]/route.ts` | `GET` → `getAdminClass(id)` → `AdminClassDetail` / `PATCH` → `updateClass(id, body)` → `{ ok: true }` / `DELETE` → `deleteClass(id)` → `{ ok: true }` |
| `app/api/admin/classes/[id]/image/route.ts` | `PUT` (`multipart/form-data`, 필드명 `image`) → `uploadClassImage(id, file)` → `{ imageUrl }` |
| `app/api/admin/classes/[id]/sessions/route.ts` | `POST` → `createSession(id, body)` → 201 `{ id }` |
| `app/api/admin/sessions/[id]/route.ts` | `PATCH` → `updateSession(id, body)` → `{ ok: true }` / `DELETE` → `deleteSession(id)` → `{ ok: true }` |
| `app/api/admin/sessions/[id]/cancel/route.ts` | `POST` → `cancelSession(id)` → `{ ok: true }` |

핵심 규칙:

- 이미지: `await request.formData()`의 `image`가 `File`이 아니면 400 `VALIDATION_ERROR`(db 미호출). 형식·크기 검증은 `lib/db.ts`(`validateImage`)가 한다. 요청 크기 제한 때문에 4MB를 넘는 파일은 Vercel에서 413으로 막힐 수 있으므로 화면에서도 미리 검사한다(`6-admin-ui` step 1).
- GET 핸들러는 요청마다 최신이어야 한다(`dynamic = 'force-dynamic'` 또는 동등한 방법).
- `params`는 `Promise`이므로 `await`한다.

테스트(`vi.mock('@/lib/db')`):

- 각 메서드의 미인증 401(db 미호출).
- 성공 상태 코드(201/200)와 본문.
- `R-51` `CLASS_HAS_SESSIONS` → 409, `R-40` `CAPACITY_BELOW_OCCUPIED` → 409, `R-41`/`R-44` `SESSION_HAS_BOOKINGS` → 409, `R-45` `SESSION_CANCELLED` → 409, `R-46` `VALIDATION_ERROR` → 400, `NOT_FOUND` → 404.
- 이미지: `FormData`에 `File`을 담아 `uploadClassImage`에 같은 File이 전달됨, `image` 필드 누락 → 400.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
for f in classes "classes/[id]" "classes/[id]/image" "classes/[id]/sessions" "sessions/[id]" "sessions/[id]/cancel"; do test -f "app/api/admin/$f/route.test.ts" || { echo "missing test $f"; exit 1; }; done
test "$(grep -rL requireAdmin app/api/admin/classes app/api/admin/sessions --include=route.ts | wc -l | tr -d ' ')" = "0"
! grep -rn "@supabase" app/
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 이미지가 운영자 API를 거쳐 서버에서만 Storage로 가는가(ADR-011)?
   - `app/` 아래에서 Supabase를 직접 import하지 않는가?
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/4-api/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- Route Handler에서 Supabase·Storage를 직접 호출하지 마라. 이유: 모든 저장소 접근은 `lib/db.ts`가 담당한다(ADR-002).
- 회차의 `classId`를 바꾸는 필드를 PATCH에서 받지 마라. 이유: R-46.
- 공개 클래스 조회용 API를 만들지 마라. 이유: AGENTS.md CRITICAL.
- 기존 테스트를 깨뜨리지 마라
