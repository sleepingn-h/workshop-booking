# Step 0: admin-bookings-ui

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/UI_GUIDE.md` (운영자 헤더 ink, 운영자 예약 표, 다이얼로그, 버튼, 운영자 로그인 중앙 정렬)
- `/docs/ARCHITECTURE.md` (디렉토리 구조의 `admin/layout.tsx`, "상태 관리")
- `/docs/PLAN.md` 4절 예약 처리·문의 대응, 8절 "운영자 로그인", "운영자 예약 목록", R-17·R-19·R-20~R-22·R-32
- `/docs/SPEC.md` 5절 어드민 API(예약 목록 응답, 동작별 엔드포인트)
- `/lib/types.ts` (`AdminBookingList`, `AdminBooking`, `BookingAction`), `/lib/api.ts`, `/lib/format.ts`
- `/components/status-badge.tsx`, `/components/booking-lookup.tsx`·테스트 (`5-customer-ui` step 3 — 다이얼로그·mutation 패턴)
- `/proxy.ts` (`2-admin-auth` step 1), `/app/api/admin/login|logout|bookings/**/route.ts` (`4-api` step 2)

## 작업

각 컴포넌트의 테스트를 **먼저 별도 패치로** 작성한 뒤 구현한다.

### 1. `components/admin-login-form.tsx` (+ test)

```tsx
'use client';
export function AdminLoginForm(): JSX.Element;
```
- 비밀번호 입력(`type="password"`, 라벨) + primary "로그인" 버튼. `useMutation`으로 `POST /api/admin/login`. 성공 → `router.replace('/admin')` + `router.refresh()`. 실패 → 입력 유지, "비밀번호가 올바르지 않습니다" 오류 박스. 제출 중 비활성.
- 테스트: 빈 값 제출 방지, 성공 시 이동, 401 시 오류 표시, 제출 중 비활성.

### 2. `components/admin-header.tsx` (+ test)

```tsx
'use client';
export function AdminHeader(): JSX.Element;
```
- ink 배경 헤더. 로고(`공방 예약 관리`), 내비 `예약`(`/admin`), `클래스`(`/admin/classes`) — 현재 경로 강조(`usePathname`), ink 로그아웃 버튼 → `POST /api/admin/logout` → `router.replace('/admin/login')`.
- `/admin/login`에서는 내비·로그아웃을 숨기고 로고만 보인다.
- 640px 이하에서는 내비를 헤더 아래 줄로 내린다.
- 테스트: 로그인 경로에서 로그아웃 숨김, 다른 경로에서 로그아웃 클릭 시 API 호출과 이동, 현재 내비 `aria-current="page"`.

### 3. `components/admin-booking-list.tsx` (+ test)

```tsx
'use client';
export function AdminBookingList(): JSX.Element;
```
- 필터: 회차 select(응답의 `sessions` 선택지, 라벨 = 클래스 이름 + KST 시작 시각 + 취소된 회차면 `(취소)`), 상태 select(전체·승인 대기·참여 확정·거절됨·취소됨), 검색 입력(이름 또는 전체 전화번호, R-19 — 제출 버튼 또는 Enter로 적용).
- 조회: `useQuery({ queryKey: ['admin', 'bookings', filters], queryFn: apiFetch('/api/admin/bookings?…') })`. 로딩·빈 결과·실패(재시도) 구분 표시. 401이면 `/admin/login`으로 이동.
- 행 정보: 예약자 이름, 전체 전화번호, 클래스·회차(KST), 회차 상태(취소된 회차는 danger Tag), 인원, 예약번호, 예약 상태 배지(텍스트 라벨 포함).
- 동작(R-20):
  - `pending`: primary "승인"(회차 시작 후에는 비활성 + `title`/문구 "시작한 회차는 승인할 수 없어요", R-22), ghost "거절", ghost "취소".
  - `confirmed`: ghost "취소".
  - `rejected`·`cancelled`: 동작 없음.
  - "거절"·"취소"는 확인 다이얼로그(ink 확정 버튼)를 거친다. "승인"은 바로 실행한다.
  - `useMutation`으로 `POST /api/admin/bookings/{id}/{action}` → 성공 시 `['admin']` 접두 쿼리 무효화 + 토스트, 실패 시 서버 메시지 토스트. 해당 행 버튼은 요청 중 비활성.
- 시작 여부 판단은 화면 안내일 뿐이며 서버가 다시 검증한다. 현재 시각은 렌더 시 `new Date()`를 쓴다.
- 레이아웃: 데스크톱은 UI_GUIDE 표 그리드, 900px 이하는 행마다 카드(동작 버튼 가로 꽉 채움). 취소·지난 회차 행은 연한 배경. 360px에서 페이지 가로 스크롤 없음.
- 테스트: `R-19` 검색어가 요청 URL의 `q`에 들어감, 필터 변경 시 쿼리 파라미터, `R-20` 상태별 노출 버튼, `R-22` 시작한 회차의 승인 비활성, 거절 확인 다이얼로그 취소 시 미호출·확정 시 호출, 회차 상태 `취소` 표시, 빈 결과 문구, 실패 시 재시도 버튼.

### 4. 페이지

- `app/admin/layout.tsx`: `metadata.robots = { index: false, follow: false }`, `<AdminHeader />` + 본문 컨테이너.
- `app/admin/login/page.tsx`: 화면 중앙 카드에 `<AdminLoginForm />`.
- `app/admin/page.tsx`: 제목 "예약 관리" + `<AdminBookingList />`.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
for c in admin-login-form admin-header admin-booking-list; do test -f "components/$c.test.tsx" || { echo "missing $c test"; exit 1; }; done
grep -q "index: false" app/admin/layout.tsx
grep -q "invalidateQueries" components/admin-booking-list.tsx
! grep -rnE "@/lib/db|@/lib/auth|@supabase|server-only" components/
! grep -rqE "SUPABASE_SERVICE_ROLE_KEY|ADMIN_PASSWORD|ADMIN_SESSION_SECRET" .next/static
git diff --quiet HEAD -- components/ui/
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 운영자 페이지가 모두 noindex이고 `proxy.ts`로 보호되는가?
   - 상태 변경이 동작별 엔드포인트를 쓰는가?
   - 비밀값이 브라우저 번들(`.next/static`)에 없는가?
   - UI_GUIDE 900px 표 → 카드 전환
3. 결과에 따라 `phases/6-admin-ui/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (쿼리 키 규칙 `['admin', ...]` 포함)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 로그인 상태를 localStorage·쿠키 직접 조작으로 관리하지 마라. 이유: 인증은 httpOnly 쿠키로만 유지한다(ARCHITECTURE "인증 상태").
- 클라이언트 컴포넌트에서 `lib/auth.ts`·`lib/db.ts`를 import하지 마라. 이유: 비밀값이 브라우저 번들에 들어갈 수 있다.
- 실시간 갱신(폴링·웹소켓)을 넣지 마라. 이유: PLAN 8절 — 다시 조회할 때 반영한다.
- 클래스 관리 화면을 만들지 마라. 이유: step 1, 2의 범위다.
- 기존 테스트를 깨뜨리지 마라
