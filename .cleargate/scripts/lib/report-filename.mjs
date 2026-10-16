#!/usr/bin/env node
/**
 * report-filename.mjs — Shared helper for computing the sprint report filename.
 *
 * Named export only — no default.
 *
 * Dependencies: node:path, node:fs only. No third-party deps.
 *
 * Design notes:
 *   - Helper is pure given its arguments + a filesystem read (when opts.forRead=true).
 *   - Never throws — callers decide whether to fs.readFileSync and handle ENOENT.
 *   - Never reads env vars. Sprint dir resolution stays in callers.
 *     (Each consumer owns CLEARGATE_SPRINT_DIR resolution.)
 */

import path from 'node:path';
import fs from 'node:fs';

/**
 * Compute the report filename for a given sprint directory + sprint ID.
 *
 * New naming (SPRINT-18+): SPRINT-<#>_REPORT.md where <#> is the numeric
 *   portion of the sprint-id (e.g. "18" for "SPRINT-18").
 * No-numeric-portion ids (e.g. "SPRINT-TEST") → plain REPORT.md.
 *
 * Backwards-compat read-fallback: when opts.forRead === true AND the new-name
 *   file is absent BUT legacy REPORT.md exists, return the legacy path.
 *   Covers SPRINT-01..17 archives written before STORY-025-03's naming change.
 *   MUST NOT rename or rewrite those pre-existing files.
 *
 * @param {string} sprintDirPath  absolute path to the sprint directory
 * @param {string} sprintId       e.g. "SPRINT-18" or "SPRINT-TEST"
 * @param {{ forRead?: boolean }} [opts]
 * @returns {string} absolute path to the report file
 */
export function reportFilename(sprintDirPath, sprintId, opts) {
  const numMatch = sprintId.match(/^SPRINT-(\d+)$/);
  if (!numMatch) {
    // No numeric portion — use plain REPORT.md (e.g. SPRINT-TEST)
    return path.join(sprintDirPath, 'REPORT.md');
  }
  const sprintNumber = numMatch[1];
  const newName = path.join(sprintDirPath, `SPRINT-${sprintNumber}_REPORT.md`);

  // Read-fallback: if the new-name file doesn't exist but legacy REPORT.md does, use legacy.
  if (opts?.forRead) {
    const legacyName = path.join(sprintDirPath, 'REPORT.md');
    if (!fs.existsSync(newName) && fs.existsSync(legacyName)) {
      return legacyName;
    }
  }

  return newName;
}
