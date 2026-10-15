#!/bin/bash
# Verify Hook — Codex Stop (.codex/hooks.json)
# 턴을 끝내기 전에 lint → build → test를 실행하고, 실패하면 출력 끝부분을 넘겨 Codex가 이어서 고치게 한다.

INPUT=$(cat)
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
[ -z "$CWD" ] && CWD=$(pwd)

# 이미 Stop hook으로 이어진 턴이면 다시 막지 않는다(무한 반복 방지).
if [ "$(echo "$INPUT" | jq -r '.stop_hook_active // false')" = "true" ]; then
  exit 0
fi

# 프로젝트가 아직 스캐폴딩되지 않았으면(package.json 없음) 검증할 대상이 없다.
ROOT=$(git -C "$CWD" rev-parse --show-toplevel 2>/dev/null || echo "$CWD")
if [ ! -f "$ROOT/package.json" ]; then
  exit 0
fi

LOG=$(cd "$ROOT" && { npm run lint && npm run build && npm run test; } 2>&1)
if [ $? -ne 0 ]; then
  REASON="VERIFY: lint/build/test 중 실패가 있습니다. 아래 출력을 보고 수정하세요.

$(printf '%s\n' "$LOG" | tail -n 60)"
  jq -n --arg reason "$REASON" '{decision: "block", reason: $reason}'
fi

exit 0
