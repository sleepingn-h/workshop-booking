# 아키텍처

## 디렉토리 구조
`src/` 없이 프로젝트 루트에 둔다. 구현 파일마다 같은 폴더에 테스트 파일이 있다(아래 "테스트" 참고).
```
app/
├── layout.tsx                                # 루트 레이아웃 (폰트·메타데이터·QueryProvider·토스트)
├── globals.css                               # UI_GUIDE 토큰
├── (site)/                                   # 고객 화면 route group (URL에 포함되지 않음)
│   ├── layout.tsx                            # 고객 헤더
│   ├── page.tsx                              # /  클래스 목록 (요청 시 서버 렌더링)
│   ├── classes/[id]/page.tsx                 # 클래스 상세·예약 신청
│   ├── bookings/complete/page.tsx            # 신청 완료 (?code=)
│   └── bookings/lookup/page.tsx              # 예약 조회·취소
├── admin/layout.tsx                          # 운영자 헤더·noindex
├── admin/login/page.tsx                      # 운영자 로그인
├── admin/page.tsx                            # 운영자 예약 목록
├── admin/classes/page.tsx                    # 운영자 클래스 목록 (/new: 생성)
├── admin/classes/[id]/page.tsx               # 클래스 수정·이미지·회차 관리
└── api/                                      # 각 route.ts 옆에 route.test.ts
    ├── bookings/route.ts                     # POST 신청
    ├── bookings/lookup/route.ts              # POST 조회
    ├── bookings/[code]/cancel/route.ts       # POST 고객 취소
    └── admin/
        ├── login/route.ts                    # POST 로그인
        ├── logout/route.ts                   # POST 로그아웃
        ├── bookings/route.ts                 # GET 예약 목록 (필터·검색)
        ├── bookings/[id]/[action]/route.ts   # POST confirm·reject·cancel
        ├── classes/route.ts                  # GET 목록 · POST 생성
        ├── classes/[id]/route.ts             # GET · PATCH · DELETE
        ├── classes/[id]/image/route.ts       # PUT 이미지 업로드
        ├── classes/[id]/sessions/route.ts    # POST 회차 생성
        ├── sessions/[id]/route.ts            # PATCH · DELETE
        └── sessions/[id]/cancel/route.ts     # POST 회차 취소
components/
├── ui/                                       # shadcn/ui (CLI로 추가, 직접 수정하지 않음)
├── query-provider.tsx (+ .test.tsx)          # TanStack Query Provider
├── status-badge.tsx (+ .test.tsx)            # 예약 상태 배지·클래스/회차 태그
├── copy-button.tsx (+ .test.tsx)             # 예약번호 복사
├── booking-form.tsx (+ .test.tsx)            # 신청 폼
├── booking-lookup.tsx (+ .test.tsx)          # 조회·취소
├── admin-login-form.tsx (+ .test.tsx)        # 운영자 로그인 폼
├── admin-header.tsx (+ .test.tsx)            # 운영자 내비·로그아웃
├── admin-booking-list.tsx (+ .test.tsx)      # 운영자 예약 목록·검색
├── admin-class-form.tsx (+ .test.tsx)        # 클래스 생성·수정·이미지
└── admin-session-list.tsx (+ .test.tsx)      # 회차 관리
lib/
├── types.ts                                  # 도메인 타입·상태·에러 코드
├── rules.ts (+ .test.ts)                     # 순수 함수: 자리·전이·기한·입력 검증·전화번호 정규화
├── db.ts (+ .test.ts)                        # Supabase(DB·Storage) 호출 + 요청 처리 순서
├── auth.ts (+ .test.ts)                      # 운영자 쿠키 서명·검증 (node:crypto HMAC)
├── format.ts (+ .test.ts)                    # Asia/Seoul 시각 표시·입력 변환
├── http.ts (+ .test.ts)                      # Route Handler 공용: JSON 파싱, 운영자 확인, 에러 → HTTP 응답
└── api.ts (+ .test.ts)                       # 브라우저 fetch + 에러 처리
proxy.ts (+ .test.ts)                         # /admin 접근 보호 (Next.js 16, Node.js 런타임)
supabase/
└── schema.sql                                # 테이블 + 예약·관리 함수 + 이미지 버킷 + 샘플 데이터 (재실행 = 초기화)
scripts/hooks/
└── tdd-guard.sh                              # 테스트 파일 없는 구현 파일 편집 차단
```

