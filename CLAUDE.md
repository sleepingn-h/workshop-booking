# 프로젝트: 공방 클래스 예약 서비스 (workshop-booking)

고객이 공방 클래스 회차를 회원가입 없이 예약 신청하고, 운영자가 승인·거절·취소하는 포트폴리오용 하루 MVP.

- 기획·정책·규칙 ID(`R-xx`)의 기준: `docs/PLAN.md`
- 도메인 모델·페이지·REST API·에러 코드·검증 기준: `docs/SPEC.md`
- 정책을 바꿀 때는 PLAN.md → SPEC.md 순서로 수정한 뒤 구현한다. 두 문서와 다르게 구현하지 않는다.
- PLAN.md의 P0만 구현 대상이다. P1·후속 기능(클래스·회차 관리, 이미지 업로드, 예약자 검색)은 요청 없이 추가하지 않는다.

## 기술 스택
- Next.js (App Router)
- TypeScript strict mode
- Tailwind CSS + shadcn/ui
- Supabase (Postgres) — 배포 저장소. 개발·자동 테스트는 InMemoryRepository

## 아키텍처 규칙
- CRITICAL: 브라우저(클라이언트 컴포넌트)는 자체 REST API(`app/api/` Route Handlers)만 호출한다. Supabase를 직접 호출하지 않는다.
- CRITICAL: 서버 컴포넌트는 자기 REST API를 HTTP로 다시 부르지 않고 Route Handler와 같은 Service 함수를 직접 호출한다.
- CRITICAL: 예약 규칙은 Service에서 적용하고, 저장 시점의 상태 확인과 원자적 처리는 Repository가 담당한다. 조회한 값만으로 변경을 확정하지 않는다.
- CRITICAL: 예약 생성·상태 변경은 SupabaseRepository에서 Postgres 함수 한 트랜잭션 안에서 처리한다(회차 행 `FOR UPDATE`, R-15). InMemoryRepository도 같은 규칙 판정을 따른다.
- CRITICAL: 현재 시각은 주입한 Clock에서만 읽는다. Postgres 함수는 `now()` 대신 인자 `p_now`를 받는다.
- CRITICAL: `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`는 서버 코드에서만 사용하고 브라우저 번들·로그·README에 노출하지 않는다.
- 저장소 구현은 환경 변수 `REPOSITORY`(`memory` | `supabase`)로 선택한다.
- 예약 상태 변경은 `PATCH { status }`가 아닌 동작별 엔드포인트(confirm·reject·cancel)로 나눈다.
- 시각은 `timestamptz`로 저장하고 화면에는 항상 `Asia/Seoul`로 표시한다.
- 에러 응답은 `{ error: { code, message } }` 형식과 SPEC.md의 에러 코드를 사용한다.
- 고객 화면과 운영자 화면 모두 모바일(360px)~데스크톱(1280px)에서 가로 스크롤 없이 동작해야 한다.

## 개발 프로세스
- CRITICAL: 새 기능 구현 시 반드시 테스트를 먼저 작성하고, 테스트가 통과하는 구현을 작성할 것 (TDD)
- 테스트 이름에 검증하는 규칙 ID(`R-xx`)를 포함한다. 시간 경계는 고정 Clock으로 검증한다.
- 커밋 메시지는 conventional commits 형식을 따를 것 (feat:, fix:, docs:, refactor:)

## 명령어
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드
npm run lint     # ESLint
npm run test     # 테스트
