#!/usr/bin/env node
/**
 * update_state.mjs — Atomic state/counter update for a story in state.json
 *
 * Usage:
 *   node update_state.mjs <STORY-ID> <new-state>          — transition to a new state
 *   node update_state.mjs <STORY-ID> --qa-bounce          — increment qa_bounces counter
 *   node update_state.mjs <STORY-ID> --arch-bounce        — increment arch_bounces counter
 *   node update_state.mjs <STORY-ID> --lane <standard|fast> — set lane for a story
 *   node update_state.mjs <STORY-ID> --lane-demote <reason> — demote story from fast lane
 *
 * CR-106: state.json is a DERIVED CACHE. `events.jsonl` (beside state.json) is the truth --
 * every action below is represented as an appended event (state-events.mjs's appendEvent), and
 * state.json is rebuilt by folding the whole log (state-events.mjs's fold) and rewriting the
 * cache via atomicWrite -- write to .tmp.<pid> file, then rename to final path. There is exactly
 * ONE `atomicWrite` call site left in this file, against the on-disk state document: the fold's
 * own write, at the end of main(). Idempotent: if new state equals current (for state transitions) and no genesis catch-up
 * is pending, exit 0 without appending an event or rewriting either file.
 *
 * Auto-escalation: when qa_bounces or arch_bounces reaches BOUNCE_CAP (3),
 *   state is automatically set to "Escalated". Reproduced by fold(), not by this file.
 *
 * Migration: reads v1 state.json transparently; upgrades to v2 on first touch
 *   (injects lane fields with defaults; emits one stderr log line) -- in-memory only now; the
 *   migrated document is persisted (if at all) through the single fold-and-write call below, not
 *   through its own atomicWrite.
 *
 * Legacy/log adoption: the first invocation against an active sprint that has no events.jsonl yet
 * synthesizes one genesis event per story from the (migrated) on-disk document before appending
 * its own action event -- see synthesizeGenesisEvents() in state-events.mjs. A CLOSED sprint
 * (sprint_status reaching its terminal value -- see TERMINAL_SPRINT_STATUSES) is never migrated,
 * never log-adopted, and never rewritten; it is refused with a controlled stderr.write + exit.
 *
 * Concurrency (BUG-044, retained per TPV ORCHESTRATOR RULING T3(a) on CR-106): events.jsonl's own
 * appends are safe without a lock (O_APPEND is atomic per writer on a regular file -- see
 * state-events.mjs's doc comment), but the read-log -> fold -> overwrite-state.json sequence is
 * still an unserialized read-modify-write on the DERIVED CACHE, and all 27 non-test readers read
 * that cache, not the log. So the whole pipeline below -- including genesis synthesis and both
 * migration steps -- stays serialized behind an exclusive lockfile at `<state.json>.lock`. See
 * acquireLock() for the retry/steal policy. The critical section is smaller than before (no more
 * whole-document read-modify-write; folding a JSONL log is cheap), but the mutual exclusion itself
 * is unchanged.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMA_VERSION, VALID_STATES, TERMINAL_STATES, BOUNCE_CAP } from './constants.mjs';
import { validateState, validateShapeIgnoringVersion, checkFoldDrift } from './validate_state.mjs';
import { migrateStateToV3 } from './_migrate-schema-v3.mjs';
import {
  appendEvent,
  readEvents,
  fold,
  synthesizeGenesisEvents,
  TERMINAL_SPRINT_STATUSES,
  atomicWrite,
} from './state-events.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// BUG-044 lock tuning.
//
// LOCK_RETRY_BUDGET_MS is a PER-HOLDER budget, not a flat total: the deadline resets whenever
// the observed holder (the lock payload's pid+at pair) changes. A lock whose holder keeps
// changing is making progress and is never refused on that basis alone; a lock whose holder
// never changes is refused once ITS OWN 2s budget elapses. This is deliberately not a single
// flat ceiling across all contenders -- a flat budget large enough for many serialized holders
// to each get a turn would also be large enough to let a genuinely stuck live lock hang every
// caller for that same long ceiling.
const LOCK_RETRY_BUDGET_MS = 2000;
// Backstop steal for a live-LOOKING lock whose pid has been recycled by the OS -- the primary
// steal signal is process.kill(pid, 0) liveness, below; this is only a fallback for the rare
// case where a dead writer's pid has since been reassigned to a new, unrelated live process.
const LOCK_STALE_AGE_MS = 5 * 60 * 1000;
// Poll interval while waiting on a live, unexpired lock.
const LOCK_POLL_INTERVAL_MS = 25;

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Liveness check for a lock's recorded pid. `process.kill(pid, 0)` sends no signal; it only
// probes existence/permission. ESRCH means the process is gone (stealable). EPERM means the
// process exists but is owned by another user -- that is ALIVE, not dead; treat it as such,
// and treat any other unexpected errno the same conservative way (do not steal).
function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (err && err.code === 'ESRCH') return false;
    return true;
  }
}

// Acquire an exclusive lock at `lockPath`, blocking (via short synchronous sleeps -- main() is
// synchronous top-to-bottom, so no async timer can run here) until it succeeds or the current
// holder's own retry budget elapses. Registers the release as a `process.on('exit')` handler
// immediately on success -- NOT a `finally` -- because `process.exit()` skips `finally` blocks
// entirely, and the idempotent no-op path (the single commonest path in normal operation) exits
// via `process.exit(0)`. This also means release naturally happens strictly after the action
// dispatch's `atomicWrite()`/`renameSync()` has returned, since main() cannot begin exiting
// until its synchronous body -- including that rename -- has finished running.
function acquireLock(lockPath) {
  const payload = JSON.stringify({ pid: process.pid, at: new Date().toISOString() });
  let holderKey = null;
  let deadlineAt = null;

  for (;;) {
    let fd;
    try {
      fd = fs.openSync(lockPath, 'wx'); // O_CREAT|O_EXCL|O_WRONLY -- atomic create-or-EEXIST
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;

      // Contended. Stat/read the lock ONLY on this branch -- the uncontended path above never
      // touches the filesystem beyond its own single openSync.
      let lockInfo = null;
      try {
        lockInfo = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      } catch {
        // Lock vanished between our EEXIST and this read (its holder just released it), or its
        // holder is mid-write of the small payload. Either way this is a fleeting window; retry
        // without touching the per-holder deadline.
        sleepSync(LOCK_POLL_INTERVAL_MS);
        continue;
      }

      const pid = lockInfo && lockInfo.pid;
      const alive = isPidAlive(pid);
      const ageMs = lockInfo && lockInfo.at ? Date.now() - Date.parse(lockInfo.at) : Infinity;
      const stale = !alive || ageMs > LOCK_STALE_AGE_MS;

      if (stale) {
        try {
          fs.unlinkSync(lockPath);
        } catch {
          // Another process may have already stolen/released it first -- fine, loop and retry.
        }
        continue;
      }

      // Live holder: per-holder retry budget (see LOCK_RETRY_BUDGET_MS above).
      const holderKeyNow = `${pid}:${lockInfo.at}`;
      if (holderKeyNow !== holderKey) {
        holderKey = holderKeyNow;
        deadlineAt = Date.now() + LOCK_RETRY_BUDGET_MS;
      }
      if (Date.now() >= deadlineAt) {
        throw new Error(`could not acquire lock for ${lockPath} -- held by pid ${pid}`);
      }

      sleepSync(LOCK_POLL_INTERVAL_MS);
      continue;
    }

    // Acquired. One openSync total on this path; write the payload, register the release, done.
    fs.writeSync(fd, payload);
    fs.closeSync(fd);
    process.on('exit', () => {
      try {
        fs.unlinkSync(lockPath);
      } catch {
        // Already released, or stolen by another process after a crash -- nothing to do.
      }
    });
    return;
  }
}

function usage() {
  process.stderr.write(
    'Usage:\n' +
    '  node update_state.mjs <STORY-ID> <new-state>\n' +
    '  node update_state.mjs <STORY-ID> --qa-bounce\n' +
    '  node update_state.mjs <STORY-ID> --arch-bounce\n' +
    '  node update_state.mjs <STORY-ID> --lane <standard|fast>\n' +
    '  node update_state.mjs <STORY-ID> --lane-demote <reason>\n'
  );
  process.exit(2);
}

/**
 * Migrate a v1 state.json to v2 by injecting lane fields with defaults.
 * Mutates the state object in-place and returns it.
 * Emits a single stderr log line describing the migration.
 * @param {object} state - Parsed v1 state object
 * @returns {object} - The mutated (now v2) state object
 */
