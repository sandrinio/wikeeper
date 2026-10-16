#!/usr/bin/env bash
# collision_surface.sh — STORY-033-03 (EPIC-033) + BUG-046 (worktree-reachability)
#
# Standalone fork of parse_surface_paths() from file_surface_diff.sh:158-189.
# FIXES the single-column bug: the original reads only cols[2]; this fork scans
# ALL columns to detect file paths regardless of which column they appear in.
#
# Usage: collision_surface.sh <story-file>
#   STDOUT: one file path per line, deduped, backticks stripped, comma-split
#           cells split. This is architect-synth's ONLY input and its shape is
#           UNCHANGED by BUG-046 — reachability annotations never touch stdout.
#   STDERR: BUG-046 reachability annotations — a `[collision_surface]
#           UNREACHABLE...` line per path that cannot exist inside a
#           `git worktree add` checkout (gitignored, untracked-and-
#           undeclared, or inside an independent nested git repo). Exit code
#           stays 0 always — unchanged from the pre-BUG-046 contract.
#
# FAIL-SAFE CONTRACT (BUG-033): when ZERO paths are parseable from the §3.1 table
#   (no table, prose-only table, or only slash-free/extension-less tokens), this
#   script emits EMPTY stdout AND a `[collision_surface] WARN:` line on STDERR.
#   The wave-compatibility predicate (architect-synth) MUST treat an empty surface
#   as "cannot prove disjointness" → fail-safe-serialize, NEVER as
#   "empty ∩ empty = ∅ ⇒ disjoint". Empty stdout is a SERIALIZE signal, not a
#   parallelize signal. Over-serialization is the safe failure direction.
#
# BUG-046 REACHABILITY CONTRACT: a `git worktree add` checkout materializes
#   TRACKED FILES ONLY. Classification asks GIT, never the filesystem, so a
#   gitignored/untracked path classifies the same whether or not it happens to
#   exist on disk in THIS checkout — an on-disk accident must never change the
#   verdict (the hybrid `unreachable ⇔ nested OR (untracked AND on-disk)` is a
#   known-bad mutant: it ships blind on a fresh clone or a CI box that never
#   checked out the gitignored siblings). Nested-independent-repo detection is
#   git-native (`git -C <dir> rev-parse --show-toplevel`) walking up existing
#   ancestor directories — NEVER a hardcoded prefix list (`mcp/`,
#   `cleargate-cli/`, `admin/`); a fourth nested repo must classify correctly
#   with zero code changes here. A row/bullet labelled with "new" or "create"
#   (architect-reader.md:45's rule) is exempt — it legitimately does not exist
#   yet.
#
# Used by architect-synth to compute the five-clause wave-compatibility predicate.
# Do NOT modify file_surface_diff.sh — this is a deliberate standalone fork.

set -euo pipefail

STORY_FILE="${1:-}"

if [[ -z "${STORY_FILE}" ]]; then
  echo "[collision_surface] ERROR: No story file argument provided." >&2
  echo "[collision_surface] Usage: $0 <story-file>" >&2
  exit 1
fi

if [[ ! -f "${STORY_FILE}" ]]; then
  echo "[collision_surface] ERROR: Story file not found: ${STORY_FILE}" >&2
  exit 1
fi

# ---- BUG-046: repo root resolution (file_surface_diff.sh:29 convention) ----
REPO_ROOT="${CLEARGATE_REPO_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
OUTER_TOPLEVEL="$(git -C "${REPO_ROOT}" rev-parse --show-toplevel 2>/dev/null || echo "${REPO_ROOT}")"

# ---- Parse §3.1 file surface table (multi-column fix) -----------------------
#
# CHANGE vs file_surface_diff.sh:158-189:
#   Original: val=cols[2]  — reads only the second column (the "Value" column).
#   Fork:     iterate cols[1..n] — checks every column for path-like tokens.
#
# Non-path skip list (tightened to avoid false matches with col-1 labels):
#   "Yes", "No", "Yes/No", "N/A", and any prefix of "Yes/No —"
#
# Path-shape guard (looks_like_path): a token is a path IFF it contains "/" OR ends
# in a known file extension. This catches both slash-bearing paths (a/b.ts) AND
# bare filenames the prior slash-only guard missed (package.json, schema.sql), while
# still rejecting label cells like "Primary File (new)" or prose like "Some details.".
# BUG-033: the guard now matches the documented contract — the prior code was
# slash-only despite the comment claiming "/ OR known extension".
#
# Over-serialization is the safe failure direction — a token we cannot classify as a
# path is dropped, so the story trends toward an empty surface → fail-safe-serialize.
#
# BUG-046: every emitted path now carries its row/bullet LABEL (tab-separated)
# so the reachability classifier below can apply the "New Files Needed"
# create-row exemption (architect-reader.md:45). Labels are stripped again
# before stdout is printed — the stdout surface CONTRACT is unchanged.

