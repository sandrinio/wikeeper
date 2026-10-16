#!/usr/bin/env bash
set -u
# STORY-058-11: harness-neutral repo root (lib/harness.sh). SessionStart reads
# no stdin, so the payload argument is empty.
. "$(dirname "${BASH_SOURCE[0]}")/lib/harness.sh"
REPO_ROOT="$(cg_repo_root claude-first "")"

# cleargate-pin: 0.27.0
# Resolve cleargate CLI (three-branch resolver — CR-009):
#   1. meta-repo dogfood dist (fastest; only present in ClearGate's own repo)
#   2. on-PATH binary (global install or shim)
#   3. pinned npx invocation (always works wherever Node is present)
if [ -f "${REPO_ROOT}/cleargate-cli/dist/cli.js" ]; then
  CG=(node "${REPO_ROOT}/cleargate-cli/dist/cli.js")
elif command -v cleargate >/dev/null 2>&1; then
  CG=(cleargate)
else
  CG=(npx -y "cleargate@0.27.0")
fi

"${CG[@]}" doctor --session-start || true

# --- Sprint-active skill auto-load directive (STORY-026-01) ---
#
# BUG-036: the sentinel is not self-validating. It named SPRINT-99 in the
# ClearGate meta-repo — a sprint with no plan file anywhere — and this line
# announced an active sprint on every session for as long as that lasted.
# Directing the agent to load sprint-execution for a sprint that does not exist
# is worse than saying nothing, so check for the plan before emitting it.
ACTIVE_FILE="${REPO_ROOT}/.cleargate/sprint-runs/.active"
if [ -s "${ACTIVE_FILE}" ]; then
  SPRINT_ID="$(tr -d '[:space:]' < "${ACTIVE_FILE}")"
  if [ -n "${SPRINT_ID}" ]; then
    PLAN_FOUND=""
    for _dir in pending-sync archive; do
      for _plan in "${REPO_ROOT}/.cleargate/delivery/${_dir}/${SPRINT_ID}_"*.md \
                   "${REPO_ROOT}/.cleargate/delivery/${_dir}/${SPRINT_ID}.md"; do
        if [ -e "${_plan}" ]; then PLAN_FOUND=1; break 2; fi
      done
    done
    if [ -n "${PLAN_FOUND}" ]; then
      printf '→ Active sprint detected. Load skill: sprint-execution\n'
    else
      printf '⚠️  .cleargate/sprint-runs/.active names %s, which has no plan file — sentinel is stale. Not loading sprint-execution.\n' "${SPRINT_ID}"
    fi
  fi
fi

# ── §14.9 SessionStart sync nudge (STORY-010-08) ─────────────────────────────
# Daily-throttled: probe remote for updates at most once per 24h.
# Never auto-pulls or auto-pushes. Exits 0 regardless of outcome.
MARKER="${REPO_ROOT}/.cleargate/.sync-marker.json"
NOW_ISO=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
NOW_EPOCH=$(date +%s)

if [ ! -f "${MARKER}" ]; then
  # First run — write marker with current timestamp and skip MCP call (24h grace).
  mkdir -p "$(dirname "${MARKER}")"
  printf '{"last_check":"%s"}' "${NOW_ISO}" > "${MARKER}"
else
  # Parse last_check epoch from marker using node (portable, avoids jq dep)
  LAST_CHECK_ISO=$(node -e "try{const m=JSON.parse(require('fs').readFileSync('${MARKER}','utf8'));process.stdout.write(m.last_check||'1970-01-01T00:00:00Z')}catch{process.stdout.write('1970-01-01T00:00:00Z')}" 2>/dev/null || echo "1970-01-01T00:00:00Z")
  LAST_EPOCH=$(node -e "process.stdout.write(String(Math.floor(new Date('${LAST_CHECK_ISO}').getTime()/1000)))" 2>/dev/null || echo "0")
  ELAPSED=$(( NOW_EPOCH - LAST_EPOCH ))

  if [ "${ELAPSED}" -ge 86400 ]; then
    # ≥24h since last check — run probe (3s timeout, R7 mitigation)
    RESULT_FILE=$(mktemp)
    # Cross-platform 3-second timeout: prefer `timeout` (Linux); fall back to
    # background-process kill (macOS where GNU coreutils may be absent).
    if command -v timeout > /dev/null 2>&1; then
      timeout 3 "${CG[@]}" sync --check > "${RESULT_FILE}" 2>/dev/null || true
    else
      "${CG[@]}" sync --check > "${RESULT_FILE}" 2>/dev/null &
      _PROBE_PID=$!
      (sleep 3 && kill "${_PROBE_PID}" 2>/dev/null) &
      _KILL_PID=$!
      wait "${_PROBE_PID}" 2>/dev/null || true
      kill "${_KILL_PID}" 2>/dev/null || true
      wait "${_KILL_PID}" 2>/dev/null || true
    fi
    UPDATES=$(node -e "
try {
  var data = require('fs').readFileSync(process.argv[1], 'utf8').trim();
  var obj = JSON.parse(data);
  process.stdout.write(String(obj.updates || 0));
} catch(e) {
  process.stdout.write('0');
}
" "${RESULT_FILE}" 2>/dev/null || echo "0")
    rm -f "${RESULT_FILE}"
    if [ "${UPDATES}" -gt 0 ] 2>/dev/null; then
      printf '📡 ClearGate: %s remote updates since yesterday — run `cleargate sync` to reconcile.\n' "${UPDATES}"
    fi
    # Marker is updated by sync --check itself; no re-write needed here.
  fi
fi
exit 0
