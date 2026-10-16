#!/usr/bin/env node
/**
 * prep_doc_refresh.mjs <sprint-id>
 *
 * Generates a per-sprint tailored doc-refresh checklist by scanning what
 * changed in the sprint window and matching trigger patterns from the
 * canonical checklist at .cleargate/knowledge/sprint-closeout-checklist.md.
 *
 * Output: .cleargate/sprint-runs/<sprint-id>/.doc-refresh-checklist.md
 *
 * Each canonical-checklist category is evaluated; items where the trigger
 * pattern matches at least one changed file get `- [ ]`; items where it
 * does not get `- [x] — no changes detected, skip`.
 *
 * Does NOT modify any documentation. Application is human-driven.
 *
 * Exit codes:
 *   0 — success
 *   1 — sprint state.json not found (sprint dir missing)
 *   2 — usage error (missing sprint-id argument)
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** @typedef {{ surface: string, trigger: RegExp | null, triggerDesc: string }} Item */
/** @typedef {{ name: string, items: Item[] }} Category */

/** @type {Category[]} */
const CATEGORIES = [
  {
    name: '1. Project READMEs',
    items: [
      {
        surface: '`README.md`',
        trigger: /^README\.md$/,
        triggerDesc: 'any feature that changes user-visible product behavior',
      },
      {
        surface: '`cleargate-cli/README.md`',
        trigger: /^cleargate-cli\/src\/commands\//,
        triggerDesc: 'any change to cleargate-cli/src/commands/*.ts',
      },
      {
        surface: '`cleargate-planning/README.md`',
        trigger: /^cleargate-planning\//,
        triggerDesc: 'any change under cleargate-planning/',
      },
      {
        surface: '`mcp/README.md`',
        trigger: /^mcp\/src\//,
        triggerDesc: 'any change under mcp/src/ (nested repo — check separately)',
      },
      {
        surface: '`admin/README.md`',
        trigger: /^admin\//,
        triggerDesc: 'any change under admin/ (currently stub)',
      },
    ],
  },
  {
    name: '2. CHANGELOG files (Common-Changelog format per STORY-016-03)',
    items: [
      {
        surface: '`cleargate-cli/CHANGELOG.md`',
        trigger: /^cleargate-cli\//,
        triggerDesc: 'any user-visible change in cleargate-cli/ (CLI surface, error messages, package contents)',
      },
      {
        surface: '`mcp/CHANGELOG.md`',
        trigger: /^mcp\//,
        triggerDesc: 'any user-visible change in mcp/ (if file exists)',
      },
    ],
  },
  {
    name: '3. Manifest / package metadata',
    items: [
      {
        surface: '`cleargate-planning/MANIFEST.json`',
        trigger: /^(\.claude\/agents\/|\.cleargate\/templates\/|\.cleargate\/knowledge\/|\.cleargate\/scripts\/)/,
        triggerDesc: 'any change to .claude/agents/*.md, .cleargate/templates/*, .cleargate/knowledge/*, or .cleargate/scripts/*',
      },
      {
        surface: '`cleargate-cli/package.json` (version bump)',
        trigger: /^cleargate-cli\//,
        triggerDesc: 'only if releasing this sprint (release lane is separate from sprint close)',
      },
      {
        surface: '`mcp/package.json` (version bump)',
        trigger: /^mcp\//,
        triggerDesc: 'only if releasing this sprint',
      },
    ],
  },
  {
    name: '4. CLAUDE.md "Active state" subsection',
    items: [
      {
        surface: '`CLAUDE.md` "Active state" section',
        trigger: /\.(cleargate\/delivery\/archive\/|cleargate\/delivery\/pending-sync\/)/,
        triggerDesc: 'any EPIC / CR / Bug / Hotfix archived this sprint, OR any stack version bumped',
      },
      {
        surface: '`cleargate-planning/CLAUDE.md` mirror',
        trigger: /\.(cleargate\/delivery\/archive\/|cleargate\/delivery\/pending-sync\/)/,
        triggerDesc: 'same edit as live (CLEARGATE-tag-block region only — outside-block diverges intentionally)',
      },
    ],
  },
  {
    name: '5. Wiki surfaces (auto-rebuilt by PostToolUse hooks; verify after close)',
    items: [
      {
        surface: '`.cleargate/wiki/active-sprint.md`',
        trigger: null,
        triggerDesc: 'always verify at sprint close — confirm sprint ID, status, and date are current',
      },
      {
        surface: '`.cleargate/wiki/index.md`',
        trigger: null,
        triggerDesc: 'always verify at sprint close — confirm new artifacts appear in relevant sections',
      },
      {
        surface: '`.cleargate/wiki/product-state.md`',
        trigger: null,
        triggerDesc: 'always verify at sprint close — confirm shipped capabilities are listed',
      },
      {
        surface: '`.cleargate/wiki/roadmap.md`',
        trigger: null,
        triggerDesc: 'always verify at sprint close — confirm closed sprint moved from Active to Completed',
      },
    ],
  },
  {
    name: '6. INDEX surfaces (manual updates)',
    items: [
      {
        surface: '`.cleargate/INDEX.md`',
        trigger: null,
        triggerDesc: 'if maintained as a curated roadmap; update when sprint closes',
      },
      {
        surface: '`.cleargate/delivery/INDEX.md`',
        trigger: null,
        triggerDesc: 'update epic/sprint map when new artifacts archived',
      },
    ],
  },
  {
    name: '7. Frontmatter version stamps',
    items: [
      {
        surface: 'Modified `.cleargate/templates/*.md` (run `cleargate stamp <path>`)',
        trigger: /^\.cleargate\/templates\//,
        triggerDesc: 'any .cleargate/templates/*.md modified this sprint',
      },
      {
        surface: '`.cleargate/knowledge/cleargate-protocol.md` (run `cleargate stamp`)',
        trigger: /^\.cleargate\/knowledge\/cleargate-protocol\.md$/,
        triggerDesc: 'if cleargate-protocol.md was modified this sprint (post-EPIC-024 slim)',
      },
      {
        surface: '`.cleargate/knowledge/cleargate-enforcement.md` (run `cleargate stamp`)',
        trigger: /^\.cleargate\/knowledge\/cleargate-enforcement\.md$/,
        triggerDesc: 'if cleargate-enforcement.md was modified this sprint (post-EPIC-024 split)',
      },
      {
        surface: 'Other modified `.cleargate/knowledge/*.md` (run `cleargate stamp <path>`)',
        trigger: /^\.cleargate\/knowledge\//,
        triggerDesc: 'any other .cleargate/knowledge/*.md touched this sprint',
      },
    ],
  },
  {
    name: '8. Knowledge doc cross-references',
    items: [
      {
        surface: 'Knowledge docs citing `§N` of protocol or enforcement.md',
        trigger: /^\.cleargate\/knowledge\//,
        triggerDesc: 'any knowledge doc modified — verify §N citations still resolve post-rewrite',
      },
    ],
  },
  {
    name: '9. Mirror parity audit',
    items: [
      {
        surface: '`cleargate-planning/.claude/agents/` diff',
        trigger: /^\.claude\/agents\//,
        triggerDesc: 'any change to .claude/agents/*.md — run diff -r to verify parity',
      },
      {
        surface: '`cleargate-planning/.cleargate/templates/` diff',
        trigger: /^\.cleargate\/templates\//,
        triggerDesc: 'any change to .cleargate/templates/ — run diff -r to verify parity',
      },
      {
        surface: '`cleargate-planning/.cleargate/knowledge/` diff',
        trigger: /^\.cleargate\/knowledge\//,
        triggerDesc: 'any change to .cleargate/knowledge/ — run diff -r to verify parity',
      },
    ],
  },
];