parse_surface_paths() {
  local story_file="$1"
  awk '
    # A token is a path IFF it contains "/" OR ends in a known file extension.
    function looks_like_path(s) {
      return (s ~ /\//) || \
             (s ~ /\.(ts|tsx|cts|mts|js|jsx|cjs|mjs|json|jsonc|sh|bash|md|sql|svelte|vue|css|scss|sass|less|ya?ml|toml|ini|env|txt|prisma|html|htm|py|rs|go|rb|java|kt)$/)
    }
    # BUG-049: emit every backticked token on a line that looks like a path.
    # Bug/CR Execution Sandbox sections declare their surface as prose bullets
    # (`- `path` — note`), not as a §3.1 table, so the table parser never saw them.
    # BUG-046: `label` carries the enclosing row/bullet label through to the
    # reachability classifier (the "New Files Needed" create-row exemption).
    function emit_backticked(line, label,   n, parts, i, j, m, sub2, tok, p) {
      n = split(line, parts, "`")
      # Odd indices are outside backticks; even indices are inside.
      for (i = 2; i <= n; i += 2) {
        tok = parts[i]
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", tok)
        m = split(tok, sub2, ", ")
        for (j = 1; j <= m; j++) {
          p = sub2[j]
          gsub(/^[[:space:]]+|[[:space:]]+$/, "", p)
          if (p != "" && looks_like_path(p)) print p "\t" label
        }
      }
    }
    # ---- Bug §4 / CR §3 "Execution Sandbox" prose (BUG-049) ----------------
    # Collect only under an affirmative label (Modify / Create / Investigate).
    # A "Do NOT modify" list is ANTI-surface: including it would over-report and
    # wrongly serialize items that could safely share a wave. Checked first,
    # because that label also contains the word "modify".
    /^## [0-9]+\.[[:space:]]*Execution Sandbox/ { in_sandbox=1; collecting=0; next }
    in_sandbox && /^## / { in_sandbox=0; collecting=0; next }
    in_sandbox && /^\*\*/ {
      lower = tolower($0)
      if (lower ~ /do not/)                        { collecting=0; next }
      if (lower ~ /modify|create|investigate/)     { collecting=1; sbox_label=$0; emit_backticked($0, sbox_label); next }
      collecting=0; next
    }
    in_sandbox && collecting && /^[[:space:]]*[-*][[:space:]]/ { emit_backticked($0, sbox_label); next }

    /^### 3\.1/ { in_section=1; next }
    in_section && /^### / { in_section=0; next }
    in_section && /^\|/ {
      line=$0
      gsub(/^\||\|$/, "", line)
      n=split(line, cols, "|")
      row_label=cols[1]
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", row_label)
      gsub(/`/, "", row_label)
      # Scan ALL columns (fix: was only cols[2])
      for (c=1; c<=n; c++) {
        val=cols[c]
        # Trim whitespace
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", val)
        # Strip backticks
        gsub(/`/, "", val)
        # Skip known non-path cells (exact and prefix matches)
        if (val == "Yes") continue
        if (val == "No") continue
        if (val == "Yes/No") continue
        if (val == "N/A") continue
        if (val == "Item") continue
        if (val == "Value") continue
        if (val == "") continue
        # Skip cells starting with "Yes/No —" (partial answers)
        if (substr(val, 1, 8) == "Yes/No -") continue
        # Handle multiple paths separated by ", "; guard each split token.
        npaths=split(val, paths, ", ")
        for (i=1; i<=npaths; i++) {
          p=paths[i]
          gsub(/^[[:space:]]+|[[:space:]]+$/, "", p)
          if (p != "" && looks_like_path(p)) print p "\t" row_label
        }
      }
    }
  ' "${story_file}"
}

# ---- BUG-046: reachability classification -----------------------------------
#
# Ask git, never the filesystem — a gitignored or untracked path classifies
# identically whether or not it happens to exist on disk in this checkout.

is_create_label() {
  # $1 = row/bullet label. True iff it names a to-be-created path
  # (architect-reader.md:45 -- "rows whose label column contains 'new' or
  # 'create'").
  local lower
  lower="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  [[ "${lower}" == *new* || "${lower}" == *create* ]]
}

