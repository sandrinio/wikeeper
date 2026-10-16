/**
 * work-item-id.mjs — the work-item ID grammar, payload side.
 *
 * BUG-041 unified fourteen divergent ID parsers into `cleargate-cli/src/lib/work-item-id.ts`.
 * Scaffold scripts ship as standalone ESM and cannot import the compiled TypeScript, so the
 * grammar exists twice: there, and here. That duplication is deliberate and *bounded* — this
 * file is the only copy on the payload side, and every scaffold script imports it rather than
 * re-deriving one. A shared-corpus test in the CLI runs both and fails on divergence.
 *
 * The alternative — each script carrying its own regex — is precisely how fourteen happened.
 */

const TYPE_PREFIXES = [
  'INITIATIVE', 'PROPOSAL', 'PLATFORM', 'HOTFIX', 'SPRINT',
  'STORY', 'AUDIT', 'SPIKE', 'EPIC', 'PROP', 'BUG', 'CR',
];
const PREFIX_ALT = TYPE_PREFIXES.join('|');
// Longest-alternative-first. date-form before numeric-multi or BUG-2026-08-24 degrades to
// BUG-2026-08; sub-lettered before numeric-multi or STORY-047-02a..02f alias onto one id.
const BODY_ALT = [
  String.raw`\d{4}-\d{2}-\d{2}(?:-[A-Za-z0-9]+)*`,
  String.raw`\d+-\d+[a-z]`,
  String.raw`\d+-\d+`,
  String.raw`\d+`,
  String.raw`[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+){1,}`,
].join('|');

function normaliseId(id) {
  return id.replace(/^PROP-(\d)/, 'PROPOSAL-$1');
}

export function extractWorkItemIds(text) {
  // No trailing \b: the package pattern had one after \d{3}, so `BUG-2026-08-24` consumed
  // `BUG-202`, failed the boundary on the following `6`, and vanished entirely.
  const re = new RegExp(String.raw`\b(?:${PREFIX_ALT})-(?:${BODY_ALT})`, 'g');
  const raw = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    raw.push(normaliseId(m[0]));
  }
  return [...new Set(raw)];
}

export { normaliseId };

/**
 * Does `filename` name the work item `id`? Accepts `<ID>.md`, `<ID>_slug.md`, `<ID>-slug.md`.
 * The separator is REQUIRED so `STORY-152-3` cannot claim `STORY-152-33_Foo.md`.
 */
export function matchesId(filename, workItemId) {
  if (!filename.endsWith('.md')) return false;
  const stem = filename.slice(0, -3);
  const id = normaliseId(workItemId);
  for (const base of new Set([id, workItemId])) {
    if (stem === base || stem.startsWith(`${base}_`) || stem.startsWith(`${base}-`)) return true;
  }
  return false;
}
