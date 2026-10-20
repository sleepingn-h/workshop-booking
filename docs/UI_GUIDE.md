# UI 디자인 가이드

고객 화면(클래스 목록·상세·신청 완료·예약 조회)과 운영자 화면(로그인·예약 관리·클래스 관리·편집)이 함께 쓰는 시각 규칙이다. 값은 CSS 변수로 `src/app/globals.css`의 `:root`에 정의하고, Tailwind에서는 `bg-[var(--surface-card)]`처럼 변수로 참조한다. 화면에 hex 값을 직접 쓰지 않는다. 화면 흐름·단계별 안내·문구 규칙은 [UX_GUIDE.md](UX_GUIDE.md)를 따른다.

## 디자인 원칙

1. 바탕은 무채색이고 색은 의미에 쓴다. 흰 캔버스 위 그림자로 띄운 흰 카드가 기본이고, 블러플은 선택·주요 동작, 그린은 신청·참여 확정·공개, 마젠타는 승인 대기·임박에만 쓴다.
2. 상태는 글자로 말한다. 예약 상태, 남은 자리, 마감, 취소된 회차는 색만으로 구분하지 않고 항상 라벨(`승인 대기`, `2자리 남음`, `마감`)을 함께 보여준다.
3. 손가락 기준으로 만든다. 누를 수 있는 요소는 높이 44px 이상이고, 모바일 신청 버튼은 화면 하단에 고정한다. 360px에서 가로 스크롤이 생기지 않는다.

## AI 슬롭 안티패턴 — 하지 마라

| 금지 사항                                          | 이유                                        |
| -------------------------------------------------- | ------------------------------------------- |
| backdrop-filter: blur()                            | glass morphism은 AI 템플릿의 가장 흔한 징후 |
| gradient-text (배경 그라데이션 텍스트)             | AI가 만든 SaaS 랜딩의 1번 특징              |
| 배경·카드 그라데이션, 그라데이션 메시              | 화면은 단색 면으로만 구성한다               |
| "Powered by AI" 배지                               | 기능이 아니라 장식. 사용자에게 가치 없음    |
| box-shadow 글로우 애니메이션                       | 네온 글로우 = AI 슬롭                       |
| 모든 요소에 동일한 둥근 모서리                     | 요소별 반경을 아래 표대로 구분한다          |
| 배경 gradient orb (blur-3xl 원형)                  | 모든 AI 랜딩 페이지에 있는 장식             |
| 정해진 4색(블러플·그린·마젠타·레드) 외 강조색 추가 | 색의 의미가 흐려진다                        |

## 색상

### 브랜드

| 토큰                    | 값                      | 용도                                       |
| ----------------------- | ----------------------- | ------------------------------------------ |
| `--color-primary`       | `#5865f2` (blurple-500) | 주요 버튼, 선택된 회차 테두리, 입력 포커스 |
| `--color-primary-press` | `#4752c4`               | primary hover·press                        |
| `--color-link` / hover  | `#4752c4` / `#3a43a3`   | 텍스트 링크                                |
| `--color-green`         | `#35ed7e` (green-500)   | 신청 버튼, 참여 확정·공개 배지, 공개 스위치, 진행 단계 완료 |
| `--color-green-press`   | `#1fd068`               | green hover·press                          |
| `--color-magenta`       | `#ec48bd` (magenta-500) | 승인 대기 배지                             |
| `--focus-ring`          | `#00b0f4` (cyan-400)    | `:focus-visible` 2px 외곽선, offset 2px    |

<!-- 보조 단계: blurple-50 `#f1f2ff`(선택된 회차 배경) · blurple-100 `#e3e6ff`(포커스 링 4px) · green-100 `#d9fbe7` · green-600 `#1fd068`(정원 미터) · green-700 `#12a752` · magenta-100 `#fde3f4` · magenta-300 `#f59ad8` · magenta-600 `#c92f9c`(남은 자리 2개 이하, 강조 문구) -->

### 배경

