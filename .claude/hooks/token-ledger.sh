#!/usr/bin/env bash
# SubagentStop hook: append one JSONL row per subagent completion to the active sprint's token ledger.
#
# Input: JSON on stdin from Claude Code with fields session_id, transcript_path, cwd, hook_event_name.
# Output: appends to .cleargate/sprint-runs/<sprint-id>/token-ledger.jsonl
# Cost computation is deferred to the Reporter agent (prices change; keep raw).
#
# ── Per-task sentinel contract (ADDED 2026-04-20) ─────────────────────────────
#
#   Before each Task (Agent) dispatch the orchestrator writes:
#     .cleargate/sprint-runs/<sprint>/.pending-task-<N>.json
#   with shape:
#     { "agent_type": "developer"|"architect"|"qa"|"reporter",
#       "work_item_id": "STORY-006-01",
#       "turn_index": <int — count of assistant turns in orchestrator transcript at dispatch>,
#       "started_at": "<ISO-8601>" }
#
#   On SubagentStop fire the hook:
#     1. Finds the newest .pending-task-*.json in the active sprint dir.
#     2. Reads agent_type, work_item_id, turn_index from it.
#     3. Computes token delta = sum of assistant turns at index >= turn_index in the transcript
#        (NOT the cumulative whole-file sum — that was the SPRINT-05 double-count bug).
#     4. Writes one JSONL row to token-ledger.jsonl with sentinel attribution.
#     5. Deletes the sentinel atomically (mv → append → rm .processed-*).
#
#   If no sentinel exists: the hook refuses to attribute rather than infer. agent_type
#   ships as "unattributed" and work_item_id as "" (BUG-069) — the legacy transcript-grep
#   and prior-ledger-row inheritance this replaced could fabricate or perpetuate a wrong
#   attribution indefinitely once one wrong value landed. The full-transcript delta is
#   still computed on this path (single-fire: no prior rows to double-count).
#   Fail-silent either way — never block a subagent stop (exit 0 always).
#
# ── Active sprint detection ────────────────────────────────────────────────────
#
#   Primary  : .cleargate/sprint-runs/.active sentinel file (one line: "SPRINT-NN")
#              Orchestrator writes this at sprint kickoff, removes/updates at close.
#   Fallback : .cleargate/sprint-runs/_off-sprint/token-ledger.jsonl
#              When no .active sentinel exists, writes still get captured but
#              tagged _off-sprint instead of misrouting to a stale sprint dir.
#   (Removed): the old `ls -td sprint-runs/*/ | head -1` mtime heuristic — it
#              misrouted SPRINT-04 firings to SPRINT-03 because ledger appends
#              themselves bumped SPRINT-03's mtime. See REPORT.md SPRINT-04.
#
# ── Work-item ID / agent_type resolution when no ground truth exists (BUG-069) ─
#
#   Ground truth : the CR-026 dispatch marker (highest priority) or the per-task
#                   pending-task sentinel (second priority) — both read above,
#                   both written by a PreToolUse hook at dispatch time, never
#                   inferred after the fact.
#   Refusal      : when neither source supplies a value — or the sentinel's own
#                   agent_type carries its literal "unknown" default
#                   (pending-task-sentinel.sh:173) — the row ships
#                   agent_type="unattributed" and/or work_item_id="" rather than
#                   guessing.
#   story_id     : populated only when work_item_id is a STORY-* (backward
#                   compat); stays "" under a refusal.
#   (Removed)    : transcript-grep inference (first-user-message scan and
#                   anywhere-grep) and prior-ledger-row inheritance — both could
#                   fabricate or perpetuate a wrong attribution indefinitely once
#                   one wrong value landed (BUG-069 field report: 101/101 rows
#                   attributed to "architect" in a sprint architect never ran).
#
# Robustness: never exits non-zero on parse failure (never block a subagent stop). Errors go to a
# sibling hook.log so you can diagnose without fighting the runtime.

set -u

# CR-026: SessionStart blocked-items banner poisons transcript-grep (BUG-024 §3.1 Defect 2).
# Skip-pattern: any line starting with "<N> items? blocked: " is the SessionStart banner.
# Post-BUG-069 its only remaining consumer is the BUG-029 tuple-match's transcript
# scan below (marker-present path) — the legacy sed-filtered resolution steps that
# used to apply it on the marker-absent path are gone.
BANNER_SKIP_RE='^[0-9]+ items? blocked: '

# Read stdin once (STORY-058-11: before the repo root, which takes the
# payload's cwd when neither env var is set; formerly the first line of the
# grouped block below).
INPUT="$(cat)"

# STORY-058-11: harness-neutral repo root (lib/harness.sh), orchestrator-first —
# ORCHESTRATOR_PROJECT_DIR, then CLAUDE_PROJECT_DIR, then the git top level of
# the payload's cwd, then the current dir.
. "$(dirname "${BASH_SOURCE[0]}")/lib/harness.sh"
REPO_ROOT="$(cg_repo_root orchestrator-first "${INPUT}")"
LOG_DIR="${REPO_ROOT}/.cleargate/hook-log"
mkdir -p "${LOG_DIR}"
HOOK_LOG="${LOG_DIR}/token-ledger.log"
ACTIVE_SENTINEL="${REPO_ROOT}/.cleargate/sprint-runs/.active"

