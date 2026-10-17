// src/lint/rules-lint.ts
// STORY-005-04: `lint --rules` checks over the parsed .wiki/kb_instructions.md, and the doctor parse check.
// Imports ./checks.js with `import type` only (load-cycle rule in checks.ts).
import { loadInstructions, KB_ISSUE_CODES } from "../kb/parse-instructions.js";
import type { KbEntity, KbInstructions, KbQuestion } from "../kb/parse-instructions.js";
import type { SourceKindRule } from "../ingest/kind-rules.js";
import { matchesKind } from "../ingest/permissions.js";
import { toPosixRelative } from "../core/paths.js";
import type { ResolvedPaths } from "../core/paths.js";
import type { DoctorCheck } from "../core/integrations.js";
import type { LintFinding } from "../ingest/lint-hook.js";
import type { LintCheck, LintContext } from "./checks.js";

export const RULES_LINT_CHECK_IDS = [
  "missing-file",
  "missing-section",
  "malformed-question",
  "malformed-entity",
  "unknown-question-ref",
  "ambiguous-line",
  "duplicate-rule",
  "unknown-entity",
  "unknown-field",
  "question-without-rule",
  "rule-without-question",
  "changelog-version-mismatch",
  "unknown-whitelist-kind",
] as const;
export const KB_INSTRUCTIONS_CHECK_ID = "kb-instructions-valid";

type Severity = LintFinding["severity"];

export function parseTarget(target: string): { entity: string; field: string | null } {
  const t = target.trim();
  const dot = t.indexOf(".");
  if (dot < 0) return { entity: t.toLowerCase(), field: null };
  return { entity: t.slice(0, dot).trim().toLowerCase(), field: normField(t.slice(dot + 1)) };
}

function normField(f: string): string {
  return f.toLowerCase().replace(/[\s_-]+/g, " ").trim();
}

function kbPath(ctx: LintContext): string {
  return toPosixRelative(ctx.paths.root, ctx.paths.kbInstructions);
}

function at(line: number): { line?: number } {
  return line > 0 ? { line } : {};
}

function firstBy<T>(items: readonly T[], key: (t: T) => string): Map<string, T> {
  const m = new Map<string, T>();
  for (const it of items) if (!m.has(key(it))) m.set(key(it), it);
  return m;
}

function splitTargets(targets: string): string[] {
  return targets
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t !== "");
}

/** A check that needs a parsed file: no file means no finding (missing-file reports it). */
function make(
  id: (typeof RULES_LINT_CHECK_IDS)[number],
  severity: Severity,
  body: (kb: KbInstructions, ctx: LintContext, file: string) => LintFinding[],
): LintCheck {
  return {
    id,
    severity,
    scope: "rules",
    async run(ctx) {
      if (ctx.kb === null) return [];
      return body(ctx.kb, ctx, kbPath(ctx));
    },
  };
}

function issueCheck(code: (typeof KB_ISSUE_CODES)[number], severity: Severity): LintCheck {
  return make(code, severity, (kb, _ctx, file) =>
    kb.issues
      .filter((i) => i.code === code)
      .map((i) => ({ id: code, severity, message: i.message, path: file, ...at(i.line) })),
  );
}

const missingFile: LintCheck = {
  id: "missing-file",
  severity: "error",
  scope: "rules",
  async run(ctx) {
    if (ctx.kb !== null) return [];
    const file = kbPath(ctx);
    return [
      {
        id: "missing-file",
        severity: "error",
        message: `${file} is missing; run wikeeper init to restore the seed`,
        path: file,
      },
    ];
  },
};