| 용도                            | 토큰                                               | 값                   |
| ------------------------------- | -------------------------------------------------- | -------------------- | --------- |
| 페이지                          | `--surface-canvas`                                 | `#ffffff`            |
| 카드·헤더·입력                  | `--surface-card`                                   | `#ffffff`            |
| <!--                            | 보조 면(안내 박스, 표 머리, 활성 내비, ghost 버튼) | `--surface-raised`   | `#efeff1` |
| 눌린 면(비활성 버튼, 미터 트랙) | `--surface-sunk`                                   | `#e7e7ea`            | -->       |
| 운영자 헤더, ink 버튼, 토스트   | `--surface-ink`                                    | `#0a0d3a`            |
| ink 위 hover·활성               | `--surface-ink-raised`                             | `#1e2353`            |
| 다이얼로그 뒤                   | `--overlay-scrim`                                  | `rgba(10,13,58,.45)` |

### 텍스트

| 용도                | 토큰              | 값        |
| ------------------- | ----------------- | --------- |
| 주 텍스트(제목, 값) | `--text-strong`   | `#0a0d3a` |
| 본문                | `--text-body`     | `#23272a` |
| 보조(라벨, 메타)    | `--text-muted`    | `#333333` |
| 비활성              | `--text-disabled` | `#767676` |
| ink 위              | `--text-on-ink`   | `#ffffff` |

### 테두리

| 용도                    | 토큰               | 값        |
| ----------------------- | ------------------ | --------- |
| 구분선(헤더·푸터·표 행) | `--border-subtle`  | `#e2e4f0` |
| 입력·회차 버튼 기본     | `--border-default` | `#e2e4f0` |
| 강조                    | `--border-strong`  | `#0a0d3a` |

### 데이터/시맨틱 색상

| 용도 | 값                                            |
| ---- | --------------------------------------------- |
| 성공 | `--status-success` `#12a752` / 배경 `#d9fbe7` |
| 오류 | `--status-danger` `#ff4d6a` / 배경 `#fde4e8`  |
| 중립 | 배경 `#efeff1` / 글자 `#3a43a3`               |

### 예약 상태 배지

| 상태      | 라벨      | 배경 / 글자           |
| --------- | --------- | --------------------- |
| pending   | 승인 대기 | `#ec48bd` / `#ffffff` |
| confirmed | 참여 확정 | `#35ed7e` / `#0a0d3a` |
| rejected  | 거절됨    | `#fde4e8` / `#ff4d6a` |
| cancelled | 취소됨    | `#e7e7ea` / `#3b3f6b` |

배지는 padding `4px 12px`, radius 16px, 14px/600. 고객·운영자 화면이 같은 색을 쓴다.

클래스·회차 배지(작은 크기 `12px`/600, padding `2px 8px`): 공개 = green, 비공개·지난 회차 = 중립, 취소된 회차 = 오류. 편집 화면 제목 옆의 공개 상태(`공개 중`·`비공개`)는 기본 크기 배지를 쓴다.

승인 대기 건수처럼 처리할 양을 알리는 숫자는 magenta-600 `#c92f9c` 600으로 강조한다.

## 간격·반경·그림자

| 구분           | 값                                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 간격 단위      | 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 96px                                                                                     |
| 반경           | 6px(sm 버튼) · 12px(lg 버튼, 회차 버튼, 안내 박스) · 16px(카드, 입력, md 버튼, 배지) · 20px(다이얼로그) · 50px(내비 링크 pill) |
| 그림자         | 카드 `0 2px 24px rgba(20,20,30,.06)` · hover·다이얼로그·토스트 `0 8px 40px rgba(20,20,30,.12)`                                 |
| 최소 터치 높이 | 44px                                                                                                                           |

카드는 테두리 없이 그림자로 띄운다. 구분선은 카드 안 행 사이에만 쓴다.

## 컴포넌트

shadcn/ui 컴포넌트를 CLI로 추가한 뒤 테마 변수와 래퍼(variant·className)로 아래 값에 맞춘다. `src/components/ui/` 파일은 직접 고치지 않는다.

### 카드

