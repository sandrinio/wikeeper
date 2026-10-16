#!/usr/bin/env bash
# run_script.sh — Arbitrary-command wrapper that captures stdout/stderr independently
# and writes a structured JSON incident file on non-zero exit.
#
# Interface: bash run_script.sh <command> [args...]
#   <command>  — any executable on PATH (e.g. node, bash, sh, true, false)
#   [args...]  — forwarded to the command unchanged
#
# Example (node script):
#   bash run_script.sh node .cleargate/scripts/update_state.mjs STORY-01 Done
# Example (bash script):
#   bash run_script.sh bash .cleargate/scripts/pre_gate_runner.sh qa .worktrees/X sprint/S-01
#
# On success (exit 0): stdout+stderr are passed through; no incident file written.
# On failure (exit ≠ 0): stdout+stderr are passed through AND a JSON incident is
#   written to .cleargate/sprint-runs/<active-sprint>/.script-incidents/<ts>-<hash>.json
#
# Self-exemption: if RUN_SCRIPT_ACTIVE=1 is already set, the wrapper is already
# running — do not nest. Execute the command directly to avoid infinite recursion.
# This guard implements the self-exempt contract documented in SKILL.md §C.x.
#
# Env vars read:
#   ORCHESTRATOR_PROJECT_DIR  — project root override (falls back to CLAUDE_PROJECT_DIR,
#                               then to git rev-parse --show-toplevel, then script dir ancestor)
#   AGENT_TYPE                — populates incident JSON agent_type field (null if empty)
#   WORK_ITEM_ID              — populates incident JSON work_item_id field (null if empty)
#   RUN_SCRIPT_ACTIVE         — self-exemption guard (set to 1 by this wrapper)
#   CLEARGATE_STATE_FILE      — explicitly forwarded/exported to child (F8, CR-080)
#   CLAUDE_PROJECT_DIR        — explicitly forwarded/exported to child (F8, CR-080)
#   RUN_SCRIPT_ENV_ALLOWLIST  — optional: comma/space-separated list of env var names;
#                               when set, only those vars (plus the always-forwarded set
#                               above) are guaranteed exported to the child. Default:
#                               full inherited-environment pass-through (allowlist is
#                               opt-in only — do NOT set this unless you need isolation).

set -euo pipefail

# ---------------------------------------------------------------------------
# Self-exemption guard — do not wrap recursively
# ---------------------------------------------------------------------------
if [[ "${RUN_SCRIPT_ACTIVE:-}" == "1" ]]; then
  # Already inside a wrapper invocation; pass through directly, no JSON capture.
  # F8 (CR-080): guarantee ClearGate config vars are exported even on this fast path.
  [[ -n "${CLEARGATE_STATE_FILE:-}"     ]] && export CLEARGATE_STATE_FILE
  [[ -n "${ORCHESTRATOR_PROJECT_DIR:-}" ]] && export ORCHESTRATOR_PROJECT_DIR
  [[ -n "${CLAUDE_PROJECT_DIR:-}"       ]] && export CLAUDE_PROJECT_DIR
  [[ -n "${AGENT_TYPE:-}"              ]] && export AGENT_TYPE
  [[ -n "${WORK_ITEM_ID:-}"            ]] && export WORK_ITEM_ID
  exec "$@"
fi

