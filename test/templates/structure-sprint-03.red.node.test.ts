// STORY-006-11 QA-Red: structural template tests for the SPRINT-03 commands. Immutable after QA-Red.
// S1, S4 and S5 rows 1, 2 and 4 are green at baseline by design; S2, S3, S5 row 3 and the R8 rows are the canaries.
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { CLAUDE_ENFORCE } from "../../src/agents/enforce/claude.js";
import { CODEX_ENFORCE } from "../../src/agents/enforce/codex.js";
import { templatesDir } from "../../src/core/templates.js";
import { parseInstructions } from "../../src/kb/parse-instructions.js";
import { PAGE_CHECKS, RULE_CHECKS, runLint } from "../../src/lint/checks.js";
import { checkCommands, commandTree, doctorCheckIds, formatFinding, runAllChecks } from "./structure.js";

const LONG = 60_000;
const realDir = templatesDir();
const copies: string[] = [];
afterAll(async () => {
  while (copies.length) await rm(copies.pop()!, { recursive: true, force: true });
});

async function load(): Promise<any> {
  const m: any = await import("./structure.js");
  for (const name of ["DOCUMENTED_FORMS", "checkCoverage", "checkLintIds", "checkKbSeeds"]) {
    if (m[name] === undefined) throw new Error(`not yet implemented: ${name}`);
  }
  return m;
}
async function loadFixtures(): Promise<any> {
  let m: any;
  try {
    // @ts-ignore -- the module does not exist at baseline
    m = await import("../lint/check-fixtures.js");
  } catch (e) {
    throw new Error(`not yet implemented: test/lint/check-fixtures.ts (${(e as Error).message})`);
  }
  if (m.LINT_FIXTURES === undefined) throw new Error("not yet implemented: LINT_FIXTURES");
  return m.LINT_FIXTURES;
}
async function copyTemplates(): Promise<string> {
  const copy = await mkdtemp(path.join(os.tmpdir(), "wikeeper-s03-"));
  copies.push(copy);
  await cp(realDir, copy, { recursive: true });
  return copy;
}
const lf = (s: string): string => s.replace(/\r\n/g, "\n");
const texts = (items: any[]): string[] => items.flatMap((i) => (typeof i.value === "string" ? [i.value] : []));

describe("STORY-006-11 S1: SPRINT-03 commands and flags exist", () => {
  it("checkCommands is clean, the tree has the SPRINT-03 surface and the enforce entries resolve", async () => {
    expect((await checkCommands(realDir)).map(formatFinding)).toEqual([]);
    const setup = lf(await readFile(path.join(realDir, "system", "SETUP.md"), "utf8"));
    expect(setup).toContain("Bash(wikeeper ingest *--drop*)");
    expect(setup).toContain("Bash(wikeeper ingest *--force-unlock*)");
    const tree = commandTree();
    for (const c of ["read", "lint", "status", "rules"]) expect(tree.commands.has(c), c).toBe(true);
    expect([...tree.commands.get("rules")!.subcommands.keys()].sort()).toEqual(["list", "record"]);
    expect(tree.commands.get("search")!.options.has("--no-miss")).toBe(true);
    expect(tree.commands.get("search")!.options.has("--mark")).toBe(true);
    expect(tree.commands.get("lint")!.options.has("--rules")).toBe(true);
    expect(tree.commands.get("lint")!.options.has("--check")).toBe(true);
    expect(tree.commands.get("read")!.options.has("--out")).toBe(true);
    expect(tree.commands.get("ingest")!.subcommands.get("facts")!.has("--dry-run")).toBe(true);
    expect([...tree.commands.get("rules")!.subcommands.get("record")!].sort()).toEqual(
      ["--accepted", "--from", "--kind", "--rejected", "--summary"],
    );
    for (const mode of ["ai", "ask", "whitelist"] as const) {
      const claude = texts(CLAUDE_ENFORCE.items("CMD", mode) as any[]);
      // the `read` allow pair is ai-mode only (K7); the read-only allow rules are in every mode (decision 17)
      const wantClaude = ["Bash(wikeeper lint *)", "Bash(wikeeper status *)", "Bash(wikeeper rules list *)"];
      if (mode === "ai") wantClaude.push("Bash(wikeeper read *)");
      for (const v of wantClaude) expect(claude, `${mode}: ${v}`).toContain(v);
      const codex = texts(CODEX_ENFORCE.flatMap((s) => s.items("CMD", mode)) as any[]);
      for (const v of [
        'prefix_rule(pattern=["wikeeper","lint"], decision="allow")',
        'prefix_rule(pattern=["wikeeper","status"], decision="allow")',
        'prefix_rule(pattern=["wikeeper","rules","list"], decision="allow")',
      ]) {
        expect(codex, `${mode}: ${v}`).toContain(v);
      }
    }
  }, LONG);
});

