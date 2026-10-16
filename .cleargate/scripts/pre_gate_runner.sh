#!/usr/bin/env bash
# pre_gate_runner.sh — Pre-gate scanner for QA and Architect agent spawning.
# Usage: pre_gate_runner.sh qa|arch <worktree-path> <branch>
#
# Exit codes:
#   0 — all checks pass → orchestrator proceeds to spawn QA/Architect
#   1 — checks failed  → orchestrator returns story to Developer
#   2 — scan couldn't run (missing config, missing worktree, bad args)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---------------------------------------------------------------------------
# Source shared helpers
# ---------------------------------------------------------------------------
# shellcheck source=pre_gate_common.sh
source "${SCRIPT_DIR}/pre_gate_common.sh"

# ---------------------------------------------------------------------------
# Argument validation
# ---------------------------------------------------------------------------
if [[ $# -lt 3 ]]; then
  echo "Usage: pre_gate_runner.sh qa|arch <worktree-path> <branch>" >&2
  exit 2
fi

MODE="$1"
WORKTREE="$2"
BRANCH="$3"

if [[ "$MODE" != "qa" && "$MODE" != "arch" ]]; then
  echo "pre_gate_runner.sh: unknown mode '${MODE}' — must be 'qa' or 'arch'" >&2
  exit 2
fi

# ---------------------------------------------------------------------------
# Validate worktree path
# ---------------------------------------------------------------------------
if [[ ! -d "$WORKTREE" ]]; then
  echo "pre_gate_runner.sh: worktree path does not exist: ${WORKTREE}" >&2
  exit 2
fi

# F5 — normalize WORKTREE to an absolute path so that REPORT_FILE and every
# downstream non-subshell `cd "$WORKTREE"` resolve correctly regardless of
# whether the caller passed a relative or absolute path (CR-080).
WORKTREE="$(cd "$WORKTREE" && pwd)"

# ---------------------------------------------------------------------------
# Locate gate-checks.json — auto-seed if missing
# ---------------------------------------------------------------------------
CONFIG_FILE="${SCRIPT_DIR}/gate-checks.json"
if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "gate-checks.json not found at ${CONFIG_FILE}; running init_gate_config.sh …" >&2
  bash "${SCRIPT_DIR}/init_gate_config.sh" || {
    echo "pre_gate_runner.sh: init_gate_config.sh failed — cannot proceed" >&2
    exit 2
  }
fi

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "pre_gate_runner.sh: gate-checks.json still missing after init — exit 2" >&2
  exit 2
fi

# ---------------------------------------------------------------------------
# Prepare report file
# ---------------------------------------------------------------------------
REPORT_DIR="${WORKTREE}/.cleargate/reports"
REPORT_FILE="${REPORT_DIR}/pre-${MODE}-scan.txt"
write_report_header "$REPORT_FILE" "$MODE" "$WORKTREE" "$BRANCH"

OVERALL_EXIT=0

# ---------------------------------------------------------------------------
# ── QA MODE ──────────────────────────────────────────────────────────────
# ---------------------------------------------------------------------------
run_qa() {
  # 1. Typecheck
  local typecheck_cmd
  typecheck_cmd="$(read_config_field "qa.typecheck" "$CONFIG_FILE")"
  if [[ -n "$typecheck_cmd" && -f "${WORKTREE}/package.json" ]]; then
    local tc_out tc_exit
    tc_exit=0
    tc_out=$(cd "$WORKTREE" && eval "$typecheck_cmd" 2>&1) || tc_exit=$?
    if [[ $tc_exit -eq 0 ]]; then
      record_result "$REPORT_FILE" "typecheck" "PASS" "$typecheck_cmd"
    else
      record_result "$REPORT_FILE" "typecheck" "FAIL" "$(echo "$tc_out" | head -5)"
      OVERALL_EXIT=1
    fi
  else
    record_result "$REPORT_FILE" "typecheck" "INFO" "skipped (no package.json or cmd empty)"
  fi

  # 2. Debug pattern grep (staged diff)
  local debug_patterns_json
  debug_patterns_json="$(read_config_field "qa.debug_patterns" "$CONFIG_FILE")"
  local debug_patterns=()
  while IFS= read -r _line; do
    [[ -z "$_line" ]] || debug_patterns+=("$_line")
  done < <(node -e "
    try { JSON.parse('${debug_patterns_json}').forEach(p => console.log(p)); } catch(e) {}
  " 2>/dev/null)

  local staged_diff
  staged_diff="$(get_staged_diff "$WORKTREE")"

  if [[ ${#debug_patterns[@]} -gt 0 && -n "$staged_diff" ]]; then
    local pattern_found=0
    local found_details=""
    for pattern in "${debug_patterns[@]}"; do
      local matches
      # Search all tracked files (not just diff) for the pattern since in test
      # scenarios the file is committed but we want to detect it
      matches="$(git -C "$WORKTREE" grep -n "$pattern" -- 2>/dev/null || true)"
      if [[ -n "$matches" ]]; then
        found_details+="$(echo "$matches" | head -5)"$'\n'
        pattern_found=1
      fi
    done
    if [[ $pattern_found -eq 1 ]]; then
      record_result "$REPORT_FILE" "debug_patterns" "FAIL" "$(echo "$found_details" | head -10 | tr '\n' '|')"
      echo "$found_details" >> "$REPORT_FILE"
      OVERALL_EXIT=1
    else
      record_result "$REPORT_FILE" "debug_patterns" "PASS" "no debug statements found"
    fi
  else
    # Fall back to grepping all files in worktree for debug patterns
    local pattern_found=0
    local found_details=""
    for pattern in "${debug_patterns[@]:-}"; do
      [[ -z "$pattern" ]] && continue
      local matches
      matches="$(grep -rn "$pattern" "${WORKTREE}" \
        --include="*.js" --include="*.ts" --include="*.mjs" --include="*.cjs" \
        --exclude-dir=".git" --exclude-dir="node_modules" \
        2>/dev/null || true)"
      if [[ -n "$matches" ]]; then
        found_details+="$(echo "$matches" | head -5)"$'\n'
        pattern_found=1
      fi
    done
    if [[ $pattern_found -eq 1 ]]; then
      record_result "$REPORT_FILE" "debug_patterns" "FAIL" "$(echo "$found_details" | head -10 | tr '\n' '|')"
      echo "$found_details" >> "$REPORT_FILE"
      OVERALL_EXIT=1
    else
      record_result "$REPORT_FILE" "debug_patterns" "PASS" "no debug statements found"
    fi
  fi

  # 3. TODO/FIXME grep
  local todo_patterns_json
  todo_patterns_json="$(read_config_field "qa.todo_patterns" "$CONFIG_FILE")"
  local todo_patterns=()
  while IFS= read -r _line; do
    [[ -z "$_line" ]] || todo_patterns+=("$_line")
  done < <(node -e "
    try { JSON.parse('${todo_patterns_json}').forEach(p => console.log(p)); } catch(e) {}
  " 2>/dev/null)

  local todo_found=0
  local todo_details=""
  for pattern in "${todo_patterns[@]:-}"; do
    [[ -z "$pattern" ]] && continue
    local matches
    matches="$(grep -rn "$pattern" "${WORKTREE}" \
      --include="*.js" --include="*.ts" --include="*.mjs" \
      --exclude-dir=".git" --exclude-dir="node_modules" \
      2>/dev/null || true)"
    if [[ -n "$matches" ]]; then
      todo_details+="$(echo "$matches" | head -3)"$'\n'
      todo_found=1
    fi
  done
  if [[ $todo_found -eq 1 ]]; then
    record_result "$REPORT_FILE" "todo_patterns" "WARN" "$(echo "$todo_details" | head -5 | tr '\n' '|')"
  else
    record_result "$REPORT_FILE" "todo_patterns" "PASS" "no TODO/FIXME/XXX found"
  fi

  # 4. npm test
  local test_cmd
  test_cmd="$(read_config_field "qa.test" "$CONFIG_FILE")"
  if [[ -n "$test_cmd" && -f "${WORKTREE}/package.json" ]]; then
    local test_exit=0
    cd "$WORKTREE" && eval "$test_cmd" > /dev/null 2>&1 || test_exit=$?
    if [[ $test_exit -eq 0 ]]; then
      record_result "$REPORT_FILE" "test" "PASS" "$test_cmd"
    else
      record_result "$REPORT_FILE" "test" "FAIL" "exit code ${test_exit}"
      OVERALL_EXIT=1
    fi
  else
    record_result "$REPORT_FILE" "test" "INFO" "skipped (no package.json or cmd empty)"
  fi
}

# ---------------------------------------------------------------------------
# ── ARCH MODE ─────────────────────────────────────────────────────────────
# ---------------------------------------------------------------------------
run_arch() {
  # 1. Typecheck
  local typecheck_cmd
  typecheck_cmd="$(read_config_field "arch.typecheck" "$CONFIG_FILE")"
  if [[ -n "$typecheck_cmd" && -f "${WORKTREE}/package.json" ]]; then
    local tc_exit=0
    cd "$WORKTREE" && eval "$typecheck_cmd" > /dev/null 2>&1 || tc_exit=$?
    if [[ $tc_exit -eq 0 ]]; then
      record_result "$REPORT_FILE" "typecheck" "PASS" "$typecheck_cmd"
    else
      record_result "$REPORT_FILE" "typecheck" "FAIL" "exit code ${tc_exit}"
      OVERALL_EXIT=1
    fi
  else
    record_result "$REPORT_FILE" "typecheck" "INFO" "skipped (no package.json or cmd empty)"
  fi

  # 2. New runtime deps vs branch^
  local new_deps_check
  new_deps_check="$(read_config_field "arch.new_deps_check" "$CONFIG_FILE")"
  if [[ "$new_deps_check" == "true" && -f "${WORKTREE}/package.json" ]]; then
    # Get old package.json from branch^
    local old_json
    old_json="$(git -C "$WORKTREE" show "${BRANCH}^:package.json" 2>/dev/null || echo '{}')"
    local new_json
    new_json="$(cat "${WORKTREE}/package.json")"

    local new_deps
    new_deps="$(node -e "
      let oldPkg, newPkg;
      try { oldPkg = JSON.parse(process.argv[1]); } catch(e) { oldPkg = {}; }
      try { newPkg = JSON.parse(process.argv[2]); } catch(e) { newPkg = {}; }
      const oldDeps = Object.keys(oldPkg.dependencies || {});
      const newDeps = Object.keys(newPkg.dependencies || {});
      const added = newDeps.filter(d => !oldDeps.includes(d));
      added.forEach(d => console.log('new runtime dep: ' + d));
    " "$old_json" "$new_json" 2>/dev/null || true)"

    if [[ -n "$new_deps" ]]; then
      record_result "$REPORT_FILE" "new_deps" "FAIL" "new runtime dependencies detected"
      echo "$new_deps" >> "$REPORT_FILE"
      OVERALL_EXIT=1
    else
      record_result "$REPORT_FILE" "new_deps" "PASS" "no new runtime deps"
    fi
  else
    record_result "$REPORT_FILE" "new_deps" "INFO" "skipped"
  fi

  # 3. Stray .env* files
  local stray_env_json
  stray_env_json="$(read_config_field "arch.stray_env_files" "$CONFIG_FILE")"
  local stray_patterns=()
  while IFS= read -r _line; do
    [[ -z "$_line" ]] || stray_patterns+=("$_line")
  done < <(node -e "
    try { JSON.parse('${stray_env_json}').forEach(p => console.log(p)); } catch(e) {}
  " 2>/dev/null)

  # Read the provisioned-config exemption list (CR-079 single source).
  # config.yml lives two directories above SCRIPT_DIR (.cleargate/scripts/../..).
  local CONFIG_YML
  CONFIG_YML="$(cd "${SCRIPT_DIR}/../.." && pwd)/.cleargate/config.yml"
  local provisioned_config=()
  while IFS= read -r _pline; do
    [[ -z "$_pline" ]] || provisioned_config+=("$_pline")
  done < <(read_provision_config "${CONFIG_YML}")

  # Helper: returns 0 (true) if a pattern is in the provisioned-config list.
  is_provisioned() {
    local _pat="$1"
    local _p
    for _p in "${provisioned_config[@]:-}"; do
      [[ "$_p" = "$_pat" ]] && return 0
    done
    return 1
  }

  local stray_found=0
  local stray_details=""
  for pat in "${stray_patterns[@]:-}"; do
    [[ -z "$pat" ]] && continue
    if [[ -f "${WORKTREE}/${pat}" || -L "${WORKTREE}/${pat}" ]]; then
      # Skip patterns that are in the provisioned-config list (CR-079 exemption).
      if is_provisioned "${pat}"; then
        continue
      fi
      stray_details+="${pat}"$'\n'
      stray_found=1
    fi
  done
  if [[ $stray_found -eq 1 ]]; then
    record_result "$REPORT_FILE" "stray_env_files" "FAIL" "$(echo "$stray_details" | tr '\n' ' ')"
    OVERALL_EXIT=1
  else
    record_result "$REPORT_FILE" "stray_env_files" "PASS" "no stray .env files"
  fi

  # 4. File count per directory
  local file_count_report
  file_count_report="$(read_config_field "arch.file_count_report" "$CONFIG_FILE")"
  if [[ "$file_count_report" == "true" ]]; then
    record_result "$REPORT_FILE" "file_count_report" "INFO" "directory file counts:"
    find "$WORKTREE" -maxdepth 2 -type d \
      ! -path "*/.git*" ! -path "*/node_modules*" \
      2>/dev/null | while read -r dir; do
        local count
        count=$(find "$dir" -maxdepth 1 -type f 2>/dev/null | wc -l | tr -d ' ')
        echo "  ${dir}: ${count} files" >> "$REPORT_FILE"
      done
  fi

  # 5. QA-Red semantic fixture lint (CR-081)
  # Glob red test files under the worktree, run qa_red_lint.mjs.
  # Gate behind arch.qa_red_lint config key (default true).
  # Uses ABSOLUTE paths — no cd (avoids cwd-leak per FLASHCARD #pre-gate #cwd-leak).
  # Uses grep -q (not grep -c || echo 0 — avoids double-count hazard per FLASHCARD #test-harness #bash).
  local qa_red_lint_enabled
  qa_red_lint_enabled="$(read_config_field "arch.qa_red_lint" "$CONFIG_FILE")"
  # Default to enabled when key is absent (empty string → treat as true)
  if [[ -z "$qa_red_lint_enabled" || "$qa_red_lint_enabled" == "true" ]]; then
    local lint_script="${SCRIPT_DIR}/qa_red_lint.mjs"
    if [[ -f "$lint_script" ]]; then
      local lint_out lint_exit
      lint_exit=0
      lint_out="$(node "${lint_script}" "${WORKTREE}" 2>&1)" || lint_exit=$?
      if [[ $lint_exit -eq 0 ]]; then
        record_result "$REPORT_FILE" "qa_red_lint" "PASS" "no semantic fixture issues"
      else
        record_result "$REPORT_FILE" "qa_red_lint" "FAIL" "$(echo "$lint_out" | head -5 | tr '\n' '|')"
        echo "$lint_out" >> "$REPORT_FILE"
        OVERALL_EXIT=1
      fi
    else
      record_result "$REPORT_FILE" "qa_red_lint" "INFO" "skipped (qa_red_lint.mjs not found at ${lint_script})"
    fi
  else
    record_result "$REPORT_FILE" "qa_red_lint" "INFO" "skipped (arch.qa_red_lint=false in config)"
  fi
}

# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------
case "$MODE" in
  qa)   run_qa ;;
  arch) run_arch ;;
esac

# ---------------------------------------------------------------------------
# Footer
# ---------------------------------------------------------------------------
{
  echo "---"
  print_summary "$REPORT_FILE"
} >> "$REPORT_FILE"

cat "$REPORT_FILE" >&2

# ---------------------------------------------------------------------------
# Lane-aware post-scan routing (STORY-022-04)
# Resolve REPO_ROOT from SCRIPT_DIR (scripts/ lives two levels below repo root)
# ---------------------------------------------------------------------------
REPO_ROOT_FOR_LANE="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ACTIVE_FILE="${REPO_ROOT_FOR_LANE}/.cleargate/sprint-runs/.active"

STORY_ID=""
if [[ -n "${BRANCH:-}" ]]; then
  STORY_ID="$(resolve_story_id_from_branch "${BRANCH}")"
fi

STATE_JSON=""
SPRINT_ID=""
SPRINT_MD=""
if [[ -f "${ACTIVE_FILE}" ]]; then
  SPRINT_ID="$(cat "${ACTIVE_FILE}" | tr -d '[:space:]')"
  STATE_JSON="${REPO_ROOT_FOR_LANE}/.cleargate/sprint-runs/${SPRINT_ID}/state.json"
  # Sprint markdown lives in delivery/pending-sync/
  SPRINT_MD="$(ls "${REPO_ROOT_FOR_LANE}/.cleargate/delivery/pending-sync/${SPRINT_ID}_"*.md 2>/dev/null | head -1 || true)"
fi

LANE="standard"
if [[ -n "${STORY_ID}" && -n "${STATE_JSON}" ]]; then
  LANE="$(resolve_lane "${STATE_JSON}" "${STORY_ID}")"
fi

if [[ "${LANE}" = "fast" ]]; then
  if [[ "${OVERALL_EXIT}" -eq 0 ]]; then
    # Fast lane + scanner pass: skip QA spawn signal
    printf 'pre-gate: lane=fast -> skipping QA spawn for %s\n' "${STORY_ID}"
    if [[ -n "${STATE_JSON}" ]]; then
      # Positional invocation: node update_state.mjs <STORY-ID> <new-state>
      CLEARGATE_STATE_FILE="${STATE_JSON}" \
        node "${SCRIPT_DIR}/update_state.mjs" "${STORY_ID}" "Architect Passed" \
        > /dev/null 2>&1 || true
    fi
    exit 0
  else
    # Fast lane + scanner fail: auto-demote + LD event
    SCANNER_FAIL_REASON="pre-gate scanner failed (exit ${OVERALL_EXIT})"
    if [[ -n "${STATE_JSON}" ]]; then
      # Positional invocation: node update_state.mjs <STORY-ID> --lane-demote <reason>
      # Capture exit independently per FLASHCARD #hooks #bash #exit-capture 2026-04-26
      _tmp_demote_out="$(mktemp)"
      CLEARGATE_STATE_FILE="${STATE_JSON}" \
        node "${SCRIPT_DIR}/update_state.mjs" "${STORY_ID}" --lane-demote \
        "${SCANNER_FAIL_REASON}" > "${_tmp_demote_out}" 2>&1
      _demote_exit=$?
      rm -f "${_tmp_demote_out}"
      if [[ ${_demote_exit} -ne 0 ]]; then
        printf 'pre-gate: warn: lane-demote failed (exit %s) for %s\n' \
          "${_demote_exit}" "${STORY_ID}" >&2
      fi
    fi
    if [[ -n "${SPRINT_MD}" ]]; then
      append_ld_event "${SPRINT_MD}" "${STORY_ID}" "${SCANNER_FAIL_REASON}"
    fi
    # Exit with the original scanner exit code so orchestrator routes to QA
    exit "${OVERALL_EXIT}"
  fi
fi

# lane=standard (or unknown/missing): existing behaviour
exit "${OVERALL_EXIT}"
