#!/usr/bin/env bash
# lib/harness.sh — harness-neutral repo-root shim (STORY-058-11).
#
# Sourced, never executed, by the ClearGate hooks from the hook's own
# directory, so it resolves in the scaffold tree, in a Claude install
# (.claude/hooks/lib/), in a Codex install (.codex/hooks/lib/, a generated
# byte-identical copy — see scripts/build-codex-payload.mjs) and in fixtures:
#
#   . "$(dirname "${BASH_SOURCE[0]}")/lib/harness.sh"
#   REPO_ROOT="$(cg_repo_root <mode> "${INPUT}")"
#
# Sourcing defines one function and has no other side effect.
#
# cg_repo_root <mode> <stdin-json>   mode: orchestrator-first | claude-first | git
#  orchestrator-first: ${ORCHESTRATOR_PROJECT_DIR} → ${CLAUDE_PROJECT_DIR} → git toplevel of the payload cwd → $(pwd)
#  claude-first:       ${CLAUDE_PROJECT_DIR} → git toplevel of the payload cwd → $(pwd)
#  git:                git toplevel of $(pwd) → $(pwd)
#
# - The existing host wins: under Claude Code CLAUDE_PROJECT_DIR is always set,
#   so resolution is exactly what each hook resolved before this shim existed.
# - <stdin-json> is the hook's stdin payload, passed as an ARGUMENT. The hook
#   has already consumed stdin; this shim never reads stdin, in any mode. An
#   empty payload skips the payload-cwd step.
# - git mode is decided first and ignores both env vars and the payload.
# - An env var counts only when non-empty (the `${VAR:-…}` semantics the hooks
#   used before).
# - Safe under `set -u` and `set -euo pipefail`: every step has a fallback, and
#   the function always prints one path and returns 0.

cg_repo_root() {
  local _cg_mode="${1:-}"
  local _cg_payload="${2:-}"
  local _cg_cwd=""
  local _cg_top=""

  if [ "${_cg_mode}" = "git" ]; then
    git rev-parse --show-toplevel 2>/dev/null || pwd
    return 0
  fi

  if [ "${_cg_mode}" = "orchestrator-first" ] && [ -n "${ORCHESTRATOR_PROJECT_DIR:-}" ]; then
    printf '%s\n' "${ORCHESTRATOR_PROJECT_DIR}"
    return 0
  fi

  if [ -n "${CLAUDE_PROJECT_DIR:-}" ]; then
    printf '%s\n' "${CLAUDE_PROJECT_DIR}"
    return 0
  fi

  if [ -n "${_cg_payload}" ] && command -v jq >/dev/null 2>&1; then
    _cg_cwd="$(printf '%s' "${_cg_payload}" | jq -r '.cwd // empty' 2>/dev/null || true)"
    if [ -n "${_cg_cwd}" ] && [ -d "${_cg_cwd}" ]; then
      _cg_top="$(git -C "${_cg_cwd}" rev-parse --show-toplevel 2>/dev/null || true)"
      if [ -n "${_cg_top}" ]; then
        printf '%s\n' "${_cg_top}"
        return 0
      fi
    fi
  fi

  pwd
  return 0
}
