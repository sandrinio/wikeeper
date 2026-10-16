#!/usr/bin/env node
/**
 * suggest_improvements.mjs — Generate stable improvement suggestions from REPORT.md
 *
 * Usage: node suggest_improvements.mjs <sprint-id>
 *        node suggest_improvements.mjs <sprint-id> --skill-candidates
 *        node suggest_improvements.mjs <sprint-id> --flashcard-cleanup
 *
 * Reads:
 *   - .cleargate/sprint-runs/<id>/REPORT.md §5 Framework Self-Assessment tables
 *   - .cleargate/sprint-runs/<prev-id>/improvement-suggestions.md (if present, for context)
 *
 * Emits:
 *   - .cleargate/sprint-runs/<id>/improvement-suggestions.md
 *     with stable SUG-<sprint>-<n> IDs (default mode)
 *     or appends ## Skill Creation Candidates (--skill-candidates mode)
 *     or appends ## FLASHCARD Cleanup Candidates (--flashcard-cleanup mode)
 *
 * Append-only idempotency (R5):
 *   - IDs are derived from a stable hash of (category, title) tuple
 *   - Re-running produces zero new entries if all suggestions already captured
 *   - Script exits 0 in both cases
 *
 * Note: "section" as used in §5 table extraction refers to the Framework Self-Assessment
 * subsections: Templates, Handoffs, Skills, Process, Tooling.
 *
 * Test seams (CR-022 M6):
 *   CLEARGATE_FLASHCARD_PATH=<path>   — override .cleargate/FLASHCARD.md path
 *   CLEARGATE_FLASHCARD_LOOKBACK=<N>  — override 3-sprint lookback window (default 3)
 *   CLEARGATE_SPRINT_RUNS_DIR=<path>  — override .cleargate/sprint-runs/ root for sibling lookups
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { reportFilename } from './lib/report-filename.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// §5 subsection names used in sprint_report.md template
const SELF_ASSESSMENT_SECTIONS = ['Templates', 'Handoffs', 'Skills', 'Process', 'Tooling'];

/**
 * Generate a stable short hash from a string.
 * Used for SUG ID stability — same (category, title) always produces same ID.
 * @param {string} input
 * @returns {string} 6-char hex
 */
function stableHash(input) {
  return createHash('sha256').update(input).digest('hex').slice(0, 6);
}

/**
 * Parse §5 Framework Self-Assessment from REPORT.md content.
 * Extracts Yellow/Red-rated rows as improvement candidates.
 * @param {string} content
 * @returns {{ category: string, item: string, rating: string, notes: string }[]}
 */
