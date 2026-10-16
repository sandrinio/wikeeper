#!/usr/bin/env bash
# provision_worktree_config.sh — Provision configured gitignored config into a story worktree.
# Usage: provision_worktree_config.sh <worktree-path> [--mode symlink|copy]
#
# Provisions the roots listed in config.yml worktree.provision_config (default [".env"])
# into the given worktree path. Symlink mode (default) creates an absolute symlink so
# the target's build/tests load their config in-worktree without a manual step.
# Copy mode copies the file (use when the worktree must hold a divergent config).
#
# Idempotent: skips roots already present in the worktree.
# No-op (INFO, exit 0): skips roots absent at the repo root (not an error).
#
# Absolute-path safety: repo root resolved via `git rev-parse --show-toplevel`
# from the SCRIPT's own directory — NOT $PWD — to avoid the doubled-cwd hazard
# (cf. FLASHCARD #pre-gate #cwd-leak: cwd in a worktree differs from repo root).
#
# Part of CR-079: F4 fix (provision gitignored config) + F7 fix (the provisioned
# .env is exempted from the stray_env_files scan; see pre_gate_runner.sh + the
# read_provision_config() single-source helper in pre_gate_common.sh).
#
# macOS bash 3.2 portable.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source shared helpers (read_provision_config lives here).
# shellcheck source=pre_gate_common.sh
source "${SCRIPT_DIR}/pre_gate_common.sh"

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
if [[ $# -lt 1 ]]; then
  echo "Usage: provision_worktree_config.sh <worktree-path> [--mode symlink|copy]" >&2
  exit 2
fi

WORKTREE_PATH="$1"
shift

# Default mode from config.yml worktree.provision_mode; flag overrides.
PROVISION_MODE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      if [[ $# -lt 2 ]]; then
        echo "provision_worktree_config.sh: --mode requires a value (symlink|copy)" >&2
        exit 2
      fi
      PROVISION_MODE="$2"
      shift 2
      ;;
    *)
      echo "provision_worktree_config.sh: unknown argument '$1'" >&2
      exit 2
      ;;
  esac
done

if [[ -n "${PROVISION_MODE}" && "${PROVISION_MODE}" != "symlink" && "${PROVISION_MODE}" != "copy" ]]; then
  echo "provision_worktree_config.sh: --mode must be 'symlink' or 'copy', got '${PROVISION_MODE}'" >&2
  exit 2
fi

# ---------------------------------------------------------------------------
# Validate worktree path
# ---------------------------------------------------------------------------
if [[ ! -d "${WORKTREE_PATH}" ]]; then
  echo "provision_worktree_config.sh: worktree path does not exist: ${WORKTREE_PATH}" >&2
  exit 2
fi

# Resolve ABSOLUTE worktree path (guard against relative paths passed by caller).
WORKTREE_ABS="$(cd "${WORKTREE_PATH}" && pwd)"

# ---------------------------------------------------------------------------
# Resolve repo root ABSOLUTELY from the script's own directory.
# This is critical: $PWD in a worktree context points to the worktree, not
# the repo root, causing doubled-cwd hazard if used for resolution.
# ---------------------------------------------------------------------------
REPO_ROOT="$(git -C "${SCRIPT_DIR}" rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${REPO_ROOT}" ]]; then
  echo "provision_worktree_config.sh: cannot resolve repo root from ${SCRIPT_DIR}" >&2
  exit 2
fi

# ---------------------------------------------------------------------------
# Read config.yml: provision_mode (if not set via flag)
# ---------------------------------------------------------------------------
CONFIG_YML="${REPO_ROOT}/.cleargate/config.yml"

if [[ -z "${PROVISION_MODE}" ]]; then
  if [[ -f "${CONFIG_YML}" ]]; then
    # Extract provision_mode from config.yml using awk.
    # YAML line looks like:  provision_mode: symlink
    _raw_mode="$(awk '/^[[:space:]]*provision_mode:[[:space:]]/ {
      sub(/^[[:space:]]*provision_mode:[[:space:]]*/, "")
      sub(/[[:space:]]*#.*$/, "")
      sub(/[[:space:]]*$/, "")
      print; exit
    }' "${CONFIG_YML}" 2>/dev/null || true)"
    if [[ "${_raw_mode}" = "copy" ]]; then
      PROVISION_MODE="copy"
    else
      PROVISION_MODE="symlink"
    fi
  else
    PROVISION_MODE="symlink"
  fi
fi

# ---------------------------------------------------------------------------
# Read the provisioned-config list (single source: read_provision_config).
# ---------------------------------------------------------------------------
provision_roots=()
while IFS= read -r _root; do
  [[ -z "$_root" ]] || provision_roots+=("$_root")
done < <(read_provision_config "${CONFIG_YML}")

# ---------------------------------------------------------------------------
# Provision each root
# ---------------------------------------------------------------------------
for root in "${provision_roots[@]:-}"; do
  [[ -z "$root" ]] && continue

  src="${REPO_ROOT}/${root}"
  dst="${WORKTREE_ABS}/${root}"

  # No-op if source does not exist at repo root.
  if [[ ! -e "${src}" ]]; then
    echo "[INFO] provision_worktree_config: source '${root}' absent at repo root — skipping"
    continue
  fi

  # Idempotent: skip if already provisioned in the worktree.
  if [[ -e "${dst}" || -L "${dst}" ]]; then
    echo "[INFO] provision_worktree_config: '${root}' already present in worktree — skipping"
    continue
  fi

  case "${PROVISION_MODE}" in
    symlink)
      # Symlink target MUST be absolute so the link resolves correctly
      # from inside the worktree's nested directory depth (F5 absolute-path rule).
      ln -s "${src}" "${dst}"
      echo "[INFO] provision_worktree_config: symlinked '${dst}' -> '${src}'"
      ;;
    copy)
      cp "${src}" "${dst}"
      echo "[INFO] provision_worktree_config: copied '${src}' -> '${dst}'"
      ;;
  esac
done

exit 0
