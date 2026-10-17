# Step 1: ui-foundation

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/UI_GUIDE.md` (전체 — 이 step의 기준)
- `/docs/ARCHITECTURE.md`
- `/app/layout.tsx`, `/app/globals.css`, `/components.json`, `/components/ui/*` (step 0 산출물)

## 작업

공통 시각 기반(토큰·폰트·루트 레이아웃)과 여러 화면이 함께 쓰는 Provider·포맷 함수를 만든다. 예약 상태 배지(`src/components/status-badge.tsx`)는 `src/lib/types.ts`가 필요하므로 `5-customer-ui` step 0에서 만든다. 페이지 화면은 만들지 않는다. `.ts`/`.tsx` 구현 파일은 같은 폴더의 테스트 파일을 **먼저 별도 패치로** 만든 뒤 작성한다.

### 1. `src/app/globals.css`

- UI_GUIDE의 색상·배경·텍스트·테두리·시맨틱 색·반경·그림자 토큰을 `:root`의 CSS 변수로 정의한다. 주석 처리된 보조 단계 색(blurple-50 등)도 변수로 정의해 컴포넌트에서 hex를 직접 쓰지 않게 한다. `#efeff1`(보조 면), `#e7e7ea`(눌린 면)도 변수(`--surface-raised`, `--surface-sunk`)로 둔다.
- 예약 상태 배지 4종의 배경/글자 색을 변수로 둔다(`--badge-pending-bg` 등, 값은 UI_GUIDE "예약 상태 배지" 표 그대로).
- shadcn 테마 변수(`--primary`, `--background`, `--ring`, `--radius` 등)를 위 토큰에 연결한다. 다크 모드는 다루지 않는다.
- `:focus-visible` 외곽선(`--focus-ring` 2px, offset 2px), `word-break: keep-all`, 제목 `text-wrap: balance`, `prefers-reduced-motion: reduce`일 때 전환·애니메이션 끄기를 전역으로 둔다.

### 2. `src/app/layout.tsx`

- `<html lang="ko">`.
- `next/font/google`로 `Hanken_Grotesk`(display), `Plus_Jakarta_Sans`(body), `Noto_Sans_KR`(한글 대체)을 불러와 CSS 변수로 노출하고 font-family 체인을 구성한다.
- `metadata`: 기본 title·description(서비스 소개 한 줄), `metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000')`.
- `<QueryProvider>`로 children을 감싸고 shadcn `sonner`의 `<Toaster />`(하단 중앙)를 둔다.
- 헤더는 두지 않는다(고객 헤더는 `5-customer-ui` step 2의 `src/app/(site)/layout.tsx`, 운영자 헤더는 `6-admin-ui` step 0).

### 3. `src/components/query-provider.tsx` (+ `query-provider.test.tsx`)

```tsx
'use client';
export function QueryProvider({ children }: { children: React.ReactNode }): JSX.Element;
```
- 컴포넌트 수명 동안 `QueryClient` 하나를 유지한다(`useState`). 기본 옵션: `retry: 1`, `refetchOnWindowFocus: false`.
- 테스트: 자식 렌더링, 자식에서 `useQueryClient()` 사용 가능.

### 4. `src/lib/format.ts` (+ `format.test.ts`)

```ts
export function formatKstDateTime(value: string | Date): string; // 예: "10월 18일 (토) 오후 2:00" — 형식은 재량, 반드시 Asia/Seoul
export function formatKstDate(value: string | Date): string;
export function formatKstTime(value: string | Date): string;
export function isoToKstInput(iso: string): string;              // <input type="datetime-local"> 값 'YYYY-MM-DDTHH:mm' (KST)
export function kstInputToIso(value: string): string;            // 'YYYY-MM-DDTHH:mm' → 'YYYY-MM-DDTHH:mm:00+09:00'
```
- `Intl.DateTimeFormat`의 `timeZone: 'Asia/Seoul'`을 쓴다. 서버·브라우저 시간대와 무관해야 한다.
- 테스트: UTC 15:00 → 다음 날 KST 00:00처럼 날짜가 넘어가는 경우, `kstInputToIso`/`isoToKstInput` 왕복, 잘못된 입력값 처리(`kstInputToIso`는 형식이 틀리면 빈 문자열 반환).
- 테스트는 `process.env.TZ`에 의존하지 않도록 UTC 기준 ISO 입력으로 작성한다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
grep -q -- '--color-primary' src/app/globals.css && grep -q -- '--badge-pending-bg' src/app/globals.css
grep -q 'lang="ko"' src/app/layout.tsx && grep -q 'QueryProvider' src/app/layout.tsx
git diff --quiet HEAD -- src/components/ui/
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - UI_GUIDE의 "AI 슬롭 안티패턴"(blur, 그라데이션, 글로우 등)을 쓰지 않았는가?
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/0-foundation/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (정의한 주요 CSS 변수 이름 규칙, export 함수명 포함)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- `src/components/ui/` 파일을 직접 수정하지 마라. 이유: shadcn 컴포넌트는 CLI로만 관리한다. 스타일은 테마 변수와 래퍼 className으로 맞춘다.
- 컴포넌트에 hex 색상을 직접 쓰지 마라. 이유: UI_GUIDE는 모든 값을 `:root` 변수로 참조하도록 정했다.
- `backdrop-filter`, 그라데이션, 글로우 그림자, UI_GUIDE 4색 외 강조색을 쓰지 마라. 이유: UI_GUIDE 안티패턴이다.
- 페이지·헤더·도메인 화면을 만들지 마라. 이유: `5-customer-ui` step 2, 3, `6-admin-ui` step 0~2의 범위다.
- `src/components/status-badge.tsx`와 `src/lib/types.ts`를 만들지 마라. 이유: 각각 `5-customer-ui` step 0, `1-domain-rules` step 0의 범위다.
- 날짜 라이브러리(date-fns, dayjs 등)를 추가하지 마라. 이유: `Intl`로 충분하며 의존성을 늘리지 않는다.
- 기존 테스트를 깨뜨리지 마라