```
흰 카드: bg surface-card, radius 16px, shadow 카드, padding 24~28px(운영자 폼 32px), 내부 gap 12~24px
보조 카드: bg surface-raised, 그림자 없음
클래스 목록 카드: 이미지(4:3) + 본문 padding 20px 20px 22px, gap 10px. 하단 '다음 회차' 행은 위 구분선 + 14px
  hover(포인터 기기만): translateY(-4px) + 강한 그림자, 200ms
```

### 버튼

| variant | 배경 → hover          | 글자      | 쓰는 곳                                                                     |
| ------- | --------------------- | --------- | --------------------------------------------------------------------------- |
| primary | `#5865f2` → `#4752c4` | 흰색      | 조회하기, 승인, 저장, 추가, 로그인                                          |
| green   | `#35ed7e` → `#22c967` | `#000000` | 신청 버튼(고객 화면의 핵심 동작 하나)                                       |
| ink     | `#0a0d3a` → `#1e2353` | 흰색      | 되돌릴 수 없는 동작의 확인(거절하기, 예약 취소, 회차 취소), 운영자 로그아웃 |
| ghost   | `#efeff1` → `#e7e7ea` | `#0a0d3a` | 보조 동작(돌아가기, 편집, 복사, 거절·취소 트리거)                           |
| white   | 흰색 → `#efeff1`      | `#0a0d3a` | 이미지 위 등 회색 면 위의 보조 동작                                         |

| 크기 | 높이 | padding   | 글자 | 반경 | 아이콘 |
| ---- | ---- | --------- | ---- | ---- | ------ |
| sm   | 36px | 8px 16px  | 14px | 6px  | 16px   |
| md   | 44px | 12px 20px | 16px | 16px | 18px   |
| lg   | 56px | 20px 24px | 18px | 12px | 20px   |

- 글자 굵기 500, 아이콘과 글자 간격 8px.
- 비활성: 배경 `#e7e7ea`, 글자 `#a9acc8`, `cursor: not-allowed`. 비활성 이유는 `title`이나 근처 문구로 알린다(예: "시작한 회차는 승인할 수 없어요").
- 누를 때 `scale(.97)`.
- 빨간 버튼은 만들지 않는다. 파괴적 동작은 ghost로 열고 다이얼로그의 ink 버튼으로 확정한다.

### 입력 필드

```
라벨: 14px/600 text-strong, 입력과 gap 6px
상자: min-height 52px, padding 0 16px, radius 16px, border 2px #dcdce1, bg 흰색
포커스: border #5865f2 + box-shadow 0 0 0 4px #e3e6ff
오류: border #ff4d6a, 아래 13px/500 오류 문구(#ff4d6a). 보조 설명은 같은 자리에 text-muted
비활성: bg #e7e7ea
여러 줄: 같은 규칙, min-height 120px, padding 14px 16px
필수 표시: 라벨 오른쪽 4px에 `*` 14px/600, `--color-magenta`(#ec48bd). label 밖에 두고 aria-hidden
단위: 입력 안 오른쪽 16px에 16px text-muted("분", "원"), 입력 padding-right 48px
앞 아이콘: 입력 안 왼쪽 16px에 20px text-muted(장소 MapPin), 입력 padding-left 48px
```

- 클래스 기본 정보는 2열 폼이다. 클래스명·소개·장소·준비물은 한 줄 전체, 소요 시간|비용, 결제 방법|문의처는 나란히 둔다. 640px 이하 1열.

### 회차 선택(라디오 카드)

```
행: min-height 64px, padding 12px 16px, border 2px #dcdce1, radius 12px, gap 8px
  왼쪽: 날짜 16px/700 display + 시간 14px text-muted / 오른쪽: 남은 자리
hover: border #7c86f6 · 선택(aria-checked): border #5865f2 + bg #f1f2ff · 누를 때 scale(.98)
마감: bg·border #efeff1, 글자 #a9acc8, 선택 불가
남은 자리: 14px/600 text-muted, 2자리 이하 #c92f9c, 0이면 '마감'
```

### 알림·안내

