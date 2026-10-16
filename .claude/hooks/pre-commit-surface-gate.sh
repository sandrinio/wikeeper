#!/usr/bin/env bash
# pre-commit-surface-gate.sh
set -euo pipefail
# STORY-058-11: harness-neutral repo root (lib/harness.sh). git mode — the git
# top level of the current dir, else the current dir; env vars never apply.
. "$(dirname "${BASH_SOURCE[0]}")/lib/harness.sh"
REPO_ROOT="$(cg_repo_root git "")"

# CR-043: Red-test immutability check (Option A — runs BEFORE file-surface delegation)
if [[ "${SKIP_RED_GATE:-}" != "1" ]]; then
  CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"
  if [[ "${CURRENT_BRANCH}" == story/STORY-* || "${CURRENT_BRANCH}" == story/CR-* || "${CURRENT_BRANCH}" == story/BUG-* ]]; then
    # Look for staged modifications to *.red.test.ts or *.red.node.test.ts files
    STAGED_RED="$(git diff --cached --name-only --diff-filter=M 2>/dev/null | grep -E '\.red\.(node\.)?test\.ts$' || true)"
    if [[ -n "${STAGED_RED}" ]]; then
      # Check whether a qa-red commit exists on this branch (subject starts with "qa-red(")
      if git log --pretty=%s HEAD 2>/dev/null | grep -qE '^qa-red\('; then
        echo "[red-gate] REJECT: Developer commits cannot modify *.red.test.ts or *.red.node.test.ts files post-QA-Red." >&2
        echo "[red-gate] Modified files: ${STAGED_RED}" >&2
        echo "[red-gate] Bypass: SKIP_RED_GATE=1 (log bypass in sprint §4 Execution Log)." >&2
        exit 1
      fi
    fi
  fi
else
  echo "[red-gate] BYPASS: SKIP_RED_GATE=1 set — skipping Red-test immutability check. Log bypass in sprint §4." >&2
fi

# CR-087: this prefix list is meta-repo vocabulary living in a file that ships
# to every target repo. Each entry runs ONLY where the directory exists AND
# its package.json actually defines the script, so the chain is inert — not
# fatal — anywhere else. Do not add a SKIP_-style bypass here (CR-087 §4.5).
for _cg_pkg in mcp cleargate-cli admin; do
  _cg_dir="${REPO_ROOT}/${_cg_pkg}"
  [ -d "${_cg_dir}" ] || continue
  [ -f "${_cg_dir}/package.json" ] || continue
  grep -qE '"check:no-vitest"[[:space:]]*:' "${_cg_dir}/package.json" || continue
  if ! command -v npm >/dev/null 2>&1; then
    echo "[surface-gate] WARNING: npm not on PATH — skipping check:no-vitest for ${_cg_pkg}/." >&2
    continue
  fi
  if ! npm run check:no-vitest --prefix "${_cg_dir}"; then
    echo "[surface-gate] BLOCKED: check:no-vitest failed in ${_cg_pkg}/ — vitest residue detected (output above)." >&2
    exit 1
  fi
done

# BUG-041: keep the work-item ID grammar singular. Fourteen divergent parsers
# accumulated because nothing could enumerate them — and when this gate first ran
# against an already-unified tree it still found nine live hand-rolled patterns,
# five of which carried the same silent-wrong-answer defect. The module alone is a
# convention; conventions are what produced fourteen. Same inert-elsewhere shape as
# the check:no-vitest loop above.
for _cg_pkg in cleargate-cli; do
  _cg_dir="${REPO_ROOT}/${_cg_pkg}"
  [ -d "${_cg_dir}" ] || continue
  [ -f "${_cg_dir}/package.json" ] || continue
  grep -qE '"check:no-inline-id-regex"[[:space:]]*:' "${_cg_dir}/package.json" || continue
  command -v npm >/dev/null 2>&1 || continue
  if ! npm run --silent check:no-inline-id-regex --prefix "${_cg_dir}"; then
    echo "[surface-gate] BLOCKED: check:no-inline-id-regex failed in ${_cg_pkg}/ (output above)." >&2
    exit 1
  fi
done

SCRIPT="${REPO_ROOT}/.cleargate/scripts/file_surface_diff.sh"
if [[ ! -f "${SCRIPT}" ]]; then
  echo "[surface-gate] WARNING: file_surface_diff.sh not found — skipping" >&2
  exit 0
fi
exec bash "${SCRIPT}" "$@"
