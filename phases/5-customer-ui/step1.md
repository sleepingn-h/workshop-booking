# Step 1: booking-form

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/UI_GUIDE.md` (회차 선택 라디오 카드, 입력 필드, 버튼 green·lg, 오류·안내 박스, 레이아웃의 "클래스 상세" 하단 고정 바)
- `/docs/ARCHITECTURE.md` ("상태 관리", "신청 실패 – 남은 자리 재조회")
- `/docs/PLAN.md` 3절 3~4, 8절 "공통 화면 동작"
- `/lib/types.ts`, `/lib/rules.ts` (`PublicSession`, `validateBookingInput`, `MAX_HEADCOUNT`)
- `/lib/api.ts` (`4-api` step 0), `/lib/format.ts`, `/app/globals.css`, `/components/ui/*` (`0-foundation` step 1)
- `/app/api/bookings/route.ts` (`4-api` step 1 — 응답 형태 201 `{ code, status }`, 에러 `{ error: { code, message, fields? } }`)

## 작업

`src/components/booking-form.test.tsx`를 **먼저 별도 패치로** 작성한 뒤 `src/components/booking-form.tsx`를 구현한다. 페이지는 만들지 않는다(step 2).

```tsx
'use client';
export function BookingForm({ classId, sessions }: { classId: string; sessions: PublicSession[] }): JSX.Element;
```

동작:

- 회차 선택: `role="radiogroup"` 안의 라디오 카드. 각 카드에 KST 날짜·시간, 남은 자리(`N자리 남음`, 2자리 이하 강조색, 0이면 `마감`)를 표시한다. `remaining === 0`인 회차는 선택할 수 없다(R-54). `sessions`가 비어 있으면 "현재 예약 가능한 회차가 없습니다" 안내만 보이고 폼 입력은 숨긴다.
- 인원: 1~4 선택(`select` 또는 스테퍼). 선택한 회차의 남은 자리보다 많으면 제출 전에 필드 오류로 안내한다.
- 이름·전화번호 입력: 라벨 연결(`<Label htmlFor>`), `inputMode="tel"`, `autoComplete`.
- 제출 전 클라이언트 검증은 `validateBookingInput`을 그대로 써서 `fieldErrors`를 각 필드 아래에 표시한다(서버와 같은 기준).
- 신청 전 안내 박스: 수동 승인 방식(신청 = 승인 대기, 참여 확정 아님), 상태별 취소 기한(승인 대기는 시작 전까지, 참여 확정은 시작 24시간 전까지).
- 제출: `useMutation`으로 `apiFetch<CreateBookingResult>('/api/bookings', { method: 'POST', json })`. 제출 중 버튼 비활성 + "신청 중…" 표시.
- 성공: `router.push('/bookings/complete?code=' + encodeURIComponent(code))`.
- 실패: 입력값을 그대로 유지하고 서버 `message`를 오류 박스에 표시한다. 응답에 `fields`가 있으면 필드 옆에 표시한다.
  - `SESSION_FULL`이면 `router.refresh()`를 호출하고 "남은 자리가 바뀌었습니다. 회차와 인원을 다시 확인해 주세요." 안내(ARCHITECTURE "신청 실패" 흐름).
  - `SESSION_STARTED`·`SESSION_CANCELLED`·`NOT_FOUND`도 `router.refresh()`로 상세를 갱신한다.
- `sessions` prop이 바뀌어(refresh 후) 선택한 회차가 사라지거나 마감되면 선택을 해제하고 다시 고르도록 안내한다. 이름·전화번호·인원은 유지한다.
- 레이아웃: 데스크톱은 카드 안 폼, 900px 이하에서는 신청 버튼을 화면 하단 고정 바로 옮긴다(UI_GUIDE). 360px에서 가로 스크롤이 생기지 않는다. 버튼은 green variant, lg(56px).
- `useRouter`는 `next/navigation`에서 가져온다.

테스트(`next/navigation`의 `useRouter`를 `vi.mock`, `@/lib/api`의 `apiFetch` 모킹, `QueryClientProvider`로 감싸 렌더):

- `R-12`/입력 검증: 빈 이름·짧은 전화번호 제출 시 필드 오류 표시, `apiFetch` 미호출.
- `R-54` 마감 회차는 선택 불가(`disabled`/`aria-disabled`), 회차가 없으면 안내 문구.
- `R-11` 남은 자리보다 많은 인원 선택 시 오류, 미호출.
- 제출 중 버튼 비활성.
- 성공 시 `router.push('/bookings/complete?code=BK-…')`.
- `R-11` `SESSION_FULL` 실패 시 `router.refresh()` 호출, 입력값 유지, 안내 문구 표시.
- `R-16` `DUPLICATE_BOOKING` 실패 시 서버 메시지 표시, 입력 유지, refresh 미호출.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
test -f src/components/booking-form.test.tsx
grep -q "router.refresh" src/components/booking-form.tsx && grep -q "useMutation" src/components/booking-form.tsx
! grep -nE "@/lib/db|@supabase|server-only" src/components/booking-form.tsx
! grep -nE "#[0-9a-fA-F]{3,8}\b" src/components/booking-form.tsx
git diff --quiet HEAD -- src/components/ui/
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 회차·남은 자리를 TanStack Query로 다시 가져오지 않고 `router.refresh()`로 갱신하는가?
   - 브라우저가 자체 REST API만 호출하는가?
   - UI_GUIDE 토큰·컴포넌트 규칙(44px 터치 높이, 라벨 텍스트 상태 표시)을 따르는가?
3. 결과에 따라 `phases/5-customer-ui/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 회차·남은 자리를 `useQuery`나 별도 API로 다시 불러오지 마라. 이유: AGENTS.md — 신청 폼은 서버 상세에서 받아 `router.refresh()`로 갱신한다(클래스 조회 API는 없다).
- 실패 시 입력값을 초기화하지 마라. 이유: PLAN 8절 — 실패하면 입력을 유지한다.
- react-hook-form 등 폼 라이브러리를 추가하지 마라. 이유: 입력 4개에 의존성을 늘리지 않는다.
- `src/components/ui/`를 직접 수정하지 마라. 이유: shadcn은 CLI로만 관리한다.
- 페이지 파일을 만들지 마라. 이유: step 2의 범위다.
- 기존 테스트를 깨뜨리지 마라
