# Step 0: db-schema

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` ("원자적 처리는 Postgres 함수", "요청 시각")
- `/docs/ADR.md` (ADR-003, ADR-005, ADR-008, ADR-010)
- `/docs/PLAN.md` 6절(R-01~R-58), 7절(시나리오), 9절(샘플 데이터)
- `/docs/SPEC.md` 1절(도메인 모델), 3절("원자적 처리", "시각과 취소 가능 여부"), 5절(에러 코드)
- `/lib/types.ts`, `/lib/rules.ts` (`1-domain-rules` step 0 — SQL 함수는 같은 규칙을 저장 시점에 다시 확인한다)

## 작업

`supabase/schema.sql` 하나를 작성한다. Supabase SQL Editor에서 파일 전체를 실행하면 DB가 준비되고, 다시 실행하면 데모가 초기화된다. 이 파일은 로컬에서 실행해 검증할 수 없으므로(psql·Docker 없음) 문법과 규칙 일치를 꼼꼼히 직접 검토하라.

### 1. 초기화 (파일 맨 위)

- 아래 객체가 있으면 지우고 다시 만든다: 함수들, 뷰 `session_stats`, 테이블 `bookings` → `sessions` → `classes`(의존 역순, `cascade`).
- Storage 버킷: `insert into storage.buckets (id, name, public) values ('class-images', 'class-images', true) on conflict (id) do nothing;` — 업로드된 파일은 지우지 않는다(ADR-010).

### 2. 테이블

| 테이블 | 컬럼 |
|---|---|
| `classes` | `id uuid pk default gen_random_uuid()`, `title text not null check (btrim(title) <> '')`, `description text not null default ''`, `image_url text`, `image_path text` (Storage 객체 경로, 업로드 이미지일 때만), `is_published boolean not null default false`, `created_at timestamptz not null default now()` |
| `sessions` | `id uuid pk`, `class_id uuid not null references classes(id) on delete restrict`, `starts_at timestamptz not null`, `capacity int not null check (capacity >= 1)`, `status text not null default 'scheduled' check (status in ('scheduled','cancelled'))`, `created_at` |
| `bookings` | `id uuid pk`, `code text not null unique`, `session_id uuid not null references sessions(id) on delete restrict`, `headcount int not null check (headcount between 1 and 4)`, `customer_name text not null`, `phone text not null` (정규화된 숫자), `status text not null default 'pending' check (status in ('pending','confirmed','rejected','cancelled'))`, `created_at` |

- 인덱스: `bookings(session_id)`, `sessions(class_id)`.
- 뷰 `session_stats(session_id, occupied, booking_count)`: `occupied`는 pending·confirmed 인원 합(R-01), `booking_count`는 상태와 무관한 예약 수(R-41). 예약이 없는 회차도 0으로 나와야 한다.
- 세 테이블 모두 `enable row level security`, 정책은 만들지 않는다(서버의 service role 키만 접근). 뷰는 `security_invoker = true`로 만든다.

### 3. 함수 (모두 `language plpgsql`, `set search_path = public`)

에러 규약: 규칙 위반은 `raise exception '<ERROR_CODE>';` — 메시지가 정확히 `src/lib/types.ts`의 `ErrorCode` 문자열이어야 한다(예: `'SESSION_FULL'`). `src/lib/db.ts`가 이 메시지를 에러 코드로 변환한다.

시간 규약: 시간을 판정하는 함수는 `p_now timestamptz`를 받고 **`now()`·`current_timestamp`를 쓰지 않는다.**

| 함수 | 반환 | 잠금·검사 |
|---|---|---|
| `create_booking(p_session_id uuid, p_headcount int, p_customer_name text, p_phone text, p_now timestamptz)` | `text` (예약번호) | 회차 조회 → 소속 클래스 `FOR SHARE`, 회차 `FOR UPDATE`. 회차 없음·클래스 비공개 → `NOT_FOUND`(R-52), 취소 회차 → `SESSION_CANCELLED`, `p_now >= starts_at` → `SESSION_STARTED`, 인원 범위 → `INVALID_HEADCOUNT`, 같은 회차·같은 phone의 pending/confirmed 존재 → `DUPLICATE_BOOKING`, 남은 자리 부족 → `SESSION_FULL`. 통과 시 `pending`으로 insert. 예약번호는 `'BK-' || 6자리(혼동 문자 0/O/1/I 제외한 대문자·숫자)`를 생성하고 unique 충돌 시 다른 번호로 재시도(최대 10회). 기존 예약을 덮어쓰지 않는다. |
| `customer_cancel_booking(p_code text, p_phone_last4 text, p_now timestamptz)` | `void` | 예약 `FOR UPDATE`. 예약 없음 또는 `right(phone, 4) <> p_phone_last4` → `BOOKING_NOT_FOUND`(어느 값이 틀렸는지 구분 금지, R-30). `rejected`·`cancelled` → `INVALID_TRANSITION`. `pending`은 `p_now < starts_at`, `confirmed`는 `p_now <= starts_at - interval '24 hours'`, 아니면 `CANCEL_DEADLINE_PASSED`. |
| `admin_set_booking_status(p_booking_id uuid, p_action text, p_now timestamptz)` | `void` | 예약 `FOR UPDATE`. 없음 → `NOT_FOUND`. `confirm`: pending만, `p_now >= starts_at`이면 `SESSION_STARTED`(R-22). `reject`: pending만. `cancel`: pending·confirmed. 그 외 → `INVALID_TRANSITION`. 상태를 조건으로 update한다. |
| `admin_list_bookings(p_session_id uuid, p_status text, p_q text)` | `table(id, code, status, headcount, customer_name, phone, class_title, session_id, session_starts_at, session_status)` | 읽기 전용. 각 인자가 null이면 해당 필터 미적용. `p_q`는 trim 후 비어 있지 않으면 `customer_name ilike '%' || 이스케이프한 q || '%'` **또는** `phone = regexp_replace(q, '[\s-]', '', 'g')`(R-19). `%`·`_`·`\`는 이스케이프한다. 정렬: 회차 시작 시각 오름차순, 생성 시각 오름차순. 비공개 클래스·취소·시작한 회차 포함. |
| `create_session(p_class_id uuid, p_starts_at timestamptz, p_capacity int, p_now timestamptz)` | `uuid` | 클래스 `FOR SHARE`, 없으면 `NOT_FOUND`. `p_starts_at <= p_now` 또는 `p_capacity < 1` → `VALIDATION_ERROR`(R-46). |
| `update_session(p_session_id uuid, p_starts_at timestamptz, p_capacity int, p_now timestamptz)` | `void` | 회차 `FOR UPDATE`, 없음 → `NOT_FOUND`, 취소 회차 → `SESSION_CANCELLED`. null 인자는 변경하지 않음. `p_capacity`: 1 미만 `VALIDATION_ERROR`, 현재 occupied 미만 → `CAPACITY_BELOW_OCCUPIED`(R-40). `p_starts_at`: 기존과 다르고 예약 이력이 하나라도 있으면 `SESSION_HAS_BOOKINGS`(R-44), `<= p_now`면 `VALIDATION_ERROR`. |
| `delete_session(p_session_id uuid)` | `void` | 회차 `FOR UPDATE`, 없음 → `NOT_FOUND`, 예약 이력이 하나라도 있으면 `SESSION_HAS_BOOKINGS`(R-41, R-43). |
| `cancel_session(p_session_id uuid)` | `void` | 회차 `FOR UPDATE`, 없음 → `NOT_FOUND`, 이미 취소 → `SESSION_CANCELLED`(R-45). 회차를 cancelled로, 해당 회차의 pending·confirmed 예약을 모두 cancelled로 한 트랜잭션에서 변경(R-42). |
| `delete_class(p_class_id uuid)` | `text` (삭제된 클래스의 `image_path`, 없으면 null) | 클래스 `FOR UPDATE`, 없음 → `NOT_FOUND`, 회차가 하나라도 있으면 `CLASS_HAS_SESSIONS`(R-50, R-51). |
| `set_class_published(p_class_id uuid, p_is_published boolean)` | `void` | 클래스 `FOR UPDATE`, 없음 → `NOT_FOUND`. |

- 함수 실행 권한: `revoke execute on function ... from public, anon, authenticated;` 후 `grant execute ... to service_role;`.
- 잠금 순서는 항상 클래스 → 회차 → 예약 순서를 지킨다(교착 방지).

### 4. 샘플 데이터 (파일 맨 끝, `-- SAMPLE DATA` 주석으로 구분)

이 영역에서만 `now() + interval '...'`을 쓴다(ADR-010). 고정 uuid 리터럴을 써서 재실행해도 같은 id가 나오게 한다.

필요한 샘플(PLAN 9절):

- 공개 클래스 3개, 비공개 클래스 1개. 이미지 경로는 `/samples/class-1.jpg` ~ `/samples/class-4.jpg`(비공개가 4번). 설명에는 장소·소요 시간·비용과 결제 방법·준비물·문의처를 줄바꿈으로 모두 작성한다(R-53). 연락처는 가상 번호.
- 공개 클래스 A:
  - 핵심 시연 회차: `now() + 4 days`, 정원 6, 남은 자리 4 이상.
  - 만석 회차: `now() + 5 days`, 정원 4, pending 2명 + confirmed 2명.
  - 시작 24시간 이내 회차: `now() + 20 hours`, confirmed 예약 1건(고객 직접 취소 불가 시연).
  - 시작한 회차: `now() - 2 hours`, pending 예약 1건(R-33 참여 미확정 안내 시연).
  - 취소된 회차: `now() + 6 days`, status cancelled, 예약은 rejected·cancelled만(SPEC 1절).
- 공개 클래스 B: `now() + 7 days` 회차에 rejected 1건, cancelled 1건, pending 1건.
- 공개 클래스 C: 표시할 회차가 없는 클래스(시작한 회차 1개만 있거나 회차 없음, R-54).
- 비공개 클래스 D: `now() + 6 days` 회차에 pending 예약 1건(R-52 기존 예약 조회).
- 예약번호는 `BK-DEMO01`부터 순서대로 고정. 예약자 이름·전화번호는 가상 값(`010-0000-xxxx` 형태를 정규화해 저장).
- 샘플 섹션 맨 위에 주석 표로 `예약번호 | 전화번호 뒷자리 | 클래스·회차 | 상태 | 시연 용도`를 적는다. `7-readme` step 0 README가 이 표를 옮긴다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
test -f supabase/schema.sql
for f in create_booking customer_cancel_booking admin_set_booking_status admin_list_bookings create_session update_session delete_session cancel_session delete_class set_class_published; do grep -q "function $f" supabase/schema.sql || { echo "missing $f"; exit 1; }; done
! (awk '/-- SAMPLE DATA/{exit} {print}' supabase/schema.sql | grep -niE "now\(\)|current_timestamp" | grep -viE "default now\(\)")
grep -q "for update" supabase/schema.sql && grep -qi "row level security" supabase/schema.sql
grep -q "class-images" supabase/schema.sql && grep -q "BK-DEMO01" supabase/schema.sql
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 함수의 판정 규칙이 `src/lib/rules.ts`와 같은가(특히 24시간 경계 `<=`, 시작 시각 경계 `>=`)?
   - `raise exception` 메시지가 모두 `ErrorCode` 문자열과 정확히 같은가?
   - AGENTS.md CRITICAL 규칙(행 잠금, `p_now`)을 위반하지 않았는가?
3. 결과에 따라 `phases/3-database/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (RPC 이름·반환 형태, 뷰 이름, 샘플 예약번호 범위 포함)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 함수 본문에서 `now()`·`current_timestamp`를 쓰지 마라. 이유: 요청 시각은 앱 서버가 한 번 읽어 `p_now`로 넘긴다(ADR-005). 컬럼 기본값 `created_at default now()`와 샘플 섹션만 예외다.
- `DROP TABLE` 등 SQL 문자열이 들어간 셸 명령을 실행하지 마라(예: `echo`·`grep` 인자로 넣기). 이유: danger-guard 훅이 명령을 차단한다. SQL은 파일 내용으로만 작성한다.
- Supabase CLI·마이그레이션 폴더·별도 seed 파일을 만들지 마라. 이유: ADR-003·ADR-010은 `schema.sql` 하나로 결정했다.
- 테이블에 anon 읽기 정책을 만들지 마라. 이유: 브라우저는 Supabase를 직접 호출하지 않으며 예약자 개인정보가 노출된다.
- 샘플 이미지 파일을 만들지 마라. 이유: 사용자가 `public/samples/`에 직접 넣는다.
- 실제 사람의 이름·전화번호를 샘플에 쓰지 마라. 이유: PLAN 9절은 가상 데이터를 요구한다.
- 기존 테스트를 깨뜨리지 마라
