#!/usr/bin/env bash
# write_dispatch.sh — write a dispatch marker JSON file before each Task() spawn.
#
# The token-ledger.sh SubagentStop hook reads this file (keyed by session_id) to
# get explicit attribution (work_item_id + agent_type) rather than relying on
# transcript-grep heuristics.
#
# Usage:
#   bash .cleargate/scripts/write_dispatch.sh <work_item_id> <agent_type>
#
# FALLBACK PATH (CR-026): The primary dispatch-marker path is the PreToolUse:Task hook
# at `.claude/hooks/pre-tool-use-task.sh`, which auto-writes the marker on every Task()
# spawn without manual orchestrator intervention. This script is retained for one-off
# Architect dispatches or spawns whose Task() prompt does not contain a parseable
# work-item marker. Use it only when the PreToolUse:Task hook cannot determine the
# work_item_id from the prompt (e.g., a generic Architect spawn not tied to a sprint item).
#
# Args:
#   $1  work_item_id  — e.g. STORY-020-02, CR-016, BUG-021
#   $2  agent_type    — one of: developer|architect|qa|reporter|devops|cleargate-wiki-contradict
#
# Env (optional):
#   CLAUDE_SESSION_ID         — session UUID of the orchestrator session
#   ORCHESTRATOR_PROJECT_DIR  — override for repo root (cross-project routing)
#
# Exit codes:
#   0  success
#   1  missing required args
#   2  no .active sprint sentinel found
#
# Output: .cleargate/sprint-runs/<sprint>/.dispatch-<session-id>.json
# Log:    .cleargate/hook-log/write_dispatch.log

set -u

# ─── Resolve repo root ──────────────────────────────────────────────────────
REPO_ROOT="${ORCHESTRATOR_PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}}"
LOG_DIR="${REPO_ROOT}/.cleargate/hook-log"
mkdir -p "${LOG_DIR}"
LOG="${LOG_DIR}/write_dispatch.log"

# ─── Validate args ──────────────────────────────────────────────────────────
if [[ $# -lt 2 || -z "${1:-}" || -z "${2:-}" ]]; then
  printf '[%s] error: usage: write_dispatch.sh <work_item_id> <agent_type>\n' "$(date -u +%FT%TZ)" >> "${LOG}"
  printf 'Usage: write_dispatch.sh <work_item_id> <agent_type>\n' >&2
  exit 1
fi

WORK_ITEM_ID="${1}"
AGENT_TYPE="${2}"

# ─── Validate agent_type ────────────────────────────────────────────────────
case "${AGENT_TYPE}" in
  developer|architect|qa|reporter|devops|cleargate-wiki-contradict)
    ;;
  *)
    printf '[%s] error: invalid agent_type: %s\n' "$(date -u +%FT%TZ)" "${AGENT_TYPE}" >> "${LOG}"
    printf 'error: invalid agent_type: %s (expected developer|architect|qa|reporter|devops|cleargate-wiki-contradict)\n' "${AGENT_TYPE}" >&2
    exit 3
    ;;
esac

# ─── Resolve active sprint ──────────────────────────────────────────────────
ACTIVE_SENTINEL="${REPO_ROOT}/.cleargate/sprint-runs/.active"
if [[ ! -f "${ACTIVE_SENTINEL}" ]]; then
  printf '[%s] error: no .active sentinel at %s\n' "$(date -u +%FT%TZ)" "${ACTIVE_SENTINEL}" >> "${LOG}"
  printf 'error: no active sprint sentinel at %s\n' "${ACTIVE_SENTINEL}" >&2
  exit 2
fi

SPRINT_ID="$(tr -d '[:space:]' < "${ACTIVE_SENTINEL}")"
if [[ -z "${SPRINT_ID}" ]]; then
  printf '[%s] error: .active sentinel is empty\n' "$(date -u +%FT%TZ)" >> "${LOG}"
  printf 'error: .active sentinel is empty\n' >&2
  exit 2
fi

SPRINT_DIR="${REPO_ROOT}/.cleargate/sprint-runs/${SPRINT_ID}"
mkdir -p "${SPRINT_DIR}"

