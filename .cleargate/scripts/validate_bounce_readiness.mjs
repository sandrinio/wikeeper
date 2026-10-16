#!/usr/bin/env node
/**
 * validate_bounce_readiness.mjs — Pre-bounce gate check for a story
 *
 * Usage: node validate_bounce_readiness.mjs <STORY-ID>
 *
 * Checks:
 *   (a) state.json exists and is valid
 *   (b) story is present in state.json
 *   (c) story state is "Ready to Bounce"
 *   (d) git working tree is clean (git status --porcelain returns empty)
 *
 * Exits non-zero on any failure, with detail on stderr.
 * Exits 0 if all checks pass.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { validateState } from './validate_state.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function usage() {
  process.stderr.write('Usage: node validate_bounce_readiness.mjs <STORY-ID>\n');
  process.exit(2);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 1 || args[0].startsWith('--')) usage();

  const storyId = args[0];

  const stateFile = process.env.CLEARGATE_STATE_FILE
    ? path.resolve(process.env.CLEARGATE_STATE_FILE)
    : null;

  if (!stateFile) {
    process.stderr.write(
      'Error: CLEARGATE_STATE_FILE env var not set; cannot resolve state.json\n'
    );
    process.exit(1);
  }

  // (a) state.json exists
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

  // (a) schema valid
  const { valid, errors } = validateState(state);
  if (!valid) {
    process.stderr.write('Error: state.json is invalid:\n');
    for (const e of errors) process.stderr.write(`  - ${e}\n`);
    process.exit(1);
  }

  // (b) story present
  if (!state.stories[storyId]) {
    process.stderr.write(`Error: story ${storyId} not found in state.json\n`);
    process.exit(1);
  }

  const story = state.stories[storyId];

  // (c) state is "Ready to Bounce"
  if (story.state !== 'Ready to Bounce') {
    process.stderr.write(
      `Error: story ${storyId} state is "${story.state}", expected "Ready to Bounce"\n`
    );
    process.exit(1);
  }

  // (d) git working tree is clean
  let gitOutput;
  try {
    gitOutput = execSync('git status --porcelain', {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
  } catch (err) {
    process.stderr.write(`Error: failed to run git status: ${err.message}\n`);
    process.exit(1);
  }

  if (gitOutput.trim().length > 0) {
    process.stderr.write(
      `Error: git working tree is dirty. Uncommitted changes:\n${gitOutput}`
    );
    process.exit(1);
  }

  process.stdout.write(
    `Bounce readiness check passed for ${storyId} (state="Ready to Bounce", clean tree)\n`
  );
  process.exit(0);
}

main();
