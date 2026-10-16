#!/usr/bin/env bash
# pre-tool-use-task.sh — PreToolUse:Task|Agent hook.
#
# CR-026: Auto-write a dispatch marker on every subagent spawn so the
# SubagentStop hook (token-ledger.sh) can attribute tokens to the correct
# work item and agent without relying on transcript-grep heuristics.
#
# This hook addresses BUG-024 §3.1 Defect 3: manual write_dispatch.sh calls
# were unreliable (~5 calls vs ~19 spawns in SPRINT-18). The hook fires
# automatically on every subagent spawn inside the orchestrator session.
#
# BUG-068: the host build renamed the dispatch tool from "Task" to "Agent",
# which silently disabled this hook (the mismatch exited before logging
# anything). The guard below now accepts tool_name in {Task, Agent} OR any
# tool_name carrying tool_input.subagent_type, and logs every rejection.
#
# Input: JSON on stdin from Claude Code with fields:
#   session_id, transcript_path, cwd, hook_event_name, tool_name, tool_input
#   For a subagent spawn, tool_input has: subagent_type, description, prompt.
#
# Output: writes .cleargate/sprint-runs/<sprint>/.dispatch-<ts>-<pid>-<rand>.json
#   with { work_item_id, agent_type, spawned_at, session_id, writer }
#   Uniquified filename prevents collision under parallel Task() spawns.
#   SubagentStop hook uses newest-file lookup (ls -t) to consume it.
#
# Log: .cleargate/hook-log/pre-tool-use-task.log
#
# Exit code: 0 always. Never blocks a subagent spawn.
#
# Banner-immunity: reads tool_input.prompt directly from the JSON payload —
# no transcript involvement, so the SessionStart blocked-items banner cannot
# poison this path (contrast with token-ledger.sh's transcript-grep fallback).

set -u

# Read stdin once (STORY-058-11: before the repo root, which takes the
# payload's cwd when neither env var is set).
INPUT="$(cat)"

# ─── Resolve repo root (matches token-ledger.sh + pending-task-sentinel.sh) ──
# STORY-058-11: harness-neutral shim (lib/harness.sh), orchestrator-first —
# ORCHESTRATOR_PROJECT_DIR, then CLAUDE_PROJECT_DIR, then the git top level of
# the payload's cwd, then the current dir.
. "$(dirname "${BASH_SOURCE[0]}")/lib/harness.sh"
REPO_ROOT="$(cg_repo_root orchestrator-first "${INPUT}")"
LOG_DIR="${REPO_ROOT}/.cleargate/hook-log"
mkdir -p "${LOG_DIR}"
HOOK_LOG="${LOG_DIR}/pre-tool-use-task.log"
ACTIVE_SENTINEL="${REPO_ROOT}/.cleargate/sprint-runs/.active"

TS="$(date -u +%FT%TZ)"

# ─── Extract tool_name to confirm this is a subagent spawn ────────────────────
TOOL_NAME="$(printf '%s' "${INPUT}" | jq -r '.tool_name // empty' 2>/dev/null)"
SUBAGENT_TYPE_PROBE="$(printf '%s' "${INPUT}" | jq -r '.tool_input.subagent_type // empty' 2>/dev/null)"
case "${TOOL_NAME}" in
  Task|Agent) ;;
  *)
    if [[ -z "${SUBAGENT_TYPE_PROBE}" ]]; then
      printf '[%s] no marker: rejected tool_name=%s (not Task/Agent, no tool_input.subagent_type)\n' \
        "${TS}" "${TOOL_NAME:-<empty>}" >> "${HOOK_LOG}"
      exit 0
    fi
    ;;
esac

# ─── Resolve active sprint via sentinel ───────────────────────────────────────
if [[ ! -f "${ACTIVE_SENTINEL}" ]]; then
  printf '[%s] no .active sentinel — dispatch marker skipped (off-sprint)\n' "${TS}" >> "${HOOK_LOG}"
  exit 0
fi

SPRINT_ID="$(tr -d '[:space:]' < "${ACTIVE_SENTINEL}")"
if [[ -z "${SPRINT_ID}" ]]; then
  printf '[%s] .active sentinel is empty — dispatch marker skipped\n' "${TS}" >> "${HOOK_LOG}"
  exit 0
fi

SPRINT_DIR="${REPO_ROOT}/.cleargate/sprint-runs/${SPRINT_ID}"
mkdir -p "${SPRINT_DIR}"

# ─── Extract subagent_type ────────────────────────────────────────────────────
AGENT_TYPE="$(printf '%s' "${INPUT}" | jq -r '.tool_input.subagent_type // empty' 2>/dev/null)"
ALLOW_LIST="architect developer qa reporter cleargate-wiki-contradict"
if [[ -z "${AGENT_TYPE}" ]] || ! printf '%s\n' ${ALLOW_LIST} | grep -qxF "${AGENT_TYPE}"; then
  printf '[%s] no marker: agent_type absent or not in allow-list (%s)\n' "${TS}" "${AGENT_TYPE:-<empty>}" >> "${HOOK_LOG}"
  exit 0
