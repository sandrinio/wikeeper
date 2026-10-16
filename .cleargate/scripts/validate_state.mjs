#!/usr/bin/env node
/**
 * validate_state.mjs — Validate state.json schema and invariants
 *
 * Usage: node validate_state.mjs [<path>] [--state-file <path>]
 *
 * A lone positional argument is treated as the state file path -- the same convention every
 * other script in .cleargate/scripts/ that takes a file uses. If both a positional argument and
 * --state-file are supplied, both are named and --state-file wins. An argument the script does
 * not understand is named in the error, not silently discarded (CR-117).
 *
 * Reads .cleargate/sprint-runs/<sprint-id>/state.json (or a specified path),
 * confirms schema version, and reports invariant violations.
 *
 * Exports validateState(state) for use by other scripts.
 *
 * CR-106: also exports checkFoldDrift(stateFile), an ADDITIVE check -- a state.json whose bytes
 * differ from JSON.stringify(fold(readEvents(events.jsonl)), null, 2) + '\n' means something wrote
 * to state.json without going through the log (a hand-edit, or a bug), and the derived cache has
 * silently diverged from the source of truth. Per the CR's own § Open Questions: "the log wins and
 * the fold overwrites" is update_state.mjs's job on its NEXT invocation; this check exists to make
 * that drift VISIBLE rather than silent. A tree with no events.jsonl yet (every legacy sprint,
 * every sprint not yet touched since this CR shipped) cannot drift by definition -- CANNOT fail
 * this check, only skip it.
 *
 * TPV T11 (CR-106 round 2): state-scripts.test.mjs imports validateState at module-load time for
 * ALL 31 tests in that file, including the ones that predate CR-106 entirely. Keep validateState
 * exported unchanged; keep this module free of import-time side effects -- the CLI-invocation
 * guard below (`process.argv[1] === ...`) is what makes a bare `import` of this module safe today.
 * Do not move the drift check's own I/O to module scope.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMA_VERSION, VALID_STATES, BOUNCE_CAP } from './constants.mjs';
import { fold, readEvents } from './state-events.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

/**
 * Validate a parsed state object, ignoring schema_version check.
 * Used PRE-MIGRATION so that v1 files pass shape validation before being upgraded.
 * @param {object} state - Parsed state.json content
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateShapeIgnoringVersion(state) {
  const errors = [];

  if (typeof state !== 'object' || state === null) {
    errors.push('state is not an object');
    return { valid: false, errors };
  }

  if (!state.sprint_id) {
    errors.push('missing required field: sprint_id');
  }

  if (!state.sprint_status) {
    errors.push('missing required field: sprint_status');
  }

  if (typeof state.stories !== 'object' || state.stories === null) {
    errors.push('stories field must be an object');
    return { valid: false, errors };
  }

  for (const [storyId, story] of Object.entries(state.stories)) {
    if (typeof story !== 'object' || story === null) {
      errors.push(`story ${storyId}: not an object`);
      continue;
    }

    if (!VALID_STATES.includes(story.state)) {
      errors.push(
        `story ${storyId}: invalid state "${story.state}"; expected one of: ${VALID_STATES.join(', ')}`
      );
    }

    if (typeof story.qa_bounces !== 'number') {
      errors.push(`story ${storyId}: qa_bounces must be a number`);
    } else if (story.qa_bounces > BOUNCE_CAP) {
      errors.push(
        `invariant violation: story ${storyId} qa_bounces=${story.qa_bounces} exceeds BOUNCE_CAP (${BOUNCE_CAP})`
      );
    } else if (story.qa_bounces < 0) {
      errors.push(`story ${storyId}: qa_bounces must be >= 0`);
    }

    if (typeof story.arch_bounces !== 'number') {
      errors.push(`story ${storyId}: arch_bounces must be a number`);
    } else if (story.arch_bounces > BOUNCE_CAP) {
      errors.push(
        `invariant violation: story ${storyId} arch_bounces=${story.arch_bounces} exceeds BOUNCE_CAP (${BOUNCE_CAP})`
      );
    } else if (story.arch_bounces < 0) {
      errors.push(`story ${storyId}: arch_bounces must be >= 0`);
    }

    if (!story.updated_at) {
      errors.push(`story ${storyId}: missing required field: updated_at`);
    }
  }

  if (!state.updated_at) {
    errors.push('missing required top-level field: updated_at');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a parsed state object (strict — includes schema_version check).
 * Call this AFTER migration to assert the file is fully v2-compliant.
 * @param {object} state - Parsed state.json content
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateState(state) {
  const errors = [];

  if (typeof state !== 'object' || state === null) {
    errors.push('state is not an object');
    return { valid: false, errors };
  }

  if (state.schema_version !== SCHEMA_VERSION) {
    errors.push(
      `schema_version mismatch: expected ${SCHEMA_VERSION}, got ${state.schema_version}`
    );
  }

  // Delegate shape validation (everything except version check)
  const shapeResult = validateShapeIgnoringVersion(state);
  for (const e of shapeResult.errors) {
    errors.push(e);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * CR-106: additive fold-vs-file drift check. Compares the on-disk state.json bytes against
 * JSON.stringify(fold(readEvents(events.jsonl)), null, 2) + '\n' -- the exact format
 * state-events.mjs's atomicWrite produces. A tree with no events.jsonl yet cannot drift by
 * definition and is reported as skipped, never as invalid (Task Breakdown: "additive; must not
 * fail a tree with no events.jsonl").
 * @param {string} stateFile - absolute path to state.json
 * @returns {{ valid: boolean, errors: string[], skipped: boolean }}
 */
