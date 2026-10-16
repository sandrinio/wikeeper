#!/usr/bin/env bash
# pre-edit-gate.sh — CR-008 Phase B: planning-first PreToolUse gate
#
# Registered as a PreToolUse hook for Edit|Write tool calls.
# In warn mode (default), logs would-block decisions but always exits 0.
# In enforce mode, exits 2 (BUG-089: resolved via the shared `cleargate hook
# signal` handler, host-honored — Claude Code only blocks on exit 2, not the
# historical bare `exit 1`) to block the tool call when planning is missing.
#
# Mode controlled by CLEARGATE_PLANNING_GATE_MODE (warn|enforce|off). Default: warn.
# Bypass: CLEARGATE_PLANNING_BYPASS=1 → skip check, log bypass=true, exit 0.

set -u

# Claude Code sends JSON on stdin: {"tool_name":"Edit","tool_input":{"file_path":"..."}}
# STORY-058-11: read it once, before the repo root, which takes the payload's
# cwd when no CLAUDE_PROJECT_DIR is set (lib/harness.sh).
INPUT=$(cat)
. "$(dirname "${BASH_SOURCE[0]}")/lib/harness.sh"
REPO_ROOT="$(cg_repo_root claude-first "${INPUT}")"
MODE="${CLEARGATE_PLANNING_GATE_MODE:-warn}"
LOG_FILE="${REPO_ROOT}/.cleargate/hook-log/pre-edit-gate-warn.log"

# ── BUG-089: explicit host selection for the shared hook-signal handler ──────
# settings.json passes `--host claude` explicitly at this hook's boundary
# (cleargate-enforcement.md: host hook files are thin adapters into the
# normalized `cleargate hook` CLI handler, never per-host reimplementations).
# Defaults to claude when no --host flag is present (e.g. direct invocation).
HOST="claude"
while [ $# -gt 0 ]; do
  case "$1" in
    --host)
      if [ $# -ge 2 ]; then
        HOST="$2"
        shift 2
      else
        shift 1
      fi
      ;;
    --host=*)
      HOST="${1#--host=}"
      shift 1
      ;;
    *)
      shift 1
      ;;
  esac
done

# ── 0. Off mode — do nothing ──────────────────────────────────────────────────
if [ "${MODE}" = "off" ]; then
  exit 0
fi