const FORMS = [
  "read --out", "lint", "lint --rules", "lint --check", "status", "rules list",
  "rules record --accepted", "rules record --rejected", "rules record --kind", "rules record --summary",
  "rules record --from", "ingest facts --dry-run", "search --no-miss", "search --mark",
];
describe("STORY-006-11 S2: each SPRINT-03 form is named by a template", () => {
  it.each(FORMS)("%s", async (form) => {
    const m = await load();
    expect(m.DOCUMENTED_FORMS).toContain(form);
    const findings = await m.checkCoverage(realDir);
    expect(findings.filter((f: any) => f.message.includes(`"wikeeper ${form}"`)).map(formatFinding)).toEqual([]);
  }, LONG);
});

describe("STORY-006-11 S3: lint ids, finding table and kb seed", () => {
  it("ids are registered, the table matches the registry as a set, the seed parses", async () => {
    const m = await load();
    const ids = await doctorCheckIds();
    expect((await m.checkLintIds(realDir, ids)).map(formatFinding)).toEqual([]);
    expect(lf(await readFile(path.join(realDir, "system", "SETUP.md"), "utf8"))).toContain("`setup-files` finding");
    expect(lf(await readFile(path.join(realDir, "system", "WIKI.md"), "utf8"))).toContain("`ambiguous-line` finding");

    const wikiPath = (d: string): string => path.join(d, "system", "WIKI.md");
    const original = lf(await readFile(wikiPath(realDir), "utf8"));

    const reversed = await copyTemplates();
    const lines = original.split("\n");
    const start = lines.findIndex((l) => l.startsWith("| Finding | What to do |")) + 2;
    let end = start;
    while (end < lines.length && lines[end]!.startsWith("|")) end++;
    expect(end - start).toBeGreaterThan(1);
    const rev = [...lines.slice(0, start), ...lines.slice(start, end).reverse(), ...lines.slice(end)].join("\n");
    expect(rev).not.toBe(original);
    await writeFile(wikiPath(reversed), rev);
    const reversedFindings = (await m.checkLintIds(reversed, ids)).map((f: any) => f.message);
    expect(reversedFindings.filter((x: string) => x.startsWith("finding table:"))).toEqual([]);

    const wrong = await copyTemplates();
    const swapped = original.replace("| `orphan-page` |", "| `dead-link` |");
    expect(swapped).not.toBe(original);
    await writeFile(wikiPath(wrong), swapped);
    const wrongMessages = (await m.checkLintIds(wrong, ids)).map((f: any) => f.message);
    expect(wrongMessages).toContain('finding table: no row for "orphan-page"');
    expect(wrongMessages).toContain('finding table: "dead-link" is not a page check');

    expect((await m.checkKbSeeds(realDir)).map(formatFinding)).toEqual([]);
    const seed = lf(await readFile(path.join(realDir, "kb_instructions.management.md"), "utf8"));
    expect(parseInstructions(seed).issues).toEqual([]);
    expect((await runAllChecks(realDir, ids)).map(formatFinding)).toEqual([]);
  }, LONG);
});

