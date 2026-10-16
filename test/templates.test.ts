import { afterAll, describe, expect, it } from "vitest";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { templatesDir } from "../src/core/templates.js";
import {
  checkSections,
  classifyWikiPath,
  commandTree,
  doctorCheckIds,
  extractCommandRefs,
  formatFinding,
  runAllChecks,
} from "./templates/structure.js";

const dir = templatesDir();
const copies: string[] = [];
afterAll(async () => {
  for (const d of copies) await rm(d, { recursive: true, force: true });
});

describe("reference extractor", () => {
  it("reads inline code spans and fenced lines, not prose", () => {
    const text = "Prose wikeeper init here.\nUse `npx wikeeper search --json foo`.\n```\nwikeeper ingest start --x\n```\n";
    expect(extractCommandRefs("a.md", text)).toEqual([
      { line: 2, words: ["search"], flags: ["--json"] },
      { line: 4, words: ["ingest", "start"], flags: ["--x"] },
    ]);
  });
  it("reads only developer_instructions lines of a TOML file, with two references on one line", () => {
    const toml = 'name = "x"\ndeveloper_instructions = """\nNever run wikeeper ingest apply or wikeeper search --misses.\n"""\n';
    expect(extractCommandRefs("a.toml", toml)).toEqual([
      { line: 3, words: ["ingest", "apply"], flags: [] },
      { line: 3, words: ["search"], flags: ["--misses"] },
    ]);
  });
  it("turns a Codex prefix_rule into the words it matches and skips placeholders", () => {
    const refs = extractCommandRefs("rules", 'prefix_rule(pattern=["npx","wikeeper","ingest","start"], decision="prompt")\n`wikeeper ingest <id>`');
    expect(refs).toEqual([
      { line: 1, words: ["ingest", "start"], flags: [] },
      { line: 2, words: ["ingest"], flags: [] },
    ]);
  });
});

describe("command-tree walker", () => {
  it("lists commands, subcommands and options without spawning the CLI", () => {
    const tree = commandTree();
    expect([...tree.rootOptions]).toEqual(expect.arrayContaining(["--json", "--version", "--help"]));
    expect(tree.commands.get("ingest")?.subcommands.has("start")).toBe(true);
    expect(tree.commands.get("search")?.subcommands.size).toBe(0);
  });
});

describe(".wiki/ path classifier", () => {
  it.each([
    [".wiki/system/WIKI.md", "system"],
    [".wiki/system/", "system"],
    [".wiki/system/MISSING.md", "unknown"],
    [".wiki/system/manifest.json", "cli"],
    [".wiki/me.md", "runtime"],
    [".wiki/pages/a/b.md", "cli"],
    [".wiki/.lock", "cli"],
    [".wiki/team.md", "unknown"],
  ])("%s -> %s", (p, kind) => {
    expect(classifyWikiPath(p, dir)).toBe(kind);
  });
});

describe("section resolver", () => {
  async function scratch(files: Record<string, string>): Promise<string> {
    const d = await mkdtemp(path.join(os.tmpdir(), "wikeeper-sec-"));
    copies.push(d);
    await cp(dir, d, { recursive: true });
    for (const [rel, text] of Object.entries(files)) await writeFile(path.join(d, ...rel.split("/")), text);
    return d;
  }
  it("resolves the five reference forms and ignores headings inside fences", async () => {
    const d = await scratch({
      "system/WIKI.md": "# W\n\n## Real\n\n```\n## Fenced\n```\n\n## Other\nsee section \"Real\".\n",
      "skills/wiki-search/SKILL.md": [
        "Read `.wiki/system/WIKI.md`, sections \"Real\" and \"Other\".",
        "Also WIKI.md, section \"Real\" and `WIKI.md, section \"Other\"`.",
        "Later, section \"Real\".",
        "Read these sections before you start: \"Real\", \"Other\" and \"Fenced\".",
        "",
      ].join("\n"),
    });
    const findings = (await checkSections(d)).filter((f) => f.file === "skills/wiki-search/SKILL.md" || f.file === "system/WIKI.md");
    expect(findings.map(formatFinding)).toEqual([
      expect.stringMatching(/^skills\/wiki-search\/SKILL\.md:4 — section "Fenced" is not a "## " heading in WIKI\.md$/),
    ]);
  });
});

describe("structural checks", () => {
  it("report findings as file:line — message", () => {
    expect(formatFinding({ file: "system/SETUP.md", line: 3, message: "m" })).toBe("system/SETUP.md:3 — m");
  });
  it("copy-mutation: a broken SETUP.md reference is reported with its line", async () => {
    const copy = await mkdtemp(path.join(os.tmpdir(), "wikeeper-tpl-"));
    copies.push(copy);
    await cp(dir, copy, { recursive: true });
    const setup = path.join(copy, "system", "SETUP.md");
    const text = (await readFile(setup, "utf8")).replace(/\r\n/g, "\n");
    await writeFile(setup, `${text.endsWith("\n") ? text : `${text}\n`}\`wikeeper ingest publish <id>\`\n`);
    const findings = await runAllChecks(copy, await doctorCheckIds());
    expect(findings.some((f) => f.file === "system/SETUP.md" && f.message.includes("ingest publish"))).toBe(true);
  }, 60_000);
});

describe("structural template tests (real templates tree)", () => {
  it("every check is clean on the package's templates", async () => {
    const findings = await runAllChecks(dir, await doctorCheckIds());
    expect(findings.map(formatFinding)).toEqual([]);
  }, 60_000);
});
