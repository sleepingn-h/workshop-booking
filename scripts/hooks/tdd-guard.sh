#!/bin/bash
# TDD Guard Hook — Codex PreToolUse[apply_patch] (.codex/hooks.json)
# 구현 코드를 작성하려 할 때, 해당 모듈의 테스트 파일이 먼저 존재하는지 체크.
# 테스트 없이 구현 코드를 작성하려 하면 차단.
#
# Codex의 apply_patch는 file_path 대신 패치 본문을 tool_input.command로 넘긴다.
#   *** Add File: <path> / *** Update File: <path> / *** Move to: <path>
# 헤더에서 대상 파일을 뽑아 파일마다 검사한다. (Delete File은 검사하지 않는다.)

INPUT=$(cat)
PATCH=$(echo "$INPUT" | jq -r '.tool_input.command // .tool_input.input // .tool_input.patch // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
[ -z "$CWD" ] && CWD=$(pwd)

# 패치가 없으면 통과
if [ -z "$PATCH" ]; then
  exit 0
fi

# 프로젝트가 아직 스캐폴딩되지 않았으면(package.json 없음) TDD 가드를 건너뛴다.
# 테스트 프레임워크가 깔리기 전(MVP 부트스트랩)에는 강제할 대상이 없기 때문.
# package.json이 생기면 이후 모든 lib/소스 편집에 TDD가 적용된다.
ROOT=$(git -C "$CWD" rev-parse --show-toplevel 2>/dev/null || echo "$CWD")
if [ ! -f "$ROOT/package.json" ]; then
  exit 0
fi

# 파일 하나를 검사한다. 테스트가 없으면 BASENAME을 출력한다.
check_file() {
  FILE_PATH="$1"
  case "$FILE_PATH" in
    /*) ;;
    *) FILE_PATH="$CWD/$FILE_PATH" ;;
  esac

  # 테스트 파일 자체를 수정하는 건 허용
  case "$FILE_PATH" in
    *test*|*spec*|*.test.*|*.spec.*|*__tests__*)
      return 0
      ;;
  esac

  # .codex/ 인프라(설정·훅)와 workflows/ 오케스트레이션 스크립트는 TDD 비대상 — 허용.
  # 이유: 워크플로우 스크립트는 런타임이 주입하는 전역(agent/pipeline/log)에 의존하는 오케스트레이션
  #       정의로, lib/services 비즈니스 로직이 아니며 유닛 테스트를 붙일 수 없다.
  case "$FILE_PATH" in
    */.codex/*|*/workflows/*)
      return 0
      ;;
  esac

  # 설정/타입/스타일 파일은 테스트 불필요 — 허용
  case "$FILE_PATH" in
    *.json|*.css|*.scss|*.md|*.yml|*.yaml|*.env*|*.config.*|*tailwind*|*postcss*|*next.config*|*tsconfig*)
      return 0
      ;;
  esac

  # types/ 폴더는 테스트 불필요 — 허용
  case "$FILE_PATH" in
    */types/*|*/types.ts|*/types.d.ts)
      return 0
      ;;
  esac

  # Next.js 프레임워크 파일은 허용 (layout, page, loading, error, not-found, global styles)
  case "$FILE_PATH" in
    */layout.tsx|*/layout.ts|*/page.tsx|*/page.ts|*/loading.tsx|*/error.tsx|*/not-found.tsx|*/globals.css)
      return 0
      ;;
  esac

  # lib/ 또는 소스 파일이면 테스트 파일 존재 여부 확인
  case "$FILE_PATH" in
    *.ts|*.tsx|*.js|*.jsx)
      # 파일명 추출
      DIR=$(dirname "$FILE_PATH")
      BASENAME=$(basename "$FILE_PATH" | sed -E 's/\.(ts|tsx|js|jsx)$//')

      # 테스트 파일 후보 경로들
      TEST_FOUND=false

      # 같은 폴더에 .test 파일
      for EXT in ts tsx js jsx; do
        if [ -f "${DIR}/${BASENAME}.test.${EXT}" ] || [ -f "${DIR}/${BASENAME}.spec.${EXT}" ]; then
          TEST_FOUND=true
          break
        fi
      done

      # __tests__ 폴더
      if [ "$TEST_FOUND" = false ]; then
        PARENT=$(dirname "$DIR")
        for EXT in ts tsx js jsx; do
          if [ -f "${PARENT}/__tests__/${BASENAME}.test.${EXT}" ] || [ -f "${DIR}/__tests__/${BASENAME}.test.${EXT}" ]; then
            TEST_FOUND=true
            break
          fi
        done
      fi

      # src/__tests__/ 루트 테스트 폴더
      if [ "$TEST_FOUND" = false ]; then
        for EXT in ts tsx js jsx; do
          if [ -f "${ROOT}/src/__tests__/${BASENAME}.test.${EXT}" ]; then
            TEST_FOUND=true
            break
          fi
        done
      fi

      if [ "$TEST_FOUND" = false ]; then
        echo "$BASENAME"
      fi
      ;;
  esac
}

MISSING=""
while IFS= read -r F; do
  [ -z "$F" ] && continue
  M=$(check_file "$F")
  [ -n "$M" ] && MISSING="${MISSING:+$MISSING, }$M"
done < <(printf '%s\n' "$PATCH" | sed -nE 's/^\*\*\* (Add File|Update File|Move to): (.*)$/\2/p')

if [ -n "$MISSING" ]; then
  REASON="TDD GUARD: '${MISSING}'에 대한 테스트 파일이 존재하지 않습니다. 구현 코드를 작성하기 전에 테스트를 먼저 작성하세요. (테스트 파일 예: <이름>.test.ts)"
  jq -n --arg reason "$REASON" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
fi

exit 0