```
오류 박스: padding 12px 14px, radius 12px, bg #fde4e8, 글자 #ff4d6a 14px/500, 왼쪽 아이콘
안내 박스: padding 14px 16px, radius 12px, bg #efeff1, 글자 text-body 14px
토스트: 화면 하단 중앙(bottom 24px), bg #0a0d3a 흰 글자(오류는 #ff4d6a), radius 16px,
        padding 14px 16px 14px 18px, 최대 폭 440px, 제목 16px/700 + 설명 14px, 3.2초 후 사라짐
```

### 다이얼로그

```
scrim rgba(10,13,58,.45) · 본문 흰색, radius 20px, padding 40px, 최대 폭 480px, gap 20px
제목 28px/800 display + 닫기 아이콘 버튼 · 버튼은 오른쪽 정렬, gap 12px: [ghost 돌아가기] [ink 확정]
```

### 운영자 예약 표

```
필터: [회차 선택 320px | 예약자 검색(돋보기 아이콘)] gap 16px → 900px 이하 1열
데스크톱: 흰 카드 안 행 그리드(이름 / 회차 / 인원 56px / 예약번호 / 상태 104px / 동작 176px),
  행 padding 16px 20px, 위 구분선. 머리 행은 bg #efeff1, 13px/600 text-muted
  취소·지난 회차 행은 bg #f6f6f7
  동작은 sm 버튼(ghost 거절·예약 취소, primary 승인). 처리할 수 없는 행은 비활성 ghost 버튼에 결과를 쓴다
900px 이하: 머리 행을 숨기고 행마다 흰 카드로 바꾼다(gap 12px, padding 18px 16px).
  [이름 | 상태] / [회차] / [인원 | 예약번호(오른쪽)] / [동작] 순서, 동작 버튼은 가로로 꽉 채운다
빈 결과: 표 카드 안 가운데 정렬, padding 40px, text-muted
```

### 상태 탭

```
트랙: inline-flex, bg #efeff1, padding 4px, gap 4px, pill 반경. 가로로 넘치면 트랙만 스크롤
탭: min-height 40px, padding 8px 18px(640px 이하 8px 12px), pill, 14px/600 text-muted
선택: bg 흰색 + shadow 0 2px 10px rgba(69,42,124,.12), text-strong
```

### 스위치

```
트랙 52×32px, padding 4px, 완전한 원형 반경. 켜짐 #35ed7e, 꺼짐 #d6d8ee
손잡이 24px 흰 원, shadow 0 2px 6px rgba(10,13,58,.2), 켜지면 20px 이동(200ms, bounce)
라벨은 오른쪽 16px/500 text-strong, 전체 높이 44px. 처리 중에는 opacity .5 + not-allowed
```

### 운영자 클래스 목록·회차 행

```
클래스 행: 흰 카드 grid [썸네일 112px(4:3, radius 12px) | 본문 | 공개 스위치 + 편집], gap 20px, padding 16px
  본문: 제목 18px/700 display + 공개 배지 / 예정 회차 N개 · 승인 대기 N건(14px)
  900px 이하: 썸네일 88px, 스위치·편집 줄은 아래로 내려 양끝 정렬
회차 행: grid [일시 | 차지/정원 미터 120px | 예약 이력 140px | 동작], padding 16px 0, 위 구분선
  일시 16px/700 display, 아래에 상태 배지 또는 13px 안내(N시간 후 시작·예정)와 승인 대기 건수
  취소된 회차는 일시에 취소선 + text-muted
  회차 카드 폭 620px 이하: [일시 | 미터] / [예약 이력] / [동작] 2열
```

### 기타

- 진행 단계(신청 완료): 3칸 막대 6px. 완료 `#35ed7e`, 현재 `#f59ad8`(라벨 `#c92f9c`), 남은 단계 `#e7e7ea`.
- 정원 미터: 6px 트랙 `#e7e7ea`, 채움 `#1fd068`.
- 이미지가 없는 클래스는 연한 단색 면(`#e4e7fb`·`#e3e6ff`·`#fde3f4`·`#d9fbe7` 중 하나) 가운데에 Lucide 아이콘을 둔다.
- 예약번호: display 800, 자간 .06em, `tabular-nums`. 신청 완료 화면은 44px(모바일 34px), 자간 .08em.
- 정의 목록(예약 상세): 라벨 열 96px(모바일 80px), 행 padding 12px 0, 행 사이 구분선, 15px.