# ---------------------------------------------------------------------------
# Usage guard
# ---------------------------------------------------------------------------
if [[ $# -lt 1 ]]; then
  echo "Usage: bash run_script.sh <command> [args...]" >&2
  exit 2
fi

# ---------------------------------------------------------------------------
# Resolve project root for incident file path
# ---------------------------------------------------------------------------
_resolve_project_root() {
  # Priority: ORCHESTRATOR_PROJECT_DIR → CLAUDE_PROJECT_DIR → git toplevel → script dir ancestor
  if [[ -n "${ORCHESTRATOR_PROJECT_DIR:-}" ]]; then
    echo "$ORCHESTRATOR_PROJECT_DIR"
    return
  fi
  if [[ -n "${CLAUDE_PROJECT_DIR:-}" ]]; then
    echo "$CLAUDE_PROJECT_DIR"
    return
  fi
  if _root=$(git rev-parse --show-toplevel 2>/dev/null); then
    echo "$_root"
    return
  fi
  # Fallback: assume run_script.sh lives in <repo>/.cleargate/scripts/
  echo "$(cd "$(dirname "${BASH_SOURCE[0]}")" && cd ../.. && pwd)"
}

PROJECT_ROOT="$(_resolve_project_root)"
SPRINT_RUNS_DIR="${PROJECT_ROOT}/.cleargate/sprint-runs"
ACTIVE_FILE="${SPRINT_RUNS_DIR}/.active"

# Determine sprint incident dir
if [[ -f "$ACTIVE_FILE" ]]; then
  SPRINT_ID="$(cat "$ACTIVE_FILE" | tr -d '[:space:]')"
  INCIDENTS_DIR="${SPRINT_RUNS_DIR}/${SPRINT_ID}/.script-incidents"
else
  # No active sprint sentinel → write to _off-sprint bucket
  INCIDENTS_DIR="${SPRINT_RUNS_DIR}/_off-sprint/.script-incidents"
fi

# ---------------------------------------------------------------------------
# Capture stdout + stderr to temp files
# ---------------------------------------------------------------------------
STDOUT_TMP="$(mktemp)"
STDERR_TMP="$(mktemp)"
trap 'rm -f "$STDOUT_TMP" "$STDERR_TMP"' EXIT

# Mark self as active before running the wrapped command
export RUN_SCRIPT_ACTIVE=1

# F8 (CR-080): explicitly export the documented ClearGate config vars so they
# reach the child regardless of whether the caller used `export` or plain assignment.
# Default = full inherited-environment pass-through; allowlist is opt-in only.
[[ -n "${CLEARGATE_STATE_FILE:-}"     ]] && export CLEARGATE_STATE_FILE
[[ -n "${ORCHESTRATOR_PROJECT_DIR:-}" ]] && export ORCHESTRATOR_PROJECT_DIR
[[ -n "${CLAUDE_PROJECT_DIR:-}"       ]] && export CLAUDE_PROJECT_DIR
[[ -n "${AGENT_TYPE:-}"              ]] && export AGENT_TYPE
[[ -n "${WORK_ITEM_ID:-}"            ]] && export WORK_ITEM_ID

# Optional allowlist: when RUN_SCRIPT_ENV_ALLOWLIST is set (comma/space-separated
# var names), restrict env to only those vars + the always-forwarded set above.
# This is opt-in isolation — never the default.
if [[ -n "${RUN_SCRIPT_ENV_ALLOWLIST:-}" ]]; then
  _allowed_env=""
  for _var in ${RUN_SCRIPT_ENV_ALLOWLIST//,/ }; do
    _val="${!_var:-}"
    [[ -n "$_val" ]] && _allowed_env="${_allowed_env}${_var}=${_val} "
  done
fi

EXIT_CODE=0
"$@" >"$STDOUT_TMP" 2>"$STDERR_TMP" || EXIT_CODE=$?

# ---------------------------------------------------------------------------
# Always pass through stdout + stderr to the caller
# ---------------------------------------------------------------------------
cat "$STDOUT_TMP"
cat "$STDERR_TMP" >&2

# ---------------------------------------------------------------------------
# On success: nothing more to do
# ---------------------------------------------------------------------------
if [[ $EXIT_CODE -eq 0 ]]; then
  exit 0
fi

# ---------------------------------------------------------------------------
# On failure: write structured JSON incident file
# ---------------------------------------------------------------------------
MAX_BYTES=4096
TRUNCATION_SUFFIX="... [truncated]"

_truncate_stream() {
  # Byte-correct truncation: use head -c for POSIX byte-count (not bash ${var:0:N}
  # which is char-index — wrong for UTF-8 multi-byte input).
  # Trade-off: output may end with a partial multi-byte char boundary; downstream
  # Node.js JSON.stringify escapes the partial sequence, producing valid JSON.
  local file="$1"
  local file_bytes
  file_bytes="$(wc -c < "$file")"
  if [[ $file_bytes -le $MAX_BYTES ]]; then
    # File fits within budget — emit as-is (no suffix)
    head -c "$MAX_BYTES" "$file"
  else
    # Truncation occurred — emit first MAX_BYTES bytes then TRUNCATION_SUFFIX
    printf '%s' "$(head -c "$MAX_BYTES" "$file")${TRUNCATION_SUFFIX}"
  fi
}

STDOUT_CAPTURED="$(_truncate_stream "$STDOUT_TMP")"
STDERR_CAPTURED="$(_truncate_stream "$STDERR_TMP")"

# Build filename: <ts>-<hash>.json
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
TS_FILE="$(date -u +%Y%m%dT%H%M%SZ)"
# Hash the full command string (first arg + all args)
HASH="$(printf '%s' "$*" | shasum -a 1 | cut -c1-12)"
INCIDENT_FILE="${INCIDENTS_DIR}/${TS_FILE}-${HASH}.json"

# Ensure incident directory exists
mkdir -p "$INCIDENTS_DIR"

# Collect context
COMMAND="$1"
shift
ARGS_JSON="["
FIRST=1
for ARG in "$@"; do
  if [[ $FIRST -eq 1 ]]; then
    FIRST=0
  else
    ARGS_JSON="${ARGS_JSON},"
  fi
  # JSON-escape the arg: replace \ with \\, " with \", newlines with \n
  ARG_ESCAPED="${ARG//\\/\\\\}"
  ARG_ESCAPED="${ARG_ESCAPED//\"/\\\"}"
  ARG_ESCAPED="${ARG_ESCAPED//$'\n'/\\n}"
  ARGS_JSON="${ARGS_JSON}\"${ARG_ESCAPED}\""
done
ARGS_JSON="${ARGS_JSON}]"

CWD="$(pwd)"

# Encode agent_type + work_item_id (null if empty)
AGENT_TYPE_VAL="${AGENT_TYPE:-}"
WORK_ITEM_ID_VAL="${WORK_ITEM_ID:-}"

if [[ -z "$AGENT_TYPE_VAL" ]]; then
  AGENT_TYPE_JSON="null"
else
  AGENT_TYPE_JSON="\"${AGENT_TYPE_VAL}\""
fi

if [[ -z "$WORK_ITEM_ID_VAL" ]]; then
  WORK_ITEM_ID_JSON="null"
else
  WORK_ITEM_ID_JSON="\"${WORK_ITEM_ID_VAL}\""
fi

# JSON-encode captured streams (escape backslash, double-quote, and newlines)
_json_str() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/\\r}"
  printf '%s' "$s"
}

STDOUT_JSON="$(_json_str "$STDOUT_CAPTURED")"
STDERR_JSON="$(_json_str "$STDERR_CAPTURED")"
COMMAND_JSON="$(_json_str "$COMMAND")"
CWD_JSON="$(_json_str "$CWD")"

cat > "$INCIDENT_FILE" <<JSON
{
  "ts": "${TS}",
  "command": "${COMMAND_JSON}",
  "args": ${ARGS_JSON},
  "cwd": "${CWD_JSON}",
  "exit_code": ${EXIT_CODE},
  "stdout": "${STDOUT_JSON}",
  "stderr": "${STDERR_JSON}",
  "agent_type": ${AGENT_TYPE_JSON},
  "work_item_id": ${WORK_ITEM_ID_JSON}
}
JSON

exit $EXIT_CODE
