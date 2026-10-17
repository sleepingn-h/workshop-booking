# Step 2: admin-session-ui

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/UI_GUIDE.md` (운영자 표·카드, 정원 미터, Tag, 다이얼로그, 입력 필드)
- `/docs/PLAN.md` 4절 "문의 대응"의 일정 변경 절차, 8절 "운영자 클래스 상세", R-40~R-46
- `/docs/SPEC.md` 3절("시각과 취소 가능 여부" — 운영자 입력은 Asia/Seoul로 해석), 5절 회차 API
- `/lib/types.ts` (`AdminSession`, `AdminClassDetail`), `/lib/rules.ts` (`validateSessionInput`, `canDeleteSession`, `canChangeStartsAt`, `canChangeCapacity`), `/lib/format.ts` (`kstInputToIso`, `isoToKstInput`, `formatKstDateTime`), `/lib/api.ts`
- `/components/admin-class-form.tsx`·테스트 (step 1 — 쿼리 키 `['admin', 'class', id]`)
- `/app/admin/classes/[id]/page.tsx` (step 1)
- `/app/api/admin/classes/[id]/sessions/route.ts`, `/app/api/admin/sessions/**/route.ts` (`4-api` step 3)

## 작업

`src/components/admin-session-list.test.tsx`를 **먼저 별도 패치로** 작성한 뒤 구현한다.

```tsx
'use client';
export function AdminSessionList({ classId }: { classId: string }): JSX.Element;
```

- 데이터: step 1과 같은 쿼리 `['admin', 'class', classId]`(`GET /api/admin/classes/{id}`)의 `sessions`를 쓴다. 별도 API를 만들지 않는다.
- 목록(시작 시각 오름차순): KST 시작 시각, 상태 Tag(예정·지난 회차=neutral, 취소=danger), 정원·차지된 자리(정원 미터 + `차지 N / 정원 M` 텍스트), 예약 이력 수.
- 회차 추가 폼: `datetime-local`(KST로 해석 → `kstInputToIso`) + 정원(정수 ≥1). `validateSessionInput(input, new Date())`로 과거 시각·정원 오류를 필드 옆에 표시(R-46). `POST /api/admin/classes/{classId}/sessions` → 무효화 + 토스트.
- 회차 수정(예정 회차만): 정원과 시작 시각 편집.
  - 예약 이력이 있으면 시작 시각 입력을 비활성화하고 "예약 이력이 있는 회차는 시간을 바꿀 수 없어요. 회차를 취소하고 새로 만들어 주세요" 안내(R-44).
  - 정원을 차지된 자리보다 작게 입력하면 제출 전에 오류(R-40).
  - `PATCH /api/admin/sessions/{id}` — 바뀐 필드만 보낸다.
- 삭제: 예약 이력이 0인 회차만 ghost "삭제" 노출(R-43) → 확인 다이얼로그 → `DELETE`. 이력이 있으면 삭제 버튼 대신 안내(R-41).
- 취소: 예정 회차에 ghost "회차 취소" → 확인 다이얼로그("승인 대기·참여 확정 예약 N건이 함께 취소됩니다. 고객에게 직접 연락해 주세요", R-42) → ink 확정 → `POST /api/admin/sessions/{id}/cancel`. 취소된 회차에는 수정·취소·삭제 동작이 없다(R-45).
- 모든 변경 성공 시 `['admin']` 접두 쿼리를 무효화한다(예약 목록의 회차 상태도 갱신). 실패 시 서버 메시지 표시, 입력 유지, 요청 중 비활성.
- 레이아웃: 데스크톱 표, 900px 이하 카드. 360px 가로 스크롤 없음.

`src/app/admin/classes/[id]/page.tsx`에 `<AdminSessionList classId={id} />`를 클래스 폼 아래(섹션 제목 "회차")에 추가한다.

테스트:

- `R-46` 과거 시각 입력 시 오류·미호출, 정상 입력 시 `+09:00` 오프셋 ISO로 POST.
- `R-40` 차지된 자리보다 작은 정원 입력 시 오류·미호출.
- `R-44` 이력 있는 회차의 시작 시각 입력 비활성.
- `R-41`/`R-43` 이력 있는 회차는 삭제 버튼 없음, 이력 없는 회차는 확인 후 DELETE.
- `R-42` 회차 취소 다이얼로그에 활성 예약 안내, 확정 시 cancel API 호출 후 무효화.
- `R-45` 취소된 회차에는 동작 버튼 없음, 상태 텍스트 `취소` 표시.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
test -f src/components/admin-session-list.test.tsx
grep -q "AdminSessionList" "src/app/admin/classes/[id]/page.tsx"
grep -q "kstInputToIso" src/components/admin-session-list.tsx
for id in R-40 R-41 R-42 R-44 R-45 R-46; do grep -q "$id" src/components/admin-session-list.test.tsx || { echo "missing $id"; exit 1; }; done
! grep -rqE "SUPABASE_SERVICE_ROLE_KEY|ADMIN_PASSWORD|ADMIN_SESSION_SECRET" .next/static
git diff --quiet HEAD -- src/components/ui/
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 운영자의 시각 입력이 Asia/Seoul로 해석되어 오프셋 포함 ISO로 전송되는가?
   - 회차 취소·삭제 전에 확인 절차가 있는가?
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/6-admin-ui/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 취소된 회차를 다시 여는 동작을 만들지 마라. 이유: R-45.
- 회차를 다른 클래스로 옮기는 UI를 만들지 마라. 이유: R-46.
- 취소된 회차의 예약을 다른 회차로 옮기는 기능을 만들지 마라. 이유: PLAN 2절 범위 제외.
- `datetime-local` 값을 브라우저 시간대로 해석하지 마라(`new Date(value)` 금지). 이유: SPEC 3절 — 운영자 입력은 Asia/Seoul로 해석한다.
- 기존 테스트를 깨뜨리지 마라