path_is_tracked() {
  # $1 = path, relative to REPO_ROOT. Asks the git INDEX -- never requires
  # the path to exist on disk.
  git -C "${REPO_ROOT}" ls-files --error-unmatch -- "$1" >/dev/null 2>&1
}

path_is_nested() {
  # $1 = path, relative to REPO_ROOT. True iff any EXISTING ancestor
  # directory of the path resolves (git-natively, via `rev-parse
  # --show-toplevel`) to a toplevel DIFFERENT from the outer repo's -- an
  # independent nested git repo, under ANY name. Never a hardcoded prefix
  # list: a fourth nested repo must classify correctly with zero changes here.
  local rel="$1" dir candidate top
  dir="$(dirname -- "${rel}")"
  while [[ "${dir}" != "." && "${dir}" != "/" ]]; do
    candidate="${REPO_ROOT}/${dir}"
    if [[ -d "${candidate}" ]]; then
      top="$(git -C "${candidate}" rev-parse --show-toplevel 2>/dev/null || true)"
      if [[ -n "${top}" && "${top}" != "${OUTER_TOPLEVEL}" ]]; then
        return 0
      fi
    fi
    dir="$(dirname -- "${dir}")"
  done
  return 1
}

path_is_ignored() {
  # $1 = path, relative to REPO_ROOT. `git check-ignore` exits 1 on the
  # NORMAL "not ignored" case. No crash guard is needed here: `set -e` is
  # suspended inside an `if` condition, and this is only ever invoked as one
  # (a bare-statement assignment form of this same call WOULD die under
  # `set -e` -- see the header note and FLASHCARD #bash #set-e).
  git -C "${REPO_ROOT}" check-ignore -q -- "$1"
}

classify_path() {
  # $1 = path, $2 = its row/bullet label. Emits an UNREACHABLE annotation on
  # stderr only -- never touches stdout, which stays the bare surface list
  # architect-synth consumes.
  local p="$1" label="$2"

  if path_is_tracked "${p}"; then
    return 0
  fi

  if path_is_nested "${p}"; then
    echo "[collision_surface] UNREACHABLE (nested): \`${p}\` is inside an independent nested git repo — a \`git worktree add\` checkout of this repo has zero tracked files under it and will not materialize this path. Edit it from the main checkout." >&2
    return 0
  fi

  if path_is_ignored "${p}"; then
    echo "[collision_surface] UNREACHABLE: \`${p}\` is gitignored — a \`git worktree add\` checkout materializes tracked files only and will not contain this path." >&2
    return 0
  fi

  if is_create_label "${label}"; then
    # Declared new by this story (architect-reader.md:45) -- untracked and
    # not-yet-on-disk is the EXPECTED state for a file the story creates.
    return 0
  fi

  echo "[collision_surface] UNREACHABLE: \`${p}\` is untracked and not declared as a new file — a \`git worktree add\` checkout will not contain it. If this story creates it, label the row/bullet 'New Files Needed' (or 'Create')." >&2
  return 0
}

# Collect paths (with their row/bullet label) and dedup by PATH ONLY —
# portable bash 3.2 compat (macOS): no mapfile, no declare -A.
# FLASHCARD #bash #macos: no mapfile on macOS bash 3.2 — use while-read loop
# FLASHCARD #bash #macos: no associative arrays (declare -A) on macOS bash 3.2 — use awk for dedup
SURFACE_TSV="$(parse_surface_paths "${STORY_FILE}" | awk -F'\t' '!seen[$1]++')"

if [[ -z "${SURFACE_TSV}" ]]; then
  # BUG-033 fail-safe signal. ZERO parseable paths = the disjointness predicate CANNOT
  # prove this story is collision-free, so it must NOT be co-waved. stdout stays empty
  # (the caller reads "no proven surface"); the predicate fail-safe-serializes on empty.
  echo "[collision_surface] WARN: no parseable file surface in ${STORY_FILE} — downstream MUST fail-safe-serialize (empty surface is NOT 'disjoint')." >&2
  exit 0
fi

# BUG-046: classify every path; annotations go to stderr only.
while IFS=$'\t' read -r cs_path cs_label; do
  [[ -n "${cs_path}" ]] || continue
  classify_path "${cs_path}" "${cs_label}"
done <<< "${SURFACE_TSV}"

printf '%s\n' "${SURFACE_TSV}" | awk -F'\t' '{print $1}'
exit 0
