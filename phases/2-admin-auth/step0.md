# Step 0: admin-auth

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` ("운영자 인증" 데이터 흐름)
- `/docs/ADR.md` (ADR-006)
- `/docs/SPEC.md` 5절 "어드민 API" 첫 단락, 7절 환경 변수
- `/lib/types.ts` (`1-domain-rules` step 0), `/vitest.config.mts` (`0-foundation` step 0)

## 작업

`lib/auth.test.ts`를 **먼저 별도 패치로** 작성한 뒤 `lib/auth.ts`를 구현한다.

### `lib/auth.ts`

```ts
import 'server-only';

export const ADMIN_COOKIE = 'admin_session';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function createSessionToken(now: Date): string;
export function verifySessionToken(token: string | undefined | null, now: Date): boolean;
export function checkPassword(input: unknown): boolean;
export function isAdminRequest(request: Request, now: Date): boolean;   // Cookie 헤더에서 ADMIN_COOKIE를 찾아 검증
export function sessionCookieOptions(now: Date): {
  httpOnly: true; secure: true; sameSite: 'lax'; path: '/'; expires: Date;
};
```

핵심 규칙:

- 토큰 형식: `<만료 시각 epoch ms>.<HMAC-SHA256(만료 시각, ADMIN_SESSION_SECRET) base64url>`. `node:crypto`의 `createHmac`을 쓴다.
- 검증: 형식 오류·서명 불일치·`now >= 만료 시각`·빈 값은 모두 `false`. 서명 비교는 `timingSafeEqual`로 하고, 길이가 다르면 비교 전에 `false`를 반환한다.
- `checkPassword`: 문자열이 아니거나 빈 문자열이면 `false`. `ADMIN_PASSWORD`와 `timingSafeEqual`로 비교한다(길이가 달라도 예외를 던지지 않도록 양쪽을 해시한 뒤 비교하는 방식 권장).
- `ADMIN_PASSWORD`·`ADMIN_SESSION_SECRET`가 비어 있으면 로그인·검증 모두 실패(`false`)로 처리한다. 예외를 던지거나 기본값을 쓰지 않는다.
- 환경 변수는 모듈 최상단이 아니라 **함수 호출 시** `process.env`에서 읽는다(테스트에서 `vi.stubEnv` 가능, 빌드 시 환경 변수 불필요).
- 현재 시각은 인자로만 받는다.

### `lib/auth.test.ts`

- 테스트 이름은 동작을 쓴다(규칙 ID 없음). 예: `it('만료 시각이 지난 토큰은 거부한다')`.
- 사례: 발급 직후 유효, 만료 정각·이후 거부, 서명 한 글자 변조 거부, 만료 시각 변조 거부, 다른 secret으로 서명한 토큰 거부, 빈 값·`undefined`·점 없는 문자열 거부, 비밀번호 일치·불일치·길이 다름·비문자열, 환경 변수 미설정 시 실패, `isAdminRequest`가 여러 쿠키가 섞인 Cookie 헤더에서 올바른 값을 찾음, `sessionCookieOptions`의 `expires`가 `now + 12h`.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
grep -q "server-only" lib/auth.ts && grep -q "timingSafeEqual" lib/auth.ts && grep -q "node:crypto" lib/auth.ts
! grep -nE "console\.(log|info|debug)" lib/auth.ts
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 서버 세션 저장소·사용자 테이블 없이 서명 쿠키만으로 동작하는가(ADR-006)?
   - 비밀값이 로그·예외 메시지에 들어가지 않는가?
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/2-admin-auth/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (export 이름, 쿠키 이름 포함)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- jose·jsonwebtoken·next-auth 등 인증 라이브러리를 추가하지 마라. 이유: ADR-006은 `node:crypto` HMAC 서명 쿠키로 결정했다.
- 비밀번호·secret·토큰을 `console`에 출력하거나 에러 메시지에 넣지 마라. 이유: AGENTS.md CRITICAL — 비밀값을 로그에 노출하지 않는다.
- 환경 변수를 모듈 로드 시점에 읽거나 없을 때 throw하지 마라. 이유: `npm run build`가 환경 변수 없이 통과해야 한다.
- `proxy.ts`나 Route Handler를 만들지 마라. 이유: step 1, `4-api` step 2의 범위다.
- 기존 테스트를 깨뜨리지 마라
