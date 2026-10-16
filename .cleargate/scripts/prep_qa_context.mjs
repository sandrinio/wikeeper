#!/usr/bin/env node
// schema_version: 1 — frozen for SPRINT-19 M8
//
// prep_qa_context.mjs — QA context-bundle assembler
//
// Usage:
//   node prep_qa_context.mjs <story-id> <worktree-path> [--output <path>] [--dev-handoff-json <path>]
//
// Positional args:
//   <story-id>       — e.g. STORY-025-04 or CR-024
//   <worktree-path>  — absolute path to the developer's worktree
//
// Options:
//   --output <path>          — override default output path
//   --dev-handoff-json <path>— path to JSON file containing dev's STATUS=done handoff
//
// Env overrides:
//   CLEARGATE_SPRINT_DIR       — override the sprint-runs/<sprint-id> directory
//   CLEARGATE_PENDING_SYNC_DIR — override .cleargate/delivery/pending-sync/
//
// Output file: <sprint-dir>/.qa-context-<story-id>.md (default)
//
// Bundle target: ≤20KB. If exceeded, warns to stderr but still writes.
//
// Schema freeze contract (M8 reads exactly v1):
// ```json
// {
//   "schema_version": 1,
//   "story_id": "STORY-NNN-NN",
//   "sprint_id": "SPRINT-NN",
//   "generated_at": "ISO-8601",
//   "worktree": {
//     "path": "string",
//     "branch": "string",
//     "head_sha": "string",
//     "dev_status_block_present": "boolean"
//   },
//   "spec_sources": {
//     "story_path": "string|null",
//     "plan_path": "string|null",
//     "spec_pointers": [{"section": "string", "path": "string", "line_range": "string"}]
//   },
//   "baseline": {
//     "main_head_sha": "string",
//     "baseline_unavailable": "boolean",
//     "failures": [{"file": "string", "count": "integer"}]
//   },
//   "adjacent": {
//     "touched_files": ["string"],
//     "adjacent_test_files": ["string"],
//     "mirror_pairs": [{"touched": "string", "mirror": "string"}]
//   },
//   "cross_story_map": [
//     {"story_id": "string", "branch": "string", "head_sha": "string", "shared_files": ["string"]}
//   ],
//   "flashcard_slice": {
//     "tags_inferred": ["string"],
//     "entries": ["string"]
//   },
//   "lane": {
//     "value": "fast|standard|runtime",
//     "source": "state.json|default|not-yet-runtime-aware"
//   },
//   "dev_handoff": {
//     "format": "structured|legacy|absent",
//     "status": "done|blocked|null",
//     "commit": "string|null",
//     "typecheck": "pass|fail|null",
//     "tests": "string|null",
//     "files_changed": ["string"],
//     "notes": "string|null",
//     "r_coverage": [{"r_id": "string", "covered": "boolean", "deferred": "boolean", "clarified": "boolean"}],
//     "plan_deviations": [{"what": "string", "why": "string", "orchestrator_confirmed": "boolean"}],
//     "adjacent_files": ["string"],
//     "flashcards_flagged": ["string"]
//   }
// }
// ```
//
// Exit codes:
//   0 — success (including all R4 soft-degrades)
//   1 — hard error (worktree path doesn't exist, git command fails unrecoverably)
//   2 — usage error (missing required args)
//
// M8 hand-off: M8 (CR-024 S2) consumes this schema. M2 freezes; M8 wires.

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VALID_STATES, TERMINAL_STATES } from './constants.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// ── Env overrides ─────────────────────────────────────────────────────────────

function resolveSprintDir(sprintId) {
  return process.env.CLEARGATE_SPRINT_DIR
    ? path.resolve(process.env.CLEARGATE_SPRINT_DIR)
    : path.join(REPO_ROOT, '.cleargate', 'sprint-runs', sprintId);
}

