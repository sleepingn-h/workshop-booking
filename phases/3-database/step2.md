# Step 2: db-catalog

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` ("이미지는 운영자 API 경유", "요청 시각")
- `/docs/ADR.md` (ADR-003, ADR-011)
- `/docs/PLAN.md` 6절 R-40~R-58
- `/docs/SPEC.md` 1절(Class 이미지 규칙), 3절, 5절 어드민 API 표
- `/lib/types.ts`, `/lib/rules.ts` (`1-domain-rules` step 0)
- `/supabase/schema.sql` (step 0)
- `/lib/db.ts`, `/lib/db.test.ts` (step 1 — 공통 헬퍼 `getClient`·`toAppError`와 테스트 헬퍼를 재사용하라)

## 작업

`src/lib/db.test.ts`에 테스트를 **먼저** 추가한 뒤 `src/lib/db.ts`에 아래 함수를 추가한다. step 1의 함수·테스트는 수정하지 않는다(공통 헬퍼 추출 정도의 리팩터링은 허용).

```ts
export async function listAdminClasses(): Promise<AdminClassSummary[]>;
export async function getAdminClass(id: string): Promise<AdminClassDetail>;        // 없으면 NOT_FOUND
export async function createClass(input: unknown): Promise<{ id: string }>;         // R-57: is_published=false
export async function updateClass(id: string, input: unknown): Promise<void>;       // title·description·isPublished
export async function deleteClass(id: string): Promise<void>;                       // R-50, R-51
export async function uploadClassImage(id: string, file: File): Promise<{ imageUrl: string }>;
export async function createSession(classId: string, input: unknown): Promise<{ id: string }>; // R-46
export async function updateSession(id: string, input: unknown): Promise<void>;     // R-40, R-44
export async function deleteSession(id: string): Promise<void>;                     // R-41, R-43
export async function cancelSession(id: string): Promise<void>;                     // R-42, R-45
```

핵심 규칙:

- 모든 함수는 진입 직후 `const now = new Date()`를 한 번 읽는다. 시간 판정이 있는 RPC(`create_session`, `update_session`)에는 같은 값을 `p_now`로 넘긴다.
- 잘못된 uuid 형식의 id는 DB 호출 없이 `NOT_FOUND`.
- `listAdminClasses`: 비공개 포함 전체, 생성 시각 내림차순, `sessionCount`.
- `getAdminClass`: 회차 전체(취소·시작 포함, 시작 시각 오름차순)와 `session_stats`의 `occupied`·`bookingCount`.
- `createClass`: `validateClassInput` → insert(`is_published` 지정하지 않음 = false).
- `updateClass`: `validateClassPatch` → `title`/`description`은 일반 update, `isPublished`가 있으면 `rpc('set_class_published')`(행 잠금, AGENTS.md CRITICAL). 대상 없음 → `NOT_FOUND`.
- `deleteClass`: 클래스·회차 수 조회 → `canDeleteClass` → `rpc('delete_class')` → 반환된 `image_path`가 있으면 Storage `class-images`에서 삭제. Storage 삭제 실패는 클래스 삭제를 되돌리지 않는다(서버 로그에 경로만 남기고 무시).
- `uploadClassImage`: `validateImage({ type: file.type, size: file.size })` 실패 시 Storage 호출 없이 `VALIDATION_ERROR` → 클래스 조회(없으면 `NOT_FOUND`) → `class-images/classes/<classId>/<randomUUID>.<ext>`에 업로드(`contentType` 지정) → `getPublicUrl` → `image_url`·`image_path` update → 기존 `image_path`가 있으면 기존 파일 삭제. 샘플 이미지(`image_path` null, `/samples/...`)는 Storage 삭제 대상이 아니다.
- `createSession`: `validateSessionInput(input, now)` → `rpc('create_session', { ..., p_now })` → id.
- `updateSession`: `validateSessionPatch(input, now)` → 회차·`session_stats` 조회 → `canChangeCapacity`/`canChangeStartsAt`(시작 시각이 실제로 바뀔 때만) → `rpc('update_session', { ..., p_now })`.
- `deleteSession`: 조회 → `canDeleteSession(bookingCount)` → `rpc('delete_session')`.
- `cancelSession`: 조회 → `canCancelSession(status)` → `rpc('cancel_session')`.
- RPC·Storage 에러는 step 1의 `toAppError`로 변환한다.

### 테스트 (`src/lib/db.test.ts`에 추가)

- `R-57` createClass가 `is_published: true`를 보내지 않는다.
- `R-52` updateClass의 `isPublished` 변경이 `set_class_published` RPC로 간다.
- `R-51` 회차가 있는 클래스 삭제 → RPC 미호출, `CLASS_HAS_SESSIONS`.
- 클래스 삭제·이미지 교체 시 기존 Storage 파일 `remove`가 호출된다(SPEC 6절).
- 이미지 형식(`image/gif`)·크기(4MB 초과) 오류 시 Storage `upload` 미호출.
- `R-46` 과거 시각 회차 생성 → DB 미호출, `VALIDATION_ERROR`, 정상 생성 시 `p_now`가 고정 시각과 같음.
- `R-40` 차지된 자리보다 작은 정원 → RPC 미호출, `CAPACITY_BELOW_OCCUPIED`.
- `R-44` 이력 있는 회차의 시작 시각 변경 → `SESSION_HAS_BOOKINGS`.
- `R-41` 이력 있는 회차 삭제 → `SESSION_HAS_BOOKINGS`. `R-43` 이력 없는 회차 삭제 → RPC 호출.
- `R-45` 이미 취소된 회차 취소 → `SESSION_CANCELLED`. `R-42` 정상 취소 → `cancel_session` RPC 호출.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
for f in listAdminClasses getAdminClass createClass updateClass deleteClass uploadClassImage createSession updateSession deleteSession cancelSession; do grep -q "export async function $f" src/lib/db.ts || { echo "missing $f"; exit 1; }; done
grep -q "set_class_published" src/lib/db.ts && grep -q "class-images" src/lib/db.ts
for id in R-40 R-41 R-42 R-44 R-46 R-51 R-57; do grep -q "$id" src/lib/db.test.ts || { echo "missing $id"; exit 1; }; done
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 회차 정원 변경·취소·삭제, 클래스 삭제·공개 전환이 모두 Postgres 함수를 거치는가?
   - 이미지가 서버에서만 Storage에 저장되는가?
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/3-database/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 공개 전환·회차 정원 변경·취소·삭제·클래스 삭제를 일반 `update`/`delete` 쿼리로 처리하지 마라. 이유: AGENTS.md CRITICAL — Postgres 함수의 행 잠금 안에서 처리한다(R-15, R-50~R-52).
- 클래스 소속(`class_id`)을 변경하는 경로를 만들지 마라. 이유: R-46 — 생성 후 소속 클래스는 바꿀 수 없다.
- 브라우저용 Storage 업로드 URL(signed upload URL)을 만들지 마라. 이유: ADR-011 — 이미지는 운영자 API를 거쳐 서버에서 저장한다.
- step 1의 테스트를 삭제하거나 기대값을 바꾸지 마라. 이유: 기존 동작 회귀를 막는다.
- 기존 테스트를 깨뜨리지 마라