function parseSelfAssessment(content) {
  const suggestions = [];

  // Find the §5 Framework Self-Assessment section
  const selfAssessmentMatch = content.match(/##\s*§5[^\n]*\n([\s\S]*?)(?=##\s*§6|$)/);
  if (!selfAssessmentMatch) return suggestions;

  const sectionContent = selfAssessmentMatch[1];

  // Extract each subsection table
  for (const category of SELF_ASSESSMENT_SECTIONS) {
    // Find table rows under the category header
    // Pattern: ### <category>\n | <item> | <rating> | <notes> |
    const categoryMatch = sectionContent.match(
      new RegExp(`###\\s+${category}\\s*\\n([\\s\\S]*?)(?=###|$)`, 'i')
    );
    if (!categoryMatch) continue;

    const tableContent = categoryMatch[1];
    // Parse table rows (skip header rows with ---)
    const rows = tableContent.split('\n').filter(l => l.startsWith('|') && !l.includes('---'));

    for (const row of rows) {
      const cells = row.split('|').map(c => c.trim()).filter(Boolean);
      if (cells.length < 2) continue;

      const item = cells[0];
      const rating = cells[1] || '';
      const notes = cells[2] || '';

      // Only flag Yellow or Red items as needing improvement
      if (rating.toLowerCase().includes('yellow') || rating.toLowerCase().includes('red')) {
        // Skip header rows
        if (item === 'Item' || item === '---') continue;
        suggestions.push({ category, item, rating, notes });
      }
    }
  }

  return suggestions;
}

/**
 * Parse existing improvement-suggestions.md to extract already-captured SUG and CAND IDs.
 * @param {string} content
 * @returns {Set<string>} Set of SUG/CAND IDs
 */
function parseExistingIds(content) {
  const ids = new Set();
  // Match SUG-<sprint>-<n> patterns (default mode)
  const sugMatches = content.matchAll(/SUG-[A-Z0-9-]+-\d+/g);
  for (const m of sugMatches) {
    ids.add(m[0]);
  }
  // Match CAND-<sprint>-[SF]<n> patterns (--skill-candidates / --flashcard-cleanup modes)
  const candMatches = content.matchAll(/CAND-[A-Z0-9-]+-[SF]\d+/g);
  for (const m of candMatches) {
    ids.add(m[0]);
  }
  return ids;
}

/**
 * Atomic write using tmp+rename pattern.
 * @param {string} filePath
 * @param {string} content
 */
function atomicWrite(filePath, content) {
  const tmpFile = `${filePath}.tmp.${process.pid}`;
  fs.writeFileSync(tmpFile, content, 'utf8');
  fs.renameSync(tmpFile, filePath);
}

/**
 * Read all ledger entries from a token-ledger.jsonl file.
 * @param {string} ledgerPath
 * @returns {{ work_item_id: string, agent_type: string, session_id?: string, sprint_id?: string }[]}
 */
function readLedgerEntries(ledgerPath) {
  if (!fs.existsSync(ledgerPath)) return [];
  const lines = fs.readFileSync(ledgerPath, 'utf8').split('\n').filter(l => l.trim());
  const entries = [];
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.work_item_id && entry.agent_type) {
        entries.push({
          work_item_id: entry.work_item_id,
          agent_type: entry.agent_type,
          session_id: entry.session_id ?? '',
          sprint_id: entry.sprint_id ?? '',
        });
      }
    } catch { /* skip malformed lines */ }
  }
  return entries;
}

/**
 * Check if a (work_item_id|agent_type) bucket is a session-attribution artifact.
 *
 * Session-shared filter (CR-056): When multiple Architect (or other agent) dispatches run
 * within the same session, the token ledger attributes them all to the same bucket keyed
 * by the first-merged work_item_id. The canonical example is "CR-045 × architect" in
 * SPRINT-23/SPRINT-24 — all 17 entries share the SAME session_id 48aa90c9-..., making
 * them one session mis-attributed as 17 distinct repeats.
 *
 * Rule: session-attribution artifact if ALL entries with a known session_id share the
 * SAME session_id (i.e., exactly 1 distinct session across all entries). When multiple
 * distinct sessions are present, there is genuine independent repetition.
 *
 * Known false-positive class: "CR-045 × architect" — 17 entries, 1 session UUID.
 *
 * @param {{ session_id?: string }[]} entries all entries for this bucket (across sprints)
 * @returns {boolean} true if bucket should be filtered as session-shared artifact
 */
function isSessionShared(entries) {
  if (entries.length < 3) return false;
  const distinctSessions = new Set(
    entries.map(e => e.session_id ?? '').filter(s => s !== '')
  );
  // If exactly 1 distinct session accounts for all entries, this is a session-attribution artifact
  return distinctSessions.size === 1;
}