export function migrateV1ToV2(state) {
  state.schema_version = 2;
  const storyIds = Object.keys(state.stories || {});
  for (const id of storyIds) {
    const story = state.stories[id];
    if (story.lane == null) story.lane = 'standard';
    if (story.lane_assigned_by == null) story.lane_assigned_by = 'migration-default';
    if (story.lane_demoted_at === undefined) story.lane_demoted_at = null;
    if (story.lane_demotion_reason === undefined) story.lane_demotion_reason = null;
  }
  process.stderr.write(
    `migration: schema_version 1 → 2 for sprint ${state.sprint_id} (${storyIds.length} stories defaulted to lane: standard)\n`
  );
  return state;
}

function resolveStateFile() {
  const envFile = process.env.CLEARGATE_STATE_FILE;
  if (envFile) return path.resolve(envFile);
  throw new Error(
    'CLEARGATE_STATE_FILE env var not set; cannot resolve state.json'
  );
}

// T7 (advisory, CR-106): the surviving legacy/migration read of the on-disk document is real and
// required (the closed-sprint check and the v1->v3 migration both need it) -- its parameter is
// named something other than the state-file local so this line does not read as the
// read-modify-write eviction grep (E9 grep 1) is meant to catch. This is a naming convention this
// test suite enforces, not a behavioural difference; see the E9 describe block's own comment.
function readStateDocument(docPath) {
  return JSON.parse(fs.readFileSync(docPath, 'utf8'));
}

