# Step 3: booking-lookup

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/UI_GUIDE.md` (입력 필드, 정의 목록, 다이얼로그, 버튼 ghost·ink, 안내·오류 박스, 좁은 폼 최대 640px)
- `/docs/ARCHITECTURE.md` ("상태 관리 – 클라이언트")
- `/docs/PLAN.md` 3절 5~6, 8절 "예약 조회·취소", R-30~R-33
- `/lib/types.ts` (`BookingLookupResult`), `/lib/rules.ts` (`validateLookupInput`), `/lib/api.ts`, `/lib/format.ts`
- `/components/status-badge.tsx`, `/components/booking-form.tsx` (step 1 — 테스트 작성 패턴)
- `/app/(site)/layout.tsx`, `/app/(site)/bookings/complete/page.tsx` (step 2)
- `/app/api/bookings/lookup/route.ts`, `/app/api/bookings/[code]/cancel/route.ts` (`4-api` step 1)

## 작업

`components/booking-lookup.test.tsx`를 **먼저 별도 패치로** 작성한 뒤 구현한다.

```tsx
'use client';
export function BookingLookup({ initialCode }: { initialCode?: string }): JSX.Element;
```

동작:

- 입력: 예약번호(`initialCode`로 미리 채움), 전화번호 뒷자리 4자리(`inputMode="numeric"`, `maxLength=4`). 제출 전 `validateLookupInput`으로 필드 오류 표시.
- 조회: 제출 시 `{ code, phoneLast4 }`를 상태로 저장하고 `useQuery({ queryKey: ['booking', code, phoneLast4], queryFn: () => apiFetch('/api/bookings/lookup', { method: 'POST', json }) , enabled })`로 조회한다. 전화번호 뒷자리는 URL·저장소에 남기지 않는다.
- 결과 상태별 표시:
  - 로딩, `BOOKING_NOT_FOUND`("예약번호 또는 전화번호 뒷자리를 다시 확인해 주세요" — 어느 값이 틀렸는지 구분하지 않음, R-30), 기타 실패(재시도 버튼).
  - 성공: 상태 배지, 클래스 이름, 회차 시작(KST), 회차 상태(취소된 회차면 표시), 인원, 클래스 설명(문의처 포함, `whitespace-pre-line`), 취소 가능 여부와 기한(KST).
  - `pending`: "승인 대기는 참여 확정이 아닙니다" 안내(R-33). 회차가 이미 시작했는데 `pending`이면 "참여 미확정 — 공방에 문의해 주세요" 안내.
  - `canCancel === false`이고 상태가 `pending`·`confirmed`이면 직접 취소 불가 사유(기한 경과)와 공방 문의 안내(R-31, R-32).
  - "다시 조회" 버튼(`refetch`)으로 최신 상태 확인(PLAN 8절).
- 취소: `canCancel`일 때만 ghost "예약 취소" 버튼 → 확인 다이얼로그(ink "예약 취소" / ghost "돌아가기") → `useMutation`으로 `POST /api/bookings/{code}/cancel { phoneLast4 }` → 성공 시 `['booking', code, phoneLast4]` 쿼리 무효화 + 토스트. 실패 시 서버 메시지 표시(`CANCEL_DEADLINE_PASSED` 등). 제출 중 비활성.
- 키보드만으로 입력·제출·다이얼로그 확인이 가능해야 한다.

`app/(site)/bookings/lookup/page.tsx`:

- 서버 컴포넌트. `searchParams`의 `code`를 `initialCode`로 넘긴다. DB를 조회하지 않는다.
- `metadata.robots = { index: false, follow: false }`.
- 좁은 폼 레이아웃(최대 640px).

테스트(`apiFetch` 모킹, `QueryClientProvider`로 감싸 렌더):

- `R-30` 형식 오류(뒷자리 3자리)면 미호출, `BOOKING_NOT_FOUND`면 구분 없는 안내.
- 상태 텍스트 라벨 표시(`승인 대기` 등).
- `R-33` pending이면 참여 확정 아님 안내.
- `R-31` `canCancel: false`인 확정 예약은 취소 버튼 없음 + 문의 안내.
- `R-31` 취소 확인 다이얼로그에서 "돌아가기"는 미호출, 확정하면 cancel API 호출 후 재조회.
- 취소 요청 중 버튼 비활성.
- `initialCode`가 입력에 채워짐.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
test -f components/booking-lookup.test.tsx && test -f "app/(site)/bookings/lookup/page.tsx"
grep -q "index: false" "app/(site)/bookings/lookup/page.tsx"
grep -q "invalidateQueries" components/booking-lookup.tsx
! grep -nE "localStorage|sessionStorage|router\.(push|replace)\([^)]*phoneLast4" components/booking-lookup.tsx
git diff --quiet HEAD -- components/ui/
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 조회는 `useQuery`, 취소는 `useMutation` + 무효화인가?
   - 전화번호 뒷자리가 URL·브라우저 저장소에 남지 않는가?
   - 조회 페이지가 noindex인가?
3. 결과에 따라 `phases/5-customer-ui/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 전화번호 뒷자리를 쿼리스트링·localStorage에 저장하지 마라. 이유: SPEC 5절 — 인증 정보가 URL에 남지 않게 한다.
- 예약 수정(회차·인원 변경) UI를 만들지 마라. 이유: R-18.
- 취소 버튼을 확인 절차 없이 바로 실행하지 마라. 이유: PLAN 8절 — 취소 전 확인 절차.
- 빨간 버튼을 만들지 마라. 이유: UI_GUIDE — 파괴적 동작은 ghost로 열고 ink로 확정한다.
- 기존 테스트를 깨뜨리지 마라