/**
 * Scan token-ledger.jsonl and FLASHCARD.md for skill creation candidates.
 *
 * Heuristic (CR-056 tightened):
 *   1. Session-shared filter: if ≥2 of ≥3 entries for a bucket share the same
 *      session_id → skip (token-attribution artifact, not a real recurring pattern).
 *      Known false-positive class: "CR-045 × architect" from SPRINT-23/SPRINT-24 —
 *      all 17 entries share session_id 48aa90c9-... (session-shared).
 *   2. Cross-sprint aggregation: collect entries from the current sprint's ledger PLUS
 *      prior sprints' ledgers (via CLEARGATE_SPRINT_RUNS_DIR). Count ≥3× total across
 *      ≥2 distinct sprints.
 *   3. Cross-sprint dedup: if the candidate's hash already appears in any prior sprint's
 *      improvement-suggestions.md → surface as seen_in: [...] instead of re-flagging.
 *   4. Threshold raised to "≥3× across ≥2 distinct sprints AND not session-shared".
 *
 * Appends or replaces the "## Skill Creation Candidates" section in improvement-suggestions.md.
 * @param {string} sprintId
 * @param {string} sprintDir
 * @param {string} suggestionsFile
 */
function scanSkillCandidates(sprintId, sprintDir, suggestionsFile) {
  const flashcardPath = process.env.CLEARGATE_FLASHCARD_PATH
    ? path.resolve(process.env.CLEARGATE_FLASHCARD_PATH)
    : path.join(REPO_ROOT, '.cleargate', 'FLASHCARD.md');
  const ledgerPath = path.join(sprintDir, 'token-ledger.jsonl');

  // Resolve sprint-runs root (used for cross-sprint lookback)
  const sprintRunsDir = process.env.CLEARGATE_SPRINT_RUNS_DIR
    ? path.resolve(process.env.CLEARGATE_SPRINT_RUNS_DIR)
    : path.dirname(sprintDir);

  // ── Step 1: collect all ledger entries across current + prior sprints ─────────
  // Collect from current sprint
  const currentEntries = readLedgerEntries(ledgerPath);

  // Collect from prior sprints (all sprint dirs except current)
  const allPriorEntries = [];
  const priorSuggestionsContents = [];
  if (fs.existsSync(sprintRunsDir)) {
    let priorDirs;
    try {
      priorDirs = fs.readdirSync(sprintRunsDir)
        .filter(name => name !== sprintId && !name.startsWith('.'))
        .map(name => path.join(sprintRunsDir, name))
        .filter(p => {
          try { return fs.statSync(p).isDirectory(); } catch { return false; }
        });
    } catch { priorDirs = []; }

    for (const priorDir of priorDirs) {
      const priorLedger = path.join(priorDir, 'token-ledger.jsonl');
      const entries = readLedgerEntries(priorLedger);
      allPriorEntries.push(...entries);

      // Collect prior improvement-suggestions.md for cross-sprint dedup
      const priorSuggFile = path.join(priorDir, 'improvement-suggestions.md');
      if (fs.existsSync(priorSuggFile)) {
        try {
          priorSuggestionsContents.push(fs.readFileSync(priorSuggFile, 'utf8'));
        } catch { /* skip unreadable */ }
      }
    }
  }

  // ── Step 2: build cross-sprint bucket map ────────────────────────────────────
  // Map: key (work_item_id|agent_type) → { entries: [...], sprintIds: Set<string> }
  /** @type {Map<string, { entries: { session_id?: string, sprint_id?: string }[], sprintIds: Set<string> }>} */
  const buckets = new Map();

  for (const e of currentEntries) {
    const key = `${e.work_item_id}|${e.agent_type}`;
    if (!buckets.has(key)) buckets.set(key, { entries: [], sprintIds: new Set() });
    const b = buckets.get(key);
    b.entries.push(e);
    b.sprintIds.add(sprintId);
  }
  for (const e of allPriorEntries) {
    const key = `${e.work_item_id}|${e.agent_type}`;
    if (!buckets.has(key)) buckets.set(key, { entries: [], sprintIds: new Set() });
    const b = buckets.get(key);
    b.entries.push(e);
    if (e.sprint_id) b.sprintIds.add(e.sprint_id);
  }

  // ── Step 3: apply heuristic filters ──────────────────────────────────────────
  // Threshold: ≥3× total AND ≥2 distinct sprints AND NOT session-shared
  const repeatedTuples = [...buckets.entries()].filter(([, b]) => {
    if (b.entries.length < 3) return false;
    if (b.sprintIds.size < 2) return false;
    if (isSessionShared(b.entries)) return false;
    return true;
  });

  // Grep FLASHCARD.md for "also do" patterns
  const alsoDoMatches = [];
  if (fs.existsSync(flashcardPath)) {
    const fcContent = fs.readFileSync(flashcardPath, 'utf8');
    const lines = fcContent.split('\n');
    for (const line of lines) {
      if (/remember to also|also do X|also need to/i.test(line)) {
        alsoDoMatches.push(line.trim());
      }
    }
  }

  // Read existing suggestions file content (current sprint)
  let existingContent = fs.existsSync(suggestionsFile)
    ? fs.readFileSync(suggestionsFile, 'utf8')
    : `# Improvement Suggestions — ${sprintId}\n\nGenerated by \`suggest_improvements.mjs\`. Append-only; IDs are stable.\nVocabulary: Templates | Handoffs | Skills | Process | Tooling\n\n---\n\n`;

  /**
   * Check if a hash already appears in current sprint's suggestions OR any prior sprint's.
   * @param {string} hash
   * @returns {boolean}
   */
  function hashAlreadySeen(hash) {
    const marker = `<!-- hash:${hash} -->`;
    if (existingContent.includes(marker)) return true;
    for (const priorContent of priorSuggestionsContents) {
      if (priorContent.includes(marker)) return true;
    }
    return false;
  }

  // Build the candidates
  const candidates = [];
  let candN = 1;
  for (const [key, bucket] of repeatedTuples) {
    const [workItemId, agentType] = key.split('|');
    const candId = `CAND-${sprintId}-S${String(candN).padStart(2, '0')}`;
    const hashKey = `skill|${key}`;
    const hash = stableHash(hashKey);
    if (!hashAlreadySeen(hash)) {
      candidates.push({ candId, hash, workItemId, agentType, source: 'ledger', sprintIds: bucket.sprintIds });
      candN++;
    }
  }
  for (const line of alsoDoMatches) {
    const candId = `CAND-${sprintId}-S${String(candN).padStart(2, '0')}`;
    const hashKey = `skill|flashcard|${line.slice(0, 60)}`;
    const hash = stableHash(hashKey);
    if (!hashAlreadySeen(hash)) {
      candidates.push({ candId, hash, workItemId: null, agentType: null, source: 'flashcard', line, sprintIds: new Set() });
      candN++;
    }
  }

  // Build the section content
  const sectionLines = [
    '## Skill Creation Candidates',
    '',
    '<!-- generated-by: suggest_improvements.mjs --skill-candidates -->',
    '',
  ];

  if (candidates.length === 0) {
    sectionLines.push('_No candidates detected this sprint._');
    sectionLines.push('');
  } else {
    for (const c of candidates) {
      sectionLines.push(`### ${c.candId}: ${c.source === 'ledger' ? `${c.workItemId} × ${c.agentType}` : 'flashcard pattern'}`);
      sectionLines.push(`<!-- hash:${c.hash} -->`);
      sectionLines.push('');
      if (c.source === 'ledger') {
        const sprintList = c.sprintIds ? [...c.sprintIds].sort().join(', ') : sprintId;
        sectionLines.push(`**Pattern detected:** ${c.workItemId} × ${c.agentType} repeated ≥3× across ≥2 distinct sprints (${sprintList})`);
      } else {
        sectionLines.push(`**Pattern detected:** "also do" pattern in FLASHCARD.md`);
        sectionLines.push(`**Source line:** \`${c.line}\``);
      }
      sectionLines.push(`**Proposed skill:** \`.claude/skills/<slug>/SKILL.md\``);
      sectionLines.push('');
      sectionLines.push('---');
      sectionLines.push('');
    }
  }

  const sectionContent = sectionLines.join('\n');
  // Anchored heading regex — strict match, no trailing text
  const headingRe = /^## Skill Creation Candidates$/m;

  let finalContent;
  if (headingRe.test(existingContent)) {
    // Replace existing section (splice out old, append new)
    const nextHeadingRe = /^## /m;
    const headingIdx = existingContent.search(headingRe);
    const afterHeading = existingContent.slice(headingIdx + existingContent.match(headingRe)[0].length);
    const nextMatch = afterHeading.search(/^## /m);
    if (nextMatch === -1) {
      finalContent = existingContent.slice(0, headingIdx).trimEnd() + '\n\n' + sectionContent;
    } else {
      finalContent = existingContent.slice(0, headingIdx).trimEnd() + '\n\n' + sectionContent + '\n' + afterHeading.slice(nextMatch);
    }
    void nextHeadingRe;
  } else {
    finalContent = existingContent.trimEnd() + '\n\n' + sectionContent;
  }

  atomicWrite(suggestionsFile, finalContent);
  process.stdout.write(`suggest_improvements: skill-candidates section written to ${suggestionsFile}\n`);
}

/**
 * Scan FLASHCARD.md for cleanup candidates (stale / superseded / resolved).
 * Appends or replaces the "## FLASHCARD Cleanup Candidates" section in improvement-suggestions.md.
 * @param {string} sprintId
 * @param {string} sprintDir
 * @param {string} suggestionsFile
 */
function scanFlashcardCleanup(sprintId, sprintDir, suggestionsFile) {
  const flashcardPath = process.env.CLEARGATE_FLASHCARD_PATH
    ? path.resolve(process.env.CLEARGATE_FLASHCARD_PATH)
    : path.join(REPO_ROOT, '.cleargate', 'FLASHCARD.md');

  const lookback = parseInt(process.env.CLEARGATE_FLASHCARD_LOOKBACK ?? '3', 10);
  const sprintRunsDir = process.env.CLEARGATE_SPRINT_RUNS_DIR
    ? path.resolve(process.env.CLEARGATE_SPRINT_RUNS_DIR)
    : path.dirname(sprintDir);

  if (!fs.existsSync(flashcardPath)) {
    process.stderr.write(`suggest_improvements --flashcard-cleanup: FLASHCARD.md not found at ${flashcardPath}, skipping\n`);
    return;
  }

  const fcContent = fs.readFileSync(flashcardPath, 'utf8');
  // Parse entries: YYYY-MM-DD · #tag1 #tag2 · lesson
  const entryRe = /^(\d{4}-\d{2}-\d{2})\s+·\s+(.*?)\s+·\s+(.+)$/;
  const entries = fcContent.split('\n').filter(l => entryRe.test(l.trim()));

  // Determine lookback sprint dirs (numerical extraction from sprintId)
  const numMatch = sprintId.match(/(\d+)$/);
  const currentNum = numMatch ? parseInt(numMatch[1], 10) : null;
  const sprintPrefix = numMatch ? sprintId.replace(/\d+$/, '') : null;

  // Collect prior sprint REPORT.md content for "resolved" detection
  const priorReportContent = [];
  if (currentNum !== null && sprintPrefix !== null) {
    for (let i = 1; i <= lookback; i++) {
      const priorId = `${sprintPrefix}${currentNum - i}`;
      const priorDir = path.join(sprintRunsDir, priorId);
      if (!fs.existsSync(priorDir)) continue;
      try {
        const rFile = reportFilename(priorDir, priorId, { forRead: true });
        if (fs.existsSync(rFile)) {
          priorReportContent.push(fs.readFileSync(rFile, 'utf8'));
        }
      } catch { /* skip missing */ }
    }
  }

  // Collect prior sprint dirs for stale detection
  const priorSprintDirs = [];
  if (currentNum !== null && sprintPrefix !== null) {
    for (let i = 1; i <= lookback; i++) {
      const priorId = `${sprintPrefix}${currentNum - i}`;
      const priorDir = path.join(sprintRunsDir, priorId);
      if (fs.existsSync(priorDir)) priorSprintDirs.push(priorDir);
    }
  }

  /** @type {{ entry: string, date: string, tags: string, lesson: string, category: 'stale'|'superseded'|'resolved', reason: string }[]} */
  const candidates = [];
  const processedHashes = new Set();

  for (const rawEntry of entries) {
    const m = rawEntry.trim().match(entryRe);
    if (!m) continue;
    const [, date, tags, lesson] = m;
    const entry = rawEntry.trim();
    const hashKey = `flashcard|${entry.slice(0, 80)}`;
    const hash = stableHash(hashKey);
    if (processedHashes.has(hash)) continue;
    processedHashes.add(hash);

    // Extract first keyword from lesson (first word-run, stripping punctuation)
    const keyword = lesson.split(/\s+/)[0].replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
    if (!keyword) continue;

    // Check "resolved": keyword appears in §6 Tooling "Resolved" of a prior REPORT.md
    let resolved = false;
    for (const rc of priorReportContent) {
      const resolvedSection = rc.match(/##\s*§6[^\n]*\n([\s\S]*?)(?=##\s*§|$)/);
      if (resolvedSection && resolvedSection[1].toLowerCase().includes(keyword)) {
        resolved = true;
        break;
      }
    }
    if (resolved) {
      candidates.push({ entry, date, tags, lesson, category: 'resolved', reason: 'keyword found in a prior §6 Tooling section' });
      continue;
    }

    // Check "stale": zero grep hits for keyword across prior sprint dirs
    if (priorSprintDirs.length > 0) {
      let hitCount = 0;
      for (const priorDir of priorSprintDirs) {
        try {
          const files = fs.readdirSync(priorDir);
          for (const f of files) {
            const fPath = path.join(priorDir, f);
            if (fs.statSync(fPath).isFile()) {
              const content = fs.readFileSync(fPath, 'utf8');
              if (content.toLowerCase().includes(keyword)) { hitCount++; break; }
            }
          }
        } catch { /* skip unreadable dirs */ }
      }
      if (hitCount === 0) {
        candidates.push({ entry, date, tags, lesson, category: 'stale', reason: `stale: zero grep hits across last ${priorSprintDirs.length} sprint dir(s)` });
        continue;
      }
    }
  }

  // Read existing suggestions file content
  let existingContent = fs.existsSync(suggestionsFile)
    ? fs.readFileSync(suggestionsFile, 'utf8')
    : `# Improvement Suggestions — ${sprintId}\n\nGenerated by \`suggest_improvements.mjs\`. Append-only; IDs are stable.\nVocabulary: Templates | Handoffs | Skills | Process | Tooling\n\n---\n\n`;

  // Build section
  const sectionLines = [
    '## FLASHCARD Cleanup Candidates',
    '',
    '<!-- generated-by: suggest_improvements.mjs --flashcard-cleanup -->',
    '',
  ];

  // Filter out already-captured candidates
  const newCandidates = candidates.filter(c => {
    const hash = stableHash(`flashcard|${c.entry.slice(0, 80)}`);
    return !existingContent.includes(`<!-- hash:${hash} -->`);
  });

  if (newCandidates.length === 0) {
    sectionLines.push('_No candidates detected this sprint._');
    sectionLines.push('');
  } else {
    newCandidates.forEach((c, i) => {
      const candId = `CAND-${sprintId}-F${String(i + 1).padStart(2, '0')}`;
      const hash = stableHash(`flashcard|${c.entry.slice(0, 80)}`);
      sectionLines.push(`### ${candId}: ${c.lesson.slice(0, 60)}`);
      sectionLines.push(`<!-- hash:${hash} -->`);
      sectionLines.push('');
      sectionLines.push(`**Category:** ${c.category}`);
      sectionLines.push(`**Reason:** ${c.reason}`);
      sectionLines.push(`**Original entry:** \`${c.entry}\``);
      sectionLines.push('**Suggested action:** approve to remove via `cleargate flashcard prune` (run /improve)');
      sectionLines.push('');
      sectionLines.push('---');
      sectionLines.push('');
    });
  }

  const sectionContent = sectionLines.join('\n');
  // Anchored heading regex — strict match, no trailing text
  const headingRe = /^## FLASHCARD Cleanup Candidates$/m;

  let finalContent;
  if (headingRe.test(existingContent)) {
    const headingIdx = existingContent.search(headingRe);
    const afterHeading = existingContent.slice(headingIdx + existingContent.match(headingRe)[0].length);
    const nextMatch = afterHeading.search(/^## /m);
    if (nextMatch === -1) {
      finalContent = existingContent.slice(0, headingIdx).trimEnd() + '\n\n' + sectionContent;
    } else {
      finalContent = existingContent.slice(0, headingIdx).trimEnd() + '\n\n' + sectionContent + '\n' + afterHeading.slice(nextMatch);
    }
  } else {
    finalContent = existingContent.trimEnd() + '\n\n' + sectionContent;
  }

  atomicWrite(suggestionsFile, finalContent);
  process.stdout.write(`suggest_improvements: flashcard-cleanup section written to ${suggestionsFile}\n`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    process.stderr.write('Usage: node suggest_improvements.mjs <sprint-id> [--skill-candidates | --flashcard-cleanup]\n');
    process.exit(2);
  }

  // Flag-aware parse: detect flags first, then extract sprintId from positional args.
  // Sprint IDs match ^SPRINT-\d+$ so they never start with '--'; no collision possible.
  const skillCandidatesMode = args.includes('--skill-candidates');
  const flashcardCleanupMode = args.includes('--flashcard-cleanup');

  if (skillCandidatesMode && flashcardCleanupMode) {
    process.stderr.write('Error: --skill-candidates and --flashcard-cleanup are mutually exclusive\n');
    process.exit(2);
  }

  const sprintId = args.find(a => !a.startsWith('--'));
  if (!sprintId) {
    process.stderr.write('Usage: node suggest_improvements.mjs <sprint-id> [--skill-candidates | --flashcard-cleanup]\n');
    process.exit(2);
  }

  const sprintDir = process.env.CLEARGATE_SPRINT_DIR
    ? path.resolve(process.env.CLEARGATE_SPRINT_DIR)
    : path.join(REPO_ROOT, '.cleargate', 'sprint-runs', sprintId);

  if (!fs.existsSync(sprintDir)) {
    process.stderr.write(`Error: sprint directory not found: ${sprintDir}\n`);
    process.exit(1);
  }

  const reportFile = reportFilename(sprintDir, sprintId, { forRead: true });
  const suggestionsFile = path.join(sprintDir, 'improvement-suggestions.md');

  // Default mode requires REPORT.md; flag-driven modes do not.
  if (!skillCandidatesMode && !flashcardCleanupMode) {
    if (!fs.existsSync(reportFile)) {
      process.stderr.write(`Error: report file not found at ${reportFile}\n`);
      process.stderr.write('Run the Reporter agent first to generate the report.\n');
      process.exit(1);
    }
  }

  // Route flag-driven modes before default processing
  if (skillCandidatesMode) {
    scanSkillCandidates(sprintId, sprintDir, suggestionsFile);
    return;
  }
  if (flashcardCleanupMode) {
    scanFlashcardCleanup(sprintId, sprintDir, suggestionsFile);
    return;
  }

  const reportContent = fs.readFileSync(reportFile, 'utf8');

  // Parse §5 self-assessment for improvement candidates
  const candidates = parseSelfAssessment(reportContent);

  // Read existing suggestions if present (idempotency)
  let existingContent = '';
  const existingIds = new Set();
  let nextN = 1;

  if (fs.existsSync(suggestionsFile)) {
    existingContent = fs.readFileSync(suggestionsFile, 'utf8');
    // Parse existing IDs
    const parsed = parseExistingIds(existingContent);
    for (const id of parsed) {
      existingIds.add(id);
    }
    // Determine the highest existing N for this sprint to continue from
    const sprintPrefix = `SUG-${sprintId}-`;
    let maxN = 0;
    for (const id of parsed) {
      if (id.startsWith(sprintPrefix)) {
        const n = parseInt(id.slice(sprintPrefix.length), 10);
        if (!isNaN(n) && n > maxN) maxN = n;
      }
    }
    nextN = maxN + 1;
  }

  // Determine which candidates are new (stable hash-based dedup)
  const newEntries = [];
  for (const candidate of candidates) {
    const hashKey = `${candidate.category}|${candidate.item}`;
    const hash = stableHash(hashKey);
    // Check if we already have an entry with this hash in existing content
    // We encode the hash in a comment to enable stable lookup
    const hashMarker = `<!-- hash:${hash} -->`;
    if (existingContent.includes(hashMarker)) {
      continue; // Already captured
    }
    const sugId = `SUG-${sprintId}-${String(nextN).padStart(2, '0')}`;
    nextN++;
    newEntries.push({ sugId, hash, hashMarker, ...candidate });
  }

  if (newEntries.length === 0) {
    process.stdout.write(
      `Idempotent: no new suggestions to add for sprint ${sprintId}.\n` +
      `Existing file has ${existingIds.size} suggestion(s).\n`
    );
    process.exit(0);
  }

  // Build new entries markdown
  const timestamp = new Date().toISOString();
  const newEntriesLines = [];

  // If file doesn't exist yet, write a header
  if (!existingContent) {
    newEntriesLines.push(`# Improvement Suggestions — ${sprintId}`);
    newEntriesLines.push('');
    newEntriesLines.push('Generated by `suggest_improvements.mjs`. Append-only; IDs are stable.');
    newEntriesLines.push(`Vocabulary: Templates | Handoffs | Skills | Process | Tooling`);
    newEntriesLines.push('');
    newEntriesLines.push('---');
    newEntriesLines.push('');
  }

  for (const entry of newEntries) {
    newEntriesLines.push(`## ${entry.sugId} — ${entry.category}: ${entry.item}`);
    newEntriesLines.push(`${entry.hashMarker}`);
    newEntriesLines.push('');
    newEntriesLines.push(`**Category:** ${entry.category}`);
    newEntriesLines.push(`**Rating:** ${entry.rating}`);
    newEntriesLines.push(`**Added:** ${timestamp}`);
    newEntriesLines.push('');
    if (entry.notes && entry.notes !== '' && entry.notes !== '<notes>') {
      newEntriesLines.push(`**Context from report:** ${entry.notes}`);
      newEntriesLines.push('');
    }
    newEntriesLines.push('**Suggested action:**');
    newEntriesLines.push(`> _(to be filled by orchestrator or next sprint planning)_`);
    newEntriesLines.push('');
    newEntriesLines.push('---');
    newEntriesLines.push('');
  }

  const appendContent = newEntriesLines.join('\n');
  const finalContent = existingContent
    ? existingContent.trimEnd() + '\n\n' + appendContent
    : appendContent;

  atomicWrite(suggestionsFile, finalContent);

  process.stdout.write(
    `suggest_improvements: added ${newEntries.length} new suggestion(s) to ${suggestionsFile}\n`
  );
  for (const e of newEntries) {
    process.stdout.write(`  ${e.sugId}: [${e.category}] ${e.item} (${e.rating})\n`);
  }
}

main();
