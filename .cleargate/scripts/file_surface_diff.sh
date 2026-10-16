#!/usr/bin/env bash
# file_surface_diff.sh — Parse §3.1 of the active story file and compare
# declared file paths against `git diff --cached --name-only`.
#
# Usage: file_surface_diff.sh [--story-file <path>] [--whitelist <path>]
#
# Environment:
#   SKIP_SURFACE_GATE=1    — bypass the gate (exit 0 always); the sole bypass.
#   CLEARGATE_REPO_ROOT    — override repo root (default: CWD git toplevel)
#
# §3.1 paths MUST be backtick-quoted — the parser takes the first
# backtick-quoted span per comma-segment of the Value cell and ignores
# trailing prose; an un-backticked cell declares nothing (§6.3).
#
# Sprint runtime state (.active sentinel, state.json) is resolved against the
# MAIN working tree, not CLEARGATE_REPO_ROOT/REPO_ROOT — see
# resolve_sprint_state_root() below. This makes the gate fire inside a linked
# worktree, where .active is gitignored and absent (§6.2).
#
# Exit codes:
#   0  — all staged files are on-surface or whitelisted (or SKIP_SURFACE_GATE=1,
#        or no active story/sprint found, or §3.1 declares zero backtick-quoted
#        paths — see enforcement.md §6.6 for the full exit-0 ledger)
#   1  — off-surface files detected

set -euo pipefail

# ---- Configuration ---------------------------------------------------------

REPO_ROOT="${CLEARGATE_REPO_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
WHITELIST_DEFAULT="${REPO_ROOT}/.cleargate/scripts/surface-whitelist.txt"

