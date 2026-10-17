# Step 0: project-setup

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/AGENTS.md`
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md`
- `/.gitignore`
- `/.codex/hooks.json`, `/scripts/hooks/tdd-guard.sh`, `/scripts/hooks/verify-on-stop.sh`, `/scripts/hooks/danger-guard.sh`

현재 저장소에는 앱 코드가 없고 문서·하네스 스크립트만 있다. 이 step은 이후 모든 step이 쓸 도구 기반만 만든다. 도메인 코드·화면은 만들지 않는다.

## 작업

### 1. Next.js 16 스캐폴드

- 저장소 **밖**의 임시 폴더(예: `$TMPDIR/wb-scaffold`)에서 `npx create-next-app@16`을 비대화식으로 실행한다. 옵션: TypeScript, Tailwind CSS, ESLint, App Router, `src/` 디렉토리 사용(`--src-dir`), import alias `@/*`, npm. 생성된 `tsconfig.json`의 `paths`가 `"@/*": ["./src/*"]`인지 확인한다.
- 생성 결과 중 아래만 저장소 루트로 복사한다: `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `next-env.d.ts`, `src/app/`(layout.tsx·page.tsx·globals.css, 스캐폴드의 `src/` 아래 그대로), `public/`.
- `package.json`의 `name`은 `workshop-booking`으로 한다.
- `.gitignore`는 기존 항목(`refs/`, `docs/PLAN.md`, `docs/SPEC.md`, `.DS_Store`)을 그대로 두고 스캐폴드의 항목(node_modules, .next, .env*.local, next-env.d.ts 등)을 병합한다. `.env.example`은 무시하지 않는다.
- `tsconfig.json`의 `strict: true`를 확인한다.
- `src/app/page.tsx`는 스캐폴드 데모 내용을 지우고 서비스 이름(`공방 클래스 예약`)만 보여주는 최소 페이지로 바꾼다. 이후 `5-customer-ui` step 2에서 `src/app/(site)/page.tsx`로 옮긴다.
- `eslint.config.mjs`에 `refs/**`, `phases/**`, `scripts/**`를 ignore로 추가한다.

### 2. 의존성

- dependencies: `@supabase/supabase-js`, `@tanstack/react-query`, `lucide-react`, `server-only`
- devDependencies: `vitest`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/jest-dom`, `@testing-library/user-event`

### 3. Vitest

- `vitest.config.mts`: `environment: 'jsdom'`, `@/` → `./src` alias(`tsconfig.json`의 `paths`와 일치), `setupFiles: ['./vitest.setup.ts']`, `passWithNoTests: true`, `exclude`에 `node_modules`, `.next`, `refs`를 넣는다.
- `server-only` 패키지는 테스트 환경에서 import 시 예외를 던지므로 `resolve.alias`로 빈 모듈(`vitest.server-only-stub.ts` 같은 설정용 파일, 내용은 `export {}`)에 연결한다.
- `vitest.setup.ts`: `@testing-library/jest-dom/vitest` import.
- `package.json` scripts: `"test": "vitest run"`. `dev`·`build`·`lint`는 스캐폴드 값을 유지한다(`lint`는 `eslint`).

### 4. shadcn/ui

- `npx shadcn@latest init`을 비대화식 옵션(`--defaults` 또는 `--yes` 등)으로 실행한다. `components.json`은 저장소 루트에 두고 alias는 `@/components`, `@/lib/utils`(실제 위치 `src/components/`, `src/lib/utils.ts`), `tailwind.css`는 `src/app/globals.css`다.
- 컴포넌트 추가: `button input label textarea dialog select sonner` (`npx shadcn@latest add ... --yes`).
- shadcn init이 만드는 `src/lib/utils.ts`는 shadcn 생성물이므로 그대로 둔다. 이 파일은 수정하지 않는다(따라서 TDD 가드 대상이 아니다).

### 5. 환경 변수·자산 자리

- `.env.example`: 아래 이름만 적고 값은 비운다. 주석으로 용도 한 줄씩.
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `NEXT_PUBLIC_SITE_URL`
- `public/samples/.gitkeep`을 만든다. 샘플 사진(`class-1.jpg`~`class-4.jpg`)은 사용자가 나중에 직접 넣는다. 이 step에서 이미지 파일을 만들지 않는다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
test -f AGENTS.md && test -f CLAUDE.md && git diff --quiet -- AGENTS.md CLAUDE.md docs/
grep -q '"strict": true' tsconfig.json
grep -q '"@/\*": \["./src/\*"\]' tsconfig.json
test -d src/app && test ! -e app && test ! -e components && test ! -e lib
grep -q 'refs/' .gitignore && grep -q 'docs/PLAN.md' .gitignore
test -f src/components/ui/button.tsx && test -f components.json
test -f .env.example && ! grep -E '=[^[:space:]]+' .env.example
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 소스가 `src/app/`, `src/components/`, `src/lib/` 아래에 있고, 저장소 루트에 `app/`, `components/`, `lib/` 폴더가 없는가?
   - ADR 기술 스택(Next.js 16, TS strict, Tailwind, shadcn/ui, TanStack Query, Supabase, Vitest+RTL)을 벗어나지 않았는가?
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/0-foundation/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (설치한 Next 버전, Tailwind 버전, 추가한 shadcn 컴포넌트, vitest 설정 파일명을 포함)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 저장소 루트에서 `create-next-app`을 직접 실행하지 마라. 이유: 기존 `AGENTS.md`·`CLAUDE.md`·`docs/`·`scripts/`와 충돌하거나 덮어쓴다.
- `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/`를 스캐폴드 결과로 덮어쓰거나 새로 만들지 마라. 이유: 프로젝트 규칙 문서이며 README는 `7-readme` step 0에서 작성한다.
- `rm -rf`를 쓰지 마라. 이유: danger-guard 훅이 차단한다. 임시 폴더는 지우지 않고 남겨도 된다.
- 저장소 루트의 `app/`·`components/`·`lib/` 폴더, `middleware.ts`, 도메인 코드(`src/lib/types.ts`, `src/lib/rules.ts` 등)를 만들지 마라. 이유: 소스는 `src/` 아래에만 두며, `middleware.ts`와 도메인 코드는 쓰지 않거나 이후 step의 범위다.
- `src/components/ui/` 파일을 CLI 생성 후 직접 수정하지 마라. 이유: shadcn 컴포넌트는 CLI로만 관리한다.
- 테스트 통과를 위해 빈 테스트 파일이나 공용 `__tests__` 폴더를 만들지 마라. 이유: `passWithNoTests`로 충분하며 TDD 가드 우회 금지 규칙에 어긋난다.
- 기존 테스트를 깨뜨리지 마라
