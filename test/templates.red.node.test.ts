import { afterAll, describe, expect, it } from "vitest";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { listTemplateFiles, templatesDir } from "../src/core/templates.js";

interface Finding { file: string; line: number; message: string }
interface CommandTree {
  rootOptions: Set<string>;
  commands: Map<string, { options: Set<string>; subcommands: Map<string, Set<string>> }>;
}
interface Structure {
  formatFinding(f: Finding): string;
  commandTree(): CommandTree;
  extractCommandRefs(file: string, text: string): Array<{ line: number; words: string[]; flags: string[] }>;
  checkCommands(dir: string, tree?: CommandTree): Promise<Finding[]>;
  checkDoctorIds(dir: string, ids: readonly string[]): Promise<Finding[]>;
  checkPaths(dir: string): Promise<Finding[]>;
  checkSections(dir: string): Promise<Finding[]>;
  checkFormats(dir: string): Promise<Finding[]>;
  checkCaps(dir: string): Promise<Finding[]>;
  checkParsers(dir: string): Promise<Finding[]>;
  checkPlaceholders(dir: string): Promise<Finding[]>;
  doctorCheckIds(): Promise<string[]>;
  runAllChecks(dir: string, ids: readonly string[]): Promise<Finding[]>;
}

async function load(spec: string): Promise<Structure> {
  try {
    return (await import(/* @vite-ignore */ spec)) as Structure;
  } catch (e) {
    throw new Error(`not yet implemented: ${spec} (${(e as Error).message})`);
  }
}

const SPEC = "./templates/structure.js";
const realDir = templatesDir();
const copies: string[] = [];
afterAll(async () => {
  for (const d of copies) await rm(d, { recursive: true, force: true });
});

function expectNone(s: Structure, findings: Finding[]): void {
  expect(findings.map((f) => s.formatFinding(f)), "findings").toEqual([]);
}

describe("STORY-006-06 structural template tests (real templates tree)", () => {
  it("S1: every referenced command and flag exists, and every ingest verb is a subcommand", async () => {
    const s = await load(SPEC);
    const tree = s.commandTree();
    expect(tree.rootOptions.has("--json")).toBe(true);
    expect(tree.commands.has("ingest")).toBe(true);
    expectNone(s, await s.checkCommands(realDir, tree));
    const ingestVerbs = new Set(tree.commands.get("ingest")?.subcommands.keys() ?? []);
    const bad: string[] = [];
    for (const rel of await listTemplateFiles("", realDir)) {
      const file = rel.replace(/^\//, "");
      if (!/\.(md|json|toml)$/.test(file)) continue;
      const text = await readFile(path.join(realDir, ...file.split("/")), "utf8");
      for (const ref of s.extractCommandRefs(file, text)) {
        if (ref.words[0] === "ingest" && ref.words[1] && !ingestVerbs.has(ref.words[1])) {
          bad.push(`${file}:${ref.line} ingest ${ref.words[1]}`);
        }
      }
    }
    expect(bad).toEqual([]);
    expectNone(s, await s.checkDoctorIds(realDir, await s.doctorCheckIds()));
  }, 60_000);

  it("S2: every path and section reference resolves", async () => {
    const s = await load(SPEC);
    expectNone(s, await s.checkPaths(realDir));
    expectNone(s, await s.checkSections(realDir));
  });

  describe("S3: each file kind meets its format", () => {
    const rows: Array<[string, (f: Finding) => boolean]> = [
      ["skill", (f) => f.file.startsWith("skills/")],
      ["claude sub-agent", (f) => f.file.startsWith("agents/claude/")],
      ["antigravity sub-agent", (f) => f.file.startsWith("agents/antigravity/")],
      ["codex sub-agent", (f) => f.file.startsWith("agents/codex/")],
    ];
    for (const [kind, pick] of rows) {
      it(kind, async () => {
        const s = await load(SPEC);
        expectNone(s, (await s.checkFormats(realDir)).filter(pick));
      });
    }
    it("page template and Source kinds section", async () => {
      const s = await load(SPEC);
      expectNone(s, await s.checkParsers(realDir));
    });
    it("checkFormats has no findings at all", async () => {
      const s = await load(SPEC);
      expectNone(s, await s.checkFormats(realDir));
    });
  });

  it("S4: always-loaded text stays small and no placeholder is left", async () => {
    const s = await load(SPEC);
    expectNone(s, await s.checkCaps(realDir));
    expectNone(s, await s.checkPlaceholders(realDir));
  });
});

describe("STORY-006-06 error outline: a broken reference names the template, line and token", () => {
  const rows: Array<[string, string]> = [
    ["`.wiki/system/MISSING.md`", ".wiki/system/MISSING.md"],
    ["`.wiki/team.md`", ".wiki/team.md"],
    ["`wikeeper ingest publish <id>`", "ingest publish"],
    ["`wikeeper search --owner Ana`", "--owner"],
    ['WIKI.md, section "Querying"', "Querying"],
  ];
  for (const [reference, named] of rows) {
    it(`${reference} -> ${named}`, async () => {
      const s = await load(SPEC);
      const ids = await s.doctorCheckIds();
      const copy = await mkdtemp(path.join(os.tmpdir(), "wikeeper-tpl-"));
      copies.push(copy);
      await cp(realDir, copy, { recursive: true });
      const setup = path.join(copy, "system", "SETUP.md");
      let text = (await readFile(setup, "utf8")).replace(/\r\n/g, "\n");
      if (!text.endsWith("\n")) text += "\n";
      const line = text.split("\n").length; // 1-based number of the appended line
      await writeFile(setup, `${text}${reference}\n`);
      const findings = await s.runAllChecks(copy, ids);
      const hit = findings.filter(
        (f) => f.file === "system/SETUP.md" && f.line === line && f.message.includes(named),
      );
      expect(hit.map((f) => s.formatFinding(f)), `findings: ${findings.map((f) => s.formatFinding(f)).join(" | ")}`).not.toEqual([]);
      expect(s.formatFinding(hit[0])).toBe(`system/SETUP.md:${line} — ${hit[0].message}`);
    }, 60_000);
  }
});