function resolvePendingSyncDir() {
  return process.env.CLEARGATE_PENDING_SYNC_DIR
    ? path.resolve(process.env.CLEARGATE_PENDING_SYNC_DIR)
    : path.join(REPO_ROOT, '.cleargate', 'delivery', 'pending-sync');
}

function resolveArchiveDir() {
  return path.join(REPO_ROOT, '.cleargate', 'delivery', 'archive');
}

// ── Atomic write ──────────────────────────────────────────────────────────────

function atomicWrite(filePath, content) {
  const tmpFile = `${filePath}.tmp.${process.pid}`;
  fs.writeFileSync(tmpFile, content, 'utf8');
  fs.renameSync(tmpFile, filePath);
}

// ── Frontmatter parser ────────────────────────────────────────────────────────

function parseFrontmatter(content) {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!fmMatch) return {};
  const fields = {};
  for (const line of fmMatch[1].split('\n')) {
    const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*"?([^"]*)"?\s*$/);
    if (m) {
      const val = m[2].trim();
      fields[m[1]] = val === 'null' || val === '' ? null : val;
    }
  }
  return fields;
}

// ── Git helpers ───────────────────────────────────────────────────────────────

function gitExec(args, cwd) {
  try {
    return execSync(`git -C "${cwd}" ${args}`, {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();
  } catch {
    return null;
  }
}

// ── Sprint ID derivation ──────────────────────────────────────────────────────

function deriveSprintId() {
  if (process.env.CLEARGATE_SPRINT_DIR) {
    return path.basename(path.resolve(process.env.CLEARGATE_SPRINT_DIR));
  }
  const activePath = path.join(REPO_ROOT, '.cleargate', 'sprint-runs', '.active');
  if (fs.existsSync(activePath)) {
    return fs.readFileSync(activePath, 'utf8').trim();
  }
  return 'SPRINT-UNKNOWN';
}

// ── Section 1: Worktree + Commit ──────────────────────────────────────────────

function buildWorktreeSection(storyId, worktreePath, devHandoffJson) {
  const branch = (() => {
    const raw = gitExec('symbolic-ref HEAD', worktreePath);
    if (!raw) return 'unknown';
    return raw.replace(/^refs\/heads\//, '');
  })();

  const headSha = gitExec('rev-parse HEAD', worktreePath) || 'unknown';

  // Check if STATUS=done block is present
  let devStatusBlockPresent = false;
  if (devHandoffJson) {
    try {
      const handoff = JSON.parse(fs.readFileSync(devHandoffJson, 'utf8'));
      devStatusBlockPresent = !!(handoff.status && /done|blocked/i.test(handoff.status));
    } catch {
      // fallthrough
    }
  }
  if (!devStatusBlockPresent && headSha !== 'unknown') {
    const commitMsg = gitExec(`log -1 --format=%B ${headSha}`, worktreePath);
    if (commitMsg && /STATUS:\s*(done|blocked)/i.test(commitMsg)) {
      devStatusBlockPresent = true;
    }
  }

  return {
    path: worktreePath,
    branch,
    head_sha: headSha,
    dev_status_block_present: devStatusBlockPresent,
  };
}

// ── Section 2: Spec Sources ───────────────────────────────────────────────────

function buildSpecSources(storyId, sprintId, sprintDir) {
  // Find story file
  let storyPath = null;
  const pendingSync = resolvePendingSyncDir();
  const archive = resolveArchiveDir();
  for (const dir of [pendingSync, archive]) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(
      f => f.startsWith(storyId + '_') && f.endsWith('.md')
    );
    if (files.length > 0) {
      storyPath = path.join(dir, files[0]);
      break;
    }
    // Also try: file that contains storyId anywhere before the first _ delimiter
    // Pattern: <storyId>_* (already covered above)
  }

  // Find plan file — look in sprintDir/plans/ for any M*.md containing ## storyId heading
  let planPath = null;
  const specPointers = [];
  const plansDir = path.join(sprintDir, 'plans');
  if (fs.existsSync(plansDir)) {
    const planFiles = fs.readdirSync(plansDir)
      .filter(f => /^M\d+\.md$/.test(f))
      .sort();
    for (const pf of planFiles) {
      const pfPath = path.join(plansDir, pf);
      const content = fs.readFileSync(pfPath, 'utf8');
      const lines = content.split('\n');
      // Find heading with the story ID
      for (let i = 0; i < lines.length; i++) {
        if (/^#{2,4}\s/.test(lines[i]) && lines[i].includes(storyId)) {
          planPath = pfPath;
          // Find end of section
          let endLine = i + 1;
          while (endLine < lines.length && !/^#{2,4}\s/.test(lines[endLine])) {
            endLine++;
          }
          specPointers.push({
            section: 'Per-story blueprint',
            path: pfPath,
            line_range: `${i + 1}-${endLine}`,
          });
          break;
        }
      }
      if (planPath) break;
    }
  }

  return {
    story_path: storyPath,
    plan_path: planPath,
    spec_pointers: specPointers,
  };
}

// ── Section 3: Baseline ───────────────────────────────────────────────────────

function buildBaseline(sprintDir, worktreePath) {
  const mainHeadSha = gitExec('rev-parse main', worktreePath) || 'unknown';

  const baselinePath = path.join(sprintDir, '.baseline-failures.json');
  if (!fs.existsSync(baselinePath)) {
    return {
      main_head_sha: mainHeadSha,
      baseline_unavailable: true,
      failures: [],
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    const failures = Array.isArray(parsed) ? parsed : (parsed.failures || []);
    return {
      main_head_sha: mainHeadSha,
      baseline_unavailable: false,
      failures,
    };
  } catch {
    return {
      main_head_sha: mainHeadSha,
      baseline_unavailable: true,
      failures: [],
    };
  }
}

// ── Section 4: Adjacent Files ─────────────────────────────────────────────────

function inferMirrorPairs(touchedFiles) {
  const pairs = [];
  const mirrorMap = [
    ['.cleargate/scripts/', 'cleargate-planning/.cleargate/scripts/'],
    ['cleargate-planning/.cleargate/scripts/', '.cleargate/scripts/'],
    ['.claude/agents/', 'cleargate-planning/.claude/agents/'],
    ['cleargate-planning/.claude/agents/', '.claude/agents/'],
    ['.cleargate/templates/', 'cleargate-planning/.cleargate/templates/'],
    ['cleargate-planning/.cleargate/templates/', '.cleargate/templates/'],
  ];

  for (const touchedFile of touchedFiles) {
    for (const [prefix, mirrorPrefix] of mirrorMap) {
      if (touchedFile.startsWith(prefix)) {
        const relative = touchedFile.slice(prefix.length);
        const mirrorPath = mirrorPrefix + relative;
        // Only emit pair if the mirror actually exists
        const fullMirrorPath = path.join(REPO_ROOT, mirrorPath);
        if (fs.existsSync(fullMirrorPath)) {
          pairs.push({ touched: touchedFile, mirror: mirrorPath });
          break;
        }
      }
    }
  }

  return pairs;
}

function buildAdjacent(worktreePath) {
  // Get touched files from git diff
  let touchedFiles = [];
  const diffOutput = gitExec('diff --name-only main..HEAD', worktreePath);
  if (diffOutput) {
    touchedFiles = diffOutput.split('\n').filter(Boolean);
  } else {
    process.stderr.write(
      'Warning: git diff --name-only main..HEAD failed — touched_files will be empty\n'
    );
  }

  // Find adjacent test files
  const adjacentTestFiles = [];
  const seen = new Set();
  for (const f of touchedFiles) {
    const dir = path.dirname(f);
    const fullDir = path.join(REPO_ROOT, dir);
    if (!fs.existsSync(fullDir)) continue;
    try {
      const siblings = fs.readdirSync(fullDir);
      for (const sibling of siblings) {
        if (
          (sibling.endsWith('.test.ts') || sibling.endsWith('.test.sh') ||
           sibling.startsWith('test_') && sibling.endsWith('.sh')) &&
          !seen.has(sibling)
        ) {
          const relPath = path.join(dir, sibling);
          if (!seen.has(relPath)) {
            seen.add(relPath);
            adjacentTestFiles.push(relPath);
          }
        }
      }
    } catch {
      // non-fatal
    }
  }

  const mirrorPairs = inferMirrorPairs(touchedFiles);

  return {
    touched_files: touchedFiles,
    adjacent_test_files: adjacentTestFiles,
    mirror_pairs: mirrorPairs,
  };
}

// ── Section 5: Cross-Story Map ────────────────────────────────────────────────

const IN_FLIGHT_STATES = new Set(
  VALID_STATES.filter(s => !TERMINAL_STATES.includes(s))
);

function buildCrossStoryMap(sprintDir, touchedFiles, currentStoryId) {
  const stateFile = path.join(sprintDir, 'state.json');
  if (!fs.existsSync(stateFile)) return [];

  let state;
  try {
    state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch {
    return [];
  }

  const stories = state.stories || {};
  const crossMap = [];

  for (const [sid, entry] of Object.entries(stories)) {
    if (sid === currentStoryId) continue;
    if (!IN_FLIGHT_STATES.has(entry.state)) continue;

    const branch = `story/${sid}`;
    const headSha = gitExec(`rev-parse ${branch}`, REPO_ROOT) || 'unknown';

    let storyTouched = [];
    const storyDiff = gitExec(`diff --name-only main..${branch}`, REPO_ROOT);
    if (storyDiff) {
      storyTouched = storyDiff.split('\n').filter(Boolean);
    }

    const shared = touchedFiles.filter(f => storyTouched.includes(f));
    if (shared.length > 0) {
      crossMap.push({
        story_id: sid,
        branch,
        head_sha: headSha,
        shared_files: shared,
      });
    }

    // Cap at 5 stories
    if (crossMap.length >= 5) break;
  }

  return crossMap;
}

// ── Section 6: Flashcard Slice ────────────────────────────────────────────────

const TAG_PREFIX_TABLE = [
  { prefix: 'cleargate-cli/src/commands/', tags: ['#cli', '#commander'] },
  { prefix: 'cleargate-cli/src/auth/', tags: ['#auth'] },
  { prefix: 'cleargate-cli/src/', tags: ['#cli'] },
  { prefix: 'mcp/src/auth/', tags: ['#auth', '#mcp'] },
  { prefix: 'mcp/src/db/', tags: ['#schema', '#migrations', '#mcp'] },
  { prefix: 'mcp/src/', tags: ['#mcp', '#fastify'] },
  { prefix: '.cleargate/scripts/', tags: ['#scripts', '#test-harness'] },
  { prefix: '.claude/agents/', tags: ['#agents'] },
  { prefix: '.cleargate/knowledge/', tags: ['#protocol', '#wiki'] },
];

function inferTagsFromPaths(touchedFiles) {
  const tagSet = new Set();
  for (const f of touchedFiles) {
    let matched = false;
    for (const { prefix, tags } of TAG_PREFIX_TABLE) {
      if (f.startsWith(prefix)) {
        for (const t of tags) tagSet.add(t);
        matched = true;
        break;
      }
    }
    if (!matched) tagSet.add('#general');
  }
  return Array.from(tagSet);
}

function buildFlashcardSlice(touchedFiles) {
  const tagsInferred = inferTagsFromPaths(touchedFiles);

  const flashcardFile = path.join(REPO_ROOT, '.cleargate', 'FLASHCARD.md');
  if (!fs.existsSync(flashcardFile)) {
    return {
      tags_inferred: tagsInferred,
      entries: [],
    };
  }

  const content = fs.readFileSync(flashcardFile, 'utf8');
  const lines = content.split('\n').filter(l => /^\d{4}-\d{2}-\d{2}\s+·/.test(l));

  // Build grep pattern from tags
  const tagPattern = tagsInferred.join('|');
  const re = new RegExp(tagPattern.replace(/#/g, '#'), 'i');
  const matching = lines.filter(l => re.test(l)).slice(0, 20);

  return {
    tags_inferred: tagsInferred,
    entries: matching,
  };
}

// ── Section 7: Lane ───────────────────────────────────────────────────────────

function buildLane(storyId, sprintDir, touchedFiles) {
  const stateFile = path.join(sprintDir, 'state.json');
  if (fs.existsSync(stateFile)) {
    try {
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      const storyEntry = (state.stories || {})[storyId];
      if (storyEntry && storyEntry.lane !== undefined) {
        const laneValue = storyEntry.lane;
        // Heuristic: flag not-yet-runtime-aware if standard + touches CLI commands
        const touchesCli = touchedFiles.some(f => f.startsWith('cleargate-cli/src/commands/'));
        const source =
          laneValue === 'standard' && touchesCli
            ? 'not-yet-runtime-aware'
            : 'state.json';
        return { value: laneValue, source };
      }
    } catch {
      // fallthrough
    }
  }

  return { value: 'standard', source: 'default' };
}

// ── Section 8: Dev Handoff ────────────────────────────────────────────────────

function parseStructuredStatusBlock(text) {
  if (!text) return null;

  const statusMatch = text.match(/STATUS:\s*(done|blocked)/i);
  const commitMatch = text.match(/COMMIT:\s*([^\n]+)/i);
  const typecheckMatch = text.match(/TYPECHECK:\s*(pass|fail)/i);
  const testsMatch = text.match(/TESTS:\s*([^\n]+)/i);
  const filesChangedMatch = text.match(/FILES_CHANGED:\s*([^\n]+)/i);
  const notesMatch = text.match(/NOTES:\s*([\s\S]*?)(?=\nFLASHCARDS_FLAGGED:|$)/i);
  const flashcardsMatch = text.match(/flashcards_flagged:([\s\S]*?)(?=\n[A-Z_]+:|$)/i);

  if (!statusMatch) return null;

  // Structured = has r_coverage:/plan_deviations:/adjacent_files: as field keys (with colon)
  const hasStructuredFields =
    /r_coverage\s*:/.test(text) ||
    /plan_deviations\s*:/.test(text) ||
    /adjacent_files\s*:/.test(text);

  const filesChanged = filesChangedMatch
    ? filesChangedMatch[1].trim().split(/\s*,\s*|\s+/).filter(Boolean)
    : [];

  const flashcardsFlagged = flashcardsMatch
    ? flashcardsMatch[1].trim().split('\n').map(l => l.replace(/^\s*-\s*"?/, '').replace(/"?\s*$/, '')).filter(Boolean)
    : [];

  return {
    format: hasStructuredFields ? 'structured' : 'legacy',
    status: (statusMatch[1] || '').toLowerCase(),
    commit: commitMatch ? commitMatch[1].trim() : null,
    typecheck: typecheckMatch ? typecheckMatch[1].toLowerCase() : null,
    tests: testsMatch ? testsMatch[1].trim() : null,
    files_changed: filesChanged,
    notes: notesMatch ? notesMatch[1].trim() : null,
    r_coverage: [],
    plan_deviations: [],
    adjacent_files: [],
    flashcards_flagged: flashcardsFlagged,
  };
}

function buildDevHandoff(worktreePath, devHandoffJsonPath) {
  // Try --dev-handoff-json first
  if (devHandoffJsonPath && fs.existsSync(devHandoffJsonPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(devHandoffJsonPath, 'utf8'));
      // If it already has 'format' field, treat as pre-parsed
      if (raw.format) return raw;
      // Otherwise treat JSON as the full text to parse
      const text = JSON.stringify(raw);
      const parsed = parseStructuredStatusBlock(text);
      if (parsed) return parsed;
    } catch {
      // fallthrough
    }
  }

  // Try to extract from commit message
  const headSha = gitExec('rev-parse HEAD', worktreePath);
  if (headSha) {
    const commitMsg = gitExec(`log -1 --format=%B ${headSha}`, worktreePath);
    if (commitMsg) {
      const parsed = parseStructuredStatusBlock(commitMsg);
      if (parsed) return parsed;
    }
  }

  return {
    format: 'absent',
    status: null,
    commit: null,
    typecheck: null,
    tests: null,
    files_changed: [],
    notes: null,
    r_coverage: [],
    plan_deviations: [],
    adjacent_files: [],
    flashcards_flagged: [],
  };
}

// ── Prose section builders ────────────────────────────────────────────────────

function proseWorktree(w) {
  return [
    '## Worktree + Commit',
    '',
    `- **Path:** \`${w.path}\``,
    `- **Branch:** \`${w.branch}\``,
    `- **HEAD SHA:** \`${w.head_sha}\``,
    `- **Dev STATUS block present:** ${w.dev_status_block_present}`,
    '',
  ].join('\n');
}

function proseSpecSources(s) {
  const lines = ['## Spec Sources', ''];
  if (s.story_path) {
    lines.push(`- **Story file:** \`${s.story_path}\``);
  } else {
    lines.push('_Story file not found for this story._');
  }
  if (s.plan_path) {
    lines.push(`- **Plan file:** \`${s.plan_path}\``);
  } else {
    lines.push('_Plan file not found (fast-lane or unplanned story)._');
  }
  if (s.spec_pointers.length > 0) {
    lines.push('');
    lines.push('**Spec pointers:**');
    for (const sp of s.spec_pointers) {
      lines.push(`- ${sp.section}: \`${sp.path}\` lines ${sp.line_range}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

function proseBaseline(b) {
  const lines = ['## Baseline', ''];
  lines.push(`- **main HEAD SHA:** \`${b.main_head_sha}\``);
  if (b.baseline_unavailable) {
    lines.push('- **Baseline cache:** unavailable');
    lines.push('');
    lines.push('_Baseline cache stale or absent — recompute via `cleargate gate test` on main._');
  } else {
    lines.push(`- **Baseline cache:** available (${b.failures.length} known failure(s))`);
    for (const f of b.failures) {
      lines.push(`  - \`${f.file}\`: ${f.count} failure(s)`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

function proseAdjacent(a) {
  const lines = ['## Adjacent Files', ''];
  lines.push(`**Touched files (${a.touched_files.length}):**`);
  if (a.touched_files.length === 0) {
    lines.push('_(none — diff vs main empty or unavailable)_');
  } else {
    for (const f of a.touched_files) lines.push(`- \`${f}\``);
  }
  lines.push('');
  lines.push(`**Adjacent test files (${a.adjacent_test_files.length}):**`);
  if (a.adjacent_test_files.length === 0) {
    lines.push('_(none found)_');
  } else {
    for (const f of a.adjacent_test_files) lines.push(`- \`${f}\``);
  }
  lines.push('');
  if (a.mirror_pairs.length > 0) {
    lines.push('**Mirror pairs:**');
    for (const mp of a.mirror_pairs) {
      lines.push(`- \`${mp.touched}\` ↔ \`${mp.mirror}\``);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function proseCrossStoryMap(csList) {
  const lines = ['## Cross-Story Map', ''];
  if (csList.length === 0) {
    lines.push('_No in-flight stories share files with this story._');
  } else {
    for (const cs of csList) {
      lines.push(`### ${cs.story_id} (\`${cs.branch}\` @ \`${cs.head_sha.slice(0, 8)}\`)`);
      lines.push('**Shared files:**');
      for (const f of cs.shared_files) lines.push(`- \`${f}\``);
      lines.push('');
    }
  }
  lines.push('');
  return lines.join('\n');
}

function proseFlashcardSlice(fc) {
  const lines = ['## Flashcard Slice', ''];
  lines.push(`**Tags inferred from touched paths:** ${fc.tags_inferred.join(', ') || '(none)'}`);
  lines.push('');
  if (fc.entries.length === 0) {
    lines.push('_No matching flashcard entries for inferred tags._');
  } else {
    lines.push(`**Matching entries (${fc.entries.length}, capped at 20):**`);
    lines.push('');
    for (const e of fc.entries) lines.push(e);
  }
  lines.push('');
  return lines.join('\n');
}

function proseLane(l) {
  const lines = ['## Lane', ''];
  lines.push(`- **Value:** \`${l.value}\``);
  lines.push(`- **Source:** \`${l.source}\``);
  if (l.source === 'not-yet-runtime-aware') {
    lines.push('');
    lines.push(
      '_Heuristic: story lane is `standard` but touches CLI command files — ' +
      'QA may want to apply `runtime` playbook depth. See CR-024 M8 for lane-playbook dispatch._'
    );
  }
  lines.push('');
  return lines.join('\n');
}

function proseDevHandoff(dh) {
  const lines = ['## Dev Handoff', ''];
  if (dh.format === 'absent') {
    lines.push('_No dev handoff found in commit message or `--dev-handoff-json`. Context limited._');
  } else if (dh.format === 'legacy') {
    lines.push(
      '_SCHEMA_INCOMPLETE — context limited; old-format STATUS=done found, ' +
      'no `r_coverage`/`plan_deviations`/`adjacent_files`._'
    );
    lines.push('');
    lines.push(`- **Status:** ${dh.status}`);
    lines.push(`- **Commit:** ${dh.commit || '(not found)'}`);
    lines.push(`- **Typecheck:** ${dh.typecheck || '(not found)'}`);
    lines.push(`- **Tests:** ${dh.tests || '(not found)'}`);
    if (dh.notes) {
      lines.push('');
      lines.push(`**Notes:** ${dh.notes}`);
    }
  } else {
    // structured
    lines.push(`- **Status:** ${dh.status}`);
    lines.push(`- **Commit:** ${dh.commit || '(not found)'}`);
    lines.push(`- **Typecheck:** ${dh.typecheck || '(not found)'}`);
    lines.push(`- **Tests:** ${dh.tests || '(not found)'}`);
    if (dh.files_changed.length > 0) {
      lines.push('- **Files changed:**');
      for (const f of dh.files_changed) lines.push(`  - \`${f}\``);
    }
    if (dh.r_coverage && dh.r_coverage.length > 0) {
      lines.push('');
      lines.push('**R-coverage:**');
      for (const r of dh.r_coverage) {
        lines.push(`- ${r.r_id}: covered=${r.covered} deferred=${r.deferred} clarified=${r.clarified}`);
      }
    }
    if (dh.plan_deviations && dh.plan_deviations.length > 0) {
      lines.push('');
      lines.push('**Plan deviations:**');
      for (const pd of dh.plan_deviations) {
        lines.push(`- **${pd.what}**: ${pd.why} (orchestrator_confirmed=${pd.orchestrator_confirmed})`);
      }
    }
    if (dh.adjacent_files && dh.adjacent_files.length > 0) {
      lines.push('');
      lines.push('**Adjacent files flagged by dev:**');
      for (const af of dh.adjacent_files) lines.push(`- \`${af}\``);
    }
    if (dh.notes) {
      lines.push('');
      lines.push(`**Notes:** ${dh.notes}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

// ── Main ───────────────────────────────────────────────────────────────────────

function main() {
  const rawArgs = process.argv.slice(2);

  // Parse args
  const positionals = [];
  let outputPath = null;
  let devHandoffJsonPath = null;

  for (let i = 0; i < rawArgs.length; i++) {
    if (rawArgs[i] === '--output' && rawArgs[i + 1]) {
      outputPath = rawArgs[++i];
    } else if (rawArgs[i] === '--dev-handoff-json' && rawArgs[i + 1]) {
      devHandoffJsonPath = rawArgs[++i];
    } else if (!rawArgs[i].startsWith('--')) {
      positionals.push(rawArgs[i]);
    }
  }

  const storyId = positionals[0];
  const worktreePath = positionals[1];

  if (!storyId || !worktreePath) {
    process.stderr.write(
      'Usage: node prep_qa_context.mjs <story-id> <worktree-path> [--output <path>] [--dev-handoff-json <path>]\n'
    );
    process.exit(2);
  }

  // Validate worktree path
  if (!fs.existsSync(worktreePath)) {
    process.stderr.write(`Error: worktree path does not exist: ${worktreePath}\n`);
    process.exit(1);
  }

  const sprintId = deriveSprintId();
  const sprintDir = resolveSprintDir(sprintId);

  // Default output path
  if (!outputPath) {
    outputPath = path.join(sprintDir, `.qa-context-${storyId}.md`);
  }

  // Ensure sprint dir exists for output
  if (!fs.existsSync(sprintDir)) {
    try {
      fs.mkdirSync(sprintDir, { recursive: true });
    } catch (err) {
      process.stderr.write(`Warning: could not create sprint dir ${sprintDir}: ${err.message}\n`);
    }
  }

  // Build all sections
  const worktreeData = buildWorktreeSection(storyId, worktreePath, devHandoffJsonPath);
  const specSources = buildSpecSources(storyId, sprintId, sprintDir);
  const baseline = buildBaseline(sprintDir, worktreePath);
  const adjacent = buildAdjacent(worktreePath);
  const crossStoryMap = buildCrossStoryMap(sprintDir, adjacent.touched_files, storyId);
  const flashcardSlice = buildFlashcardSlice(adjacent.touched_files);
  const lane = buildLane(storyId, sprintDir, adjacent.touched_files);
  const devHandoff = buildDevHandoff(worktreePath, devHandoffJsonPath);

  // Build machine-readable JSON block
  const jsonPayload = {
    schema_version: 1,
    story_id: storyId,
    sprint_id: sprintId,
    generated_at: new Date().toISOString(),
    worktree: worktreeData,
    spec_sources: specSources,
    baseline,
    adjacent,
    cross_story_map: crossStoryMap,
    flashcard_slice: flashcardSlice,
    lane,
    dev_handoff: devHandoff,
  };

  // Build bundle
  const bundleParts = [
    `# QA Context Pack — ${storyId}\n`,
    `_Generated: ${jsonPayload.generated_at}_\n`,
    `_Sprint: ${sprintId}_\n`,
    '---\n',
    '```json',
    JSON.stringify(jsonPayload, null, 2),
    '```\n',
    '---\n',
    proseWorktree(worktreeData),
    proseSpecSources(specSources),
    proseBaseline(baseline),
    proseAdjacent(adjacent),
    proseCrossStoryMap(crossStoryMap),
    proseFlashcardSlice(flashcardSlice),
    proseLane(lane),
    proseDevHandoff(devHandoff),
  ];

  const bundle = bundleParts.join('\n');
  const bundleBytes = Buffer.byteLength(bundle, 'utf8');

  // Write bundle (always write, even if oversized — R4)
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  atomicWrite(outputPath, bundle);

  const kb = (bundleBytes / 1024).toFixed(1);
  if (bundleBytes > 20480) {
    process.stderr.write(
      `Warning: bundle exceeds 20KB target (${kb}KB) — QA context pack is oversized\n`
    );
  }

  process.stdout.write(`QA context pack ready: ${kb}KB at ${outputPath}\n`);
  process.exit(0);
}

main();