describe("STORY-006-11 S4: the R6 re-scopes are in place (anchors by content)", () => {
  async function src(rel: string): Promise<string> {
    return lf(await readFile(path.join(process.cwd(), ...rel.split("/")), "utf8"));
  }
  it("every authorised edit is present", async () => {
    const wp = await src("test/templates/wiki-protocol.red.node.test.ts");
    expect(wp).toMatch(/"read", "lint", "status", "rules"/);
    expect(wp).toContain("one SPRINT-03 vocabulary");
    expect(wp).toContain("outside the SPRINT-03 vocabulary");
    expect(wp).toContain("Run `wikeeper publish` after every ingest.");
    expect(wp).toContain('{ ref: "wikeeper publish", line: n }');
    expect(wp).toContain("wikeeper ingest read x");
    expect(wp).toContain('"Proposing rule changes",\n  "Lint and status",\n  "Log and index",');
    expect(wp).toContain("fourteen sections");

    const setup = await src("test/templates/setup.red.node.test.ts");
    expect(setup).toContain('["doctor", "update", "setup", "ingest", "read", "lint"]');
    expect(setup).toContain("only SPRINT-03 commands");
    expect(setup).toContain("Bash(npx wikeeper read *), Bash(wikeeper read *)");
    expect(setup).toContain("Bash(wikeeper config get *)]");

    expect(await src("test/templates/onboarding.red.node.test.ts")).toContain(
      'toMatch(/\\.wiki\\/system\\/WIKI\\.md`?, section "Proposing rule changes"/)',
    );

    const aiRules = await src("test/agents/enforce-ai-rules.red.node.test.ts");
    const enforce = await src("test/agents/enforce.red.node.test.ts");
    const prompts = await src("test/agents/enforce-prompts.red.node.test.ts");
    for (const t of [aiRules, enforce]) {
      expect(t).toContain("const ASK_CLAUDE = [");
      expect(t).toContain("const PROMPT_CODEX = [");
    }
    for (const t of [aiRules, enforce, prompts]) {
      expect(t).toContain("const READ_CLAUDE");
      expect(t).toContain("const READ_CODEX");
      expect(t).toContain("const READ_ONLY_CLAUDE = [");
      expect(t).toContain("const READ_ONLY_CODEX = [");
    }
    expect(enforce).toContain("toHaveLength(13)");

    expect(await src("test/search/search-misses.red.node.test.ts")).toContain('"1 miss, 1 distinct query"');
  });
});

const S5_ROWS: Array<[string, string]> = [
  ["`wikeeper lint --fix`", '"--fix" is not an option of "lint"'],
  ["`wikeeper rules delete`", "rules delete"],
  ["`wikeeper lint --check no-such-check`", "no-such-check"],
  ["`wikeeper status --all`", "--all"],
];
describe("STORY-006-11 S5: a broken SPRINT-03 reference names the template, line and token", () => {
  for (const [reference, named] of S5_ROWS) {
    it(`${reference} -> ${named}`, async () => {
      const ids = await doctorCheckIds();
      const copy = await copyTemplates();
      const setup = path.join(copy, "system", "SETUP.md");
      let text = lf(await readFile(setup, "utf8"));
      if (!text.endsWith("\n")) text += "\n";
      const line = text.split("\n").length;
      await writeFile(setup, `${text}${reference}\n`);
      const findings = await runAllChecks(copy, ids);
      const hit = findings.filter((f) => f.file === "system/SETUP.md" && f.line === line && f.message.includes(named));
      expect(hit.map(formatFinding), `findings: ${findings.map(formatFinding).join(" | ")}`).not.toEqual([]);
    }, LONG);
  }
});

describe("STORY-006-11 R8: every lint check id has a trigger fixture and a pass fixture", () => {
  const registered = [...PAGE_CHECKS, ...RULE_CHECKS].map((c) => c.id);
  it("LINT_FIXTURES keys equal the registered ids as a set", async () => {
    const fx = await loadFixtures();
    const keys = Object.keys(fx);
    const missing = registered.filter((id) => !keys.includes(id));
    const extra = keys.filter((id) => !registered.includes(id));
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });
  it.each(registered)("%s: trigger gives a finding, pass gives none", async (id) => {
    const fx = await loadFixtures();
    const entry = fx[id];
    if (entry === undefined) throw new Error(`not yet implemented: no fixture for "${id}"`);
    const triggered = await runLint(await entry.trigger(), { scope: entry.scope, checks: [id] });
    expect(triggered.filter((f) => f.id === id).length, `trigger for ${id}`).toBeGreaterThan(0);
    const passed = await runLint(await entry.pass(), { scope: entry.scope, checks: [id] });
    expect(passed.map((f) => `${f.id}:${f.path}`), `pass for ${id}`).toEqual([]);
  }, LONG);
});
