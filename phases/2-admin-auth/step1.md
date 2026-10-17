# Step 1: admin-proxy

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` ("운영자 인증")
- `/docs/SPEC.md` 4절 `/admin` 행
- `/lib/auth.ts`, `/lib/auth.test.ts` (step 0)
- Next.js 16의 `src/proxy.ts` 규약: `node_modules/next/dist/docs/`가 있으면 그 안의 proxy 문서를, 없으면 `node_modules/next`의 타입 정의(`NextRequest`, `NextResponse`, `ProxyConfig`/`config.matcher`)를 확인하라.

## 작업

`src/proxy.test.ts`를 **먼저 별도 패치로** 작성한 뒤 `src/proxy.ts`(`src/app/`과 같은 단계, Next.js의 `src/` 레이아웃 규칙)를 구현한다.

### `src/proxy.ts`

```ts
import { NextResponse, type NextRequest } from 'next/server';
export function proxy(request: NextRequest): NextResponse;
export const config = { matcher: ['/admin/:path*'] };
```

- `/admin/login`(및 그 하위)은 검사 없이 통과(`NextResponse.next()`).
- 그 밖의 `/admin` 이하 경로는 `request.cookies.get(ADMIN_COOKIE)?.value`를 `verifySessionToken(value, new Date())`로 검증한다. 무효하면 `/admin/login`으로 redirect(`new URL('/admin/login', request.url)`).
- 유효하면 통과.
- 이 파일은 페이지 보호만 담당한다. `/api/admin/*`는 matcher에 넣지 않는다(API는 각 Route Handler가 401로 응답한다).
- Next.js 16 proxy는 Node.js 런타임에서 실행되므로 `node:crypto`를 쓰는 `src/lib/auth.ts`를 그대로 import한다. `runtime` 설정을 edge로 바꾸지 않는다.

### `src/proxy.test.ts`

- `NextRequest`를 직접 만들어 호출한다. `ADMIN_SESSION_SECRET`은 `vi.stubEnv`로 설정하고 유효 토큰은 `createSessionToken`으로 만든다.
- 사례: 쿠키 없음 → `/admin/login` redirect(Location 헤더 확인), 변조·만료 쿠키 → redirect, 유효 쿠키 → 통과, `/admin/login` → 쿠키 없어도 통과, `/admin/classes/abc` 하위 경로도 보호, `config.matcher`에 `/api`가 없음.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
test -f src/proxy.ts && test -f src/proxy.test.ts && test ! -f middleware.ts
grep -q "verifySessionToken" src/proxy.ts
! grep -n "edge" src/proxy.ts
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - `middleware.ts`가 없고 `src/proxy.ts`만 있는가?
   - 검증 로직을 복제하지 않고 `src/lib/auth.ts`를 재사용하는가?
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/2-admin-auth/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- `middleware.ts`를 만들지 마라. 이유: Next.js 16에서는 `src/proxy.ts`를 쓰기로 AGENTS.md에 정했다.
- 토큰 서명·검증 코드를 src/proxy.ts에 다시 작성하지 마라. 이유: 페이지와 API가 `src/lib/auth.ts`의 같은 함수로 검증해야 한다.
- 운영자 페이지 파일(`src/app/admin/**`)을 만들지 마라. 이유: `6-admin-ui` step 0~2의 범위다.
- 기존 테스트를 깨뜨리지 마라