# ── 1. Read file path from the stdin payload (PreToolUse JSON, read above) ────
FILE=$(printf '%s' "${INPUT}" | node -e "
try {
  var d = require('fs').readFileSync('/dev/stdin','utf8');
  var o = JSON.parse(d);
  var fp = (o.tool_input && o.tool_input.file_path) ? o.tool_input.file_path : '';
  process.stdout.write(fp);
} catch(e) {
  process.stdout.write('');
}
" 2>/dev/null || true)

TOOL_NAME=$(printf '%s' "${INPUT}" | node -e "
try {
  var d = require('fs').readFileSync('/dev/stdin','utf8');
  var o = JSON.parse(d);
  process.stdout.write(o.tool_name || '');
} catch(e) {
  process.stdout.write('');
}
" 2>/dev/null || true)

# ── STORY-058-10 (AD-7): shared helpers for the codex apply_patch multi-target
# path. `resolve_cg` is the same three-branch resolver as before, extracted so
# it can run early (edit-target resolution needs the CLI before whitelisting)
# without duplicating the branch logic. `is_whitelisted`'s codex-only case
# arms are gated on `${HOST}` so the Claude path never sees them.
CG_RESOLVED=0
resolve_cg() {
  if [ "${CG_RESOLVED}" -eq 1 ]; then
    return 0
  fi
  if [ -f "${REPO_ROOT}/cleargate-cli/dist/cli.js" ]; then
    CG=(node "${REPO_ROOT}/cleargate-cli/dist/cli.js")
  elif command -v cleargate >/dev/null 2>&1; then
    CG=(cleargate)
  else
    # Read pinned version from stamp-and-gate.sh
    HOOK_PIN=""
    HOOK_SH="${REPO_ROOT}/.claude/hooks/stamp-and-gate.sh"
    if [ -f "${HOOK_SH}" ]; then
      # BUG-038: this was a PCRE lookbehind, which BSD/macOS grep rejects outright
      # ("invalid option -- P"), so the primary parse never ran on macOS and the
      # result depended entirely on the fallback below. `sed -n …p` is portable
      # across GNU and BSD.
      HOOK_PIN=$(sed -n 's/^# cleargate-pin: *//p' "${HOOK_SH}" 2>/dev/null | head -1)
      if [ -z "${HOOK_PIN}" ]; then
        HOOK_PIN=$(grep -oE 'cleargate@[^"]+' "${HOOK_SH}" 2>/dev/null | head -1 | sed 's/.*@//')
      fi
    fi
    if [ -z "${HOOK_PIN}" ]; then
      HOOK_PIN="0.27.0"
    fi
    CG=(npx -y "cleargate@${HOOK_PIN}")
  fi
  CG_RESOLVED=1
}

is_whitelisted() {
  local f="$1"
  local abs="$2"
  # Exact or prefix matches for whitelisted directories/files
  case "${f}" in
    .cleargate/*|.claude/*|cleargate-planning/*) return 0 ;;
    CLAUDE.md|MANIFEST.json|README.md|.gitignore|.gitkeep) return 0 ;;
    package.json|package-lock.json) return 0 ;;
    .env|.env.*|.npmrc|.editorconfig) return 0 ;;
  esac
  # Check absolute path variants
  case "${abs}" in
    "${REPO_ROOT}/.cleargate/"*|"${REPO_ROOT}/.claude/"*|"${REPO_ROOT}/cleargate-planning/"*) return 0 ;;
  esac
  if [ "${HOST}" = "codex" ]; then
    case "${f}" in
      .codex/*|.agents/*|AGENTS.md) return 0 ;;
    esac
    case "${abs}" in
      "${REPO_ROOT}/.codex/"*|"${REPO_ROOT}/.agents/"*|"${REPO_ROOT}/AGENTS.md") return 0 ;;
    esac
  fi
  return 1
}

# Emits the resolver-tail (host-honored block signal) and exits 2. `${CG[@]}`
# must already be resolved by the caller.
block_tail() {
  "${CG[@]}" hook signal block --host "${HOST}" > /dev/null 2>&1
  SIGNAL_EXIT=$?
  if [ "${SIGNAL_EXIT}" -ne 2 ]; then
    ISO_TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u +"%Y-%m-%dT%H:%M:%SZ")
    mkdir -p "$(dirname "${LOG_FILE}")"
    printf '[%s] mode=%s hook-signal-non-2 exit=%s host=%s — failing closed as exit 2\n' \
      "${ISO_TS}" "${MODE}" "${SIGNAL_EXIT}" "${HOST}" >> "${LOG_FILE}"
  fi
  exit 2
}

# ── Build the target list. Claude: the single tool_input.file_path (unchanged
# at runtime — a missing file_path still fails open with no CLI resolution
# and no whitelist/doctor work, exactly as before). Codex: when file_path is
# absent (the apply_patch shape, H8), resolve CG early and ask
# `cleargate hook edit-targets` for the normalized target list (AD-7).
TARGETS=()
if [ -n "${FILE}" ]; then
  TARGETS=("${FILE}")
elif [ "${HOST}" = "codex" ]; then
  resolve_cg
  _ET_TMPFILE=$(mktemp)
  printf '%s' "${INPUT}" | "${CG[@]}" hook edit-targets > "${_ET_TMPFILE}" 2>/dev/null
  ET_EXIT=$?
  if [ "${ET_EXIT}" -ne 0 ]; then
    rm -f "${_ET_TMPFILE}"
    if [ "${MODE}" = "enforce" ]; then
      printf 'ClearGate: planning-first gate — could not resolve apply_patch targets (cleargate hook edit-targets exit %s)\n' \
        "${ET_EXIT}" >&2
      block_tail
    else
      ISO_TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u +"%Y-%m-%dT%H:%M:%SZ")
      mkdir -p "$(dirname "${LOG_FILE}")"
      printf '[%s] mode=%s edit-targets-error exit=%s\n' "${ISO_TS}" "${MODE}" "${ET_EXIT}" >> "${LOG_FILE}"
      exit 0
    fi
  fi
  while IFS= read -r _t; do
    [ -n "${_t}" ] && TARGETS+=("${_t}")
  done < "${_ET_TMPFILE}"
  rm -f "${_ET_TMPFILE}"
else
  # ── Guard: if we couldn't parse the file path, fail-open (unchanged) ───────
  exit 0
fi

if [ "${#TARGETS[@]}" -eq 0 ]; then
  exit 0
fi

# ── 2. Bypass env var ─────────────────────────────────────────────────────────
if [ "${CLEARGATE_PLANNING_BYPASS:-0}" = "1" ]; then
  ISO_TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u +"%Y-%m-%dT%H:%M:%SZ")
  mkdir -p "$(dirname "${LOG_FILE}")"
  for _t in "${TARGETS[@]}"; do
    printf '[%s] mode=%s bypass=true file=%s\n' "${ISO_TS}" "${MODE}" "${_t}" >> "${LOG_FILE}"
  done
  exit 0
fi

# ── 3.5 Sprint-active sentinel bypass ────────────────────────────────────────
# If a sprint is actively running, all in-sprint edits bypass the gate.
if [ -f "${REPO_ROOT}/.cleargate/sprint-runs/.active" ]; then
  exit 0
fi

# ── 4. Resolve cleargate CLI (three-branch resolver — CR-009; a no-op if
# resolve_cg already ran above for edit-targets) ──────────────────────────────
resolve_cg

# ── 5. Read user prompt snippet for log context (optional; best-effort) ───────
PROMPT_SNIPPET=$(printf '%s' "${INPUT}" | node -e "
try {
  var d = require('fs').readFileSync('/dev/stdin','utf8');
  var o = JSON.parse(d);
  var p = (o.user_prompt || '').slice(0, 200);
  process.stdout.write(p);
} catch(e) {
  process.stdout.write('');
}
" 2>/dev/null || true)

# Count approved stories in pending-sync (for log entry)
PENDING_DIR="${REPO_ROOT}/.cleargate/delivery/pending-sync"
PENDING_MATCH_COUNT=0
if [ -d "${PENDING_DIR}" ]; then
  PENDING_MATCH_COUNT=$(grep -rl 'approved: true' "${PENDING_DIR}" 2>/dev/null | wc -l | tr -d ' ' || echo "0")
fi

# ── 6/7. Ask doctor --can-edit per target, then the gate decision ────────────
# Never short-circuits on a whitelisted target (TPV R-H2): the loop always
# walks every target so a later uncovered one is still caught. `ANY_BLOCKED`
# / `BLOCKED_FILE` / `BLOCKED_REASON` remember only the FIRST blocked target
# for the stderr message; the log gets one `would_block` line per blocked
# target, in the existing format.
ANY_BLOCKED=0
BLOCKED_FILE=""
BLOCKED_REASON=""
ISO_TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u +"%Y-%m-%dT%H:%M:%SZ")

for _target in "${TARGETS[@]}"; do
  REL_FILE="${_target}"
  if [[ "${_target}" == "${REPO_ROOT}/"* ]]; then
    REL_FILE="${_target#${REPO_ROOT}/}"
  fi

  if is_whitelisted "${REL_FILE}" "${_target}"; then
    continue
  fi

  # Capture both stdout AND exit code without || true swallowing the exit code.
  _DOCTOR_TMPFILE=$(mktemp)
  "${CG[@]}" doctor --can-edit "${_target}" --cwd "${REPO_ROOT}" > "${_DOCTOR_TMPFILE}" 2>/dev/null
  DOCTOR_EXIT=$?
  DOCTOR_OUT=$(cat "${_DOCTOR_TMPFILE}")
  rm -f "${_DOCTOR_TMPFILE}"

  if [ "${DOCTOR_EXIT}" -ne 0 ]; then
    # Parse reason from doctor output.
    #
    # BUG-038: this was a PCRE lookbehind via `grep -oP`, which BSD/macOS grep does
    # not support — it exits "invalid option -- P", so on macOS the primary parse has
    # never run and REASON has always come from the sed fallback. Since the fallback
    # is portable and produces the same value, lead with it and drop the PCRE branch.
    REASON=$(printf '%s' "${DOCTOR_OUT}" | sed -n 's/.*blocked: \([^ ]*\).*/\1/p' | head -1)
    [ -z "${REASON}" ] && REASON="unknown"

    mkdir -p "$(dirname "${LOG_FILE}")"
    printf '[%s] mode=%s would_block file=%s reason=%s tool=%s pending_match_count=%d prompt_snippet=%s\n' \
      "${ISO_TS}" "${MODE}" "${_target}" "${REASON}" "${TOOL_NAME}" "${PENDING_MATCH_COUNT}" "${PROMPT_SNIPPET}" \
      >> "${LOG_FILE}"

    if [ "${ANY_BLOCKED}" -eq 0 ]; then
      ANY_BLOCKED=1
      BLOCKED_FILE="${_target}"
      BLOCKED_REASON="${REASON}"
    fi
  fi
done

if [ "${ANY_BLOCKED}" -eq 1 ] && [ "${MODE}" = "enforce" ]; then
  printf 'ClearGate: planning-first gate — no approved story covers %s (%s). Draft a work item first.\n' \
    "${BLOCKED_FILE}" "${BLOCKED_REASON}" >&2
  # BUG-089: resolve the host-honored blocking exit code through the shared
  # hook-signal handler instead of a bare `exit 1` — Claude Code treats a
  # PreToolUse hook's exit 1 (no JSON decision) as non-blocking, so the
  # tool call proceeded anyway. This is a blocking branch: any resolver
  # outcome other than the expected 2 (missing CLI, resolver crash,
  # unexpected status) still fails closed as exit 2 here, never falls
  # through as 0/1/127.
  block_tail
fi

# warn mode: log written above, exit 0 (do not block)
exit 0
