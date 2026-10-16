#!/usr/bin/env bash
set -u
# M5-A25: read stdin once, before jq consumes it directly, so the codex branch
# below (and `cleargate hook edit-targets`) can reuse the same bytes.
# STORY-058-11: read before the repo root, which takes the payload's cwd.
INPUT="$(cat)"
. "$(dirname "${BASH_SOURCE[0]}")/lib/harness.sh"
REPO_ROOT="$(cg_repo_root claude-first "${INPUT}")"
LOG="${REPO_ROOT}/.cleargate/hook-log/gate-check.log"
mkdir -p "$(dirname "$LOG")"

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

# ── STORY-058-10: explicit host selection for the shared hook-signal
# contract (this hook never blocks, but shares the resolver pattern with the
# other 3 canonical hooks so a host flag always parses the same way).
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

FILE=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path' 2>/dev/null || echo "")

# ── STORY-058-10 (AD-7): under Codex, apply_patch PostToolUse payloads carry
# no tool_input.file_path (jq prints the literal "null"). Resolve the target
# list via the normalized `cleargate hook edit-targets` CLI instead.
TARGETS=()
if [ -n "$FILE" ] && [ "$FILE" != "null" ]; then
  TARGETS=("$FILE")
elif [ "$HOST" = "codex" ]; then
  _ET_TMPFILE=$(mktemp)
  printf '%s' "$INPUT" | "${CG[@]}" hook edit-targets > "$_ET_TMPFILE" 2>/dev/null
  ET_EXIT=$?
  if [ "$ET_EXIT" -eq 0 ]; then
    while IFS= read -r _t; do
      [ -n "$_t" ] && TARGETS+=("$_t")
    done < "$_ET_TMPFILE"
  fi
  rm -f "$_ET_TMPFILE"
fi

[ "${#TARGETS[@]}" -eq 0 ] && exit 0

TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
for FILE in "${TARGETS[@]}"; do
  case "$FILE" in *.cleargate/delivery/*) : ;; *) continue ;; esac
  # CR-093: the delivery tree also carries non-work-item artifacts — SPRINT-NN_waves.json
  # and whatever sidecars an agent drops beside an item. stamp/gate/ingest all parse
  # frontmatter, so each rewrite of waves.json logged a spurious
  # "unable to detect work-item type from frontmatter" and a gate exit 1.
  case "$FILE" in *.md) : ;; *) continue ;; esac
  # Ordered chain — stamp MUST precede gate (gate may read draft_tokens)
  "${CG[@]}" stamp-tokens "$FILE" >>"$LOG" 2>&1
  SR1=$?
  # CR-032: capture gate check stdout to tmpfile so we can re-emit ⚠️ lines to
  # hook stdout (→ Claude Code system-reminder). gate.ts emits ❌ lines to
  # stdout (gate.ts:259), not stderr; the tmpfile captures them separately.
  GATE_OUT=$(mktemp)
  "${CG[@]}" gate check "$FILE" >"$GATE_OUT" 2>>"$LOG"
  SR2=$?
  cat "$GATE_OUT" >>"$LOG"
  if [ "$SR2" -ne 0 ]; then
    WORK_ITEM_ID=$(grep -m1 -oE '(EPIC|STORY|CR|BUG|HOTFIX|PROPOSAL|INITIATIVE|SPRINT)-[0-9]+(-[0-9]+)?' "$FILE" | head -1)
    : "${WORK_ITEM_ID:=<work-item>}"
    grep '^❌' "$GATE_OUT" 2>/dev/null | sed -E "s/^❌ /⚠️ gate failed: ${WORK_ITEM_ID} — /"
  fi
  rm -f "$GATE_OUT"
  # CR-093: capture ingest output rather than sending it straight to the log.
  # A rejected ingest reached the log and nowhere else: this hook always exits 0
  # (severity enforcement is at wiki lint), so there was no failing command and no
  # message anywhere the agent could see it. An entire sprint's work items — plan,
  # stories, bugs, CR — silently never reached the wiki. Re-emit to hook stdout,
  # the same channel the gate ⚠️ path above uses.
  INGEST_OUT=$(mktemp)
  "${CG[@]}" wiki ingest "$FILE" >"$INGEST_OUT" 2>&1
  SR3=$?
  cat "$INGEST_OUT" >>"$LOG"
  if [ "$SR3" -ne 0 ]; then
    grep -v '^[[:space:]]*$' "$INGEST_OUT" 2>/dev/null | sed 's/^/⚠️ wiki ingest failed: /'
  fi
  rm -f "$INGEST_OUT"
  echo "[$TS] stamp=$SR1 gate=$SR2 ingest=$SR3 file=$FILE" >>"$LOG"
done

exit 0   # ALWAYS 0 — severity enforcement is at wiki lint, not hook
