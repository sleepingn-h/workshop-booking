# Step 0: status-badge

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/UI_GUIDE.md` ("예약 상태 배지" 표, 배지·태그 규칙)
- `/app/globals.css` (`0-foundation` step 1 산출물 — `--badge-*` 등 색상 변수)
- `/lib/types.ts` (`1-domain-rules` step 0 산출물 — `BookingStatus`, `BOOKING_STATUS_LABEL`)
- `/components/query-provider.tsx`, `/components/query-provider.test.tsx` (`0-foundation` step 1 — 컴포넌트 테스트 작성 패턴)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

여러 화면(예약 조회, 운영자 예약 목록, 클래스·회차 관리)이 함께 쓰는 상태 배지 컴포넌트를 만든다. `components/status-badge.test.tsx`를 **먼저 별도 패치로** 작성한 뒤 `components/status-badge.tsx`를 구현한다.

### `components/status-badge.tsx` (+ `status-badge.test.tsx`)

```tsx
export function BookingStatusBadge({ status }: { status: BookingStatus }): JSX.Element; // 라벨은 BOOKING_STATUS_LABEL
export function Tag({ tone, children }: { tone: 'success' | 'neutral' | 'danger'; children: React.ReactNode }): JSX.Element;
```
- 배지 색은 globals.css 변수로만 지정한다. 상태는 항상 텍스트 라벨과 함께 보인다(색만으로 구분 금지).
- `Tag`는 클래스·회차 배지용(12px, padding 2px 8px). 공개=success, 비공개·지난 회차=neutral, 취소된 회차=danger.
- 테스트: 4개 상태의 한국어 라벨(`승인 대기`, `참여 확정`, `거절됨`, `취소됨`) 표시, Tag 텍스트 표시.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
test -f components/status-badge.test.tsx
! grep -nE '#[0-9a-fA-F]{3,8}\b' components/status-badge.tsx
git diff --quiet HEAD -- components/ui/
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - UI_GUIDE의 "AI 슬롭 안티패턴"(blur, 그라데이션, 글로우 등)을 쓰지 않았는가?
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/5-customer-ui/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (export 컴포넌트명, 사용한 CSS 변수 포함)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 컴포넌트에 hex 색상을 직접 쓰지 마라. 이유: UI_GUIDE는 모든 값을 `:root` 변수로 참조하도록 정했다. 필요한 변수가 없으면 `app/globals.css`에 추가한다.
- 상태 라벨 문자열을 컴포넌트에 다시 하드코딩하지 마라. 이유: `lib/types.ts`의 `BOOKING_STATUS_LABEL`이 단일 기준이다.
- `components/ui/` 파일을 직접 수정하지 마라. 이유: shadcn 컴포넌트는 CLI로만 관리한다.
- 페이지·헤더·도메인 화면을 만들지 마라. 이유: step 2, 3, `6-admin-ui` step 0~2의 범위다.
- 기존 테스트를 깨뜨리지 마라