/**
 * Get changed files for a sprint using available strategies.
 * Strategy 1: git log sprint/<sprint-id> ^main --name-only (if branch exists)
 * Strategy 2: git log --since <start_date> --name-only (from sprint frontmatter)
 * Strategy 3: git log --grep <sprint-id> --name-only (commit-message grep fallback)
 *
 * @param {string} sprintId
 * @param {string} sprintDir
 * @returns {string[]} deduped array of changed file paths
 */
function getChangedFiles(sprintId, sprintDir) {
  // Strategy 1: sprint branch
  try {
    const branchCheck = execSync(`git rev-parse --verify "refs/heads/sprint/${sprintId}"`, {
      cwd: REPO_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString().trim();
    if (branchCheck) {
      const out = execSync(
        `git log "sprint/${sprintId}" ^main --name-only --format=""`,
        { cwd: REPO_ROOT, stdio: ['pipe', 'pipe', 'pipe'] }
      ).toString();
      const files = out.split('\n').map(f => f.trim()).filter(Boolean);
      if (files.length > 0) {
        return [...new Set(files)];
      }
    }
  } catch {
    // branch does not exist — fall through to next strategy
  }

  // Strategy 2: --since <start_date> from sprint frontmatter
  const startDate = readStartDateFromFrontmatter(sprintId);
  if (startDate) {
    try {
      const out = execSync(
        `git log --since="${startDate}" --name-only --format=""`,
        { cwd: REPO_ROOT, stdio: ['pipe', 'pipe', 'pipe'] }
      ).toString();
      const files = out.split('\n').map(f => f.trim()).filter(Boolean);
      if (files.length > 0) {
        return [...new Set(files)];
      }
    } catch {
      // fall through to strategy 3
    }
  }

  // Strategy 3: commit-message grep for sprint ID
  try {
    const out = execSync(
      `git log --grep="${sprintId}" --name-only --format=""`,
      { cwd: REPO_ROOT, stdio: ['pipe', 'pipe', 'pipe'] }
    ).toString();
    const files = out.split('\n').map(f => f.trim()).filter(Boolean);
    return [...new Set(files)];
  } catch {
    return [];
  }
}

/**
 * Read start_date from sprint frontmatter file.
 * Looks in pending-sync first, then archive.
 *
 * @param {string} sprintId
 * @returns {string | null}
 */
function readStartDateFromFrontmatter(sprintId) {
  const dirs = [
    path.join(REPO_ROOT, '.cleargate', 'delivery', 'pending-sync'),
    path.join(REPO_ROOT, '.cleargate', 'delivery', 'archive'),
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const entries = fs.readdirSync(dir);
    const match = entries.find(e => e.startsWith(`${sprintId}_`) && e.endsWith('.md'));
    if (match) {
      const content = fs.readFileSync(path.join(dir, match), 'utf8');
      const m = content.match(/^start_date:\s*["']?(.+?)["']?\s*$/m);
      if (m) return m[1].trim();
    }
  }
  return null;
}

/**
 * Evaluate each checklist category against the changed file set.
 *
 * @param {string[]} changedFiles
 * @returns {{ category: Category, results: Array<{ item: Item, triggered: boolean }> }[]}
 */
function evaluateChecklist(changedFiles) {
  return CATEGORIES.map(category => ({
    category,
    results: category.items.map(item => ({
      item,
      triggered: item.trigger === null
        ? true  // null trigger = always review
        : changedFiles.some(f => item.trigger.test(f)),
    })),
  }));
}

/**
 * Render the checklist markdown.
 *
 * @param {ReturnType<typeof evaluateChecklist>} evaluation
 * @param {string} sprintId
 * @returns {string}
 */
function renderChecklist(evaluation, sprintId) {
  const lines = [
    `# Doc & Metadata Refresh Checklist — ${sprintId}`,
    '',
    `> Generated by \`prep_doc_refresh.mjs\` at ${new Date().toISOString()}.`,
    '> Each item is pre-evaluated against the sprint\'s changed file set.',
    '> `- [ ]` = action required; `- [x]` = no changes detected, skip.',
    '> Apply or defer each `- [ ]` item during Gate 4 ack.',
    '> Canonical checklist: `.cleargate/knowledge/sprint-closeout-checklist.md`',
    '',
  ];

  for (const { category, results } of evaluation) {
    lines.push(`### ${category.name}`);
    lines.push('');
    for (const { item, triggered } of results) {
      if (triggered) {
        lines.push(`- [ ] ${item.surface} — **trigger:** ${item.triggerDesc}`);
      } else {
        lines.push(`- [x] ${item.surface} — no changes detected, skip`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

function main() {
  const sprintId = process.argv[2];
  if (!sprintId) {
    console.error('Usage: prep_doc_refresh.mjs <sprint-id>');
    console.error('Example: prep_doc_refresh.mjs SPRINT-16');
    process.exit(2);
  }

  const sprintDir = path.join(REPO_ROOT, '.cleargate', 'sprint-runs', sprintId);
  if (!fs.existsSync(sprintDir)) {
    console.error(`Error: sprint state.json not found at ${path.join(sprintDir, 'state.json')}`);
    console.error(`Sprint directory does not exist: ${sprintDir}`);
    process.exit(1);
  }

  const changedFiles = getChangedFiles(sprintId, sprintDir);
  console.log(`Found ${changedFiles.length} changed files in sprint window.`);

  const evaluation = evaluateChecklist(changedFiles);
  const markdown = renderChecklist(evaluation, sprintId);

  const outFile = path.join(sprintDir, '.doc-refresh-checklist.md');
  fs.writeFileSync(outFile, markdown, 'utf8');
  console.log(`Wrote ${outFile}`);
}

main();