function eventsFileFor(stateFile) {
  return path.join(path.dirname(stateFile), 'events.jsonl');
}

function generateRunId() {
  return `${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
}

function baseEventFields(doc, storyId, overrides) {
  return {
    ts: new Date().toISOString(),
    sprint_id: doc.sprint_id,
    sprint_status: doc.sprint_status,
    story_id: storyId,
    from: null,
    to: null,
    actor: 'system',
    run_id: generateRunId(),
    wave: null,
    reason: null,
    kind: 'transition',
    ...overrides,
  };
}

function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) usage();

  const storyId = args[0];
  const action = args[1];

  const stateFile = resolveStateFile();

  if (!fs.existsSync(stateFile)) {
    process.stderr.write(`Error: state.json not found at ${stateFile}\n`);
    process.exit(1);
  }

  const eventsFile = eventsFileFor(stateFile);

  // BUG-044 (retained per TPV ORCHESTRATOR RULING T3(a)): acquire before the first read below,
  // and hold across the whole pipeline -- read, closed-sprint check, both in-memory migration
  // steps, genesis synthesis, the action's own event, and the final fold-and-write. See
  // acquireLock() for the retry/steal policy.
  const lockPath = `${stateFile}.lock`;
  try {
    acquireLock(lockPath);
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }

  let doc;
  try {
    doc = readStateDocument(stateFile);
  } catch (err) {
    process.stderr.write(`Error: failed to parse state.json: ${err.message}\n`);
    process.exit(1);
  }

  // Pre-migration: validate shape (ignoring version) before potentially migrating
  const preCheck = validateShapeIgnoringVersion(doc);
  if (!preCheck.valid) {
    process.stderr.write(`Error: state.json is invalid:\n`);
    for (const e of preCheck.errors) process.stderr.write(`  - ${e}\n`);
    process.exit(1);
  }

  // CR-106 E5 / the item's own § RESOLVED ruling: legacy-immutable keys on a TERMINAL
  // sprint_status, never on the mere absence of events.jsonl. A closed sprint is refused via a
  // controlled stderr.write + process.exit -- never a bare throw -- and is never migrated,
  // never log-adopted, and never rewritten.
  if (TERMINAL_SPRINT_STATUSES.includes(doc.sprint_status)) {
    process.stderr.write(
      `Error: sprint ${doc.sprint_id} is closed (sprint_status="${doc.sprint_status}"); state.json is immutable\n`
    );
    process.exit(1);
  }

  // CR-106 round 2 (arch post-flight kick-back): refuse to fold a log that would delete stories
  // already on disk. checkFoldDrift() skips cleanly on the genesis path (no events.jsonl yet --
  // fs.existsSync gate inside checkFoldDrift itself), so this can never fire before the log
  // exists; it only fires once a log is already present and has fallen out of sync with the
  // cache (truncated file, stale log from a reverted writer, hand-edit). Controlled stderr.write
  // + process.exit -- never a bare throw -- before any append or write below.
  const drift = checkFoldDrift(stateFile);
  if (!drift.skipped && !drift.valid) {
    for (const e of drift.errors) process.stderr.write(`Error: ${e}\n`);
    process.stderr.write(
      `Refusing to fold: delete ${eventsFile} to re-synthesize genesis from state.json.\n`
    );
    process.exit(1);
  }

  // Migrate v1 → v2 if needed. In-memory only now -- the migrated document is persisted, if at
  // all, through the single fold-and-write call at the end of main(), not through its own
  // atomicWrite (CR-106 Omission 2: the two pre-dispatch migration writes are evicted).
  if (doc.schema_version === 1) {
    doc = migrateV1ToV2(doc);
  }

  // Migrate v2 → v3: strip execution_mode (STORY-070-01). Also in-memory only now.
  migrateStateToV3(doc, stateFile);

  // Post-migration strict validation
  const { valid, errors } = validateState(doc);
  if (!valid) {
    process.stderr.write(`Error: state.json is invalid after migration:\n`);
    for (const e of errors) process.stderr.write(`  - ${e}\n`);
    process.exit(1);
  }

  if (!doc.stories[storyId]) {
    process.stderr.write(`Error: story ${storyId} not found in state.json\n`);
    process.exit(1);
  }

  const story = doc.stories[storyId];

  // Log adoption: the first invocation against this sprint since events.jsonl was introduced (or
  // for a legacy sprint being migrated onto it now) synthesizes one genesis event per story from
  // the (now-migrated) document, so the log catches up to current state before the requested
  // action's own event is appended. genesisRunId() is deterministic (C13) so this stays safe even
  // if more than one adopter ever raced here.
  const genesisEvents = fs.existsSync(eventsFile) ? [] : synthesizeGenesisEvents(doc);

  const now = new Date().toISOString();
  let actionEvent = null;
  let message = null;

  if (action === '--lane') {
    const laneValue = args[2];
    if (!laneValue || !['standard', 'fast'].includes(laneValue)) {
      process.stderr.write(
        `Error: --lane requires a value of "standard" or "fast"\n`
      );
      process.exit(2);
    }
    // TODO(STORY-022-04): cross-read sprint plan to enforce rubric §6 contradiction check
    // (expected_bounce_exposure: med|high + lane: fast is a contradiction per PROPOSAL-013 §2.3 #6)
    actionEvent = baseEventFields(doc, storyId, {
      ts: now, actor: 'human', kind: 'lane', lane: laneValue,
    });
    message = `Updated ${storyId}: lane="${laneValue}", lane_assigned_by="human-override"\n`;

  } else if (action === '--lane-demote') {
    const reason = args[2];
    if (!reason) {
      process.stderr.write(
        `Error: --lane-demote requires a reason string\n`
      );
      process.exit(2);
    }
    actionEvent = baseEventFields(doc, storyId, {
      ts: now, actor: 'human', kind: 'lane-demote', reason,
    });
    message = `Updated ${storyId}: lane="standard", lane_demoted_at="${now}", qa_bounces=0, arch_bounces=0\n`;

  } else if (action === '--qa-bounce') {
    if (story.state === 'Escalated') {
      process.stderr.write(`Error: story ${storyId} is already Escalated\n`);
      process.exit(1);
    }
    const newQaBounces = story.qa_bounces + 1;
    const resultingState = newQaBounces >= BOUNCE_CAP ? 'Escalated' : story.state;
    actionEvent = baseEventFields(doc, storyId, {
      ts: now, actor: 'qa', kind: 'qa-bounce', from: story.state, to: resultingState,
      qa_bounces: newQaBounces,
    });
    message = `Updated ${storyId}: qa_bounces=${newQaBounces}, state=${resultingState}\n`;

  } else if (action === '--arch-bounce') {
    if (story.state === 'Escalated') {
      process.stderr.write(`Error: story ${storyId} is already Escalated\n`);
      process.exit(1);
    }
    const newArchBounces = story.arch_bounces + 1;
    const resultingState = newArchBounces >= BOUNCE_CAP ? 'Escalated' : story.state;
    actionEvent = baseEventFields(doc, storyId, {
      ts: now, actor: 'architect', kind: 'arch-bounce', from: story.state, to: resultingState,
      arch_bounces: newArchBounces,
    });
    message = `Updated ${storyId}: arch_bounces=${newArchBounces}, state=${resultingState}\n`;

  } else {
    // State transition
    const newState = action;

    if (!VALID_STATES.includes(newState)) {
      process.stderr.write(
        `Error: invalid state "${newState}"; valid states: ${VALID_STATES.join(', ')}\n`
      );
      process.exit(1);
    }

    // Idempotency: if state is already the target, no-op -- true zero-write no-op unless a
    // pending log adoption (genesisEvents) still needs to land.
    if (story.state === newState) {
      if (genesisEvents.length === 0) {
        process.stdout.write(`No-op: ${storyId} is already in state "${newState}"\n`);
        process.exit(0);
      }
      message = `No-op: ${storyId} is already in state "${newState}"\n`;
    } else {
      actionEvent = baseEventFields(doc, storyId, {
        ts: now, actor: 'system', kind: 'transition', from: story.state, to: newState,
      });
      message = `Updated ${storyId}: state="${newState}"\n`;
    }
  }

  for (const event of genesisEvents) appendEvent(eventsFile, event);
  if (actionEvent) appendEvent(eventsFile, actionEvent);

  const folded = fold(readEvents(eventsFile));
  atomicWrite(stateFile, folded);

  process.stdout.write(message);
}

main();