# ── STORY-058-10 (M5-A24): explicit host selection for the shared hook-signal
# contract (a copy of pre-edit-gate.sh's parser). Defaults to claude when no
# --host flag is present (e.g. direct invocation).
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

{
  # ── STORY-058-10 (AD-6, M5-A24): under Codex, SubagentStop identity comes
  # from the per-turn Codex sentinel written by pending-task-sentinel.sh, not
  # the Claude dispatch-marker/transcript chain below — Codex's SubagentStop
  # payload already carries agent_type and agent_id (H11), and per-subagent
  # token usage is not verifiable, so no ledger row is written. This branch
  # sits before any transcript_path check or usage parsing (never reached by
  # the Claude path — HOST defaults to "claude").
  if [[ "${HOST}" == "codex" ]]; then
    CODEX_AGENT_TYPE="$(printf '%s' "${INPUT}" | jq -r '.agent_type // empty')"
    CODEX_AGENT_ID="$(printf '%s' "${INPUT}" | jq -r '.agent_id // empty')"

    CODEX_SPRINT_ID=""
    if [[ -f "${ACTIVE_SENTINEL}" ]]; then
      CODEX_SPRINT_ID="$(tr -d '[:space:]' < "${ACTIVE_SENTINEL}")"
    fi
    [[ -z "${CODEX_SPRINT_ID}" ]] && CODEX_SPRINT_ID="_off-sprint"
    CODEX_SPRINT_DIR="${REPO_ROOT}/.cleargate/sprint-runs/${CODEX_SPRINT_ID}"
    mkdir -p "${CODEX_SPRINT_DIR}"

    # Oldest-first (`ls -tr` reverses `-t`'s newest-first order).
    CODEX_SENTINELS=()
    while IFS= read -r _cs; do
      CODEX_SENTINELS+=("${_cs}")
    done < <(ls -tr "${CODEX_SPRINT_DIR}"/.pending-codex-task-*.json 2>/dev/null)

    # Claim the OLDEST sentinel whose agent_type matches the payload's; when
    # none matches, fall back to the oldest sentinel overall (never the
    # newest — TPV R-H6).
    CODEX_CLAIMED=""
    for _cs in ${CODEX_SENTINELS[@]+"${CODEX_SENTINELS[@]}"}; do
      [[ -f "${_cs}" ]] || continue
      _cs_agent="$(jq -r '.agent_type // empty' "${_cs}" 2>/dev/null)"
      if [[ "${_cs_agent}" == "${CODEX_AGENT_TYPE}" ]]; then
        CODEX_CLAIMED="${_cs}"
        break
      fi
    done
    if [[ -z "${CODEX_CLAIMED}" ]]; then
      CODEX_CLAIMED="${CODEX_SENTINELS[0]:-}"
    fi

    CODEX_WORK_ITEM=""
    CODEX_SENTINEL_NAME=""
    if [[ -n "${CODEX_CLAIMED}" && -f "${CODEX_CLAIMED}" ]]; then
      CODEX_WORK_ITEM="$(jq -r '.work_item_id // empty' "${CODEX_CLAIMED}" 2>/dev/null)"
      CODEX_SENTINEL_NAME="$(basename "${CODEX_CLAIMED}")"
      rm -f "${CODEX_CLAIMED}"
    fi

    printf '[%s] codex-identity sprint=%s agent_type=%s agent_id=%s work_item=%s sentinel=%s metering=unavailable\n' \
      "$(date -u +%FT%TZ)" "${CODEX_SPRINT_ID}" "${CODEX_AGENT_TYPE}" "${CODEX_AGENT_ID}" "${CODEX_WORK_ITEM}" "${CODEX_SENTINEL_NAME}" \
      >> "${HOOK_LOG}"
    exit 0
  fi

  # --- parse hook payload ---
  TRANSCRIPT_PATH="$(printf '%s' "${INPUT}" | jq -r '.transcript_path // empty')"
  SESSION_ID="$(printf '%s' "${INPUT}" | jq -r '.session_id // empty')"

  if [[ -z "${TRANSCRIPT_PATH}" || ! -f "${TRANSCRIPT_PATH}" ]]; then
    printf '[%s] no transcript_path (session=%s)\n' "$(date -u +%FT%TZ)" "${SESSION_ID}" >> "${HOOK_LOG}"
    exit 0
  fi

  # --- determine active sprint via sentinel ---
  SPRINT_ID=""
  if [[ -f "${ACTIVE_SENTINEL}" ]]; then
    SPRINT_ID="$(tr -d '[:space:]' < "${ACTIVE_SENTINEL}")"
  fi

  # BUG-036: note — but do not act on — a sentinel naming a sprint with no plan
  # file. In the ClearGate meta-repo the sentinel named SPRINT-99, which had no
  # plan anywhere under delivery/, and 66,679,111 tokens accumulated in a phantom
  # run directory with nothing saying so.
  #
  # This deliberately still routes to the named directory. Rerouting to
  # _off-sprint would relocate data without adding detection, and it would break
  # attribution for any legitimately sparse checkout. The condition is caught
  # where it belongs: `sprint init` now refuses to create a plan-less sprint at
  # all, and `doctor --session-start` reports a stale sentinel on every session.
  # This line exists so the hook log dates the drift when it does occur.
  if [[ -n "${SPRINT_ID}" ]]; then
    PLAN_FOUND=""
    for _dir in pending-sync archive; do
      for _plan in "${REPO_ROOT}/.cleargate/delivery/${_dir}/${SPRINT_ID}_"*.md \
                   "${REPO_ROOT}/.cleargate/delivery/${_dir}/${SPRINT_ID}.md"; do
        if [[ -e "${_plan}" ]]; then PLAN_FOUND=1; break 2; fi
      done
    done
    if [[ -z "${PLAN_FOUND}" ]]; then
      printf '[%s] WARNING: sentinel names %s but no plan file exists under delivery/ — sentinel may be stale\n' \
        "$(date -u +%FT%TZ)" "${SPRINT_ID}" >> "${HOOK_LOG}"
    fi
  fi

  if [[ -n "${SPRINT_ID}" ]]; then
    SPRINT_DIR="${REPO_ROOT}/.cleargate/sprint-runs/${SPRINT_ID}"
    mkdir -p "${SPRINT_DIR}"
    printf '[%s] routing to sprint=%s (sentinel)\n' "$(date -u +%FT%TZ)" "${SPRINT_ID}" >> "${HOOK_LOG}"
  else
    # No active sprint: capture the row in an off-sprint ledger so we don't lose data.
    SPRINT_ID="_off-sprint"
    SPRINT_DIR="${REPO_ROOT}/.cleargate/sprint-runs/_off-sprint"
    mkdir -p "${SPRINT_DIR}"
    printf '[%s] no .active sentinel — bucketing as _off-sprint\n' "$(date -u +%FT%TZ)" >> "${HOOK_LOG}"
  fi
  LEDGER="${SPRINT_DIR}/token-ledger.jsonl"

  # --- dispatch-marker attribution (CR-016 + CR-026 + BUG-029, highest priority) ---
  # The PreToolUse:Task hook (pre-tool-use-task.sh, CR-026) auto-writes:
  #   .cleargate/sprint-runs/<sprint>/.dispatch-<ts>-<pid>-<rand>.json
  # with { work_item_id, agent_type, spawned_at, session_id, writer }.
  # Reading this file (if present) gives accurate attribution; falls back to the
  # per-task pending-task sentinel (second priority) and transcript-scan (third).
  #
  # BUG-029 fix — tuple-match replaces newest-file lookup:
  # When two parallel Task() spawns write two distinct .dispatch-*.json files,
  # the old `ls -t | head -1` (newest-file) lookup grabs whichever was written
  # last — mis-attributing the ledger row to the wrong story. The fix: extract
  # the work_item_id from the SubagentStop transcript (first user message) and
  # match it against the work_item_id field inside each .dispatch-*.json.
  # Fallback: if no tuple match, fall back to newest-file lookup with a warning.
  #
  # Atomicity: rename to .processed-$$ before reading, then delete post-row-write.
  # This prevents stale dispatch files from leaking attribution to a later subagent.
  SENTINEL_AGENT_TYPE=""
  SENTINEL_WORK_ITEM_ID=""
  DISPATCH_PROCESSED=""
  DISPATCH_RUN_ID=""

  # BUG-029: extract work_item_id from the SubagentStop transcript (first user message).
  # This is the orchestrator's dispatch prompt — by convention it starts with the
  # work_item_id (e.g. "STORY=NNN-NN" or "STORY-NNN-NN") or contains it prominently.
  # We use non-capturing groups (no capture groups → scan returns full match string)
  # and a broad alphanumeric suffix to also match letter-suffix IDs like STORY-A, STORY-B
  # used in tests and fast-lane items (not just digit-keyed like the legacy path).
  TRANSCRIPT_WORK_ITEM=""
  if [[ -f "${TRANSCRIPT_PATH}" ]]; then
    # Primary: first user message, scan for work-item reference (TYPE[-=]ID).
    # scan("(?:...)+") with no capture groups returns the full match string.
    TRANSCRIPT_WORK_ITEM="$(jq -rs --arg banner_re "${BANNER_SKIP_RE}" '
      [.[] | select(.type == "user")]
      | [.[] | select(
          (.message.content | if type == "array"
            then map(.text? // "") | join(" ")
            else (. // "") end
          ) | test($banner_re) | not
        )]
      | .[0].message.content
      | if type == "array" then map(.text? // "") | join(" ") else (. // "") end
      | tostring
      | [scan("(?:STORY|PROPOSAL|EPIC|CR|BUG|HOTFIX)[-=][A-Za-z0-9]+(?:-[A-Za-z0-9]+)?")]
      | .[0] // ""
    ' "${TRANSCRIPT_PATH}" 2>/dev/null | head -1 | sed 's/=/-/g')"
    # Normalize: replace = with - (STORY=NNN-NN → STORY-NNN-NN)
    TRANSCRIPT_WORK_ITEM="$(printf '%s' "${TRANSCRIPT_WORK_ITEM}" | sed 's/=/-/g')"
    [[ "${TRANSCRIPT_WORK_ITEM}" == "" || "${TRANSCRIPT_WORK_ITEM}" == "null" ]] && TRANSCRIPT_WORK_ITEM=""
  fi

  # BUG-029: tuple-match — iterate dispatch files, find one whose work_item_id
  # matches TRANSCRIPT_WORK_ITEM. If exactly one matches, consume it; otherwise
  # fall back to newest-file (legacy CR-026 path) with a warning logged.
  DISPATCH_FILE=""
  if [[ -n "${TRANSCRIPT_WORK_ITEM}" ]]; then
    # Search all dispatch files for a content match on work_item_id.
    MATCHED_FILE=""
    MATCH_COUNT=0
    for CANDIDATE in "${SPRINT_DIR}"/.dispatch-*.json; do
      [[ -f "${CANDIDATE}" ]] || continue
      CANDIDATE_WORK_ITEM="$(jq -r '.work_item_id // empty' "${CANDIDATE}" 2>/dev/null)"
      if [[ "${CANDIDATE_WORK_ITEM}" == "${TRANSCRIPT_WORK_ITEM}" ]]; then
        MATCHED_FILE="${CANDIDATE}"
        MATCH_COUNT=$(( MATCH_COUNT + 1 ))
      fi
    done
    if [[ "${MATCH_COUNT}" -eq 1 ]]; then
      DISPATCH_FILE="${MATCHED_FILE}"
      printf '[%s] dispatch-marker tuple-match: transcript_work_item=%s → %s\n' \
        "$(date -u +%FT%TZ)" "${TRANSCRIPT_WORK_ITEM}" "${DISPATCH_FILE}" >> "${HOOK_LOG}"
    elif [[ "${MATCH_COUNT}" -gt 1 ]]; then
      printf '[%s] warn: %d dispatch files matched work_item=%s — falling back to newest-file\n' \
        "$(date -u +%FT%TZ)" "${MATCH_COUNT}" "${TRANSCRIPT_WORK_ITEM}" >> "${HOOK_LOG}"
    fi
  fi

  # Fallback: newest-file lookup (CR-026 path-B) when tuple-match found nothing.
  if [[ -z "${DISPATCH_FILE}" ]]; then
    if [[ -n "${TRANSCRIPT_WORK_ITEM}" ]]; then
      printf '[%s] warn: no tuple-match for work_item=%s — falling back to newest-file lookup\n' \
        "$(date -u +%FT%TZ)" "${TRANSCRIPT_WORK_ITEM}" >> "${HOOK_LOG}"
    fi
    DISPATCH_FILE="$(ls -t "${SPRINT_DIR}"/.dispatch-*.json 2>/dev/null | head -1)"
  fi

  if [[ -n "${DISPATCH_FILE}" && -f "${DISPATCH_FILE}" ]]; then
    DISPATCH_PROCESSED="${DISPATCH_FILE%.json}.processed-$$"
    if mv "${DISPATCH_FILE}" "${DISPATCH_PROCESSED}" 2>/dev/null; then
      DISPATCH_JSON="$(cat "${DISPATCH_PROCESSED}" 2>/dev/null)"
      DISPATCH_AGENT="$(printf '%s' "${DISPATCH_JSON}" | jq -r '.agent_type // empty' 2>/dev/null)"
      DISPATCH_WORK_ITEM="$(printf '%s' "${DISPATCH_JSON}" | jq -r '.work_item_id // empty' 2>/dev/null)"
      DISPATCH_RUN_ID="$(printf '%s' "${DISPATCH_JSON}" | jq -r '.run_id // empty' 2>/dev/null)"
      if [[ -n "${DISPATCH_AGENT}" && -n "${DISPATCH_WORK_ITEM}" ]]; then
        SENTINEL_AGENT_TYPE="${DISPATCH_AGENT}"
        SENTINEL_WORK_ITEM_ID="${DISPATCH_WORK_ITEM}"
        printf '[%s] dispatch-marker: session=%s work_item=%s agent=%s\n' \
          "$(date -u +%FT%TZ)" "${SESSION_ID}" "${SENTINEL_WORK_ITEM_ID}" "${SENTINEL_AGENT_TYPE}" >> "${HOOK_LOG}"
      else
        printf '[%s] warn: dispatch file malformed or missing fields, falling back: %s\n' \
          "$(date -u +%FT%TZ)" "${DISPATCH_PROCESSED}" >> "${HOOK_LOG}"
      fi
    else
      printf '[%s] warn: could not rename dispatch file %s (race?), skipping\n' \
        "$(date -u +%FT%TZ)" "${DISPATCH_FILE}" >> "${HOOK_LOG}"
    fi
  fi
  # DISPATCH_PROCESSED is deleted after row-write (see "delete processed dispatch" block below).

  # --- per-task sentinel: find newest .pending-task-*.json in sprint dir ---
  # Second-priority fallback when dispatch-marker is absent or malformed.
  # When dispatch-marker already populated SENTINEL_AGENT_TYPE + SENTINEL_WORK_ITEM_ID,
  # still read the pending-task sentinel to get turn_index + started_at for delta accounting.
  SENTINEL_FILE=""
  SENTINEL_TURN_INDEX=0
  SENTINEL_STARTED_AT=""
  # Preserve SENTINEL_AGENT_TYPE / SENTINEL_WORK_ITEM_ID from dispatch block above.

  if [[ -d "${SPRINT_DIR}" ]]; then
    # Find newest pending-task sentinel (ls -t sorts newest first)
    SENTINEL_FILE="$(ls -t "${SPRINT_DIR}"/.pending-task-*.json 2>/dev/null | head -1)"
  fi

  if [[ -n "${SENTINEL_FILE}" && -f "${SENTINEL_FILE}" ]]; then
    SENTINEL_JSON="$(cat "${SENTINEL_FILE}" 2>/dev/null)"
    # Only use attribution from pending-task if dispatch-marker did not already provide it.
    if [[ -z "${SENTINEL_AGENT_TYPE}" ]]; then
      SENTINEL_AGENT_TYPE="$(printf '%s' "${SENTINEL_JSON}" | jq -r '.agent_type // empty' 2>/dev/null)"
    fi
    if [[ -z "${SENTINEL_WORK_ITEM_ID}" ]]; then
      SENTINEL_WORK_ITEM_ID="$(printf '%s' "${SENTINEL_JSON}" | jq -r '.work_item_id // empty' 2>/dev/null)"
    fi
    SENTINEL_TURN_INDEX="$(printf '%s' "${SENTINEL_JSON}" | jq -r '.turn_index // 0' 2>/dev/null)"
    SENTINEL_STARTED_AT="$(printf '%s' "${SENTINEL_JSON}" | jq -r '.started_at // empty' 2>/dev/null)"
    printf '[%s] found sentinel=%s agent=%s work_item=%s turn_index=%s\n' \
      "$(date -u +%FT%TZ)" "${SENTINEL_FILE}" "${SENTINEL_AGENT_TYPE}" "${SENTINEL_WORK_ITEM_ID}" "${SENTINEL_TURN_INDEX}" >> "${HOOK_LOG}"
  fi

  # --- compute token usage ---
  # DELTA MODEL (per-task sentinel path): slice transcript from turn_index forward.
  # CUMULATIVE GUARD (no-sentinel path): use entire transcript — single-fire so no double-count.
  #
  # turn_index counts assistant turns (0-based). We select assistant turns, skip the first
  # turn_index of them, then sum the remainder. This isolates tokens attributable to this subagent run.
  if [[ -n "${SENTINEL_FILE}" && -f "${SENTINEL_FILE}" && -n "${SENTINEL_AGENT_TYPE}" ]]; then
    # Delta model: slice from turn_index
    USAGE_JSON="$(jq -cs --argjson idx "${SENTINEL_TURN_INDEX}" '
      [ .[] | select(.type == "assistant" and .message.usage) ]
      | .[$idx:]
      | (map(.message.usage.input_tokens // 0)                     | add // 0) as $in
      | (map(.message.usage.output_tokens // 0)                    | add // 0) as $out
      | (map(.message.usage.cache_creation_input_tokens // 0)      | add // 0) as $cc
      | (map(.message.usage.cache_read_input_tokens // 0)          | add // 0) as $cr
      | (map(.message.model) | unique | map(select(. != null)) | join(","))     as $models
      | (length)                                                   as $turns
      | {input: $in, output: $out, cache_creation: $cc, cache_read: $cr, model: $models, turns: $turns}
    ' "${TRANSCRIPT_PATH}" 2>/dev/null)"
  else
    # No sentinel: sum all assistant turns (full transcript — first fire, no prior rows to double-count)
    USAGE_JSON="$(jq -cs '
      map(select(.type == "assistant" and .message.usage))
      | (map(.message.usage.input_tokens // 0)                     | add // 0) as $in
      | (map(.message.usage.output_tokens // 0)                    | add // 0) as $out
      | (map(.message.usage.cache_creation_input_tokens // 0)      | add // 0) as $cc
      | (map(.message.usage.cache_read_input_tokens // 0)          | add // 0) as $cr
      | (map(.message.model) | unique | map(select(. != null)) | join(","))     as $models
      | (length)                                                   as $turns
      | {input: $in, output: $out, cache_creation: $cc, cache_read: $cr, model: $models, turns: $turns}
    ' "${TRANSCRIPT_PATH}" 2>/dev/null)"
  fi

  if [[ -z "${USAGE_JSON}" || "${USAGE_JSON}" == "null" ]]; then
    printf '[%s] could not parse usage from %s\n' "$(date -u +%FT%TZ)" "${TRANSCRIPT_PATH}" >> "${HOOK_LOG}"
    exit 0
  fi

  # --- resolve agent_type and work_item_id ---
  # BUG-069: attribution comes ONLY from a dispatch-time ground-truth source — the
  # CR-026 dispatch marker (read above) or the pending-task sentinel. When neither
  # supplied a value we REFUSE to attribute rather than infer one. A wrong
  # attribution is strictly worse than a missing one: it looks like data, and the
  # Reporter consumes it without suspicion. The prior-row inheritance this replaced
  # was self-referential — the fallback read its own last output, so the first wrong
  # value was copied into every subsequent row for the life of the sprint (101/101
  # rows in the observed field case).
  #
  # The two fields refuse independently: pending-task-sentinel.sh can legitimately
  # write a sentinel with a populated agent_type and an empty work_item_id (its
  # regex missed), so agent_type keeps real ground truth while only work_item_id
  # refuses in that case.
  #
  # agent_type also refuses the literal string "unknown" — not just emptiness.
  # pending-task-sentinel.sh:173 defaults agent_type to "unknown" (non-empty) when
  # a spawn carries no tool_input.subagent_type, so a -z-only guard would let that
  # fabricated value straight through.
  AGENT_TYPE="${SENTINEL_AGENT_TYPE}"
  WORK_ITEM_ID="${SENTINEL_WORK_ITEM_ID}"

  if [[ -z "${AGENT_TYPE}" || "${AGENT_TYPE}" == "unknown" ]]; then
    AGENT_TYPE="unattributed"
    printf '[%s] unattributed agent_type: no dispatch marker and no usable pending-task sentinel (session=%s sprint=%s)\n' \
      "$(date -u +%FT%TZ)" "${SESSION_ID}" "${SPRINT_ID}" >> "${HOOK_LOG}"
  fi

  if [[ -z "${WORK_ITEM_ID}" ]]; then
    WORK_ITEM_ID=""
    printf '[%s] unattributed work_item_id: no dispatch marker and no pending-task sentinel (session=%s sprint=%s)\n' \
      "$(date -u +%FT%TZ)" "${SESSION_ID}" "${SPRINT_ID}" >> "${HOOK_LOG}"
  fi

  # story_id is populated only when the work item is a STORY-* (backward compat)
  STORY_ID=""
  if [[ "${WORK_ITEM_ID}" == STORY-* ]]; then
    STORY_ID="${WORK_ITEM_ID}"
  fi

  # --- atomic sentinel deletion (mv → append → rm) ---
  PROCESSED_FILE=""
  if [[ -n "${SENTINEL_FILE}" && -f "${SENTINEL_FILE}" ]]; then
    PROCESSED_FILE="${SENTINEL_FILE%.json}.processed-$$"
    if ! mv "${SENTINEL_FILE}" "${PROCESSED_FILE}" 2>/dev/null; then
      # mv failed (race condition or permissions): proceed without deletion
      PROCESSED_FILE=""
      printf '[%s] warn: could not mv sentinel %s\n' "$(date -u +%FT%TZ)" "${SENTINEL_FILE}" >> "${HOOK_LOG}"
    fi
  fi

  # --- per-turn delta math (CR-018) ---
  # USAGE_JSON (computed above) is the intra-fire cumulative session total from the transcript.
  # We maintain .session-totals.json keyed by session_id with the last-known cumulative totals.
  # Cross-fire delta = current_session_total − prior_session_total.
  # For the first fire of a session, delta == session_total.
  #
  # Atomic update via mktemp + mv (POSIX rename is atomic on the same filesystem).
  # Concurrent-fire safety: two worktree SubagentStop fires may race. The atomic rename
  # ensures one writer wins; the other sees the updated file on its next read.
  SESSION_TOTALS_FILE="${SPRINT_DIR}/.session-totals.json"

  # Read current session totals (or empty object if file absent)
  PRIOR_SESSION_JSON="{}"
  if [[ -f "${SESSION_TOTALS_FILE}" ]]; then
    PRIOR_SESSION_JSON="$(cat "${SESSION_TOTALS_FILE}" 2>/dev/null || printf '{}')"
    [[ -z "${PRIOR_SESSION_JSON}" ]] && PRIOR_SESSION_JSON="{}"
  fi

  # Compute current intra-fire totals from USAGE_JSON
  CURRENT_IN="$(printf '%s' "${USAGE_JSON}" | jq -r '.input // 0')"
  CURRENT_OUT="$(printf '%s' "${USAGE_JSON}" | jq -r '.output // 0')"
  CURRENT_CC="$(printf '%s' "${USAGE_JSON}" | jq -r '.cache_creation // 0')"
  CURRENT_CR="$(printf '%s' "${USAGE_JSON}" | jq -r '.cache_read // 0')"
  CURRENT_MODEL="$(printf '%s' "${USAGE_JSON}" | jq -r '.model // ""')"
  CURRENT_TURNS="$(printf '%s' "${USAGE_JSON}" | jq -r '.turns // 0')"

  # Look up prior totals for this session_id
  PRIOR_IN="$(printf '%s' "${PRIOR_SESSION_JSON}" | jq -r --arg sid "${SESSION_ID}" '.[$sid].input // 0' 2>/dev/null || printf '0')"
  PRIOR_OUT="$(printf '%s' "${PRIOR_SESSION_JSON}" | jq -r --arg sid "${SESSION_ID}" '.[$sid].output // 0' 2>/dev/null || printf '0')"
  PRIOR_CC="$(printf '%s' "${PRIOR_SESSION_JSON}" | jq -r --arg sid "${SESSION_ID}" '.[$sid].cache_creation // 0' 2>/dev/null || printf '0')"
  PRIOR_CR="$(printf '%s' "${PRIOR_SESSION_JSON}" | jq -r --arg sid "${SESSION_ID}" '.[$sid].cache_read // 0' 2>/dev/null || printf '0')"

  # Compute delta = current − prior (floor at 0 to guard against transcript-reread edge cases)
  DELTA_IN=$(( CURRENT_IN - PRIOR_IN ))
  DELTA_OUT=$(( CURRENT_OUT - PRIOR_OUT ))
  DELTA_CC=$(( CURRENT_CC - PRIOR_CC ))
  DELTA_CR=$(( CURRENT_CR - PRIOR_CR ))
  [[ "${DELTA_IN}" -lt 0 ]] && DELTA_IN=0
  [[ "${DELTA_OUT}" -lt 0 ]] && DELTA_OUT=0
  [[ "${DELTA_CC}" -lt 0 ]] && DELTA_CC=0
  [[ "${DELTA_CR}" -lt 0 ]] && DELTA_CR=0

  # Build delta and session_total JSON blocks
  DELTA_JSON="$(jq -cn \
    --argjson in "${DELTA_IN}" \
    --argjson out "${DELTA_OUT}" \
    --argjson cc "${DELTA_CC}" \
    --argjson cr "${DELTA_CR}" \
    '{input: $in, output: $out, cache_creation: $cc, cache_read: $cr}')"

  SESSION_TOTAL_JSON="$(jq -cn \
    --argjson in "${CURRENT_IN}" \
    --argjson out "${CURRENT_OUT}" \
    --argjson cc "${CURRENT_CC}" \
    --argjson cr "${CURRENT_CR}" \
    '{input: $in, output: $out, cache_creation: $cc, cache_read: $cr}')"

  # Atomically update .session-totals.json with new totals for this session_id
  # STORY-033-02: also key by RUN_ID when dispatch marker carries one (parallel-wave attribution).
  TS="$(date -u +%FT%TZ)"
  NEW_SESSION_TOTALS="$(printf '%s' "${PRIOR_SESSION_JSON}" | jq -c \
    --arg sid "${SESSION_ID}" \
    --arg run_id "${DISPATCH_RUN_ID:-}" \
    --argjson in "${CURRENT_IN}" \
    --argjson out "${CURRENT_OUT}" \
    --argjson cc "${CURRENT_CC}" \
    --argjson cr "${CURRENT_CR}" \
    --arg ts "${TS}" \
    --argjson ti "${SENTINEL_TURN_INDEX}" \
    '
      .[$sid] = {input: $in, output: $out, cache_creation: $cc, cache_read: $cr, last_ts: $ts, last_turn_index: $ti}
      | if $run_id == "" then . else .[$run_id] = {input: $in, output: $out, cache_creation: $cc, cache_read: $cr, last_ts: $ts, last_turn_index: $ti} end
    ' \
    2>/dev/null)"

  if [[ -n "${NEW_SESSION_TOTALS}" ]]; then
    SESSION_TOTALS_TMP="$(mktemp "${SESSION_TOTALS_FILE}.tmp.XXXXXX" 2>/dev/null)"
    if [[ -n "${SESSION_TOTALS_TMP}" ]]; then
      printf '%s\n' "${NEW_SESSION_TOTALS}" > "${SESSION_TOTALS_TMP}"
      mv "${SESSION_TOTALS_TMP}" "${SESSION_TOTALS_FILE}" 2>/dev/null || \
        printf '[%s] warn: could not atomic-rename session-totals\n' "${TS}" >> "${HOOK_LOG}"
    fi
  fi

  # --- STORY-033-02: RUN_ID no-op guard (barrier-written row already exists) ---
  # When the dispatch marker carries a run_id, check whether a ledger row for this
  # work_item_id + run_id already exists (written by the barrier). If so, exit 0 without
  # appending a second row — this neutralises late SubagentStop mis-attribution.
  if [[ -n "${DISPATCH_RUN_ID}" && -f "${LEDGER}" ]]; then
    if grep -q "\"run_id\":\"${DISPATCH_RUN_ID}\"" "${LEDGER}" 2>/dev/null; then
      printf '[%s] barrier row already present — skip (work_item=%s run_id=%s)\n' \
        "${TS}" "${WORK_ITEM_ID}" "${DISPATCH_RUN_ID}" >> "${HOOK_LOG}"
      # Clean up sentinels/dispatch before exit
      if [[ -n "${PROCESSED_FILE}" && -f "${PROCESSED_FILE}" ]]; then rm -f "${PROCESSED_FILE}"; fi
      if [[ -n "${DISPATCH_PROCESSED:-}" && -f "${DISPATCH_PROCESSED}" ]]; then rm -f "${DISPATCH_PROCESSED}"; fi
      exit 0
    fi
  fi

  # --- STORY-033-02: ESCALATED guard — when RUN_ID is set but transcript has no tokens ---
  # A segment whose verdict carries no tokens is recorded as ESCALATED; no row is written.
  if [[ -n "${DISPATCH_RUN_ID}" ]]; then
    if [[ "${CURRENT_IN}" -eq 0 && "${CURRENT_OUT}" -eq 0 ]]; then
      printf '[%s] ESCALATED: run_id=%s work_item=%s — no tokens in transcript, skipping row\n' \
        "${TS}" "${DISPATCH_RUN_ID}" "${WORK_ITEM_ID}" >> "${HOOK_LOG}"
      # Clean up sentinels/dispatch before exit
      if [[ -n "${PROCESSED_FILE}" && -f "${PROCESSED_FILE}" ]]; then rm -f "${PROCESSED_FILE}"; fi
      if [[ -n "${DISPATCH_PROCESSED:-}" && -f "${DISPATCH_PROCESSED}" ]]; then rm -f "${DISPATCH_PROCESSED}"; fi
      exit 0
    fi
  fi

  # --- assemble ledger row (v2 schema: delta + session_total replace flat input/output/cache_*) ---
  # STORY-033-02: include run_id field when dispatch marker carries one.
  ROW="$(jq -cn \
    --arg ts "${TS}" \
    --arg agent "${AGENT_TYPE}" \
    --arg story "${STORY_ID}" \
    --arg work_item "${WORK_ITEM_ID}" \
    --arg session "${SESSION_ID}" \
    --arg transcript "${TRANSCRIPT_PATH}" \
    --arg sprint "${SPRINT_ID}" \
    --arg sentinel_started_at "${SENTINEL_STARTED_AT}" \
    --argjson turn_index "${SENTINEL_TURN_INDEX}" \
    --argjson delta "${DELTA_JSON}" \
    --argjson session_total "${SESSION_TOTAL_JSON}" \
    --arg model "${CURRENT_MODEL}" \
    --argjson turns "${CURRENT_TURNS}" \
    --arg run_id "${DISPATCH_RUN_ID:-}" \
    '{ts: $ts, sprint_id: $sprint, story_id: $story, work_item_id: $work_item, agent_type: $agent, session_id: $session, transcript: $transcript, sentinel_started_at: $sentinel_started_at, delta_from_turn: $turn_index, delta: $delta, session_total: $session_total, model: $model, turns: $turns}
    | if $run_id == "" then . else .run_id = $run_id end')"

  printf '%s\n' "${ROW}" >> "${LEDGER}"
  printf '[%s] wrote row: sprint=%s agent=%s work_item=%s story=%s delta=in:%s/out:%s session_total=in:%s/out:%s delta_from=%s\n' \
    "${TS}" "${SPRINT_ID}" "${AGENT_TYPE}" "${WORK_ITEM_ID}" "${STORY_ID}" \
    "${DELTA_IN}" "${DELTA_OUT}" \
    "${CURRENT_IN}" "${CURRENT_OUT}" \
    "${SENTINEL_TURN_INDEX}" \
    >> "${HOOK_LOG}"

  # --- CR-036: Reporter token-budget warning (chat-injection per CR-032 pattern) ---
  if [[ "${AGENT_TYPE}" == "reporter" ]]; then
    REPORTER_TOTAL=$(( DELTA_IN + DELTA_OUT + DELTA_CC + DELTA_CR ))
    REPORTER_BUDGET_SOFT=200000
    REPORTER_BUDGET_HARD=500000
    if [[ "${REPORTER_TOTAL}" -gt "${REPORTER_BUDGET_HARD}" ]]; then
      printf '\n⚠️ Reporter token budget exceeded: %s > %s (HARD advisory)\n' \
        "${REPORTER_TOTAL}" "${REPORTER_BUDGET_HARD}"
      # Auto-flashcard via cleargate CLI (best-effort; never block)
      if command -v cleargate >/dev/null 2>&1; then
        cleargate flashcard record \
          "Reporter dispatch exceeded 500k tokens — investigate prompt or bundle" \
          >/dev/null 2>&1 || true
      fi
    elif [[ "${REPORTER_TOTAL}" -gt "${REPORTER_BUDGET_SOFT}" ]]; then
      printf '\n⚠️ Reporter token budget exceeded: %s > %s (soft warn)\n' \
        "${REPORTER_TOTAL}" "${REPORTER_BUDGET_SOFT}"
    fi
  fi

  # --- CR-101: refresh the dashboard snapshot -------------------------------
  # A ledger row just landed, and token spend is one of the six stat tiles, so
  # the artifact on disk is now behind. Re-render it.
  #
  # Three properties are load-bearing and all three are about never being the
  # reason a subagent stop fails or slows down:
  #   1. BACKGROUNDED (&) — this hook fires after every single agent completion;
  #      a foreground CLI spawn would add its startup cost to each one.
  #   2. FULLY REDIRECTED — an inherited stdout held open by a background child
  #      can hang the hook runtime waiting on EOF.
  #   3. `|| true` + `command -v` guard — no cleargate on PATH, or a render that
  #      throws, must be a no-op and not a non-zero exit.
  #
  # Plain `sprint dashboard` (no flags) is the artifact path: it writes
  # dashboard.html and opens nothing. A live daemon is unaffected — it serves
  # collect() fresh per request and never reads this file.
  # CLEARGATE_NO_DASHBOARD=1 suppresses it (the CLI honours the same token).
  if [[ "${CLEARGATE_NO_DASHBOARD:-}" != "1" && "${CLEARGATE_NO_DASHBOARD:-}" != "true" ]]; then
    if command -v cleargate >/dev/null 2>&1; then
      ( cd "${REPO_ROOT}" && cleargate sprint dashboard >/dev/null 2>&1 & ) || true
    fi
  fi

  # --- delete processed sentinel ---
  if [[ -n "${PROCESSED_FILE}" && -f "${PROCESSED_FILE}" ]]; then
    rm -f "${PROCESSED_FILE}"
  fi

  # --- delete processed dispatch file ---
  if [[ -n "${DISPATCH_PROCESSED:-}" && -f "${DISPATCH_PROCESSED}" ]]; then
    rm -f "${DISPATCH_PROCESSED}"
  fi
} 2>> "${HOOK_LOG}"

exit 0
