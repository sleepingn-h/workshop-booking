# Step 1: admin-class-ui

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/UI_GUIDE.md` (입력 필드·여러 줄, 카드 운영자 폼 32px, 클래스 편집 레이아웃, Tag, 다이얼로그)
- `/docs/PLAN.md` 4절 클래스·회차 관리, 5절 클래스 필수 안내, 8절 "운영자 클래스 목록·상세", R-50~R-58
- `/docs/SPEC.md` 1절 Class(이미지 규칙), 5절 어드민 API 표
- `/lib/types.ts` (`AdminClassSummary`, `AdminClassDetail`), `/lib/rules.ts` (`validateClassInput`, `validateImage`, `IMAGE_MAX_BYTES`, `ALLOWED_IMAGE_TYPES`), `/lib/api.ts`
- `/components/admin-booking-list.tsx`·테스트 (step 0 — 쿼리 키·다이얼로그·토스트 패턴), `/components/status-badge.tsx`
- `/app/admin/layout.tsx`, `/app/admin/page.tsx` (step 0)
- `/app/api/admin/classes/**/route.ts` (`4-api` step 3)

## 작업

`src/components/admin-class-form.test.tsx`를 **먼저 별도 패치로** 작성한 뒤 구현한다.

```tsx
'use client';
export function AdminClassForm({ classId }: { classId?: string }): JSX.Element;
```

생성 모드(`classId` 없음):

- 이름·설명 입력. 설명 입력 아래에 필수 안내 항목(장소·소요 시간·비용과 결제 방법·준비물·문의처) 체크리스트를 보조 문구로 보여준다(R-53, 별도 필드는 만들지 않음).
- `validateClassInput`으로 필드 오류. `POST /api/admin/classes` → 성공 시 `router.push('/admin/classes/' + id)`. "새 클래스는 비공개로 만들어집니다" 안내(R-57).

수정 모드(`classId` 있음):

- `useQuery({ queryKey: ['admin', 'class', classId], queryFn: GET /api/admin/classes/{id} })`. 로딩·실패(재시도)·`NOT_FOUND` 표시.
- 이름·설명 수정 → `PATCH { title, description }` → 무효화 + 토스트. 실패 시 입력 유지.
- 공개 상태 Tag(공개=success, 비공개=neutral)와 전환 버튼 → `PATCH { isPublished }`. 공개 전환 시 "설명에 필수 안내가 모두 있는지 확인했나요?" 확인 다이얼로그(R-53, R-57). 비공개 전환 시 "고객 목록·검색에서 사라지고 새 예약을 받지 않습니다. 기존 예약은 유지됩니다" 확인(R-52).
- 이미지: 현재 이미지 미리보기(없으면 대체 면), 파일 선택(`accept="image/jpeg,image/png,image/webp"`). 업로드 전 `validateImage`로 형식·4MB 검사(초과 시 서버 호출 없이 오류). `PUT /api/admin/classes/{id}/image`에 `FormData`(`image`)로 전송 → 무효화.
- 삭제: ghost "클래스 삭제" → 확인 다이얼로그 → `DELETE` → 성공 시 `router.push('/admin/classes')`. `CLASS_HAS_SESSIONS` 실패 시 "회차가 있는 클래스는 삭제할 수 없어요. 비공개로 전환해 주세요" 안내(R-51). 회차가 있으면 삭제 버튼 옆에 같은 안내를 미리 보여줘도 된다.
- 레이아웃: 폼(왼쪽) + 보조 영역 360px(sticky: 공개 상태·이미지·삭제) — 900px 이하 1열. 회차 관리 영역은 step 2에서 이 페이지에 추가한다.

페이지:

- `src/app/admin/classes/page.tsx` (`'use client'` 페이지 허용): `useQuery({ queryKey: ['admin', 'classes'] })`로 `GET /api/admin/classes`. 비공개 포함 목록(이름, 공개 Tag, 회차 수, 이미지 썸네일) → 각 행 `/admin/classes/[id]` 링크, primary "새 클래스" → `/admin/classes/new`. 로딩·빈 결과·실패 구분.
- `src/app/admin/classes/new/page.tsx`: `<AdminClassForm />`.
- `src/app/admin/classes/[id]/page.tsx`: `params`에서 id를 받아 `<AdminClassForm classId={id} />`.
- 운영자 레이아웃의 noindex를 그대로 상속한다.

테스트(`apiFetch` 모킹, `next/navigation` 모킹):

- 빈 이름 제출 시 오류·미호출.
- `R-57` 생성 성공 시 상세로 이동, 비공개 안내 문구.
- `R-52` 공개 전환 확인 다이얼로그 → PATCH `{ isPublished: true }`.
- 이미지 형식 오류(`image/gif`)·4MB 초과 시 업로드 미호출, 정상 파일은 FormData로 PUT.
- `R-51` `CLASS_HAS_SESSIONS` 실패 안내.
- 수정 실패 시 입력 유지.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
test -f src/components/admin-class-form.test.tsx
test -f src/app/admin/classes/page.tsx && test -f src/app/admin/classes/new/page.tsx && test -f "src/app/admin/classes/[id]/page.tsx"
grep -q "FormData" src/components/admin-class-form.tsx && grep -q "validateImage" src/components/admin-class-form.tsx
! grep -rnE "@/lib/db|@supabase|storage" src/components/admin-class-form.tsx
git diff --quiet HEAD -- src/components/ui/
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 이미지가 자체 API(`PUT /api/admin/classes/:id/image`)로만 업로드되는가?
   - 클래스 설명 외에 장소·비용 등 별도 필드를 만들지 않았는가(SPEC 1절)?
   - 변경 후 `['admin', ...]` 쿼리가 무효화되는가?
3. 결과에 따라 `phases/6-admin-ui/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 브라우저에서 Supabase Storage로 직접 업로드하지 마라. 이유: ADR-011, AGENTS.md CRITICAL.
- 장소·비용·준비물 등을 별도 입력 필드로 만들지 마라. 이유: SPEC 1절 — 설명은 하나의 문자열이다.
- 클래스 삭제 실패 시 자동으로 비공개 전환하지 마라. 이유: R-51 — 삭제 요청만으로 자동 비공개되지 않는다.
- 회차 관리 UI를 만들지 마라. 이유: step 2의 범위다.
- 기존 테스트를 깨뜨리지 마라
