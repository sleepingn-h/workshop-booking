# 프로젝트: 공방 클래스 예약 서비스 (workshop-booking)

고객이 공방 클래스 회차를 회원가입 없이 예약 신청하고, 운영자가 승인·거절·취소하고 클래스·회차를 관리하는 포트폴리오용 MVP.

- 기획·정책·규칙 ID(`R-xx`)의 기준: `docs/PLAN.md`
- 도메인 모델·페이지·REST API·에러 코드·검증 기준: `docs/SPEC.md`
- PLAN.md·SPEC.md는 로컬 전용 문서다(`.gitignore`). 공개 문서(PRD·ARCHITECTURE·ADR·UI_GUIDE·README)는 두 파일을 링크하지 않고, 두 파일 없이도 읽히게 작성한다. 공개 문서에 상세 설명이 필요하면 ARCHITECTURE.md에 한 번만 쓰고 다른 공개 문서는 요약한다.
- 정책을 바꿀 때는 PLAN.md → SPEC.md 순서로 수정한 뒤 구현한다. 두 문서와 다르게 구현하지 않는다.
- PLAN.md의 P0만 구현 대상이다. P1(DB 연동·동시 처리 자동 검증)은 요청 없이 추가하지 않는다.

## 기술 스택
- Next.js 16 (App Router)
- TypeScript strict mode
- Tailwind CSS + shadcn/ui
- TanStack Query — 클라이언트 컴포넌트의 서버 상태
- Supabase (Postgres·Storage) — 저장소와 클래스 이미지. 테이블·예약/관리 함수·이미지 버킷·샘플 데이터는 `supabase/schema.sql` 하나
- Vitest + React Testing Library(jsdom) — 자동 테스트

## 아키텍처 규칙
- 소스는 `src/` 아래 `src/app/`, `src/components/`, `src/lib/`, `src/proxy.ts`에 둔다. import alias `@/*`는 `./src/*`를 가리킨다. `supabase/`, `scripts/`, `docs/`, `phases/`와 설정 파일(`package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.mts` 등)은 저장소 루트에 둔다.
- CRITICAL: 브라우저(클라이언트 컴포넌트)는 자체 REST API(`src/app/api/` Route Handlers)만 호출한다. Supabase를 직접 호출하지 않는다.
- CRITICAL: 서버 컴포넌트는 자기 REST API를 HTTP로 다시 부르지 않고 Route Handler와 같은 `src/lib/db.ts` 함수를 직접 호출한다. 클래스 목록·상세 조회 API(`GET /api/classes`)는 만들지 않는다.
- CRITICAL: 예약 규칙(자리·전이·기한·입력 검증)은 `src/lib/rules.ts`의 순수 함수로 작성한다. DB·네트워크·현재 시각에 의존하지 않는다.
- CRITICAL: 요청 처리 순서(조회 → 규칙 확인 → 저장)는 `src/lib/db.ts` 함수에 둔다. Service·Repository 계층이나 메모리 저장소를 만들지 않는다. 조회한 값만으로 변경을 확정하지 않는다.
- CRITICAL: 예약 생성·상태 변경과 회차 정원 변경·취소·삭제, 클래스 삭제·공개 전환은 `supabase/schema.sql`의 Postgres 함수 한 트랜잭션 안에서 처리한다(행 잠금, R-15).
- CRITICAL: 요청 시각은 `src/lib/db.ts` 함수 진입 시 DB 조회 전에 한 번 읽어 규칙 함수(`now`)와 Postgres 함수(`p_now`)에 같은 값을 넘긴다. Postgres 함수는 `now()`를 쓰지 않는다.
- CRITICAL: `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`는 서버 코드에서만 사용하고 브라우저 번들·로그·README에 노출하지 않는다.
- 클래스 목록·상세 페이지는 `await connection()`으로 동적 렌더링해 빌드 시 사전 렌더링·캐시된 남은 자리를 보여주지 않는다.
- 이미지 업로드는 운영자 Route Handler가 받아 서버에서 Supabase Storage에 저장한다. 브라우저가 Storage에 직접 올리지 않는다.
- 운영자 페이지(`/admin` 이하) 보호는 `src/proxy.ts`(Node.js 런타임)에서 한다. `middleware.ts`를 만들지 않는다.
- 예약 상태 변경은 `PATCH { status }`가 아닌 동작별 엔드포인트(confirm·reject·cancel)로 나눈다.
- 신청 폼의 회차·남은 자리는 서버 상세에서 받아 `router.refresh()`로 갱신한다. TanStack Query 무효화는 예약 조회·운영자 화면에만 적용한다.
- 신청 완료·예약 조회·운영자 페이지에 `noindex`를 적용한다. 신청 폼을 포함한 공개 클래스 상세는 검색 노출 대상이다.
- 시각은 `timestamptz`로 저장하고 화면에는 항상 `Asia/Seoul`로 표시한다.
- 에러 응답은 `{ error: { code, message } }` 형식과 SPEC.md의 에러 코드를 사용한다.
- 고객 화면과 운영자 화면 모두 모바일(360px)~데스크톱(1280px)에서 가로 스크롤 없이 동작해야 한다.

## 개발 프로세스
- CRITICAL: 새 기능 구현 시 반드시 테스트를 먼저 작성하고, 테스트가 통과하는 구현을 작성할 것 (TDD)
- CRITICAL: `scripts/hooks/tdd-guard.sh`(`.codex/hooks.json`의 PreToolUse, `apply_patch`)는 패치가 추가·수정하는 파일 중 같은 폴더에 `<이름>.test.ts(x)`가 없는 `.ts`·`.tsx` 편집을 차단한다. 구현 파일보다 테스트 파일을 먼저 만든다. 예외: `page`·`layout`·`loading`·`error`·`not-found`, `types.ts`, 설정·스타일·문서 파일. 가드를 우회하려고 빈 테스트 파일이나 공용 `__tests__` 파일을 만들지 않는다.
- `.codex/hooks.json`은 `scripts/hooks/danger-guard.sh`(PreToolUse, `Bash`)로 `rm -rf`·`git push --force`·`git reset --hard`·`DROP TABLE`을 차단하고, `scripts/hooks/verify-on-stop.sh`(Stop)로 턴 종료 전 `lint → build → test`를 실행해 실패하면 이어서 고치게 한다.
- shadcn/ui 컴포넌트(`src/components/ui/`)는 CLI로만 추가하고 직접 수정하지 않는다.
- 테스트별 대상과 범위는 SPEC.md 6절을 따른다. Supabase SQL 함수(잠금·동시 신청)는 자동 테스트하지 않고 배포 환경 시연으로 확인한다.
- 테스트 이름에 검증하는 규칙 ID(`R-xx`)를 포함한다. 시간 경계는 고정한 `now`를 넘겨 검증한다.
- 커밋 메시지는 conventional commits 형식을 따를 것 (feat:, fix:, docs:, refactor:)

## 명령어
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드
npm run lint     # ESLint
npm run test     # 테스트