# SPRINT_STATE_ROOT: where sprint runtime state (.active sentinel, state.json)
# lives. Inside a linked worktree, REPO_ROOT is the worktree itself, but
# .cleargate/sprint-runs/.active is gitignored and written only into the MAIN
# working tree by init_sprint.mjs — so a worktree never sees it. Resolve the
# main working tree as the parent of `git rev-parse --git-common-dir`, which
# is absolute-and-unambiguous in a linked worktree and (with the fallback
# below) in a plain checkout too. The story file itself stays on REPO_ROOT —
# see resolve_story_file() — so a self-amending §3.1 committed in the
# worktree still takes effect in the same commit.
resolve_sprint_state_root() {
  local common parent
  # git >= 2.31: absolute, unambiguous, no CWD-relative normalisation needed.
  common="$(git -C "${REPO_ROOT}" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
  if [[ -z "${common}" ]]; then
    # Fallback for git < 2.31: --git-common-dir may be CWD-relative (e.g.
    # ".git" from the toplevel, "../.git" from a subdirectory).
    common="$(git -C "${REPO_ROOT}" rev-parse --git-common-dir 2>/dev/null || true)"
    if [[ -z "${common}" ]]; then
      echo "${REPO_ROOT}"
      return
    fi
    case "${common}" in
      /*) ;;
      *)  common="${REPO_ROOT}/${common}" ;;
    esac
  fi
  parent="$(cd "${common}/.." 2>/dev/null && pwd || true)"
  if [[ -n "${parent}" && -d "${parent}/.cleargate/sprint-runs" ]]; then
    echo "${parent}"
  else
    # Not a git repo, or a topology (e.g. --separate-git-dir) where "parent
    # of the common dir" is not the main working tree — preserve today's
    # behaviour rather than guess.
    echo "${REPO_ROOT}"
  fi
}
SPRINT_STATE_ROOT="$(resolve_sprint_state_root)"

SPRINT_RUNS_DIR="${SPRINT_STATE_ROOT}/.cleargate/sprint-runs"
ACTIVE_SENTINEL="${SPRINT_RUNS_DIR}/.active"

# Parse args
STORY_FILE=""
WHITELIST_FILE="${WHITELIST_DEFAULT}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --story-file) STORY_FILE="$2"; shift 2 ;;
    --whitelist)  WHITELIST_FILE="$2"; shift 2 ;;
    *) shift ;;
  esac
done

# ---- Bypass check ----------------------------------------------------------

if [[ "${SKIP_SURFACE_GATE:-0}" == "1" ]]; then
  echo "[surface-gate] SKIP_SURFACE_GATE=1 — bypassing gate" >&2
  exit 0
fi

# ---- Resolve active story file ---------------------------------------------

# Locate STORY-<num>_*.md under one root: pending-sync first, then archive.
# Echoes the empty string when neither directory holds a match.
find_story_file() {
  local root="$1" story_num="$2" match
  match="$(ls "${root}/.cleargate/delivery/pending-sync/STORY-${story_num}_"*.md 2>/dev/null | head -1 || true)"
  if [[ -z "${match}" ]]; then
    match="$(ls "${root}/.cleargate/delivery/archive/STORY-${story_num}_"*.md 2>/dev/null | head -1 || true)"
  fi
  echo "${match}"
}

resolve_story_file() {
  local sprint_id=""
  if [[ -f "${ACTIVE_SENTINEL}" ]]; then
    sprint_id="$(tr -d '[:space:]' < "${ACTIVE_SENTINEL}")"
  fi
  if [[ -z "${sprint_id}" ]]; then
    echo ""
    return
  fi

  local state_json="${SPRINT_RUNS_DIR}/${sprint_id}/state.json"
  if [[ ! -f "${state_json}" ]]; then
    echo ""
    return
  fi

  # Find first non-terminal story (In Progress or Ready)
  local story_id=""
  story_id="$(python3 -c "
import json, sys
data = json.load(open('${state_json}'))
stories = data.get('stories', {})
for sid, st in stories.items():
    if st.get('state','') in ('In Progress','Ready','In Review'):
        print(sid)
        break
" 2>/dev/null || true)"

  if [[ -z "${story_id}" ]]; then
    # Fallback: most recently updated
    story_id="$(python3 -c "
import json, sys
data = json.load(open('${state_json}'))
stories = data.get('stories', {})
latest = max(stories.items(), key=lambda kv: kv[1].get('updated_at',''), default=(None,None))
if latest[0]:
    print(latest[0])
" 2>/dev/null || true)"
  fi

  if [[ -z "${story_id}" ]]; then
    echo ""
    return
  fi

  # Convert e.g. STORY-014-01 -> find file. REPO_ROOT (the worktree) is the
  # primary lookup: enforcement §6.1 permits a self-amending §3.1 committed
  # in the same story, and that amendment lives in the worktree, not the
  # main checkout, until merge. Fall back to SPRINT_STATE_ROOT (the main
  # checkout) only when the worktree has no matching story file — e.g. the
  # story file was authored on the main branch after this worktree was cut.
  local story_num="${story_id#STORY-}"
  local story_file
  story_file="$(find_story_file "${REPO_ROOT}" "${story_num}")"
  if [[ -z "${story_file}" && "${SPRINT_STATE_ROOT}" != "${REPO_ROOT}" ]]; then
    story_file="$(find_story_file "${SPRINT_STATE_ROOT}" "${story_num}")"
  fi
  echo "${story_file}"
}

if [[ -z "${STORY_FILE}" ]]; then
  STORY_FILE="$(resolve_story_file)"
fi

if [[ -z "${STORY_FILE}" || ! -f "${STORY_FILE}" ]]; then
  echo "[surface-gate] WARNING: No active story file found (searched ${REPO_ROOT} and ${SPRINT_STATE_ROOT}) — skipping surface check" >&2
  exit 0
fi

# ---- Parse §3.1 file surface table -----------------------------------------

parse_surface_paths() {
  local story_file="$1"
  # Extract rows between "### 3.1" and the next "### " header.
  # Table rows: | Item | Value |
  # Only rows where Value cell looks like a path (contains . or /).
  # A real-world Value cell often carries trailing prose after the path,
  # e.g. `path/to/x.md` — R3/R4: rationale. Backticks are the only reliable
  # path delimiter, so they must bound the split, not be stripped before it:
  # split the cell on ", " FIRST, then take the first backtick-quoted span
  # in each resulting segment. A segment with no backticks contributes
  # nothing — paths MUST be backtick-quoted (§6.3).
  awk '
    function first_backticked(s,   a, rest, b) {
      a = index(s, "`");            if (a == 0) return ""
      rest = substr(s, a + 1)
      b = index(rest, "`");         if (b == 0) return ""
      return substr(rest, 1, b - 1)
    }
    /^### 3\.1/ { in_section=1; next }
    in_section && /^### / { in_section=0; next }
    in_section && /^\|/ {
      # Remove leading/trailing pipe, split into fields
      line=$0
      gsub(/^\||\|$/, "", line)
      n=split(line, cols, "|")
      if (n < 2) next
      val=cols[2]
      # Trim whitespace
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", val)
      # Only process if value looks like a path (contains . or /)
      if (val !~ /[.\/]/) next
      # Handle multiple paths separated by ", "; the first backticked span
      # in a segment is that segments declared path, trailing prose ignored.
      npaths=split(val, segs, ", ")
      for (i=1; i<=npaths; i++) {
        p=first_backticked(segs[i])
        if (p == "") continue
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", p)
        if (p ~ /[[:space:]]/) continue        # a quoted phrase, not a path
        if (p ~ /[.\/]/) print p
      }
    }
  ' "${story_file}"
}

# Collect declared paths into array (portable bash 3.2 compat — no mapfile)
declared_paths=()
while IFS= read -r p; do
  declared_paths+=("$p")
done < <(parse_surface_paths "${STORY_FILE}")

if [[ ${#declared_paths[@]} -eq 0 ]]; then
  echo "[surface-gate] WARNING: No file paths found in §3.1 of ${STORY_FILE} — §3.1 paths must be backtick-quoted — skipping surface check" >&2
  exit 0
fi

# ---- Get staged files -------------------------------------------------------

staged_files=()
while IFS= read -r f; do
  staged_files+=("$f")
done < <(git -C "${REPO_ROOT}" diff --cached --name-only 2>/dev/null || true)

if [[ ${#staged_files[@]} -eq 0 ]]; then
  # Nothing staged — nothing to check
  exit 0
fi

# ---- Load whitelist ---------------------------------------------------------

whitelist_patterns=()
if [[ -f "${WHITELIST_FILE}" ]]; then
  while IFS= read -r line; do
    # Skip comments and blank lines
    [[ -z "${line}" || "${line}" =~ ^# ]] && continue
    whitelist_patterns+=("$line")
  done < "${WHITELIST_FILE}"
fi

# ---- Helper: match file against whitelist -----------------------------------

is_whitelisted() {
  local file="$1"
  local pattern
  for pattern in "${whitelist_patterns[@]+"${whitelist_patterns[@]}"}"; do
    # Use bash glob matching — convert ** to * for simple matching
    # Try direct fnmatch with case
    if [[ "${file}" == ${pattern} ]]; then
      return 0
    fi
    # Try: if pattern has **, match any path segment
    local simple_pat="${pattern//\*\*\//*/}"
    if [[ "${file}" == ${simple_pat} ]]; then
      return 0
    fi
    # Also: check if file path contains the pattern as suffix
    if [[ "${file}" == *"${pattern}" ]]; then
      return 0
    fi
  done
  return 1
}

