#!/usr/bin/env bash
# pre_gate_common.sh — Shared helpers for pre_gate_runner.sh
# Sourced by pre_gate_runner.sh. Do NOT execute directly.
# Handles Node+TS stacks only (no Python/Rust/Go/Java/Swift detectors).
set -euo pipefail

# ---------------------------------------------------------------------------
# read_config_field <field_path> <config_file>
# Uses node -p to parse JSON and extract a field.
# field_path: dot-separated path, e.g. "qa.typecheck"
# ---------------------------------------------------------------------------
read_config_field() {
  local field_path="$1"
  local config_file="$2"
  node -p "
    const c = JSON.parse(require('fs').readFileSync('${config_file}', 'utf8'));
    const parts = '${field_path}'.split('.');
    let v = c;
    for (const p of parts) { v = v[p]; }
    Array.isArray(v) ? JSON.stringify(v) : (v === undefined ? '' : String(v));
  " 2>/dev/null || echo ""
}

# ---------------------------------------------------------------------------
# get_modified_files <worktree_path>
# Lists files modified in the current git index vs HEAD.
# ---------------------------------------------------------------------------
get_modified_files() {
  local worktree="$1"
  git -C "$worktree" diff --name-only HEAD 2>/dev/null || true
  git -C "$worktree" diff --cached --name-only 2>/dev/null || true
}

# ---------------------------------------------------------------------------
# get_staged_diff <worktree_path>
# Returns unified diff of staged changes.
# ---------------------------------------------------------------------------
get_staged_diff() {
  local worktree="$1"
  git -C "$worktree" diff --cached 2>/dev/null || git -C "$worktree" diff HEAD 2>/dev/null || true
}

# ---------------------------------------------------------------------------
# record_result <report_file> <check_name> <status> [details]
# Appends one result line to the report.
# status: PASS | FAIL | WARN | INFO
# ---------------------------------------------------------------------------
record_result() {
  local report_file="$1"
  local check_name="$2"
  local status="$3"
  local details="${4:-}"
  echo "[${status}] ${check_name}: ${details}" >> "$report_file"
}

# ---------------------------------------------------------------------------
# print_summary <report_file>
# Prints count of PASS/FAIL/WARN lines from the report.
# ---------------------------------------------------------------------------
print_summary() {
  local report_file="$1"
  local pass_count fail_count warn_count
  pass_count=$(grep -c '^\[PASS\]' "$report_file" 2>/dev/null || echo 0)
  fail_count=$(grep -c '^\[FAIL\]' "$report_file" 2>/dev/null || echo 0)
  warn_count=$(grep -c '^\[WARN\]' "$report_file" 2>/dev/null || echo 0)
  echo "Summary: ${pass_count} passed, ${fail_count} failed, ${warn_count} warnings"
}

# ---------------------------------------------------------------------------
# write_report <report_file> <mode> <worktree_path> <branch>
# Writes the report header.
# ---------------------------------------------------------------------------
write_report_header() {
  local report_file="$1"
  local mode="$2"
  local worktree="$3"
  local branch="$4"
  mkdir -p "$(dirname "$report_file")"
  {
    echo "# ClearGate Pre-Gate Scan Report"
    echo "Mode: ${mode}"
    echo "Worktree: ${worktree}"
    echo "Branch: ${branch}"
    echo "Timestamp: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    echo "---"
  } > "$report_file"
}

# ---------------------------------------------------------------------------
# detect_stack <worktree_path>
# Returns "node-ts" if package.json + tsconfig.json found, else "unknown".
# Node+TS only — no Python/Rust/Go/Java/Swift detectors.
# ---------------------------------------------------------------------------
detect_stack() {
  local worktree="$1"
  if [[ -f "${worktree}/package.json" ]]; then
    if [[ -f "${worktree}/tsconfig.json" ]]; then
      echo "node-ts"
    else
      echo "node"
    fi
  else
    echo "unknown"
  fi
}

# ---------------------------------------------------------------------------
# resolve_story_id_from_branch <branch>
# Extracts story/CR/bug ID from a branch name like story/STORY-022-04.
# Pattern (per M4 plan §1): (story|cr|bug)/([A-Z-]+-[0-9]+(-[0-9]+)?)
# Returns the ID (group 2) on stdout, or empty string on no match.
# Cross-OS: bash 3.2+, POSIX ERE grep -E, quoted expansions, no sed -E extensions.
# ---------------------------------------------------------------------------
resolve_story_id_from_branch() {
  local branch="$1"
  # Match the full pattern and extract just the ID part after the slash
  local matched
  matched="$(printf '%s\n' "${branch}" | grep -oE '(story|cr|bug)/[A-Z][A-Z-]*[A-Z]-[0-9]+(-[0-9]+)?' | head -1 || true)"
  if [[ -n "${matched}" ]]; then
    # Strip the (story|cr|bug)/ prefix — everything up to and including first /
    printf '%s\n' "${matched#*/}"
  else
    printf ''
  fi
}