fi

# ─── Extract work_item_id from first 5 lines of tool_input.prompt ─────────────
# Regex: (STORY=?NNN-NN | BUG-NNN | EPIC-NNN | CR-NNN | PROPOSAL-NNN | HOTFIX-NNN)
PROMPT_HEAD="$(printf '%s' "${INPUT}" | jq -r '.tool_input.prompt // ""' 2>/dev/null | head -5)"
if [[ -z "${PROMPT_HEAD}" ]]; then
  printf '[%s] no marker: prompt empty or unreadable\n' "${TS}" >> "${HOOK_LOG}"
  exit 0
fi

WORK_ITEM_RAW="$(printf '%s' "${PROMPT_HEAD}" \
  | grep -oE '(STORY=?[0-9]{3}-[0-9]{2}|BUG-[0-9]+|EPIC-[0-9]+|CR-[0-9]+|PROPOSAL-[0-9]+|HOTFIX-[0-9]+)' \
  | head -1)"

if [[ -z "${WORK_ITEM_RAW}" ]]; then
  printf '[%s] no marker: regex miss (agent=%s prompt_head=%s)\n' \
    "${TS}" "${AGENT_TYPE}" "$(printf '%s' "${PROMPT_HEAD}" | head -1 | cut -c1-60)" >> "${HOOK_LOG}"
  exit 0
fi

# Normalize STORY=NNN-NN → STORY-NNN-NN
WORK_ITEM_ID="$(printf '%s' "${WORK_ITEM_RAW}" | sed 's/=/\-/')"

# ─── Resolve orchestrator session ID ─────────────────────────────────────────
# Path-B: uniquified filename makes session ID irrelevant for lookup.
# We embed it in the JSON body for forensic value only.
# GOTCHA-5: CLAUDE_SESSION_ID may be unset on nested spawns; fall back to stdin payload.
SESSION_ID="${CLAUDE_SESSION_ID:-}"
if [[ -z "${SESSION_ID}" ]]; then
  SESSION_ID="$(printf '%s' "${INPUT}" | jq -r '.session_id // empty' 2>/dev/null)"
fi
[[ -z "${SESSION_ID}" ]] && SESSION_ID="unknown"

# ─── Resolve cleargate version ────────────────────────────────────────────────
PKG_JSON="${REPO_ROOT}/cleargate-cli/package.json"
CG_VERSION="unknown"
if [[ -f "${PKG_JSON}" ]]; then
  CG_VERSION="$(jq -r '.version // "unknown"' "${PKG_JSON}" 2>/dev/null || echo "unknown")"
fi

# ─── Write dispatch file atomically (mktemp + mv, matches write_dispatch.sh:110-112) ──
# Uniquified filename: .dispatch-<ts-epoch>-<pid>-<random>.json
# Prevents collision under parallel Task() spawns; newest-file lookup at SubagentStop.
SPAWNED_AT="${TS}"
DISPATCH_FILENAME=".dispatch-$(date -u +%s)-$$-${RANDOM}.json"
DISPATCH_TARGET="${SPRINT_DIR}/${DISPATCH_FILENAME}"

DISPATCH_JSON="$(jq -cn \
  --arg work_item_id "${WORK_ITEM_ID}" \
  --arg agent_type "${AGENT_TYPE}" \
  --arg spawned_at "${SPAWNED_AT}" \
  --arg session_id "${SESSION_ID}" \
  --arg writer "pre-tool-use-task.sh@cleargate-${CG_VERSION}" \
  '{
    work_item_id: $work_item_id,
    agent_type: $agent_type,
    spawned_at: $spawned_at,
    session_id: $session_id,
    writer: $writer
  }' 2>/dev/null)"

if [[ -z "${DISPATCH_JSON}" ]]; then
  printf '[%s] error: jq failed to build dispatch JSON\n' "${TS}" >> "${HOOK_LOG}"
  exit 0
fi

TMP="$(mktemp "${SPRINT_DIR}/.dispatch-tmp-XXXXXX" 2>/dev/null)"
if [[ -z "${TMP}" ]]; then
  printf '[%s] error: mktemp failed for dispatch file\n' "${TS}" >> "${HOOK_LOG}"
  exit 0
fi
printf '%s\n' "${DISPATCH_JSON}" > "${TMP}"
mv "${TMP}" "${DISPATCH_TARGET}"

printf '[%s] wrote dispatch: sprint=%s work_item=%s agent=%s file=%s\n' \
  "${TS}" "${SPRINT_ID}" "${WORK_ITEM_ID}" "${AGENT_TYPE}" "${DISPATCH_FILENAME}" >> "${HOOK_LOG}"

exit 0