export function checkFoldDrift(stateFile) {
  const eventsFile = path.join(path.dirname(stateFile), 'events.jsonl');

  if (!fs.existsSync(eventsFile)) {
    return { valid: true, errors: [], skipped: true };
  }

  let onDiskBytes;
  try {
    onDiskBytes = fs.readFileSync(stateFile, 'utf8');
  } catch (err) {
    return { valid: false, errors: [`could not read ${stateFile}: ${err.message}`], skipped: false };
  }

  let events;
  try {
    events = readEvents(eventsFile);
  } catch (err) {
    return { valid: false, errors: [`could not read/parse ${eventsFile}: ${err.message}`], skipped: false };
  }

  const foldedBytes = `${JSON.stringify(fold(events), null, 2)}\n`;

  if (foldedBytes !== onDiskBytes) {
    return {
      valid: false,
      errors: [
        `state.json content differs from fold(events.jsonl) -- the derived cache has drifted from ` +
        `the event log (a hand-edit, or a write that bypassed update_state.mjs); the log at ` +
        `${eventsFile} is the source of truth, re-run any update_state.mjs invocation to re-fold it`,
      ],
      skipped: false,
    };
  }

  return { valid: true, errors: [], skipped: false };
}

// CLI mode
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf('--state-file');
  const flagValue = fileIdx !== -1 ? args[fileIdx + 1] : undefined;

  // CR-117: a lone positional argument is the state file. Any arg consumed by --state-file
  // (the flag itself and its value) is excluded from positional/unrecognised consideration;
  // any remaining arg that isn't a bare (non-flag) positional is named as unrecognised rather
  // than silently discarded.
  const consumedIdx = new Set();
  if (fileIdx !== -1) {
    consumedIdx.add(fileIdx);
    if (flagValue !== undefined) consumedIdx.add(fileIdx + 1);
  }

  let positionalValue;
  const unrecognized = [];
  for (let i = 0; i < args.length; i++) {
    if (consumedIdx.has(i)) continue;
    const arg = args[i];
    if (positionalValue === undefined && !arg.startsWith('--')) {
      positionalValue = arg;
    } else {
      unrecognized.push(arg);
    }
  }

  if (unrecognized.length > 0) {
    process.stderr.write(`Error: unrecognised argument(s): ${unrecognized.join(', ')}\n`);
    process.exit(1);
  }

  let stateFile;

  if (fileIdx !== -1 && flagValue) {
    if (positionalValue !== undefined) {
      process.stderr.write(
        `Both a positional path (${positionalValue}) and --state-file (${flagValue}) were ` +
        `supplied; using --state-file: ${flagValue}\n`
      );
    }
    stateFile = path.resolve(flagValue);
  } else if (positionalValue !== undefined) {
    stateFile = path.resolve(positionalValue);
  } else {
    // Attempt to discover via environment or fallback
    const envStateFile = process.env.CLEARGATE_STATE_FILE;
    if (envStateFile) {
      stateFile = path.resolve(envStateFile);
    } else {
      // Look for state.json in sprint-runs/
      const sprintRunsDir = path.join(REPO_ROOT, '.cleargate', 'sprint-runs');
      if (!fs.existsSync(sprintRunsDir)) {
        process.stderr.write(`Error: sprint-runs directory not found at ${sprintRunsDir}\n`);
        process.exit(1);
      }
      const entries = fs.readdirSync(sprintRunsDir);
      const found = entries
        .map((e) => path.join(sprintRunsDir, e, 'state.json'))
        .filter((p) => fs.existsSync(p));
      if (found.length === 0) {
        process.stderr.write('Error: no state.json found in sprint-runs/\n');
        process.exit(1);
      }
      if (found.length > 1) {
        process.stderr.write(
          `Multiple state.json files found; specify --state-file:\n${found.join('\n')}\n`
        );
        process.exit(1);
      }
      stateFile = found[0];
    }
  }

  if (!fs.existsSync(stateFile)) {
    process.stderr.write(`Error: state.json not found at ${stateFile}\n`);
    process.exit(1);
  }

  let state;
  try {
    state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch (err) {
    process.stderr.write(`Error: failed to parse state.json: ${err.message}\n`);
    process.exit(1);
  }

  const { valid, errors } = validateState(state);

  // CR-106: additive drift check -- never the reason a tree with no events.jsonl fails (skipped:
  // true short-circuits to zero errors), and never runs before validateState() has had its say.
  const drift = checkFoldDrift(stateFile);
  const allErrors = [...errors, ...drift.errors];

  if (valid && drift.valid) {
    process.stdout.write(`state.json at ${stateFile} is valid (schema_version=${state.schema_version})\n`);
    process.exit(0);
  } else {
    process.stderr.write(`Validation failed for ${stateFile}:\n`);
    for (const err of allErrors) {
      process.stderr.write(`  - ${err}\n`);
    }
    process.exit(1);
  }
}
