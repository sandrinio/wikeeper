#!/usr/bin/env node
/**
 * state-events.mjs — append-only event log + pure fold for state.json (CR-106)
 *
 * `events.jsonl` is the truth; `state.json` is a derived cache produced by folding the log.
 * This module owns three things:
 *
 *   - appendEvent(eventsFile, event) — append one JSON line to the log
 *   - readEvents(eventsFile)         — parse the log back into an array of event objects
 *   - fold(events)                   — pure function: event array -> state.json-shaped object
 *
 * `fold()` takes ONLY the event array. No `state.json` read, no env var, no cwd lookup — the
 * vacuity mutant this CR exists to prevent is exactly a "fold" that reaches outside its argument
 * (TPV mutant #7/#19; CR-106 E8).
 *
 * Atomicity note (CR-105 rule: replace the justification, keep the row — the original design
 * cited POSIX PIPE_BUF as the reason concurrent appends are safe. That citation was wrong on two
 * counts: PIPE_BUF governs pipes/FIFOs, not regular files, and on this machine `getconf PIPE_BUF /`
 * returns 512, not the 4096 originally assumed. Neither number has any bearing on a `.jsonl`
 * append to a REGULAR FILE. The property this module actually relies on is that `O_APPEND` makes
 * the seek-to-end and the write a single atomic operation with respect to other writers on the
 * same regular file — POSIX guarantees this, and Node reaches it via `fs.appendFileSync(path,
 * line, 'utf8')` (flag `'a'`). Concurrent appends therefore cannot interleave or truncate one
 * another, regardless of record size.
 *
 * The event log removes the race from the LOG. It does NOT remove the race from the DERIVED
 * CACHE (state.json): fold() is pure and appends are atomic, but the read-log -> fold ->
 * overwrite-state.json sequence is still an unserialized read-modify-write if nothing guards it.
 * update_state.mjs retains BUG-044's lockfile around exactly that sequence (TPV ORCHESTRATOR
 * RULING T3(a)) — this module does not attempt to solve that on its own; callers must serialize.
 */

import fs from 'node:fs';
import { SCHEMA_VERSION, BOUNCE_CAP } from './constants.mjs';

// C4 (CR-106 pinned event contract): every event carries a `kind` discriminator. The documented
// 9-field shape ({ts, sprint_id, story_id, from, to, actor, run_id, wave, reason}) describes only
// `transition`; the other four kinds cover the remaining action branches update_state.mjs
// supports. Events with no `kind` field (hand-built fixtures predating this pin) default to
// `transition` -- see fold() below.
export const EVENT_SCHEMA = {
  kinds: ['transition', 'qa-bounce', 'arch-bounce', 'lane', 'lane-demote'],
  // Base fields present on every event (C3: sprint_status is carried per-event, not just
  // per-sprint, so fold() -- which reads nothing but the array -- has a source for it).
  baseFields: ['ts', 'sprint_id', 'sprint_status', 'story_id', 'from', 'to', 'actor', 'run_id', 'wave', 'reason', 'kind'],
  // Genesis events (from: null) additionally carry an `initial` payload holding whatever
  // non-transition fields (qa_bounces, arch_bounces, worktree, notes, lane*) the story needs that
  // the base shape does not cover (C2). Action-kind events may carry kind-specific extra fields
  // (qa_bounces / arch_bounces / lane / on lane-demote, `reason` doubles as the demotion reason).
};

// Legacy-immutability predicate (Task Breakdown / item's own § RESOLVED ruling): a CLOSED sprint
// is never rewritten. `'Completed'` is the only value close_sprint.mjs actually writes
// (close_sprint.mjs:1044); `'Closed'` is guarded too because state.schema.json:30 lists it as a
// prose example -- guarding both is harmless, guarding only one is wrong (C6).
export const TERMINAL_SPRINT_STATUSES = ['Completed', 'Closed'];

/**
 * Append one event to the log. C1 (pinned): path first, mirroring atomicWrite(stateFile, state).
 * C12/C15: reaches the file through fs.appendFileSync, which relies on O_APPEND's atomic
 * seek-to-end-and-write guarantee for regular files (see module doc comment above).
 * @param {string} eventsFile
 * @param {object} event
 */
