#!/usr/bin/env bash
# PreToolUse hook for Task|Agent (subagent dispatch).
#
# Purpose: when the orchestrator spawns a subagent, record the
# dispatch metadata (agent_type, work_item_id, turn_index) into a sentinel file
# under the active sprint dir. The SubagentStop hook reads the newest sentinel
# to attribute the token-ledger row correctly.
#
# Why: SubagentStop fires on the ORCHESTRATOR's session with the orchestrator's
# transcript_path. Without a sentinel, the hook can only grep the full
# transcript and every row tags against the orchestrator — per-story cost is
# uncomputable. The sentinel provides (a) ground-truth agent_type and
# work_item_id, and (b) a turn_index pivot so the post-hook can compute the
# delta instead of the cumulative sum.
#
# Input: JSON on stdin from Claude Code with fields:
#   session_id, transcript_path, cwd, hook_event_name, tool_name, tool_input
# For a subagent spawn, tool_input has: subagent_type, description, prompt.
#
# BUG-068: the host build renamed the dispatch tool from "Task" to "Agent",
# which silently disabled both guards below. IS_AGENT_SPAWN now accepts
# tool_name in {Task, Agent} OR any tool_name carrying
# tool_input.subagent_type, computed once and reused by both guards.
#
# Output: writes .cleargate/sprint-runs/<sprint-id>/.pending-task-<turn_index>.json
#         with { agent_type, work_item_id, turn_index, started_at }
#
# Robustness: exits 2 (BUG-089: host-honored, via the shared `cleargate hook
# signal` handler — Claude Code treats the historical bare `exit 1` as
# non-blocking) to block a subagent spawn when unprocessed flashcards exist.
# Set SKIP_FLASHCARD_GATE=1 to bypass the flashcard gate entirely.
# Set CLEARGATE_ADVISORY=1 to downgrade the block to a warning (exit 0).

set -u

# Read stdin once — must happen before the grouped block, and (STORY-058-11)
# before the repo root, which takes the payload's cwd when neither env var is set.
INPUT="$(cat)"

# STORY-058-11: harness-neutral repo root (lib/harness.sh), orchestrator-first —
# ORCHESTRATOR_PROJECT_DIR, then CLAUDE_PROJECT_DIR, then the git top level of
# the payload's cwd, then the current dir.
. "$(dirname "${BASH_SOURCE[0]}")/lib/harness.sh"
REPO_ROOT="$(cg_repo_root orchestrator-first "${INPUT}")"

# ── BUG-089: explicit host selection for the shared hook-signal handler ──────
# settings.json passes `--host claude` explicitly at this hook's boundary.
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

LOG_DIR="${REPO_ROOT}/.cleargate/hook-log"
mkdir -p "${LOG_DIR}"
HOOK_LOG="${LOG_DIR}/pending-task-sentinel.log"
ACTIVE_SENTINEL="${REPO_ROOT}/.cleargate/sprint-runs/.active"

# Determine active sprint (needed for flashcard gate and sentinel)
SPRINT_ID=""
if [[ -f "${ACTIVE_SENTINEL}" ]]; then
  SPRINT_ID="$(tr -d '[:space:]' < "${ACTIVE_SENTINEL}")"
fi
[[ -z "${SPRINT_ID}" ]] && SPRINT_ID="_off-sprint"
SPRINT_DIR="${REPO_ROOT}/.cleargate/sprint-runs/${SPRINT_ID}"
mkdir -p "${SPRINT_DIR}"

# --- Flashcard gate (STORY-014-03) ---
# Runs BEFORE the logged block so stderr goes to real process stderr (not log),
# allowing Claude Code to surface the message to the orchestrator.
# Bypass: set SKIP_FLASHCARD_GATE=1 in environment.
TOOL_NAME_EARLY="$(printf '%s' "${INPUT}" | jq -r '.tool_name // empty')"
SUBAGENT_TYPE_EARLY="$(printf '%s' "${INPUT}" | jq -r '.tool_input.subagent_type // empty')"
IS_AGENT_SPAWN=0
case "${TOOL_NAME_EARLY}" in
  Task|Agent) IS_AGENT_SPAWN=1 ;;
  *) [[ -n "${SUBAGENT_TYPE_EARLY}" ]] && IS_AGENT_SPAWN=1 ;;
