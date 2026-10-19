# Step 0: mock-data

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/PLAN.md` 9절 "샘플 데이터", "개발용 목 데이터 모드"
- `/docs/SPEC.md` 3절 "개발용 목 데이터 모드", 6절 자동 테스트 표의 `src/lib/mock-db.ts` 행
- `/docs/ADR.md` ADR-012, `/docs/ARCHITECTURE.md` "패턴"의 "개발용 목 데이터 모드"
- `supabase/schema.sql` — 끝부분 샘플 데이터(클래스 4개·회차 7개·예약 11건과 주석 표), `session_stats` 뷰, `admin_list_bookings` 함수(필터·검색·정렬 기준)
- `src/lib/db.ts` — 조회 함수 6개(`listPublishedClasses`·`getPublishedClass`·`lookupBooking`·`listAdminBookings`·`listAdminClasses`·`getAdminClass`)와 내부 헬퍼(`visibleSessions`·`toBookingLookupResult` 등)의 계산 방식과 반환 형식
- `src/lib/rules.ts`, `src/lib/types.ts`
- `src/lib/db.test.ts`, `src/lib/rules.test.ts` — 테스트 작성 패턴(고정 `now`, 규칙 ID를 테스트 이름에 포함)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

`src/lib/mock-db.test.ts`를 **먼저 별도 패치로** 작성한 뒤 `src/lib/mock-db.ts`를 구현한다. 이 step에서는 `db.ts`를 수정하지 않는다(분기는 step 1).

```ts
import "server-only";

export function isMockDb(): boolean;

export function mockListPublishedClasses(now: Date): ClassSummary[];
export function mockGetPublishedClass(id: string, now: Date): ClassDetail | null;
export function mockLookupBooking(input: unknown, now: Date): BookingLookupResult;
export function mockListAdminBookings(
  filter: { sessionId?: string | null; status?: string | null; q?: string | null },
  now: Date,
): AdminBookingList;
export function mockListAdminClasses(now: Date): AdminClassSummary[];
export function mockGetAdminClass(id: string, now: Date): AdminClassDetail;
```

핵심 규칙:

- `isMockDb()`는 `process.env.MOCK_DB === "1" && process.env.NODE_ENV !== "production"`일 때만 `true`. 호출할 때마다 환경 변수를 읽는다(모듈 로드 시 고정하지 않음). Supabase 환경 변수 유무는 보지 않는다.
- 샘플 데이터는 `schema.sql`의 샘플과 **같은 ID·제목·설명·이미지 경로·공개 여부·정원·회차 상태·예약번호·인원·예약자 이름·전화번호·상태**로 상수에 둔다. 클래스 `created_at` 정렬이 필요하면 schema.sql의 삽입 순서와 같은 결과가 나오게 정한다.
- 회차 시각은 모듈을 처음 불러온 시각(`BASE_TIME`)에 schema.sql과 같은 간격(+4일, +5일, +20시간, −2시간, +6일(취소), +7일, +6일)을 더해 한 번 계산하고 이후 바꾸지 않는다. 함수 인자 `now`는 판정에만 쓴다.
- 반환 형식과 계산은 `db.ts`의 해당 함수와 같게 한다: 남은 자리(`remainingSeats` — pending·confirmed만 점유), 고객 표시 회차(`isVisibleSession` — 시작 전·미취소), 비공개 클래스는 고객 목록에서 제외·상세는 `null`, 예약 조회는 `validateLookupInput` 실패 시 해당 오류, 예약번호·뒷자리 불일치는 `BOOKING_NOT_FOUND`(어느 값이 틀렸는지 구분하지 않음, R-30), 취소 가능 여부·기한은 `db.ts`의 `toBookingLookupResult`와 같은 규칙, 운영자 목록의 `sessionId`·`status` 검증 실패 시 `VALIDATION_ERROR`, 검색·정렬은 `admin_list_bookings`와 같은 기준, 운영자 클래스 상세에 없는 ID는 `NOT_FOUND`.
- 가능하면 `db.ts`의 내부 계산을 복제하기보다 `rules.ts` 함수를 재사용한다. `db.ts`에서 함수를 export해서 가져오지 마라(step 1에서 `db.ts`가 `mock-db.ts`를 import하므로 순환 참조가 생긴다).
- 반환 객체는 매번 새로 만든다. 호출자가 결과를 변경해도 샘플 상수가 바뀌지 않아야 한다.

테스트(`src/lib/mock-db.test.ts`, 고정 `now` = 모듈 기준 시각 근처 값 사용; 필요하면 `vi.useFakeTimers()`로 모듈 로드 전 시스템 시각을 고정하고 동적 import):

- `isMockDb`: `MOCK_DB=1`+development → true, 미설정 → false, `MOCK_DB=1`+production → false (`vi.stubEnv`).
- `R-52` 고객 목록에 비공개 캔들 클래스가 없고, 비공개 클래스 상세는 `null`.
- `R-54` 도자기 상세에 시작한 회차(−2시간)·취소 회차가 없음, 꽃다발 클래스는 표시 회차 0개.
- `R-11` 남은 자리: 도자기 +5일 회차(정원 4, pending 2 + confirmed 2) 0, 가죽 +7일 회차(정원 6, rejected·cancelled 제외, pending 1) 5.
- `R-30` 예약 조회: 뒷자리 불일치 → `BOOKING_NOT_FOUND`, 형식 오류 → `VALIDATION_ERROR`, BK-DEMO01 성공.
- `R-31` BK-DEMO04(20시간 후 확정) 취소 불가, BK-DEMO03(5일 후 확정) 취소 가능.
- 운영자 목록: 상태 필터·회차 필터·이름/전화번호 검색, 잘못된 상태 값 → `VALIDATION_ERROR`.
- 운영자 클래스 목록 4개(비공개 포함)와 회차 수, 없는 ID 상세 → `NOT_FOUND`.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
test -f src/lib/mock-db.test.ts && test -f src/lib/mock-db.ts
grep -q 'NODE_ENV' src/lib/mock-db.ts
! grep -q 'mock-db' src/lib/db.ts
! grep -nE 'createClient|@supabase' src/lib/mock-db.ts
for c in BK-DEMO01 BK-DEMO11 10000000-0000-4000-8000-000000000004 20000000-0000-4000-8000-000000000007; do grep -q "$c" src/lib/mock-db.ts || exit 1; done
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 샘플 값이 `schema.sql`과 일치하는가? (예약 11건의 번호·전화번호·상태·회차 대조)
   - 판정은 인자 `now`로 하고 `rules.ts`를 재사용하는가?
   - `isMockDb()`가 production에서 항상 false인가?
3. 결과에 따라 `phases/8-mock-db/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 목 데이터에 쓰기(신청·취소·상태 변경·관리) 함수를 만들지 마라. 이유: PLAN 9절 — 목 모드는 읽기 전용이다.
- `db.ts`·Route Handler·컴포넌트를 수정하지 마라. 이유: 분기는 step 1의 범위다.
- Supabase 환경 변수가 비어 있으면 자동으로 목 모드가 켜지게 하지 마라. 이유: ADR-012 — 배포 환경 설정 누락 시 가짜 데이터 노출 방지.
- 샘플 값을 schema.sql과 다르게 만들지 마라. 이유: README의 샘플 예약 표를 목 모드에서도 그대로 쓴다.
- `supabase/schema.sql`을 수정하지 마라.
- 기존 테스트를 깨뜨리지 마라