export function appendEvent(eventsFile, event) {
  fs.appendFileSync(eventsFile, `${JSON.stringify(event)}\n`, 'utf8');
}

/**
 * Read and parse every line of the event log.
 * @param {string} eventsFile
 * @returns {object[]}
 */
export function readEvents(eventsFile) {
  const raw = fs.readFileSync(eventsFile, 'utf8');
  return raw
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

/**
 * Atomic tmp+rename write of a JSON document. The ONE writer of state.json -- reused by
 * update_state.mjs (the fold's own output write) and by init_sprint.mjs (replacing its previously
 * duplicated inline tmp+rename idiom at the old :231-233; the "Reuse" section of this CR names
 * collapsing that duplication as in scope).
 * @param {string} filePath
 * @param {object} data
 */
export function atomicWrite(filePath, data) {
  const tmpFile = `${filePath}.tmp.${process.pid}`;
  fs.writeFileSync(tmpFile, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  fs.renameSync(tmpFile, filePath);
}

/**
 * Atomic tmp+rename write of a FULL events.jsonl file from an in-memory event array. Distinct
 * from appendEvent() (which is append-only, for the ongoing case): this is for the one
 * legitimately destructive case -- init_sprint.mjs's `--force` re-init, which already overwrites
 * state.json wholesale and must keep events.jsonl's genesis set in lockstep with it, not leave
 * stale history from a prior init appended underneath a fresh one.
 * @param {string} eventsFile
 * @param {object[]} events
 */
export function writeEventsFile(eventsFile, events) {
  const content = events.length > 0 ? `${events.map((e) => JSON.stringify(e)).join('\n')}\n` : '';
  const tmpFile = `${eventsFile}.tmp.${process.pid}`;
  fs.writeFileSync(tmpFile, content, 'utf8');
  fs.renameSync(tmpFile, eventsFile);
}

/**
 * Build the deterministic genesis run_id for a story's bootstrap event. C13 (pinned): genesis
 * events appended concurrently by N adopters must dedupe on a DERIVED run_id, not a random one --
 * a random run_id on the bootstrap path re-creates the lost-update race inside the migration
 * itself, since each adopter would append its own "unique" genesis line for the same story.
 * @param {string} sprintId
 * @param {string} storyId
 * @returns {string}
 */
export function genesisRunId(sprintId, storyId) {
  return `genesis:${sprintId}:${storyId}`;
}

/**
 * Synthesize one genesis event per story from an existing (already-migrated) state document.
 * Used exactly once per sprint, the first time an invocation finds no events.jsonl -- either a
 * legacy sprint being adopted onto the log, or an active sprint initialised before events.jsonl
 * seeding existed. Story order matches Object.keys(doc.stories) (constraint #2: log order, never
 * re-sorted).
 * @param {object} doc - parsed, already-migrated (schema_version 3) state.json content
 * @returns {object[]}
 */
export function synthesizeGenesisEvents(doc) {
  const carriedKeys = [
    'qa_bounces',
    'arch_bounces',
    'worktree',
    'notes',
    'lane',
    'lane_assigned_by',
    'lane_demoted_at',
    'lane_demotion_reason',
  ];
  const events = [];
  for (const [storyId, story] of Object.entries(doc.stories || {})) {
    const initial = {};
    for (const key of carriedKeys) {
      if (key in story) initial[key] = story[key];
    }
    events.push({
      ts: story.updated_at,
      sprint_id: doc.sprint_id,
      sprint_status: doc.sprint_status,
      story_id: storyId,
      from: null,
      to: story.state,
      actor: 'migration',
      run_id: genesisRunId(doc.sprint_id, storyId),
      wave: null,
      reason: null,
      kind: 'transition',
      initial,
    });
  }
  return events;
}

// Fields a genesis event's `initial` payload may carry, in the order they should be merged onto
// the story skeleton. `state` and `updated_at` are DELIBERATELY excluded even if present on an
// `initial` payload -- those two are always derived from the event's own `to` / `ts` fields, never
// from `initial` (C2: initial holds the NON-transition fields).
const INITIAL_MERGE_KEYS = [
  'qa_bounces',
  'arch_bounces',
  'worktree',
  'notes',
  'lane',
  'lane_assigned_by',
  'lane_demoted_at',
  'lane_demotion_reason',
];

function newStorySkeleton() {
  // Constraint #6 (pinned): exact key order state, qa_bounces, arch_bounces, worktree,
  // updated_at, notes -- any `initial:` extras (lane*) are appended AFTER notes, and ONLY when a
  // genesis event actually carries them (no lane defaults on a story whose genesis carries none).
  return {
    state: null,
    qa_bounces: 0,
    arch_bounces: 0,
    worktree: null,
    updated_at: null,
    notes: '',
  };
}

/**
 * fold(events) -- pure function of its single array argument. No state.json read, no env, no cwd,
 * no second path parameter (constraint #1; TPV mutant #7 smuggles a path in as a second
 * parameter -- there is deliberately nowhere for one to go here).
 * @param {object[]} events
 * @returns {object} a state.json-shaped object
 */
export function fold(events) {
  const seenRunIds = new Set();
  const stories = {};
  let sprintId = null;
  let sprintStatus = null;
  let lastAction = null;
  let maxTs = null;

  for (const event of events) {
    if (event.run_id != null) {
      if (seenRunIds.has(event.run_id)) continue; // constraint #4: dedupe key is run_id
      seenRunIds.add(event.run_id);
    }

    if (event.sprint_id != null) sprintId = event.sprint_id;
    if (event.sprint_status != null) sprintStatus = event.sprint_status;
    if (event.ts != null && (maxTs === null || event.ts > maxTs)) maxTs = event.ts; // constraint #3

    const storyId = event.story_id;
    if (storyId == null) continue;

    if (!(storyId in stories)) {
      stories[storyId] = newStorySkeleton(); // constraint #2: insertion order = log order
    }
    const story = stories[storyId];

    const kind = event.kind || 'transition';

    switch (kind) {
      case 'qa-bounce': {
        story.qa_bounces = event.qa_bounces;
        if (story.qa_bounces >= BOUNCE_CAP) story.state = 'Escalated';
        story.updated_at = event.ts;
        lastAction = `qa-bounce ${storyId}: qa_bounces=${story.qa_bounces}`;
        break;
      }
      case 'arch-bounce': {
        story.arch_bounces = event.arch_bounces;
        if (story.arch_bounces >= BOUNCE_CAP) story.state = 'Escalated';
        story.updated_at = event.ts;
        lastAction = `arch-bounce ${storyId}: arch_bounces=${story.arch_bounces}`;
        break;
      }
      case 'lane': {
        story.lane = event.lane;
        story.lane_assigned_by = 'human-override';
        story.updated_at = event.ts;
        lastAction = `lane-set ${storyId}: lane=${event.lane} (human-override)`;
        break;
      }
      case 'lane-demote': {
        story.lane = 'standard';
        story.lane_demoted_at = event.ts;
        story.lane_demotion_reason = event.reason;
        story.qa_bounces = 0;
        story.arch_bounces = 0;
        story.updated_at = event.ts;
        lastAction = `lane-demote ${storyId}: "${event.reason}"`;
        break;
      }
      case 'transition':
      default: {
        story.state = event.to;
        story.updated_at = event.ts;
        // constraint #8: derived consequence, to === 'Done' => worktree = null
        if (event.to === 'Done') story.worktree = null;
        lastAction = `transition ${storyId} → ${event.to}`;
        break;
      }
    }

    // Genesis convention (C2): a story's non-transition fields arrive via `initial`, merged AFTER
    // the kind-specific handling above so `state`/`updated_at` always come from `to`/`ts`, never
    // from `initial` (even if a caller mistakenly included them there).
    if (event.initial) {
      for (const key of INITIAL_MERGE_KEYS) {
        if (key in event.initial && event.initial[key] !== undefined) {
          story[key] = event.initial[key];
        }
      }
    }
  }

  // Top-level key order, exact (constraint #5): schema_version, sprint_id, sprint_status,
  // stories, last_action, updated_at.
  return {
    schema_version: SCHEMA_VERSION,
    sprint_id: sprintId,
    sprint_status: sprintStatus,
    stories,
    last_action: lastAction,
    updated_at: maxTs,
  };
}