## 패턴
- **Server Components 기본**: 클래스 목록·상세는 서버에서 렌더링해 검색 노출과 공유 미리보기를 제공한다. 두 페이지는 `await connection()`으로 요청 시 렌더링을 강제해 빌드 시점에 고정된 남은 자리를 보여주지 않는다. 신청 폼·예약 조회·운영자 화면처럼 인터랙션이 필요한 곳만 Client Component로 만든다. 신청 폼을 포함한 공개 클래스 상세는 검색 노출 대상으로 유지하고 신청 완료·예약 조회·운영자 페이지만 `noindex`로 제외한다. 비공개 클래스 상세는 404로 처리한다.
- **규칙은 순수 함수**: `lib/rules.ts`는 DB를 모르는 순수 함수다. 현재 시각도 인자(`now`)로 받아 테스트에서 고정한다.
- **처리 순서는 `lib/db.ts`**: 화면과 API는 `db.ts` 함수 하나(예: `cancelBooking`)만 부른다. 이 함수가 조회 → 규칙 확인 → 저장 순서를 처리한다. 별도 Service·Repository 계층은 두지 않는다.
- **원자적 처리는 Postgres 함수**: 예약 생성·상태 변경과 회차 정원 변경·취소·삭제, 클래스 삭제·공개 전환은 `schema.sql`의 함수가 한 트랜잭션에서 행을 잠그고 상태·남은 자리·예약 이력을 다시 확인한 뒤 저장한다. 회차 취소는 회차와 활성 예약을 함께 취소한다.
- **이미지는 운영자 API 경유**: 브라우저가 Storage에 직접 올리지 않는다. 운영자 Route Handler가 형식(JPEG·PNG·WebP)과 크기(4MB)를 확인한 뒤 서버에서 Supabase Storage에 저장한다.
- **요청 시각**: `db.ts` 함수는 진입 시 DB 조회 전에 서버 시각을 한 번 읽어 규칙 함수(`now`)와 SQL 함수(`p_now`)에 같은 값을 넘긴다. 신청·승인·고객 취소의 시간 제한은 이 요청 시각으로 판정한다. SQL 함수는 `now()`를 쓰지 않는다.
- **얇은 Route Handler**: 요청 파싱, 운영자 쿠키 확인, `db.ts` 호출, 에러 코드 → HTTP 상태 변환만 한다.

## 데이터 흐름
```
[조회 – 서버 렌더링]
요청 → page.tsx(Server Component, connection()) → lib/db.ts → Supabase → HTML(메타데이터·OG 포함)

[조회·변경 – 클라이언트]
사용자 입력 → Client Component(TanStack Query) → route.ts(입력 파싱·운영자 인증)
  → lib/db.ts ─┬→ lib/rules.ts (판정)
               └→ Supabase 함수 (잠금·재확인·저장)
  → JSON 응답 → 관련 클라이언트 쿼리 무효화 또는 완료 화면 이동

[신청 실패 – 남은 자리 재조회]
SESSION_FULL → 입력 유지 → router.refresh() → 서버 상세 재조회 → 회차·남은 자리 갱신

[운영자 인증]
로그인 → ADMIN_PASSWORD 확인 → HMAC 서명 만료 토큰 쿠키 발급
  → proxy.ts(페이지)·운영자 Route Handler(API)에서 lib/auth.ts로 서명·만료 검증
```

브라우저는 Supabase를 직접 호출하지 않는다. Server Component는 자기 REST API를 HTTP로 다시 부르지 않고 `lib/db.ts`를 직접 호출한다.

## 상태 관리
- **서버 상태(서버 렌더링)**: 클래스 목록·상세는 Server Component가 요청마다 조회하며 남은 자리를 캐시하지 않는다. 신청 폼은 서버 상세에서 전달받은 회차·남은 자리를 표시하고, 상세 갱신은 `router.refresh()`로 처리한다. 신청이 `SESSION_FULL`로 실패하면 입력을 유지한 채 갱신한다. 신청 성공 시 완료 화면으로 이동하고 상세 재방문·새로고침 시 최신 남은 자리를 조회한다.
- **서버 상태(클라이언트)**: 예약 조회·운영자 화면(예약 목록, 클래스·회차 관리)은 TanStack Query의 `useQuery`, 신청·승인·거절·취소와 관리 변경은 `useMutation`으로 처리한다. 변경 성공 시 관련 클라이언트 쿼리를 무효화한다. 다른 브라우저의 변경은 해당 화면을 다시 조회할 때 반영한다.
- **클라이언트 상태**: 입력값·제출 중 상태·확인 다이얼로그는 컴포넌트 로컬 상태로 관리한다.
- **URL 상태**: 신청 완료 화면의 예약번호는 `?code=`로 주소에 담는다.
- **인증 상태**: 운영자 로그인은 httpOnly 쿠키로만 유지하며 클라이언트 저장소에 두지 않는다.

## 테스트
- 도구는 Vitest, 컴포넌트는 React Testing Library(jsdom)다. 실제 DB에 접속하는 자동 테스트는 두지 않는다.
- `scripts/hooks/tdd-guard.sh`가 Edit·Write 전에 같은 폴더의 `<이름>.test.ts(x)` 존재를 확인한다. `page`·`layout`·`loading`·`error`·`not-found`, `types.ts`, 설정·스타일·문서는 예외다.

| 대상 | 검증 내용 |
|---|---|
| `lib/rules.ts` | 정원·상태 전이·시간 경계·입력 검증·회차/클래스 관리 규칙 (규칙 ID 포함) |
| `lib/auth.ts` | 쿠키 서명·검증, 만료·변조 거부 |
| `lib/db.ts` | Supabase 모킹. 요청 시각 하나를 규칙과 `p_now`에 전달, 입력 오류 시 DB 미호출, 에러 코드 변환 |
| `lib/api.ts` | `fetch` 모킹. 응답·에러 형식 처리 |
| `route.ts` | `db.ts` 모킹. 입력 파싱, HTTP 상태 변환, 운영자 401 |
| 컴포넌트 | 입력 오류, 제출 중 비활성, 실패 시 입력 유지, `SESSION_FULL` 시 `router.refresh()`, 취소 확인 |
| `proxy.ts` | 미인증 시 `/admin/login` 이동, 로그인 페이지 제외 |

Postgres 함수의 잠금·동시 신청(R-15)은 자동 테스트하지 않고 배포 환경 시연으로 확인한다.