# ---------------------------------------------------------------------------
# resolve_lane <state_json_path> <story_id>
# Reads the lane field for a story from state.json.
# Returns "standard" if story absent, lane absent, or jq fails.
# jq 1.5+ syntax. Cross-OS portable.
# ---------------------------------------------------------------------------
resolve_lane() {
  local state_json="$1"
  local story_id="$2"
  if [[ ! -f "${state_json}" ]]; then
    printf 'standard\n'
    return
  fi
  local lane
  lane="$(jq -r --arg sid "${story_id}" '.stories[$sid].lane // "standard"' "${state_json}" 2>/dev/null || printf 'standard')"
  if [[ -z "${lane}" || "${lane}" = "null" ]]; then
    lane="standard"
  fi
  printf '%s\n' "${lane}"
}

# ---------------------------------------------------------------------------
# append_ld_event <sprint_md_path> <story_id> <reason>
# Appends an LD event row to the sprint markdown §4 Events section.
# If "## 4. Events" heading absent, creates it with table header first.
# Idempotent by design (orchestrator calls once per demotion).
# Cross-OS: bash 3.2+, portable date, printf.
# ---------------------------------------------------------------------------
append_ld_event() {
  local sprint_md="$1"
  local story_id="$2"
  local reason="$3"
  local timestamp
  timestamp="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  # Truncate reason to 80 chars
  reason="$(printf '%s' "${reason}" | cut -c1-80)"

  if [[ ! -f "${sprint_md}" ]]; then
    printf 'append_ld_event: sprint markdown not found: %s\n' "${sprint_md}" >&2
    return 1
  fi

  local row
  row="$(printf '| LD | %s | %s | %s |' "${story_id}" "${timestamp}" "${reason}")"

  if grep -q '^## 4\. Events' "${sprint_md}" 2>/dev/null; then
    # Section exists: append row only
    printf '\n%s\n' "${row}" >> "${sprint_md}"
  else
    # Section absent: append heading + table header + row
    printf '\n## 4. Events\n\n| Event | Story | Timestamp | Reason |\n|---|---|---|---|\n%s\n' "${row}" >> "${sprint_md}"
  fi
}

# ---------------------------------------------------------------------------
# read_provision_config <config_yml_path>
# Reads the worktree.provision_config list from config.yml (CR-079).
# Returns one entry per line. Defaults to ".env" if absent/unset.
# Single source of truth: both provision_worktree_config.sh and
# pre_gate_runner.sh source this function so provisioning and exemption
# always use the same list.
# YAML read strategy: awk extracts lines indented under
# "provision_config:" until the next non-list line or EOF.
# Node is available but the awk approach keeps it dependency-light and
# avoids a full YAML parse.
# ---------------------------------------------------------------------------
read_provision_config() {
  local config_yml="${1:-}"
  if [[ -z "${config_yml}" || ! -f "${config_yml}" ]]; then
    # No config.yml — return the default list
    printf '.env\n'
    return
  fi

  # Extract the sequence items under "provision_config:" using awk.
  # Handles YAML like:
  #   worktree:
  #     provision_config:
  #       - .env
  #       - .env.local
  # Stops on the first line that is NOT an indented "  - <value>" after
  # the provision_config: key.
  local extracted
  extracted="$(awk '
    /^[[:space:]]*provision_config:/ { in_list=1; next }
    in_list && /^[[:space:]]*-[[:space:]]+/ {
      sub(/^[[:space:]]*-[[:space:]]+/, "")
      sub(/[[:space:]]*$/, "")
      print
      next
    }
    in_list { in_list=0 }
  ' "${config_yml}" 2>/dev/null || true)"

  if [[ -z "${extracted}" ]]; then
    # Key absent or empty — default to .env
    printf '.env\n'
  else
    printf '%s\n' "${extracted}"
  fi
}

# ---------------------------------------------------------------------------
# diff_package_json <worktree_path> <branch>
# Prints new runtime deps (non-dev) introduced vs <branch>^.
# Returns lines like: "new runtime dep: <name>"
# ---------------------------------------------------------------------------
diff_package_json() {
  local worktree="$1"
  local branch="$2"

  # Get old package.json from branch parent (branch^ in the worktree's git)
  local old_json
  old_json=$(git -C "$worktree" show "${branch}^:package.json" 2>/dev/null || echo '{"dependencies":{}}')

  local new_json
  new_json=$(cat "${worktree}/package.json" 2>/dev/null || echo '{"dependencies":{}}')

  # Extract dep keys using node
  node -e "
    const oldPkg = JSON.parse($(echo "$old_json" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>process.stdout.write(JSON.stringify(d)))"));
    const newPkg = JSON.parse($(echo "$new_json" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>process.stdout.write(JSON.stringify(d)))"));
    const oldDeps = Object.keys(oldPkg.dependencies || {});
    const newDeps = Object.keys(newPkg.dependencies || {});
    const added = newDeps.filter(d => !oldDeps.includes(d));
    added.forEach(d => console.log('new runtime dep: ' + d));
  " 2>/dev/null || true
}
