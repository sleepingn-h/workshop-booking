# Step 2: customer-pages

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/UI_GUIDE.md` (카드, 클래스 목록 카드, 레이아웃·헤더, 진행 단계, 예약번호, 이미지 없는 클래스)
- `/docs/ARCHITECTURE.md` (디렉토리 구조의 `app/(site)/`, "Server Components 기본")
- `/docs/PLAN.md` 8절 필수 화면(클래스 목록·상세·신청 완료), R-53~R-56
- `/docs/SPEC.md` 4절 페이지와 렌더링
- `/lib/db.ts` (`listPublishedClasses`, `getPublishedClass`), `/lib/types.ts`, `/lib/format.ts`
- `/components/booking-form.tsx` (step 1), `/components/status-badge.tsx` (step 0)
- `/app/layout.tsx`, `/app/page.tsx`(`0-foundation` step 0의 임시 페이지), `/next.config.ts`
- Next.js 16의 `connection()`(`next/server`), `generateMetadata`, `params`/`searchParams`가 Promise인 점을 `node_modules/next`의 문서·타입으로 확인하라.

## 작업

### 1. 고객 route group

- `app/page.tsx`를 `app/(site)/page.tsx`로 옮긴다(`git mv`). URL은 `/` 그대로다.
- `app/(site)/layout.tsx`: 고객 헤더(상단 고정, 흰 배경 + 아래 구분선, 높이 68px/모바일 60px). 로고 `공방 클래스 예약`(→ `/`), 내비 `클래스`(→ `/`), `예약 조회`(→ `/bookings/lookup`). 본문 컨테이너(최대 1200px, 좌우 32px/640px 이하 16px).

### 2. `app/(site)/page.tsx` — 클래스 목록

- `await connection()` 후 `listPublishedClasses()`.
- 3열 카드(900px 이하 1열): 이미지 4:3, 이름, 설명 첫 줄 요약, 하단 "다음 회차" 행(KST, 없으면 "예약 가능한 회차 없음"). 카드 전체가 `/classes/[id]` 링크.
- 이미지가 없으면 UI_GUIDE의 연한 단색 면 + Lucide 아이콘(`aria-hidden`).
- 공개 클래스가 없으면 빈 상태 문구.
- `metadata`: 서비스 소개 title·description(검색 노출 대상, noindex 금지).

### 3. `app/(site)/classes/[id]/page.tsx` — 상세·신청

- `await connection()` 후 `getPublishedClass(id)`. `null`이면 `notFound()`(비공개 클래스 404, R-52).
- `generateMetadata`: 같은 함수로 조회해 title = 클래스 이름, description = 설명을 공백 정리 후 120자 요약, `openGraph`(title, description, images: 대표 이미지의 절대 URL — `metadataBase` 기준), 비공개·없음이면 `robots: { index: false }`와 기본 제목(R-55, R-56). 신청 폼이 있어도 공개 상세에는 noindex를 적용하지 않는다.
- 본문: 대표 이미지(`next/image`), 이름, 설명(`whitespace-pre-line`으로 줄바꿈 유지 — 장소·소요 시간·비용·준비물·문의처가 설명에 들어 있다, R-53).
- 오른쪽 신청 카드(420px, sticky top 92px, 900px 이하 1열): `<BookingForm classId sessions />`.
- 동적 렌더링을 보장하기 위해 `connection()` 외에 캐시 설정을 추가하지 않는다.

### 4. `app/(site)/bookings/complete/page.tsx` — 신청 완료

- `searchParams`의 `code`만 사용하고 **서버를 조회하지 않는다**. `code`가 없으면 조회 화면으로 가는 안내만 표시.
- 체크 원(72px), "신청이 접수되었습니다", 진행 단계 3칸(신청 완료 ✓ / 승인 대기(현재) / 참여 확정), 예약번호(44px·모바일 34px, tabular-nums), 복사 버튼, "승인 결과는 자동으로 알려드리지 않습니다. 예약 조회에서 직접 확인해 주세요" 안내, `/bookings/lookup?code=<code>` 링크 버튼.
- 상태·회차·인원 등 상세 정보는 표시하지 않는다(R-30, SPEC 4절).
- `metadata.robots = { index: false, follow: false }`.

### 5. `components/copy-button.tsx` (+ `copy-button.test.tsx`, 테스트 먼저)

```tsx
'use client';
export function CopyButton({ text, label }: { text: string; label?: string }): JSX.Element;
```
- `navigator.clipboard.writeText(text)` 성공 시 sonner 토스트 "예약번호를 복사했어요", 실패 시 "복사하지 못했어요. 직접 선택해 복사해 주세요".
- 테스트: 클릭 시 writeText 호출 인자, 실패 시 오류 토스트(sonner `toast` 모킹).

### 6. 이미지 설정

- `next.config.ts`의 `images.remotePatterns`에 Supabase Storage 공개 경로(`https://*.supabase.co/storage/v1/object/public/class-images/**`)를 추가한다. 로컬 `/samples/*`는 별도 설정이 필요 없다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
test -f "app/(site)/page.tsx" && test ! -f app/page.tsx && test -f "app/(site)/layout.tsx"
grep -q "connection()" "app/(site)/page.tsx" && grep -q "connection()" "app/(site)/classes/[id]/page.tsx"
grep -q "notFound" "app/(site)/classes/[id]/page.tsx" && grep -q "openGraph" "app/(site)/classes/[id]/page.tsx"
grep -q "index: false" "app/(site)/bookings/complete/page.tsx"
! grep -n "@/lib/db" "app/(site)/bookings/complete/page.tsx"
! grep -rn "fetch(" "app/(site)"
npm run build 2>&1 | tee /tmp/wb-build.log >/dev/null; grep -E "^[├└┌].*/classes/\[id\]" /tmp/wb-build.log | grep -q "ƒ"
```

## 검증 절차

1. 위 AC 커맨드를 실행한다. 마지막 줄은 빌드 출력에서 `/classes/[id]`가 동적(ƒ)으로 표시되는지 확인한다. 빌드 출력 형식이 다르면 `/`와 `/classes/[id]`가 정적(○)이 아님을 직접 확인한다.
2. 아키텍처 체크리스트를 확인한다:
   - 서버 컴포넌트가 자기 REST API를 HTTP로 부르지 않고 `lib/db.ts`를 직접 호출하는가?
   - 목록·상세가 `await connection()`으로 요청마다 렌더링되는가?
   - 완료 화면만 noindex이고 목록·공개 상세는 색인 대상인가?
   - UI_GUIDE 레이아웃 기준점(900px, 640px)과 360px 가로 스크롤 없음
3. 결과에 따라 `phases/5-customer-ui/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 서버 컴포넌트에서 `fetch('/api/...')`로 자기 API를 부르지 마라. 이유: AGENTS.md CRITICAL.
- `GET /api/classes`를 만들지 마라. 이유: AGENTS.md CRITICAL.
- `export const revalidate`·`unstable_cache`·`'use cache'`로 목록·상세를 캐시하지 마라. 이유: 빌드 시점·캐시된 남은 자리를 보여주면 안 된다.
- 신청 완료 화면에서 예약 상태·상세를 조회하지 마라. 이유: R-30 — 상태는 조회 화면에서 전화번호 확인 후에만 보인다.
- 공개 클래스 상세에 noindex를 붙이지 마라. 이유: R-55, R-56.
- `public/samples/`에 이미지를 만들지 마라. 이유: 사용자가 직접 넣는다. 파일이 없을 때 깨진 이미지 대신 대체 면이 보이도록 처리할 필요는 없다.
- 예약 조회 페이지를 만들지 마라. 이유: step 3의 범위다.
- 기존 테스트를 깨뜨리지 마라
