#!/bin/bash
# Danger Guard Hook — Codex PreToolUse[Bash] (.codex/hooks.json)
# rm -rf, git push --force, git reset --hard, DROP TABLE 같은 되돌리기 어려운 명령을 차단한다.

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if [ -z "$CMD" ]; then
  exit 0
fi

if printf '%s' "$CMD" | grep -qiE 'rm[[:space:]]+-rf|git[[:space:]]+push[[:space:]].*(--force|-f([[:space:]]|$))|git[[:space:]]+reset[[:space:]]+--hard|DROP[[:space:]]+TABLE'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "BLOCKED: 위험한 명령어가 감지되었습니다."
    }
  }'
fi

exit 0