## 레이아웃

- 전체 너비: 최대 1200px, 좌우 여백 32px(640px 이하 16px). 좁은 폼(조회·로그인)은 최대 640px.
- 정렬: 좌측 정렬 기본. 운영자 로그인만 화면 중앙에 둔다.
- 헤더: 상단 고정, 높이 68px(모바일 60px), 흰 배경 + 아래 구분선. 운영자 헤더는 ink 배경, 640px 이하에서는 메뉴를 헤더 아래 줄로 내린다.
- 내비 링크: 높이 44px, padding 0 14px, pill 반경, 15px/500. 현재 페이지는 bg `#efeff1` + 600.
- 본문 padding: 위 40px 아래 96px(640px 이하 24px / 72px). 섹션 간격 40px.
- 클래스 목록: 3열, gap 24px → 900px 이하 1열.
- 클래스 상세: 본문 + 오른쪽 신청 카드(420px, 위 92px에 sticky), gap 48px → 900px 이하 1열, 신청 버튼은 하단 고정 바(흰 배경, 위 구분선, padding 12px 16px 20px)로 옮긴다.
- 클래스 편집: 왼쪽 [기본 정보 카드 · 회차 카드] + 오른쪽 보조 영역 360px(대표 이미지 · 공개 · 클래스 삭제, sticky top 92px), gap 20px 32px → 900px 이하 1열(보조 영역은 아래로, sticky 해제).
- 반응형 기준점: 900px(2열 → 1열, 표 → 카드), 640px(여백·글자 크기 축소, 2열 폼 → 1열).
- 한국어 줄바꿈은 `word-break: keep-all`, 제목은 `text-wrap: balance`.

## 타이포그래피

글꼴: 제목 `Hanken Grotesk`, 본문·UI `Plus Jakarta Sans`, 한글은 두 경우 모두 `Noto Sans KR`로 대체한다. `next/font/google`로 불러온다.

| 용도           | 스타일                                                |
| -------------- | ----------------------------------------------------- |
| 페이지 제목    | display 44px/1.15, 800, 자간 -.01em (640px 이하 30px). 운영자 화면은 36px |
| 섹션 제목      | display 28px/1.2, 700 (640px 이하 24px)               |
| 카드 제목      | display 20px/1.3, 700                                 |
| 로고           | display 22px, 900, 자간 -.02em (모바일 19px)          |
| 리드 문단      | 18px/1.55 text-body, 최대 56ch (640px 이하 16px)      |
| 본문           | 16px/1.5, 400, text-body                              |
| 작은 본문·메타 | 14px/1.5                                              |
| 캡션·표 머리   | 13px/1.45                                             |
| 라벨           | 14px/1.4, 600, text-strong                            |

## 애니메이션

- 클래스 카드 hover 이동·그림자: 200ms `cubic-bezier(.22,1,.36,1)`, 포인터 기기에서만.
- 버튼·회차 버튼 누름: scale(.97 / .98), 200ms `cubic-bezier(.34,1.56,.64,1)`.
- 테두리·배경 색 전환: 120ms.
- 토스트 등장: 아래에서 8px 올라오며 fade-in, 220ms.
- `prefers-reduced-motion: reduce`이면 위 전환과 애니메이션을 모두 끈다.
- 그 외 모든 애니메이션 금지(배경 움직임, 마키 같은 반복 애니메이션 포함).

## 아이콘

- Lucide(`lucide-react`)만 쓴다. 크기: 버튼 안 16·18·20px, 정보 항목 20px, 토스트 22px.
- 색은 글자색(`currentColor`)을 따른다. 클래스 정보 항목만 순서대로 green-700 · magenta-600 · blurple-600을 돌려 쓴다.
- 아이콘 컨테이너(둥근 배경 박스)로 감싸지 않는다. 예외: 신청 완료의 체크 원(72px, bg `#d9fbe7`, 아이콘 `#12a752`).
- 장식용 아이콘은 `aria-hidden`, 아이콘만 있는 버튼은 `aria-label`을 단다.
