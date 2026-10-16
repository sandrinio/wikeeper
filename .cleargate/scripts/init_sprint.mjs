#!/usr/bin/env node
/**
 * init_sprint.mjs — Initialize a sprint state.json
 *
 * Usage: node init_sprint.mjs <sprint-id> --stories ID1,ID2,... [--force] [--preserve-bounces]
 *
 * --preserve-bounces requires --force; reads existing state.json and carries
 * forward qa_bounces / arch_bounces / state / lane / worktree per matching
 * story-id. Items not in the new --stories list are dropped. Useful when
 * mid-sprint dogfood / rerun must not lose kickback history.
 *
 * Creates .cleargate/sprint-runs/<sprint-id>/state.json with initial state
 * "Ready to Bounce" for each story. Refuses if state.json already exists
 * unless --force is passed.
 *
 * STORY-070-01: execution_mode is retired. All gates are always enforced.
 * Break-glass: set CLEARGATE_ADVISORY=1 to downgrade gate failures to warnings.
 * The story-file assertion always runs in blocking mode (v2-equivalent behavior).
 *
 * CR-106: also seeds `events.jsonl` beside state.json -- one genesis event per story
 * (state-events.mjs's synthesizeGenesisEvents), so state.json is the fold's output from the very
 * first write, not merely "compatible with it". Both files are written via the same atomic
 * tmp+rename helper (state-events.mjs's atomicWrite / writeEventsFile), collapsing the inline
 * tmp+rename this file used to duplicate for state.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { SCHEMA_VERSION, VALID_STATES, TERMINAL_STATES } from './constants.mjs';
import { atomicWrite, writeEventsFile, synthesizeGenesisEvents, fold } from './state-events.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Resolve repo root: .cleargate/scripts/ -> ../../ (two levels up)
// CLEARGATE_REPO_ROOT env var overrides for testing
const REPO_ROOT = process.env.CLEARGATE_REPO_ROOT
  ? path.resolve(process.env.CLEARGATE_REPO_ROOT)
  : path.resolve(__dirname, '..', '..');

// --- CR-110: Goal Acceptance Check advisory ---
// Mirrors sprint_context.md's own template text verbatim (kept in one place so drift between
// the constant and the shipped placeholder is impossible to miss in review). Detection compares
// against this with whitespace normalized, not a raw literal match — a placeholder that is
// re-wrapped for page readability must still be recognised as unresolved.
const GOAL_ACCEPTANCE_CHECK_PLACEHOLDER =
  '_(populated by orchestrator at §A.5, confirmed by the human at the same halt that confirms the sprint plan)_';

function normalizeWhitespace(s) {
  return s.replace(/\s+/g, ' ').trim();
}

// Returns the first non-blank line under a "## <heading>" section (up to the next "## "
// heading), or null if the heading is absent or the section has no non-blank line. Mirrors
// cr078_init.test.sh's first_nonempty_under_heading awk helper.
function extractSectionFirstNonEmptyLine(content, heading) {
  const lines = content.split('\n');
  let inSection = false;
  for (const line of lines) {
    if (line === heading) {
      inSection = true;
      continue;
    }
    if (inSection && /^## /.test(line)) {
      return null;
    }
    if (inSection && line.trim().length > 0) {
      return line.trim();
    }
  }
  return null;
}

function usage() {
  process.stderr.write(
    'Usage: node init_sprint.mjs <sprint-id> --stories ID1,ID2,... [--force]\n'
  );
  process.exit(2);
}

/**
 * Locate the sprint file in pending-sync/ or archive/ for the given sprint ID.
 * Returns the absolute path if found, null otherwise.
 */
function findSprintFile(repoRoot, sprintId) {
  const searchDirs = [
    path.join(repoRoot, '.cleargate', 'delivery', 'pending-sync'),
    path.join(repoRoot, '.cleargate', 'delivery', 'archive'),
  ];
  for (const dir of searchDirs) {
    let entries;
    try {
      entries = fs.readdirSync(dir);
    } catch {
      continue;
    }
    const prefix = `${sprintId}_`;
    const match = entries.find(
      (e) => (e === `${sprintId}.md` || e.startsWith(prefix)) && e.endsWith('.md')
    );
    if (match) return path.join(dir, match);
  }
  return null;
}

/**
 * Run assert_story_files.mjs for the given sprint file.
 * Returns { exitCode, stderr }.
 */
