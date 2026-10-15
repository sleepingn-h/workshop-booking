# Step 0: readme

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/PRD.md`, `/docs/ARCHITECTURE.md`, `/docs/ADR.md`
- `/docs/PLAN.md` 6절(규칙 ID와 정책), 9절(샘플·시연), 10절(최종 완료 조건 — README 요구사항)
- `/docs/SPEC.md` 6절(수동 확인·후속 범위), 7절(환경 변수)
- `/supabase/schema.sql` (`3-database` step 0 — 샘플 섹션 맨 위의 샘플 예약 주석 표)
- `/.env.example`, `/package.json`
- `phases/*/index.json`의 완료된 step summary

## 작업

저장소 루트에 `README.md`를 작성한다. 공개 저장소용 문서다. **PLAN.md·SPEC.md는 공개 저장소에 없으므로 링크하거나 "PLAN.md 참고" 같은 문구를 쓰지 않는다.** 두 파일 없이도 읽히게 쓴다. 상세 설계는 `docs/ARCHITECTURE.md`·`docs/ADR.md` 링크로 요약한다.

구성(순서 유지):

1. **소개**: 서비스 한 줄 설명, 핵심 흐름(예약 신청 → 운영자 승인 → 고객 조회 → 고객 취소 → 자리 복구), 배포 URL(`TODO: 배포 URL`).
2. **화면**: `TODO: 대표 화면 캡처 또는 시연 영상` 자리.
3. **기술 스택과 선택 이유**: ADR 요약(각 1~2줄) + `docs/ADR.md` 링크.
4. **구현 범위와 후속 범위**: MVP 기능 목록, 제외 사항(PRD "MVP 제외 사항"), 후속 범위 — DB 연동·동시 신청(R-15) 자동 검증은 하지 않았고 Postgres 함수의 행 잠금으로 구현해 배포 환경 시연으로 확인한다는 점.
5. **핵심 정책과 규칙 ID**: 테스트 이름에 쓰는 `R-xx` 전체를 표로 정리(`규칙 ID | 정책 요약`). R-01~R-03, R-10~R-19, R-20~R-22, R-30~R-33, R-40~R-46, R-50~R-58 모두 포함. 정책 문장은 짧게 요약한다. 상태 표시명(승인 대기·참여 확정·거절됨·취소됨)도 표로 둔다.
6. **로컬 실행**: Node 버전, `npm install`, `.env.local` 작성(`.env.example` 복사), `npm run dev`, `npm run test`, `npm run lint`, `npm run build`.
7. **환경 변수**: 이름과 용도만 표로. **실제 값·예시 비밀값을 쓰지 않는다.**
8. **DB 준비와 데모 초기화**: Supabase 프로젝트 생성 → SQL Editor에서 `supabase/schema.sql` 전체 실행 → 다시 실행하면 초기화. 초기화는 시연 중 만든 예약·클래스까지 모두 지운다는 경고, 업로드한 Storage 파일은 남는다는 점, 샘플 회차 시각은 실행 시점 기준이라 시연 직전에 실행해야 한다는 점, 시간이 지나면 시연 회차가 시작했거나 방문자 조작으로 데이터가 달라질 수 있다는 점(ADR-010). 샘플 이미지는 `public/samples/class-1.jpg`~`class-4.jpg`에 직접 넣어야 한다는 안내.
9. **데모 정보**: 운영자 로그인 경로 `/admin/login`, 데모 비밀번호는 `TODO: 공개용 데모 비밀번호`(실제 값 금지). 샘플 예약 표(`예약번호 | 전화번호 뒷자리 | 클래스·회차 | 예상 상태 | 시연 용도`) — `schema.sql`의 주석 표를 그대로 옮긴다.
10. **시연 순서**: 핵심 시연 7단계(고객 2명 신청 → 완료 화면 예약번호 복사·남은 자리 감소 확인 → 다른 브라우저에서 운영자 로그인·필터로 찾아 승인 → 고객 재조회로 확정·남은 자리 동일 확인 → 고객 취소·자리 복구 → 만석 회차 신청 제한·24시간 이내 확정 예약 취소 제한 → 운영자 회차 추가·예약 있는 회차 취소).
11. **테스트**: 자동 테스트 범위(ARCHITECTURE "테스트" 표 요약), 수동 확인 범위, `TODO: 브라우저 확인 결과`.
12. **AI 도구 활용 기록**: `TODO: AI가 생성한 코드를 검토·수정한 대표 사례, 수정 이유, 검증 결과` 자리.
13. **디렉토리 구조**: ARCHITECTURE 요약 + 링크.

`TODO:`로 시작하는 자리는 사용자가 배포·시연 후 직접 채운다. 그 밖의 내용은 저장소 코드와 문서에서 확인할 수 있는 사실만 쓴다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
test -f README.md
! grep -nE "PLAN\.md|SPEC\.md" README.md
for id in R-01 R-10 R-15 R-16 R-20 R-22 R-30 R-31 R-33 R-40 R-46 R-50 R-58; do grep -q "$id" README.md || { echo "missing $id"; exit 1; }; done
grep -q "supabase/schema.sql" README.md && grep -q "BK-DEMO01" README.md
grep -c "TODO:" README.md | awk '{ exit ($1 >= 4 ? 0 : 1) }'
for v in SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY ADMIN_PASSWORD ADMIN_SESSION_SECRET NEXT_PUBLIC_SITE_URL; do grep -q "$v" README.md || { echo "missing $v"; exit 1; }; done
! grep -nE "(ADMIN_PASSWORD|ADMIN_SESSION_SECRET|SUPABASE_SERVICE_ROLE_KEY)=[^[:space:]]+" README.md
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 체크리스트를 확인한다:
   - README에 PLAN·SPEC 링크나 언급이 없는가?
   - 비밀값(실제 키·비밀번호)이 없는가?
   - "하루", "8시간", "시간을 줄였다" 같은 작업 시간 표현 없이 "MVP"로 범위를 설명하는가?
   - 규칙 ID 표가 테스트 이름의 규칙 ID와 대조 가능한가?
3. 결과에 따라 `phases/7-readme/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (남긴 TODO 항목 나열)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- `docs/PLAN.md`·`docs/SPEC.md`를 링크하거나 내용을 출처로 언급하지 마라. 이유: 두 파일은 로컬 전용이며 공개 문서는 두 파일 없이 읽혀야 한다(AGENTS.md).
- 배포 URL·캡처·AI 수정 사례·브라우저 확인 결과·데모 비밀번호를 지어내지 마라. 이유: 사용자가 배포·시연 후 직접 채운다. `TODO:`로 남긴다.
- 환경 변수의 실제 값이나 예시 비밀값을 쓰지 마라. 이유: AGENTS.md CRITICAL.
- 작업 시간 예산(하루·8시간 등)이나 "시간 때문에 줄였다"는 표현을 쓰지 마라. 이유: 범위는 MVP로 설명한다.
- 다른 docs 문서(ARCHITECTURE·ADR·PRD·UI_GUIDE)를 수정하지 마라. 이유: 이 step의 범위는 README뿐이다.
- 코드 파일을 수정하지 마라. 이유: 이 step의 범위 밖이다.
- 기존 테스트를 깨뜨리지 마라