# ---- Helper: normalize path for comparison ----------------------------------

normalize_path() {
  local p="$1"
  # Strip leading ./
  p="${p#./}"
  # If absolute path under REPO_ROOT, make it relative
  if [[ "${p}" == "${REPO_ROOT}/"* ]]; then
    p="${p#${REPO_ROOT}/}"
  fi
  echo "${p}"
}

# ---- Compare staged vs declared ---------------------------------------------

off_surface=()
for staged in "${staged_files[@]}"; do
  staged_norm="$(normalize_path "${staged}")"

  # Check whitelist first
  if is_whitelisted "${staged_norm}"; then
    continue
  fi
  # Also check absolute path against whitelist
  if is_whitelisted "${REPO_ROOT}/${staged_norm}"; then
    continue
  fi

  # Check against declared surface
  found=0
  for declared in "${declared_paths[@]+"${declared_paths[@]}"}"; do
    declared_norm="$(normalize_path "${declared}")"
    if [[ "${staged_norm}" == "${declared_norm}" ]]; then
      found=1
      break
    fi
  done

  if [[ "${found}" == "0" ]]; then
    off_surface+=("${staged_norm}")
  fi
done

# ---- Report -----------------------------------------------------------------

if [[ ${#off_surface[@]} -eq 0 ]]; then
  exit 0
fi

# Off-surface files detected
echo "[surface-gate] BLOCKED: staged files outside declared §3.1 surface:" >&2
for f in "${off_surface[@]}"; do
  echo "  off-surface: ${f}" >&2
done
echo "[surface-gate] Commit blocked. Declare these files in §3.1 or open a CR:scope-change." >&2
echo "[surface-gate] Set SKIP_SURFACE_GATE=1 to bypass." >&2
exit 1
