#!/usr/bin/env node
/**
 * _migrate-schema-v3.mjs — Strip-on-read migrator: execution_mode → retired, schema v2 → v3
 *
 * STORY-070-01: collapse execution_mode vocabulary.
 *
 * Usage (CLI): node _migrate-schema-v3.mjs --state-path <path>
 * Usage (import): import { migrateStateToV3 } from './_migrate-schema-v3.mjs';
 *
 * Contract:
 *   - Reads state.json at <path>
 *   - If execution_mode present: deletes the key
 *   - If schema_version !== 3: bumps to 3
 *   - If anything changed: logs "[migrator] STORY-070-01: stripped execution_mode from <path>" to stderr
 *   - Atomic write via tmp+rename (no partial writes on crash)
 *   - Idempotent: if execution_mode absent and schema_version already 3 → no-op, no write, no log
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Migrate a parsed state object in-place: strip execution_mode + bump schema_version to 3.
 * Does NOT write to disk. Returns { state, changed }.
 *
 * @param {Record<string, unknown>} state - Parsed state.json object (mutated in-place)
 * @param {string} statePath - Path to the state.json file (used only for the log line)
 * @returns {{ state: Record<string, unknown>, changed: boolean }}
 */
export function migrateStateToV3(state, statePath) {
  let changed = false;

  if ('execution_mode' in state) {
    delete state.execution_mode;
    changed = true;
  }

  if (state.schema_version !== 3) {
    state.schema_version = 3;
    changed = true;
  }

  if (changed) {
    process.stderr.write(`[migrator] STORY-070-01: stripped execution_mode from ${statePath}\n`);
  }

  return { state, changed };
}

/**
 * Read, migrate (if needed), and atomically write state.json at the given path.
 * Exported for use by scripts that need the full read-migrate-write cycle.
 *
 * @param {string} statePath - Absolute path to state.json
 * @returns {{ changed: boolean }} whether a write occurred
 */
export function migrateStateFileToV3(statePath) {
  let raw;
  try {
    raw = fs.readFileSync(statePath, 'utf8');
  } catch (err) {
    process.stderr.write(`[migrator] ERROR: cannot read ${statePath}: ${err.message}\n`);
    process.exit(1);
  }

  let state;
  try {
    state = JSON.parse(raw);
  } catch (err) {
    process.stderr.write(`[migrator] ERROR: cannot parse ${statePath}: ${err.message}\n`);
    process.exit(1);
  }

  const { changed } = migrateStateToV3(state, statePath);

  if (changed) {
    const tmpFile = `${statePath}.tmp.${process.pid}`;
    try {
      fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2) + '\n', 'utf8');
      fs.renameSync(tmpFile, statePath);
    } catch (err) {
      // Clean up tmp if write/rename failed
      try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
      process.stderr.write(`[migrator] ERROR: cannot write ${statePath}: ${err.message}\n`);
      process.exit(1);
    }
  }

  return { changed };
}

// ── CLI entry point ────────────────────────────────────────────────────────────
// When invoked as a script: node _migrate-schema-v3.mjs --state-path <path>
// Detect CLI mode via import.meta.url vs process.argv[1]

const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && (
  process.argv[1] === __filename ||
  path.resolve(process.argv[1]) === path.resolve(__filename)
);

if (isMain) {
  const args = process.argv.slice(2);
  const statePathIdx = args.indexOf('--state-path');

  if (statePathIdx !== -1 && args[statePathIdx + 1]) {
    const statePath = path.resolve(args[statePathIdx + 1]);
    const { changed } = migrateStateFileToV3(statePath);
    if (!changed) {
      // Always emit the path on no-op so callers can confirm the file was checked.
      // Uses a plain prefix (not '[migrator]') to distinguish from real migration logs.
      process.stderr.write(`${statePath}: already at schema_version 3, no migration needed\n`);
    }
    process.exit(0);
  } else {
    process.stderr.write('Usage: node _migrate-schema-v3.mjs --state-path <path>\n');
    process.exit(2);
  }
}