const duplicateRule = make("duplicate-rule", "error", (kb, _ctx, file) => {
  const out: LintFinding[] = [];
  const add = (message: string, line: number) =>
    out.push({ id: "duplicate-rule", severity: "error", message, path: file, ...at(line) });
  const kinds = new Map<string, SourceKindRule>();
  for (const k of kb.kinds) {
    const first = kinds.get(k.id);
    if (first === undefined) kinds.set(k.id, k);
    else
      add(
        `source kind "${k.id}" is defined again; line ${first.line} defines it first and ingest uses that one`,
        k.line,
      );
  }
  const ents = new Map<string, KbEntity>();
  for (const e of kb.entities) {
    const key = e.name.toLowerCase();
    const first = ents.get(key);
    if (first === undefined) ents.set(key, e);
    else add(`entity "${e.name}" is defined again; line ${first.line} defines it first`, e.line);
  }
  const qs = new Map<string, KbQuestion>();
  for (const q of kb.questions) {
    const first = qs.get(q.id);
    if (first === undefined) qs.set(q.id, q);
    else add(`question ${q.id} is defined again; line ${first.line} defines it first`, q.line);
  }
  return out;
});

function entityMap(kb: KbInstructions): Map<string, KbEntity> {
  return firstBy(kb.entities, (e) => e.name.toLowerCase());
}

const unknownEntity = make("unknown-entity", "error", (kb, _ctx, file) => {
  const ents = entityMap(kb);
  const out: LintFinding[] = [];
  for (const k of firstBy(kb.kinds, (x) => x.id).values()) {
    const bad = splitTargets(k.targets).filter((t) => !ents.has(parseTarget(t).entity));
    if (bad.length === 0) continue;
    out.push({
      id: "unknown-entity",
      severity: "error",
      message: `source kind "${k.id}" targets ${bad.join(", ")}, which ${bad.length === 1 ? "is not an entity" : "are not entities"} in "## Entities"`,
      path: file,
      ...at(k.line),
    });
  }
  return out;
});

const unknownField = make("unknown-field", "warning", (kb, _ctx, file) => {
  const ents = entityMap(kb);
  const out: LintFinding[] = [];
  for (const k of firstBy(kb.kinds, (x) => x.id).values()) {
    const bad = splitTargets(k.targets).filter((t) => {
      const p = parseTarget(t);
      const e = ents.get(p.entity);
      return e !== undefined && p.field !== null && !e.fields.some((f) => normField(f) === p.field);
    });
    if (bad.length === 0) continue;
    out.push({
      id: "unknown-field",
      severity: "warning",
      message: `source kind "${k.id}" targets ${bad.join(", ")}, which ${bad.length === 1 ? "is not a field" : "are not fields"} of the entity`,
      path: file,
      ...at(k.line),
    });
  }
  return out;
});

function targetedEntities(kb: KbInstructions): Set<string> {
  const set = new Set<string>();
  for (const k of firstBy(kb.kinds, (x) => x.id).values())
    for (const t of splitTargets(k.targets)) set.add(parseTarget(t).entity);
  return set;
}

const questionWithoutRule = make("question-without-rule", "warning", (kb, _ctx, file) => {
  const targeted = targetedEntities(kb);
  const ents = [...entityMap(kb).values()];
  const out: LintFinding[] = [];
  for (const q of firstBy(kb.questions, (x) => x.id).values()) {
    if (q.datedFacts) continue;
    const listing = ents.filter((e) => e.questionRefs.includes(q.id));
    if (listing.some((e) => targeted.has(e.name.toLowerCase()))) continue;
    const why =
      listing.length === 0
        ? `listed by no entity; add it to an entity line or end it with "(dated facts)"`
        : `listed by ${listing.map((e) => e.name).join(", ")}, but no source kind targets them`;
    out.push({
      id: "question-without-rule",
      severity: "warning",
      message: `question ${q.id} is served by no source kind: ${why}`,
      path: file,
      ...at(q.line),
    });
  }
  return out;
});