function runAssertStoryFiles(repoRoot, sprintFilePath) {
  // Use __dirname to locate the sibling script (not CLEARGATE_REPO_ROOT, which is a test-isolation
  // override that points to a tmpdir without scripts).
  const assertScript = path.join(__dirname, 'assert_story_files.mjs');
  const env = { ...process.env, CLEARGATE_REPO_ROOT: repoRoot };
  const result = spawnSync(process.execPath, [assertScript, sprintFilePath], {
    encoding: 'utf8',
    env,
  });
  return {
    exitCode: result.status ?? 1,
    stderr: result.stderr || '',
    stdout: result.stdout || '',
  };
}

function main() {
  const args = process.argv.slice(2);

  const sprintId = args[0];
  if (!sprintId || sprintId.startsWith('--')) usage();

  const storiesIdx = args.indexOf('--stories');
  if (storiesIdx === -1 || !args[storiesIdx + 1]) usage();

  const storyIds = args[storiesIdx + 1].split(',').map((s) => s.trim()).filter(Boolean);
  if (storyIds.length === 0) {
    process.stderr.write('Error: --stories requires at least one story ID\n');
    process.exit(2);
  }

  const force = args.includes('--force');
  const preserveBounces = args.includes('--preserve-bounces');

  const sprintDir = path.join(REPO_ROOT, '.cleargate', 'sprint-runs', sprintId);
  const stateFile = path.join(sprintDir, 'state.json');

  if (fs.existsSync(stateFile) && !force) {
    process.stderr.write(
      `state.json already exists at ${stateFile}; pass --force to overwrite\n`
    );
    process.exit(1);
  }

  // --- CR-049-followup: Preserve bounce counters when --force re-inits an in-flight sprint ---
  // Default --force overwrites everything (initial design). With --preserve-bounces,
  // qa_bounces / arch_bounces / state are read from the existing state.json and merged
  // back per-story. Only Ready-to-Bounce default fields get reset.
  let preserved = {};
  if (force && preserveBounces && fs.existsSync(stateFile)) {
    try {
      const existing = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      preserved = existing.stories || {};
    } catch (err) {
      process.stderr.write(`WARN: --preserve-bounces could not read existing state.json: ${err.message}\n`);
    }
  }

  // --- Gate-2 story-file assertion (always enforced — STORY-070-01) ---
  const sprintFilePath = findSprintFile(REPO_ROOT, sprintId);
  if (sprintFilePath) {
    const { exitCode, stderr } = runAssertStoryFiles(REPO_ROOT, sprintFilePath);
    if (exitCode !== 0) {
      // Always enforce (v2-equivalent behavior; CLEARGATE_ADVISORY=1 for break-glass)
      process.stderr.write(stderr);
      // Count categories from structured stderr lines
      const missingCount = (stderr.match(/^MISSING \((\d+)\):/m) ?? [])[1] ?? '0';
      const unapprovedCount = (stderr.match(/^UNAPPROVED \((\d+)\):/m) ?? [])[1] ?? '0';
      const emptyCount = (stderr.match(/^STUB-EMPTY \((\d+)\):/m) ?? [])[1] ?? '0';
      const msg = `ERROR: sprint init blocked — ${missingCount} items missing, ${unapprovedCount} unapproved, ${emptyCount} stub-empty. Fix the above, then re-run init.\n`;
      if (process.env.CLEARGATE_ADVISORY === '1') {
        process.stderr.write(`[advisory] ${msg}`);
      } else {
        process.stderr.write(msg);
        process.exit(1);
      }
    }
  }

  const now = new Date().toISOString();

  // --- CR-078 F2: Ingest SDR lane assignments ---
  // Read lane assignments from plans/waves.json (canonical machine-readable source).
  // Falls back to parsing the Sprint Plan §2.4 Lane Audit table when waves.json is absent.
  // Emits a WARN (not a hard fail) when neither source declares any lane.
  const wavesJsonPath = path.join(sprintDir, 'plans', 'waves.json');
  let laneAssignments = {};
  let laneSourceFound = false;

  // Try waves.json first
  if (fs.existsSync(wavesJsonPath)) {
    try {
      const wavesData = JSON.parse(fs.readFileSync(wavesJsonPath, 'utf8'));
      // waves.json may carry a top-level `lane_assignments: { "STORY-ID": "fast"|"standard" }` map
      if (wavesData.lane_assignments && typeof wavesData.lane_assignments === 'object') {
        laneAssignments = wavesData.lane_assignments;
        laneSourceFound = Object.keys(laneAssignments).length > 0;
      }
    } catch (err) {
      process.stderr.write(`WARN: could not parse plans/waves.json: ${err.message}\n`);
    }
  }

  // Fallback: parse Sprint Plan §2.4 Lane Audit table
  if (!laneSourceFound && sprintFilePath) {
    try {
      const planContent = fs.readFileSync(sprintFilePath, 'utf8');
      // Match the §2.4 Lane Audit table rows: `| Story-ID | lane | rationale |`
      // Accepts both backtick-wrapped and bare story IDs in the first column.
      const tableRowRe = /^\|\s*`?([A-Z][-A-Z0-9]*(?:-\d+)?(?:-\d+)?)`?\s*\|\s*(fast|standard)\s*\|/gm;
      let match;
      while ((match = tableRowRe.exec(planContent)) !== null) {
        const storyId = match[1].trim();
        const lane = match[2].trim();
        laneAssignments[storyId] = lane;
        laneSourceFound = true;
      }
    } catch (err) {
      process.stderr.write(`WARN: could not read sprint plan for lane audit: ${err.message}\n`);
    }
  }

  if (!laneSourceFound) {
    process.stderr.write(
      `WARN: no lane assignments found (no plans/waves.json lane_assignments and no §2.4 Lane Audit table) — all stories default to standard\n`
    );
  }

  const stories = {};
  for (const id of storyIds) {
    const carry = preserved[id] || {};
    // Apply SDR lane assignment when available; carry-over lanes take precedence over
    // sdr-lane-audit (they were already explicitly set in the previous sprint).
    const sdrLane = laneAssignments[id];
    const assignedLane = carry.lane ?? sdrLane ?? 'standard';
    const assignedBy = carry.lane_assigned_by ?? (sdrLane ? 'sdr-lane-audit' : 'migration-default');
    stories[id] = {
      state: carry.state ?? 'Ready to Bounce',
      qa_bounces: carry.qa_bounces ?? 0,
      arch_bounces: carry.arch_bounces ?? 0,
      worktree: carry.worktree ?? null,
      updated_at: now,
      notes: carry.notes ?? '',
      lane: assignedLane,
      lane_assigned_by: assignedBy,
      lane_demoted_at: carry.lane_demoted_at ?? null,
      lane_demotion_reason: carry.lane_demotion_reason ?? null,
    };
  }

  // CR-106: events.jsonl is the truth; state.json is derived FROM the genesis events below, not
  // hand-assembled in parallel with them -- fold()'s genesis case (kind: 'transition', not a
  // separate "snapshot" kind, per the item's own pinned event contract) sets last_action from the
  // LAST genesis event processed, so a hand-built `last_action: "Sprint X initialised"` string
  // would silently disagree with fold(events.jsonl) the moment it is written (caught by manual
  // review -- validate_state.mjs's own new drift check flags exactly this class of mismatch).
  // Deriving state.json via fold(genesisEvents) instead guarantees the two can never drift, by
  // construction, from the very first write.
  const genesisSeed = { sprint_id: sprintId, sprint_status: 'Active', stories };
  const genesisEvents = synthesizeGenesisEvents(genesisSeed);
  const state = fold(genesisEvents);

  fs.mkdirSync(sprintDir, { recursive: true });

  atomicWrite(stateFile, state);

  // Seed events.jsonl in lockstep with the state.json just written. A --force re-init (which
  // already overwrites state.json wholesale) rewrites events.jsonl fresh too, rather than
  // appending a new genesis set underneath stale history from a prior init.
  const eventsFile = path.join(sprintDir, 'events.jsonl');
  writeEventsFile(eventsFile, genesisEvents);

  // --- CR-045: Write sprint-context.md from template ---
  // Reads .cleargate/templates/sprint_context.md, substitutes frontmatter fields,
  // optionally splices the sprint goal from the sprint plan §0, and writes atomically.
  // Skip if file already exists and --force was not passed (idempotency-safe re-init).
  const ctxTemplate = path.join(REPO_ROOT, '.cleargate', 'templates', 'sprint_context.md');
  const ctxOut = path.join(sprintDir, 'sprint-context.md');

  if (!fs.existsSync(ctxOut) || force) {
    let ctxContent;
    try {
      ctxContent = fs.readFileSync(ctxTemplate, 'utf8');
    } catch {
      // Template absent — log warning and continue (non-fatal)
      process.stderr.write(
        `WARN: sprint-context.md template not found at ${ctxTemplate}; skipping sprint-context.md write.\n`
      );
      ctxContent = null;
    }

    if (ctxContent !== null) {
      // Substitute frontmatter placeholders
      ctxContent = ctxContent.replace(/sprint_id:\s*["']?S-NN["']?/, `sprint_id: "${sprintId}"`);
      ctxContent = ctxContent.replace(/created_at:\s*["']?YYYY-MM-DDTHH:MM:SSZ["']?/, `created_at: "${now}"`);
      ctxContent = ctxContent.replace(/last_updated:\s*["']?YYYY-MM-DDTHH:MM:SSZ["']?/, `last_updated: "${now}"`);

      // Optionally extract sprint goal from sprint plan §0.
      // Regex matches `- **Sprint Goal:** <text>` within first 200 lines (after H1).
      // Falls back to placeholder if absent — non-fatal.
      if (sprintFilePath) {
        try {
          const planContent = fs.readFileSync(sprintFilePath, 'utf8');
          const planLines = planContent.split('\n').slice(0, 200);
          const goalLine = planLines.find((l) => /^- \*\*Sprint Goal:\*\* (.+)$/.test(l.trim()));
          if (goalLine) {
            const goalMatch = goalLine.trim().match(/^- \*\*Sprint Goal:\*\* (.+)$/);
            if (goalMatch) {
              const goalText = goalMatch[1].trim();
              ctxContent = ctxContent.replace(
                '_(populated by orchestrator from sprint plan §0 at kickoff)_',
                goalText
              );
            }
          }
        } catch {
          // Goal extraction failed — leave placeholder; non-fatal
        }
      }

      // --- CR-110: Goal Acceptance Check advisory (F2 — render is free; advisory only) ---
      // The check is populated by the orchestrator at §A.5 (a later, human-confirmed step), not
      // extracted here — so this only DETECTS whether the placeholder survived unedited and warns.
      // Non-blocking: WARN and continue, mirroring sprint_context.md's own §Test Stack degradation
      // idiom ("test_stack unresolved — populate sprint_context.md §Test Stack"). Detects the
      // placeholder STRING, not an empty section — a populated mechanical check or the literal
      // `not-mechanically-verifiable` token must never trip this.
      const gacValue = extractSectionFirstNonEmptyLine(ctxContent, '## Goal Acceptance Check');
      if (gacValue !== null && normalizeWhitespace(gacValue) === normalizeWhitespace(GOAL_ACCEPTANCE_CHECK_PLACEHOLDER)) {
        process.stderr.write(
          `WARN: Goal Acceptance Check unresolved — populate sprint-context.md §Goal Acceptance Check\n`
        );
      }

      // Write atomically via tmpFile + renameSync (mirrors state.json pattern)
      const ctxTmp = `${ctxOut}.tmp.${process.pid}`;
      fs.writeFileSync(ctxTmp, ctxContent, 'utf8');
      fs.renameSync(ctxTmp, ctxOut);
    }
  }

  // --- CR-078 F1: Write .active sentinel (FINAL step) ---
  // Atomically set <projectRoot>/.cleargate/sprint-runs/.active to the sprint ID,
  // mirroring the state.json atomic-write idiom (tmp + rename).
  // Emits a one-line WARN when the prior .active is non-empty and differs from this sprint.
  const activeFile = path.join(REPO_ROOT, '.cleargate', 'sprint-runs', '.active');
  let priorActive = '';
  try {
    priorActive = fs.readFileSync(activeFile, 'utf8').trim();
  } catch {
    // File absent or unreadable — treat as empty; non-fatal
  }
  if (priorActive && priorActive !== sprintId) {
    process.stderr.write(
      `WARN: .active was ${priorActive}, overwriting with ${sprintId} — prior sprint may not have been closed\n`
    );
  }
  const activeTmp = `${activeFile}.tmp.${process.pid}`;
  fs.writeFileSync(activeTmp, sprintId + '\n', 'utf8');
  fs.renameSync(activeTmp, activeFile);

  process.stdout.write(`Initialized state.json for sprint ${sprintId} with ${storyIds.length} stories\n`);
}

main();
