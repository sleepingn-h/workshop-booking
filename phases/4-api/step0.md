# Step 0: api-client

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` (데이터 흐름 "조회·변경 – 클라이언트")
- `/docs/SPEC.md` 5절(에러 응답 형식), 6절 `src/lib/api.ts` 행
- `/lib/types.ts` (`1-domain-rules` step 0 — `ErrorCode`, `ERROR_MESSAGE`)

## 작업

`src/lib/api.test.ts`를 **먼저 별도 패치로** 작성한 뒤 `src/lib/api.ts`를 구현한다. 브라우저(클라이언트 컴포넌트)가 자체 REST API를 호출할 때 쓰는 유일한 함수다.

```ts
export type ClientErrorCode = ErrorCode | 'NETWORK_ERROR';

export class ApiError extends Error {
  constructor(public code: ClientErrorCode, message: string, public status: number);
}

export async function apiFetch<T>(
  path: string,
  init?: Omit<RequestInit, 'body'> & { json?: unknown; body?: BodyInit },
): Promise<T>;
```

핵심 규칙:

- `json`이 있으면 `JSON.stringify`하고 `Content-Type: application/json`을 붙인다. `body`가 `FormData`이면 Content-Type을 지정하지 않는다.
- 동일 출처 쿠키가 전송되도록 `credentials: 'same-origin'`.
- 2xx: 본문이 있으면 JSON 파싱 결과를, 204·빈 본문이면 `undefined`를 반환한다.
- 비 2xx: 본문이 `{ error: { code, message } }`이면 `new ApiError(code, message, status)`. 형식이 다르거나 JSON이 아니면 `ApiError('INTERNAL_ERROR', ERROR_MESSAGE.INTERNAL_ERROR, status)`.
- `fetch` 자체가 실패(TypeError 등)하면 `ApiError('NETWORK_ERROR', '네트워크 연결을 확인해 주세요.', 0)`.
- 이 파일은 브라우저 번들에 포함되므로 `process.env`의 비밀값·`server-only` 모듈·`src/lib/db.ts`·`src/lib/auth.ts`를 import하지 않는다.

### `src/lib/api.test.ts`

- `vi.stubGlobal('fetch', vi.fn())`로 모킹한다.
- 사례: 성공 JSON 파싱, `json` 옵션의 직렬화·헤더, FormData 전송 시 Content-Type 미지정, 204 → undefined, `{ error }` → ApiError 필드(code·message·status), 409 `SESSION_FULL` 변환, HTML 에러 본문 → `INTERNAL_ERROR`, fetch reject → `NETWORK_ERROR`.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
! grep -nE "server-only|@/lib/db|@/lib/auth|process\.env" src/lib/api.ts
grep -q "class ApiError" src/lib/api.ts
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 브라우저 코드가 Supabase나 서버 전용 모듈을 참조하지 않는가?
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/4-api/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- axios·ky 등 HTTP 라이브러리를 추가하지 마라. 이유: `fetch`로 충분하고 의존성을 늘리지 않는다.
- 엔드포인트별 래퍼 함수(`createBooking()` 등)를 이 파일에 만들지 마라. 이유: 호출부(컴포넌트)에서 `apiFetch`를 직접 쓰는 것으로 충분하며, 엔드포인트가 아직 없다.
- 재시도 로직을 넣지 마라. 이유: 재시도는 TanStack Query 옵션이 담당한다.
- 기존 테스트를 깨뜨리지 마라