const ruleWithoutQuestion = make("rule-without-question", "warning", (kb, _ctx, file) => {
  const qids = new Set(kb.questions.map((q) => q.id));
  const kinds = [...firstBy(kb.kinds, (x) => x.id).values()];
  const out: LintFinding[] = [];
  for (const e of entityMap(kb).values()) {
    if (e.questionRefs.some((r) => qids.has(r))) continue;
    const key = e.name.toLowerCase();
    const serving = kinds
      .filter((k) => splitTargets(k.targets).some((t) => parseTarget(t).entity === key))
      .map((k) => k.id);
    const tail =
      serving.length === 0
        ? ""
        : `; source kinds that target it: ${serving.join(", ")}, which capture facts no question asks for`;
    out.push({
      id: "rule-without-question",
      severity: "warning",
      message: `entity "${e.name}" lists no question${tail}`,
      path: file,
      ...at(e.line),
    });
  }
  return out;
});

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const changelogMismatch = make("changelog-version-mismatch", "warning", (kb, _ctx, file) => {
  const kinds = [...firstBy(kb.kinds, (x) => x.id).values()];
  const mentions = kb.changelog.map((entry) => {
    const found = new Map<string, number[]>();
    for (const k of kinds) {
      const re = new RegExp("(?<![a-z0-9-])" + escapeRe(k.id) + "(?![a-z0-9-])\\s*\\(?v(\\d+)\\)?", "gi");
      for (const m of entry.text.matchAll(re)) {
        const list = found.get(k.id) ?? [];
        list.push(Number(m[1]));
        found.set(k.id, list);
      }
    }
    return { entry, found };
  });
  const out: LintFinding[] = [];
  const add = (message: string, line: number) =>
    out.push({ id: "changelog-version-mismatch", severity: "warning", message, path: file, ...at(line) });
  for (const k of kinds) {
    if (k.version > 1 && !mentions.some((m) => m.found.get(k.id)?.includes(k.version))) {
      add(`source kind "${k.id}" is at v${k.version}, but no "## Rule changelog" entry mentions ${k.id} v${k.version}`, k.line);
    }
  }
  for (const { entry, found } of mentions) {
    for (const k of kinds) {
      const above = (found.get(k.id) ?? []).find((v) => v > k.version);
      if (above !== undefined)
        add(`changelog entry mentions ${k.id} v${above}, but the source kind is at v${k.version}`, entry.line);
    }
  }
  return out;
});

const unknownWhitelistKind: LintCheck = {
  id: "unknown-whitelist-kind",
  severity: "warning",
  scope: "rules",
  async run(ctx) {
    if (ctx.kb === null) return [];
    const kb = ctx.kb;
    const ids = [...new Set(kb.kinds.map((k) => k.id))];
    const file = toPosixRelative(ctx.paths.root, ctx.paths.configFile);
    const kbFile = kbPath(ctx);
    return ctx.config.ingest.whitelist.kinds
      .filter((entry) => !kb.kinds.some((k) => matchesKind(entry, k.id)))
      .map((entry) => ({
        id: "unknown-whitelist-kind",
        severity: "warning" as const,
        message: `ingest.whitelist.kinds entry "${entry}" names no source kind in ${kbFile} (kinds: ${ids.length === 0 ? "none" : ids.join(", ")})`,
        path: file,
      }));
  },
};

export const RULES_LINT_CHECKS: readonly LintCheck[] = [
  missingFile,
  issueCheck("missing-section", "error"),
  issueCheck("malformed-question", "error"),
  issueCheck("malformed-entity", "error"),
  issueCheck("unknown-question-ref", "error"),
  issueCheck("ambiguous-line", "warning"),
  duplicateRule,
  unknownEntity,
  unknownField,
  questionWithoutRule,
  ruleWithoutQuestion,
  changelogMismatch,
  unknownWhitelistKind,
];

export async function checkKbInstructions(paths: ResolvedPaths): Promise<DoctorCheck[]> {
  const loaded = await loadInstructions(paths);
  if (loaded === null) return [];
  const file = toPosixRelative(paths.root, paths.kbInstructions);
  const { issues } = loaded.kb;
  const first = issues[0];
  if (first === undefined) return [{ id: KB_INSTRUCTIONS_CHECK_ID, severity: "ok", message: "no parse issues", file }];
  const where = first.line === 0 ? first.code : `line ${first.line}, ${first.code}`;
  return [
    {
      id: KB_INSTRUCTIONS_CHECK_ID,
      severity: "warning",
      message: `${issues.length} parse ${issues.length === 1 ? "issue" : "issues"} (first: ${where})`,
      fix: "run wikeeper lint --rules",
      file,
    },
  ];
}