esac
# STORY-058-10 (M5-A23): under Codex, spawn_agent reaches PreToolUse as
# `collaborationspawn_agent` (measured 2026-09-25 on the pinned binary) — the
# registered matcher is `Agent|.*spawn_agent`, so any tool_name ending in
# "spawn_agent" is a dispatch under this host, regardless of subagent_type.
if [[ "${HOST}" == "codex" ]]; then
  case "${TOOL_NAME_EARLY}" in
    *spawn_agent) IS_AGENT_SPAWN=1 ;;
  esac
fi

if [[ "${IS_AGENT_SPAWN}" == "1" && "${SKIP_FLASHCARD_GATE:-0}" != "1" && "${SPRINT_ID}" != "_off-sprint" ]]; then
  # Collect flagged cards from all *-dev.md / *-qa.md reports (any id: STORY/CR/BUG/...), flat + reports/ subdir (CR-082 moved reports to reports/).
  UNPROCESSED_CARDS=()
  UNPROCESSED_HASHES=()
  # BUG-085(b): reports whose flashcards_flagged JSON array never closes before EOF.
  UNPARSEABLE_FILES=()

  # Use ls -t (portable) to process report files; portable array accumulation (bash 3.2 safe).
  REPORT_FILES=()
  while IFS= read -r f; do
    REPORT_FILES+=("$f")
  done < <(ls -t "${SPRINT_DIR}"/*-dev.md "${SPRINT_DIR}"/*-qa.md "${SPRINT_DIR}"/reports/*-dev.md "${SPRINT_DIR}"/reports/*-qa.md 2>/dev/null)

  # BUG-085(b): a JSON string literal, held in a variable (bash 3.2: the regex
  # must live in a variable, not be inlined in a [[ =~ ]] test).
  JSON_STR_RE='"(([^"\\]|\\.)*)"'

  # BUG-085(b): record one card (hash + marker check). Shared by the YAML/md
  # list-item path and the JSON-array path below.
  add_card() {
    local card="$1"
    [[ -z "${card}" ]] && return 0
    local hash
    hash="$(printf '%s' "${card}" | shasum -a 1 | cut -c1-12)"
    local marker="${SPRINT_DIR}/.processed-${hash}"
    if [[ ! -f "${marker}" ]]; then
      UNPROCESSED_CARDS+=("${card}")
      UNPROCESSED_HASHES+=("${hash}")
    fi
  }

  # BUG-085(b): extract every JSON string literal in $1, unescaping \" and \\
  # before hashing so a card hashes identically whether it is written in JSON
  # or list form (list-form cards are NEVER unescaped). The block ends when
  # the line's unquoted remainder holds "]".
  scan_json() {
    local rest="$1" unq="" m s
    while [[ "${rest}" =~ ${JSON_STR_RE} ]]; do
      m="${BASH_REMATCH[0]}"
      s="${BASH_REMATCH[1]}"
      unq="${unq}${rest%%"${m}"*}"
      rest="${rest#*"${m}"}"
      s="${s//\\\"/\"}"
      s="${s//\\\\/\\}"
      add_card "${s}"
    done
    unq="${unq}${rest}"
    if [[ "${unq}" == *"]"* ]]; then
      IN_BLOCK=0
      BLOCK_TYPE=""
    fi
  }

  # BUG-085(a): bash 3.2 + `set -u`: "${REPORT_FILES[@]}" on an EMPTY array is
  # a fatal "unbound variable". The `+` alternate-value form only expands the
  # array when it holds at least one element (flashcard 2026-09-25 #bash #macos).
  for REPORT_FILE in ${REPORT_FILES[@]+"${REPORT_FILES[@]}"}; do
    [[ ! -f "${REPORT_FILE}" ]] && continue
    # Parse EVERY flashcards_flagged block in the file (M3-A53: a block END
    # resets state and the scan CONTINUES — it never stops the whole file).
    # Formats:
    #   YAML key:   flashcards_flagged: []  |  flashcards_flagged:\n  - "card"
    #   md heading: ## flashcards_flagged\n- "card"
    #   JSON array: flashcards_flagged: ["a", "b"]  (inline or multi-line, fenced or not)
    IN_BLOCK=0
    BLOCK_TYPE=""  # "yaml", "md" or "json"
    # BUG-085 (M3-A48): `|| [[ -n "${line}" ]]` reads a final line with no
    # trailing newline instead of silently dropping it (bash 3.2 safe:
    # `read` still assigns the fragment under `set -u`).
    while IFS= read -r line || [[ -n "${line}" ]]; do
      if [[ "${BLOCK_TYPE}" == "json" ]]; then
        scan_json "${line}"
        continue
      fi
      # YAML inline empty list — no cards in this block; keep scanning the file.
      if [[ "${line}" =~ ^[[:space:]]*flashcards_flagged:[[:space:]]*\[[[:space:]]*\] ]]; then
        IN_BLOCK=0
        BLOCK_TYPE=""
        continue
      fi
      # JSON array (inline or opening a multi-line array; fenced or not).
      if [[ "${line}" =~ ^[[:space:]]*flashcards_flagged:[[:space:]]*\[(.*)$ ]]; then
        IN_BLOCK=1
        BLOCK_TYPE="json"
        scan_json "${BASH_REMATCH[1]}"
        continue
      fi
      # YAML key (block form) — matches "flashcards_flagged:" or "flashcards_flagged: " with nothing after
      if [[ "${line}" =~ ^flashcards_flagged:[[:space:]]*$ ]]; then
        IN_BLOCK=1
        BLOCK_TYPE="yaml"
        continue
      fi
      # Markdown section heading (## flashcards_flagged or ## Flashcards_flagged)
      if [[ "${line}" =~ ^##[[:space:]]+[Ff]lashcards_flagged ]]; then
        IN_BLOCK=1
        BLOCK_TYPE="md"
        continue
      fi

      if [[ "${IN_BLOCK}" == "1" ]]; then
        # Stop conditions differ by block type. A block END resets state and
        # the scan continues (M3-A53) — it never exits the file loop.
        if [[ "${BLOCK_TYPE}" == "yaml" ]]; then
          # Stop at next top-level YAML key (non-indented, non-list, non-blank line)
          if [[ "${line}" =~ ^[a-zA-Z_] ]]; then
            IN_BLOCK=0
            BLOCK_TYPE=""
            continue
          fi
        elif [[ "${BLOCK_TYPE}" == "md" ]]; then
          # Stop at next markdown heading (any level)
          if [[ "${line}" =~ ^# ]]; then
            IN_BLOCK=0
            BLOCK_TYPE=""
            continue
          fi
        fi
        # Match list items: "- ..." (leading whitespace allowed). Never
        # unescaped — only the JSON-array path unescapes.
        if [[ "${line}" =~ ^[[:space:]]*-[[:space:]]+(.*) ]]; then
          CARD="${BASH_REMATCH[1]}"
          # Strip surrounding quotes (double or single)
          CARD="${CARD#\"}"
          CARD="${CARD%\"}"
          CARD="${CARD#\'}"
          CARD="${CARD%\'}"
          add_card "${CARD}"
        fi
      fi
    done < "${REPORT_FILE}"
    # BUG-085(b): fail closed — EOF while still inside an unterminated JSON array.
    if [[ "${BLOCK_TYPE}" == "json" ]]; then
      UNPARSEABLE_FILES+=("${REPORT_FILE}")
    fi
  done

  if [[ "${#UNPROCESSED_CARDS[@]}" -gt 0 || "${#UNPARSEABLE_FILES[@]}" -gt 0 ]]; then
    printf '[%s] flashcard-gate: %d unprocessed card(s), %d unparseable file(s)\n' \
      "$(date -u +%FT%TZ)" "${#UNPROCESSED_CARDS[@]}" "${#UNPARSEABLE_FILES[@]}" >> "${HOOK_LOG}"
    if [[ "${CLEARGATE_ADVISORY:-0}" == "1" ]]; then
      # Advisory mode: warning only, continue to sentinel write
      printf 'FLASHCARD GATE WARNING: %d unprocessed flashcard(s).\n' \
        "${#UNPROCESSED_CARDS[@]}" >&2
      for i in "${!UNPROCESSED_CARDS[@]}"; do
        CARD="${UNPROCESSED_CARDS[$i]}"
        HASH="${UNPROCESSED_HASHES[$i]}"
        printf '  card: %s\n' "${CARD}" >&2
        printf '  mark processed: touch %s/.processed-%s\n' "${SPRINT_DIR}" "${HASH}" >&2
      done
      for i in "${!UNPARSEABLE_FILES[@]}"; do
        printf 'FLASHCARD GATE WARNING: unparseable flashcards_flagged block in %s — rewrite it as a "- \\"card\\"" list.\n' "${UNPARSEABLE_FILES[$i]}" >&2
      done
    else
      # Default: block Task spawn — diagnostic on stderr (real stderr, not log)
      printf 'FLASHCARD GATE BLOCKED: %d unprocessed flashcard(s) must be processed before spawning next Task.\n' \
        "${#UNPROCESSED_CARDS[@]}" >&2
      for i in "${!UNPROCESSED_CARDS[@]}"; do
        CARD="${UNPROCESSED_CARDS[$i]}"
        HASH="${UNPROCESSED_HASHES[$i]}"
        printf '  card: %s\n' "${CARD}" >&2
        printf '  mark processed: touch %s/.processed-%s\n' "${SPRINT_DIR}" "${HASH}" >&2
      done
      for i in "${!UNPARSEABLE_FILES[@]}"; do
        printf 'FLASHCARD GATE BLOCKED: unparseable flashcards_flagged block in %s — rewrite it as a "- \\"card\\"" list.\n' "${UNPARSEABLE_FILES[$i]}" >&2
      done

      # BUG-089: resolve the host-honored blocking exit code through the
      # shared hook-signal handler instead of a bare `exit 1` — Claude Code
      # treats a PreToolUse hook's exit 1 (no JSON decision) as non-blocking,
      # so the subagent spawn proceeded anyway. This is a blocking branch:
      # any resolver outcome other than the expected 2 (missing CLI, resolver
      # crash, unexpected status) still fails closed as exit 2 here, never
      # falls through as 0/1/127.
      if [ -f "${REPO_ROOT}/cleargate-cli/dist/cli.js" ]; then
        CG=(node "${REPO_ROOT}/cleargate-cli/dist/cli.js")
      elif command -v cleargate >/dev/null 2>&1; then
        CG=(cleargate)
      else
        # Read pinned version from stamp-and-gate.sh (same convention as
        # pre-edit-gate.sh's three-branch resolver — CR-009).
        HOOK_PIN=""
        HOOK_SH="${REPO_ROOT}/.claude/hooks/stamp-and-gate.sh"
        if [ -f "${HOOK_SH}" ]; then
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
      "${CG[@]}" hook signal block --host "${HOST}" > /dev/null 2>&1
      SIGNAL_EXIT=$?
      if [ "${SIGNAL_EXIT}" -ne 2 ]; then
        printf '[%s] flashcard-gate: hook-signal-non-2 exit=%s host=%s — failing closed as exit 2\n' \
          "$(date -u +%FT%TZ)" "${SIGNAL_EXIT}" "${HOST}" >> "${HOOK_LOG}"
      fi
      exit 2
    fi
  fi
fi
# --- End flashcard gate ---

{
  if [[ "${IS_AGENT_SPAWN}" != "1" ]]; then
    # Not a subagent dispatch — no sentinel needed.
    exit 0
  fi

  TRANSCRIPT_PATH="$(printf '%s' "${INPUT}" | jq -r '.transcript_path // empty')"
  # STORY-058-10 (M5-A23): under Codex, the spawn payload carries agent_type
  # (not subagent_type) and message (not prompt); default is "default", not
  # "unknown" — Claude's literal default is preserved on the claude path.
  if [[ "${HOST}" == "codex" ]]; then
    AGENT_TYPE="$(printf '%s' "${INPUT}" | jq -r '.tool_input.subagent_type // .tool_input.agent_type // "default"')"
    PROMPT="$(printf '%s' "${INPUT}" | jq -r '.tool_input.prompt // .tool_input.message // empty')"
  else
    AGENT_TYPE="$(printf '%s' "${INPUT}" | jq -r '.tool_input.subagent_type // "unknown"')"
    PROMPT="$(printf '%s' "${INPUT}" | jq -r '.tool_input.prompt // empty')"
  fi

  # BUG-101: a live Codex spawn_agent `message` is encrypted, so under Codex the
  # work item comes from plaintext sources first, in this order:
  #   1. tool_input.task_name (story_001_01_qa -> STORY-001-01;
  #      sprint_01_reporter -> SPRINT-01);
  #   2. the newest fresh (< 10 min) orchestrator dispatch marker whose
  #      agent_type equals the spawn's, claimed with mv and then deleted;
  #   3. the prompt/message regex below (plaintext under the scripted provider);
  #   4. none: an empty id, and the sentinel is still written.
  # session_id is never compared: write_dispatch.sh's value means nothing on
  # Codex. Only the claimed marker, or the one marker a task_name hit consumes,
  # is ever deleted. The Claude path never enters this block.
  WORK_ITEM_ID=""
  WORK_ITEM_SOURCE="none"
  if [[ "${HOST}" == "codex" ]]; then
    # Claim one fresh marker: newest mtime first, agent_type equal (skip past
    # other types, never stop at them); $1 = the required work_item_id, or ""
    # for any. mv is the claim, so two concurrent same-type dispatches never
    # claim one marker. Prints the claimed work_item_id; returns 1 when none.
    claim_dispatch_marker() {
      local want="$1" m at wi claimed
      local cands=()
      while IFS= read -r m || [[ -n "${m}" ]]; do
        [[ -n "${m}" ]] && cands+=("${m}")
      done < <(find "${SPRINT_DIR}" -maxdepth 1 -type f -name '.dispatch-*.json' -mmin -10 2>/dev/null)
      # Guard the empty list: `ls -t` with no operands lists the cwd.
      [[ "${#cands[@]}" -gt 0 ]] || return 1
      while IFS= read -r m || [[ -n "${m}" ]]; do
        [[ -n "${m}" && -f "${m}" ]] || continue
        at="$(jq -r '.agent_type // empty' "${m}" 2>/dev/null)"
        [[ "${at}" == "${AGENT_TYPE}" ]] || continue
        if [[ -n "${want}" ]]; then
          wi="$(jq -r '.work_item_id // empty' "${m}" 2>/dev/null)"
          [[ "${wi}" == "${want}" ]] || continue
        fi
        claimed="${m}.claimed.$$"
        mv "${m}" "${claimed}" 2>/dev/null || continue
        wi="$(jq -r '.work_item_id // empty' "${claimed}" 2>/dev/null)"
        rm -f "${claimed}"
        printf '%s' "${wi}"
        return 0
      done < <(ls -t "${cands[@]}" 2>/dev/null)
      return 1
    }

    TASK_NAME="$(printf '%s' "${INPUT}" | jq -r '.tool_input.task_name // empty')"
    TASK_ID="$(printf '%s' "${TASK_NAME}" \
      | grep -oiE '(^|[_/-])(story|epic|cr|bug|proposal|sprint)[-_]?[0-9]+([-_][0-9]+)?' \
      | head -1 \
      | sed -E 's#^[_/-]##' \
      | tr 'abcdefghijklmnopqrstuvwxyz_' 'ABCDEFGHIJKLMNOPQRSTUVWXYZ-')"
    if [[ -n "${TASK_ID}" ]]; then
      WORK_ITEM_ID="${TASK_ID}"
      WORK_ITEM_SOURCE="task_name"
      # Consume the orchestrator's own {id, agent_type} marker for this spawn,
      # if any, so a later id-less same-type dispatch can never claim it.
      claim_dispatch_marker "${TASK_ID}" > /dev/null || true
    else
      MARKER_ID="$(claim_dispatch_marker "")"
      if [[ -n "${MARKER_ID}" ]]; then
        WORK_ITEM_ID="${MARKER_ID}"
        WORK_ITEM_SOURCE="marker"
      fi
    fi
  fi

  # Extract work_item_id from prompt — by convention first line is STORY=NNN-NN
  # or an inline PROPOSAL-NNN / EPIC-NNN / CR-NNN / BUG-NNN reference.
  if [[ -z "${WORK_ITEM_ID}" ]]; then
    WORK_ITEM_ID="$(printf '%s' "${PROMPT}" | grep -oE '(STORY|PROPOSAL|EPIC|CR|BUG)[-=]?[0-9]+(-[0-9]+)?' | head -1 | sed 's/=/-/g')"
    [[ -z "${WORK_ITEM_ID}" ]] && WORK_ITEM_ID=""
    [[ -n "${WORK_ITEM_ID}" ]] && WORK_ITEM_SOURCE="message"
  fi

  # Compute turn_index: count of assistant turns in the orchestrator transcript so far.
  TURN_INDEX=0
  if [[ -n "${TRANSCRIPT_PATH}" && -f "${TRANSCRIPT_PATH}" ]]; then
    TURN_INDEX="$(jq -cs '[.[] | select(.type == "assistant" and .message.usage)] | length' "${TRANSCRIPT_PATH}" 2>/dev/null)"
    [[ -z "${TURN_INDEX}" || "${TURN_INDEX}" == "null" ]] && TURN_INDEX=0
  fi

  STARTED_AT="$(date -u +%FT%TZ)"
  # STORY-058-10 (M5-A23, AD-6): a Codex sentinel always uses the distinct
  # `.pending-codex-task-` filename (never RUN_ID-keyed) so Claude's
  # `ls -t .pending-task-*.json` (token-ledger.sh) never sees it — the two
  # hosts' sentinels never collide by name.
  # STORY-033-02: key sentinel by RUN_ID when present (parallel-wave attribution).
  # When RUN_ID is set, two concurrent Task dispatches sharing one session + one TURN_INDEX
  # each get a distinct .pending-task-${RUN_ID}.json file and neither overwrites the other.
  # When RUN_ID is absent (serial path), fall back to the BUG-029 uniquify form
  # .pending-task-${TURN_INDEX}-$$-${RANDOM}.json so the serial baseline is preserved.
  if [[ "${HOST}" == "codex" ]]; then
    SENTINEL_FILE="${SPRINT_DIR}/.pending-codex-task-${TURN_INDEX}-$$-${RANDOM}.json"
  elif [[ -n "${RUN_ID:-}" ]]; then
    SENTINEL_FILE="${SPRINT_DIR}/.pending-task-${RUN_ID}.json"
  else
    # BUG-029 fix: uniquify when no RUN_ID (serial path).
    # Old: .pending-task-${TURN_INDEX}.json  ← second call overwrites first.
    # New: .pending-task-${TURN_INDEX}-$$-${RANDOM}.json  ← each call gets its own file.
    SENTINEL_FILE="${SPRINT_DIR}/.pending-task-${TURN_INDEX}-$$-${RANDOM}.json"
  fi

  # Write the sentinel atomically (tmp + mv). The Codex sentinel gains a
  # `host:"codex"` field (AD-6); the Claude shape is byte-identical to before.
  TMP="${SENTINEL_FILE}.tmp.$$"
  if [[ "${HOST}" == "codex" ]]; then
    jq -cn \
      --arg agent "${AGENT_TYPE}" \
      --arg work_item "${WORK_ITEM_ID}" \
      --argjson idx "${TURN_INDEX}" \
      --arg started "${STARTED_AT}" \
      --arg host "codex" \
      '{agent_type: $agent, work_item_id: $work_item, turn_index: $idx, started_at: $started, host: $host}' \
      > "${TMP}" 2>/dev/null \
      && mv "${TMP}" "${SENTINEL_FILE}" \
      && printf '[%s] wrote sentinel sprint=%s agent=%s work_item=%s turn=%s source=%s\n' \
          "${STARTED_AT}" "${SPRINT_ID}" "${AGENT_TYPE}" "${WORK_ITEM_ID}" "${TURN_INDEX}" "${WORK_ITEM_SOURCE}" \
          >> "${HOOK_LOG}" \
      || printf '[%s] failed to write sentinel %s\n' "${STARTED_AT}" "${SENTINEL_FILE}" >> "${HOOK_LOG}"
  else
    jq -cn \
      --arg agent "${AGENT_TYPE}" \
      --arg work_item "${WORK_ITEM_ID}" \
      --argjson idx "${TURN_INDEX}" \
      --arg started "${STARTED_AT}" \
      '{agent_type: $agent, work_item_id: $work_item, turn_index: $idx, started_at: $started}' \
      > "${TMP}" 2>/dev/null \
      && mv "${TMP}" "${SENTINEL_FILE}" \
      && printf '[%s] wrote sentinel sprint=%s agent=%s work_item=%s turn=%s\n' \
          "${STARTED_AT}" "${SPRINT_ID}" "${AGENT_TYPE}" "${WORK_ITEM_ID}" "${TURN_INDEX}" \
          >> "${HOOK_LOG}" \
      || printf '[%s] failed to write sentinel %s\n' "${STARTED_AT}" "${SENTINEL_FILE}" >> "${HOOK_LOG}"
  fi
} 2>> "${HOOK_LOG}"

exit 0