# ─── Fallback guard (CR-026 / STORY-043-09) ─────────────────────────────────
# If the PreToolUse:Task hook already wrote a same-session auto-marker for THIS
# EXACT SPAWN (same work_item_id + agent_type + session_id), this script is a
# no-op fallback. Exit 0 without writing a duplicate marker.
#
# SPAWN-SCOPED: a stale auto-marker from a DIFFERENT prior spawn (different
# work_item_id or different agent_type) must NOT trigger a skip — it is not a
# duplicate for this spawn. Fail toward writing: when no exact same-spawn match
# is found, always write. (A duplicate is harmless; a missing marker loses
# attribution — bias toward writing.)
if [[ -n "${CLAUDE_SESSION_ID:-}" ]]; then
  for _marker in "${SPRINT_DIR}"/.dispatch-*.json; do
    [[ -f "${_marker}" ]] || continue
    _session_id="$(jq -r '.session_id // ""' "${_marker}" 2>/dev/null || true)"
    _writer="$(jq -r '.writer // ""' "${_marker}" 2>/dev/null || true)"
    _work_item_id="$(jq -r '.work_item_id // ""' "${_marker}" 2>/dev/null || true)"
    _agent_type="$(jq -r '.agent_type // ""' "${_marker}" 2>/dev/null || true)"
    if [[ "${_session_id}" == "${CLAUDE_SESSION_ID}" \
       && "${_writer}" == pre-tool-use-task.sh* \
       && "${_work_item_id}" == "${WORK_ITEM_ID}" \
       && "${_agent_type}" == "${AGENT_TYPE}" ]]; then
      printf '[%s] fallback: same-spawn auto-marker present for session=%s work_item=%s agent=%s (writer=%s), no-op\n' \
        "$(date -u +%FT%TZ)" "${CLAUDE_SESSION_ID}" "${WORK_ITEM_ID}" "${AGENT_TYPE}" "${_writer}" >> "${LOG}"
      exit 0
    fi
  done
fi

# ─── Resolve session_id ─────────────────────────────────────────────────────
SESSION_ID="${CLAUDE_SESSION_ID:-}"

if [[ -z "${SESSION_ID}" ]]; then
  # Fall back to scanning the most recent transcript filename (UUID) under
  # ~/.claude/projects/-*-ClearGate/ pattern.
  TRANSCRIPT_DIR="${HOME}/.claude/projects"
  if [[ -d "${TRANSCRIPT_DIR}" ]]; then
    SESSION_ID="$(find "${TRANSCRIPT_DIR}" -maxdepth 2 -name '*.jsonl' 2>/dev/null \
      | sort -t '/' -k1 2>/dev/null | tail -1 \
      | xargs -I{} basename {} .jsonl 2>/dev/null || true)"
  fi
fi

if [[ -z "${SESSION_ID}" ]]; then
  # Final fallback: generate a pseudo-id from timestamp
  SESSION_ID="fallback-$(date -u +%s)"
  printf '[%s] warn: no CLAUDE_SESSION_ID and no transcript found; using %s\n' "$(date -u +%FT%TZ)" "${SESSION_ID}" >> "${LOG}"
fi

# ─── Resolve cleargate version ───────────────────────────────────────────────
# Read from cleargate-cli/package.json if available; otherwise use "unknown"
PKG_JSON="${REPO_ROOT}/cleargate-cli/package.json"
CG_VERSION="unknown"
if [[ -f "${PKG_JSON}" ]]; then
  CG_VERSION="$(jq -r '.version // "unknown"' "${PKG_JSON}" 2>/dev/null || echo "unknown")"
fi

# ─── Write dispatch file atomically ─────────────────────────────────────────
# BUG-029 fix: uniquify the dispatch filename so that two parallel Task()
# spawns from the same orchestrator session (same SESSION_ID) do NOT collide
# on the same target path. Pattern matches pre-tool-use-task.sh:115.
# Old: .dispatch-${SESSION_ID}.json  ← second parallel write silently overwrites first.
# New: .dispatch-${TS}-${PID}-${RAND}.json  ← each spawn gets a distinct file.
TS_EPOCH="$(date -u +%s)"
DISPATCH_TARGET="${SPRINT_DIR}/.dispatch-${TS_EPOCH}-$$-${RANDOM}.json"
SPAWNED_AT="$(date -u +%FT%TZ)"

DISPATCH_JSON="$(jq -cn \
  --arg work_item_id "${WORK_ITEM_ID}" \
  --arg agent_type "${AGENT_TYPE}" \
  --arg spawned_at "${SPAWNED_AT}" \
  --arg session_id "${SESSION_ID}" \
  --arg writer "write_dispatch.sh@cleargate-${CG_VERSION}" \
  --arg run_id "${RUN_ID:-}" \
  '{
    work_item_id: $work_item_id,
    agent_type: $agent_type,
    spawned_at: $spawned_at,
    session_id: $session_id,
    writer: $writer
  }
  | if $run_id == "" then . else .run_id = $run_id end')"

# Atomic write via mktemp + mv (rename is atomic on POSIX same-fs)
TMP="$(mktemp "${SPRINT_DIR}/.dispatch-tmp-XXXXXX")"
printf '%s\n' "${DISPATCH_JSON}" > "${TMP}"
mv "${TMP}" "${DISPATCH_TARGET}"

printf '[%s] wrote dispatch: sprint=%s session=%s work_item=%s agent=%s\n' \
  "${SPAWNED_AT}" "${SPRINT_ID}" "${SESSION_ID}" "${WORK_ITEM_ID}" "${AGENT_TYPE}" >> "${LOG}"

printf '%s\n' "${DISPATCH_TARGET}"
exit 0
