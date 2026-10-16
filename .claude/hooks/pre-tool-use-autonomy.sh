#!/usr/bin/env bash
# pre-tool-use-autonomy.sh — PreToolUse:AskUserQuestion soft-warning hook (STORY-071-01)
#
# CR-071: Logs a warning when an agent issues AskUserQuestion during an active sprint.
# Soft mode — ALWAYS exits 0 (never blocks the call). Observability only.
#
# Inputs:
#   stdin: Claude Code PreToolUse JSON payload with tool_name, tool_input, etc.
#   env:   CLAUDE_PROJECT_DIR (project root; fallback: git top level of the
#          payload cwd, then the current dir — lib/harness.sh, STORY-058-11)
#
# Output:
#   Appends to .cleargate/hook-log/autonomy-warnings.log when conditions are met.
#   Tab-separated columns: <iso-timestamp>\tAskUserQuestion\t<agent>\t<question-summary>
#
# Conditions for logging:
#   1. tool_name == "AskUserQuestion"
#   2. .cleargate/sprint-runs/.active exists and is non-empty
#   3. corresponding state.json sprint_status == "Active"
#
# Exit code: 0 always (soft mode — never blocks).

set -u

PAYLOAD="$(cat 2>/dev/null || true)"

# If jq is absent, degrade gracefully (exit 0, no log).
if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

# STORY-058-11: harness-neutral repo root (lib/harness.sh) — CLAUDE_PROJECT_DIR,
# then the git top level of the payload's cwd, then the current dir.
. "$(dirname "${BASH_SOURCE[0]}")/lib/harness.sh"
REPO_ROOT="$(cg_repo_root claude-first "${PAYLOAD}")"

TOOL=$(printf '%s' "$PAYLOAD" | jq -r '.tool_name // empty' 2>/dev/null || true)
[ "$TOOL" = "AskUserQuestion" ] || exit 0

ACTIVE_FILE="${REPO_ROOT}/.cleargate/sprint-runs/.active"
[ -s "$ACTIVE_FILE" ] || exit 0

SPRINT_ID="$(cat "$ACTIVE_FILE" 2>/dev/null || true)"
[ -n "$SPRINT_ID" ] || exit 0

STATE_FILE="${REPO_ROOT}/.cleargate/sprint-runs/$SPRINT_ID/state.json"
[ -f "$STATE_FILE" ] || exit 0

STATUS=$(jq -r '.sprint_status // empty' "$STATE_FILE" 2>/dev/null || true)
[ "$STATUS" = "Active" ] || exit 0

LOG="${REPO_ROOT}/.cleargate/hook-log/autonomy-warnings.log"
mkdir -p "$(dirname "$LOG")" 2>/dev/null || true

QUESTION_SUMMARY=$(printf '%s' "$PAYLOAD" | jq -r '.tool_input.question // ""' 2>/dev/null | head -c 200 || true)

DISPATCH_DIR="${REPO_ROOT}/.cleargate/sprint-runs/$SPRINT_ID"
AGENT=$(ls -t "$DISPATCH_DIR"/.dispatch-*.json 2>/dev/null | head -1 | \
  xargs -I {} jq -r '.agent_type // "unknown"' {} 2>/dev/null || echo "unknown")
[ -n "$AGENT" ] || AGENT="unknown"

printf '%s\tAskUserQuestion\t%s\t%s\n' "$(date -u +%FT%TZ)" "$AGENT" "$QUESTION_SUMMARY" >> "$LOG" 2>/dev/null || true

exit 0
