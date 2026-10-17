import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { resolvePaths } from "../../src/core/paths.js";
import { templatesDir } from "../../src/core/templates.js";
import { CLAUDE_ENFORCE } from "../../src/agents/enforce/claude.js";
import { CODEX_ENFORCE } from "../../src/agents/enforce/codex.js";
import { evaluatePermission, matchesOrigin } from "../../src/ingest/permissions.js";
import { parseSourceKinds } from "../../src/ingest/kind-rules.js";
import { KB_PROPOSAL_SECTION_KEYS, KB_SECTION_KEYS, parseInstructions } from "../../src/kb/parse-instructions.js";
import { runLint } from "../../src/lint/checks.js";
import { runCli } from "../../src/program.js";
import { doctorCheckIds, runAllChecks } from "./structure.js";

// Red tests for STORY-006-10: CR-003 rules, permissions and search text.
const PKG = path.resolve(import.meta.dirname, "..", "..");
const T = path.join(PKG, "templates");
const AGENTS = ["claude", "antigravity", "codex"] as const;

async function readTpl(...parts: string[]): Promise<string> {
  let raw: string;
  try {
    raw = await readFile(path.join(T, ...parts), "utf8");
  } catch (e) {
    throw new Error(`not yet implemented: templates/${parts.join("/")} (${(e as Error).message})`);
  }
  return raw.replace(/\r\n/g, "\n");
}
const readWiki = (): Promise<string> => readTpl("system", "WIKI.md");
const readSetup = (): Promise<string> => readTpl("system", "SETUP.md");

// ---------- WIKI.md sections ----------
interface Section { name: string; text: string }

function splitSections(text: string): { headings: string[]; sections: Section[] } {
  const sections: Section[] = [];
  let cur: Section | null = null;
  let fenced = false;
  for (const line of text.split("\n")) {
    if (line.startsWith("```")) fenced = !fenced;
    const m = !fenced ? /^## (.+)$/.exec(line) : null;
    if (m) {
      cur = { name: m[1]!.trim(), text: "" };
      sections.push(cur);
    } else if (cur) cur.text += line + "\n";
  }
  return { headings: sections.map((s) => s.name), sections };
}

async function wikiSection(name: string): Promise<string> {
  const s = splitSections(await readWiki()).sections.find((x) => x.name === name);
  if (!s) throw new Error(`not yet implemented: section "${name}" is missing from WIKI.md`);
  return s.text;
}

// ---------- SETUP.md steps ----------
function steps(text: string): Array<{ n: number; body: string }> {
  const out: Array<{ n: number; body: string }> = [];
  let fenced = false;
  for (const line of text.split("\n")) {
    if (/^```/.test(line)) fenced = !fenced;
    const m = !fenced ? /^## (\d+)\. (.+?)\s*$/.exec(line) : null;
    if (m) out.push({ n: Number(m[1]), body: "" });
    else if (out.length > 0) out[out.length - 1]!.body += line + "\n";
  }
  return out;
}

function stepOf(text: string, n: number): string {
  const s = steps(text).find((x) => x.n === n);
  if (!s) throw new Error(`not yet implemented: SETUP.md step ${n} is missing`);
  return s.body;
}
const setupStep = async (n: number): Promise<string> => stepOf(await readSetup(), n);

function whitelistParagraph(text: string): string {
  const p = text.split("\n\n").find((x) => x.startsWith("In `whitelist` mode a source runs without asking"));
  if (!p) throw new Error("not yet implemented: the whitelist paragraph is missing");
  return p;
}
const squash = (s: string): string => s.replace(/\s+/g, " ").trim();

const SPANS = /`([^`]+)`/g;

/** Build the kb text from the example code spans of SETUP.md step 3, items 1-4. */
function stepExamples(setupText: string): string {
  const items = stepOf(setupText, 3).split("\n").filter((l) => /^\d+\. /.test(l)).slice(0, 4);
  if (items.length < 4) throw new Error("not yet implemented: SETUP.md step 3 has fewer than four items");
  const spansOf = (item: string, i: number): string[] => {
    const m = /\bExamples?:/.exec(item);
    if (!m) throw new Error(`not yet implemented: step 3 item ${i + 1} has no "Example:" marker`);
    const out = [...item.slice(m.index).matchAll(SPANS)].map((x) => x[1]!);
    if (out.length === 0) throw new Error(`not yet implemented: step 3 item ${i + 1} has no example code span`);
    return out;
  };
  const [q, e, k, n] = items.map(spansOf) as [string[], string[], string[], string[]];
  return [
    "# KB",
    "## Questions this wiki must answer",
    ...q,
    "## Entities",
    ...e,
    "## Source kinds",
    ...k,
    ...n,
    "",
  ].join("\n");
}

// ---------- sub-agent instruction text ----------
function instructionText(agent: (typeof AGENTS)[number], name: string, raw: string): string {
  if (agent === "codex") {
    const m = /developer_instructions = """\n([\s\S]*?)"""/.exec(raw);
    if (!m) throw new Error(`codex ${name}: no developer_instructions block`);
    return m[1]!;
  }
  const m = /^---\n[\s\S]*?\n---\n?([\s\S]*)$/.exec(raw);
  if (!m) throw new Error(`${agent} ${name}: no frontmatter`);
  return m[1]!;
}
async function agentLine(agent: (typeof AGENTS)[number], name: string, prefix: string): Promise<string> {
  const file = agent === "codex" ? `${name}.toml` : `${name}.md`;
  const text = instructionText(agent, name, await readTpl("agents", agent, file));
  const line = text.split("\n").find((l) => l.startsWith(prefix));
  if (!line) throw new Error(`${agent} ${name}: no line starting "${prefix}"`);
  return line;
}

// ---------- S1 ----------
type Part = string; // "SETUP:4" | "WIKI:<section>"
async function partText(part: Part): Promise<string> {
  if (part.startsWith("SETUP:")) return setupStep(Number(part.slice(6)));
  return wikiSection(part.slice(5));
}

const ROWS: Array<[string, Part, string[]]> = [
  ["C1 (R3) SETUP", "SETUP:4", ["`wikeeper ingest abort <id> --drop`", "`wikeeper ingest apply <id> --force-unlock`", "every `wikeeper ingest abort`"]],
  ["C1 (R3) WIKI", "WIKI:Register", ["Permission prompts", "--force-unlock", "not a second approval"]],
  ["C2 (R1)", "SETUP:4", ["everything else is denied (exit code 4)"]],
  ["C3 (R2)", "WIKI:Register", ["exit code 3", "same path and size", "plan approval"]],
  ["D1 (R4)", "SETUP:3", ["`Q<n> <question>`", "`<entity> <fields> → <page> <question refs>`", "`<kind-id> (v1) → <targets>`"]],
  ["D2 (R5)", "SETUP:3", ["`note:`", "never reads a `note:` line as a rule"]],
  ["D3 (R6) triage", "WIKI:Triage and extract", ["bare target", "`entity.field`", "`note:`"]],
  ["D3 (R6) proposing", "WIKI:Proposing rule changes", ["(dated facts)", "wikeeper search --since", "wikeeper lint --rules", ".wiki/system/SETUP.md"]],
  ["kind (R7)", "WIKI:Proposing rule changes", ["`capture-signals`", "`write-policy`", "`never-capture`", "`- YYYY-MM-DD: <kind> v<N>: <change>`"]],
  ["A1 (R8)", "WIKI:Search", ["--no-miss", "triage"]],
  ["A5 (R9)", "WIKI:Search", ["wikeeper search --mark tentative", "`status::`", "frontmatter", "`--since` and `--mark`"]],
];

describe("STORY-006-10 S1: each walkthrough item lands in its file and part", () => {
  it.each(ROWS)("%s", async (_item, part, phrases) => {
    const text = await partText(part);
    for (const p of phrases) expect(text, `${part}: ${p}`).toContain(p);
  });
});

// ---------- S2 ----------
const OPTS = { homeDir: "/home/user" };
const WL_ROWS: Array<[string, string, "file" | "url" | "stdin", boolean]> = [
  ["docs/meetings/**", "docs/meetings/2026/q4.md", "file", true],
  ["./docs/meetings/**", "docs/meetings/q4.md", "file", false],
  ["~/Documents/notes/*.md", "/home/user/Documents/notes/a.md", "file", true],
  ["~/Documents/notes/*.md", "/home/user/Documents/notes/2026/a.md", "file", false],
  ["docs.example.com", "https://DOCS.example.com:8443/a", "url", true],
  ["*.example.com", "https://a.example.com/x", "url", true],
  ["*.example.com", "https://example.com/x", "url", false],
  ["docs/meetings/**", "stdin", "stdin", false],
];

describe("STORY-006-10 S2: the whitelist format is stated once, identically, and holds under matchesOrigin", () => {
  it("both copies are identical and name the denial and the chat-capture rule", async () => {
    const wiki = whitelistParagraph(await wikiSection("Register"));
    const setupText = await readSetup();
    const setup = whitelistParagraph(stepOf(setupText, 4));
    expect(squash(wiki)).toBe(squash(setup));
    for (const s of [
      "any other source is denied (exit code 4), even with `--approved`",
      "a chat capture (`wikeeper ingest start -`)",
      "`ingest.whitelist.kinds`",
      "denied at `wikeeper ingest start`",
    ]) expect(wiki, s).toContain(s);
    expect(stepOf(setupText, 4)).toContain("everything else is denied (exit code 4)");
    const paras = stepOf(setupText, 4).split("\n\n");
    const after = paras[paras.findIndex((p) => p.startsWith("In `whitelist` mode a source runs")) + 1] ?? "";
    for (const s of ["chat captures", "`chat-excerpt`", "`ingest.whitelist.kinds`"]) expect(after, s).toContain(s);

    const req = { origin: "stdin", originType: "stdin", kind: null, approved: false } as const;
    const withKind = evaluatePermission({ permission: "whitelist", whitelist: { kinds: ["chat-excerpt"], origins: ["docs/meetings/**"] } }, req);
    expect(withKind.decision).toBe("allowed");
    expect(withKind.kind_pending).toBe(true);
    expect(evaluatePermission({ permission: "whitelist", whitelist: { kinds: [], origins: ["docs/meetings/**"] } }, req).decision).toBe("denied");
  });

  it.each(WL_ROWS)("entry %s vs %s (%s) -> %s", async (entry, origin, type, result) => {
    const p = whitelistParagraph(await wikiSection("Register"));
    expect(p).toContain(entry);
    expect(matchesOrigin(entry, origin, type, OPTS)).toBe(result);
  });
});

// ---------- S3 ----------
const ctx = (kb: ReturnType<typeof parseInstructions>) => ({
  paths: resolvePaths(path.join(os.tmpdir(), "m4-kb"), DEFAULT_CONFIG),
  config: structuredClone(DEFAULT_CONFIG),
  pages: [],
  kb,
  log: [],
  now: new Date("2026-10-20T00:00:00Z"),
});

describe("STORY-006-10 S3: kb formats, proposal kinds and the changelog form agree with the parser and the rule checks", () => {
  it("the step 3 examples parse with no issue", async () => {
    const r = parseInstructions(stepExamples(await readSetup()));
    expect(r.issues).toEqual([]);
    expect(r.questions.map((q) => q.id)).toEqual(["Q1", "Q2", "Q3"]);
    expect(r.questions.filter((q) => q.datedFacts).map((q) => q.id)).toEqual(["Q3"]);
    expect(r.entities.map((e) => e.name)).toEqual(["initiative", "decision"]);
    expect(r.kinds.map((k) => [k.id, k.version])).toEqual([["meeting-notes", 1]]);
    expect(r.notes.length).toBe(1);
  });

  it("the section keys named in Proposing rule changes are exactly KB_PROPOSAL_SECTION_KEYS", async () => {
    const text = await wikiSection("Proposing rule changes");
    const named = new Set([...text.matchAll(SPANS)].map((m) => m[1]!.trim()).filter((s) => (KB_SECTION_KEYS as readonly string[]).includes(s)));
    expect([...named].sort()).toEqual([...KB_PROPOSAL_SECTION_KEYS].sort());
  });

  it("(i) a (dated facts) question is not reported by question-without-rule", async () => {
    const r = parseInstructions(stepExamples(await readSetup()));
    expect(await runLint(ctx(r), { scope: "rules", checks: ["question-without-rule"] })).toEqual([]);
  });

  it("(ii) a v2 kind with its changelog line gives no changelog-version-mismatch", async () => {
    const base = stepExamples(await readSetup()).replace("(v1)", "(v2)");
    const text = await wikiSection("Proposing rule changes");
    const line = [...text.matchAll(SPANS)].map((m) => m[1]!).find((s) => /^- \d{4}-\d{2}-\d{2}: /.test(s));
    expect(line, "a changelog example span").toBeDefined();
    const kb = parseInstructions(`${base}## Rule changelog\n${line}\n`);
    expect(await runLint(ctx(kb), { scope: "rules", checks: ["changelog-version-mismatch"] })).toEqual([]);
  });

  it("(iii) control: a v2 kind without a changelog line gives one changelog-version-mismatch", async () => {
    const kb = parseInstructions(stepExamples(await readSetup()).replace("(v1)", "(v2)"));
    const f = await runLint(ctx(kb), { scope: "rules", checks: ["changelog-version-mismatch"] });
    expect(f.map((x) => x.id)).toEqual(["changelog-version-mismatch"]);
  });

  it("the seed parses clean, keeps one comment per drafted section and gains the formats", async () => {
    const seed = await readTpl("kb_instructions.management.md");
    expect(parseInstructions(seed).issues).toEqual([]);
    expect(parseSourceKinds(seed)).toEqual([]);
    const comments = seed.split("\n").filter((l) => /^<!--.*SETUP\.md.*step 3.*-->$/.test(l));
    expect(comments.length).toBe(3);
    expect(comments.join("\n")).toContain("One line each: Q<n> <question>, ending in (dated facts) when dated facts answer it.");
    expect(comments.join("\n")).toContain("One line each: <entity> <fields> → <page> <question refs>.");
    expect(comments.join("\n")).toContain("One line each: <kind-id> (v1) → <targets>; note: lines hold routing notes and exclusions.");
  });

  it("the profile keeps five Q lines, states the formats, and holds only kind rules and one-line comments under Source kinds", async () => {
    const profile = await readTpl("system", "profiles", "management.md");
    const parts = profile.split(/^## /m);
    const questions = (parts.find((p) => p.startsWith("Questions")) ?? "").split("\n");
    expect(questions.filter((l) => /^Q\d+\s+\S/.test(l)).length).toBe(5);
    expect(questions.join("\n")).toContain("Each line reads `Q<n> <question>`.");
    const kinds = (parts.find((p) => p.startsWith("Source kinds")) ?? "").split("\n").slice(1).filter((l) => l.trim() !== "");
    expect(kinds.length).toBeGreaterThan(0);
    expect(kinds[0]).toMatch(/^<!--.*note:.*-->$/);
    const rules = new Set(parseSourceKinds(profile).map((r) => r.line));
    const lineNo = (l: string): number => profile.split("\n").indexOf(l) + 1;
    for (const l of kinds) expect(rules.has(lineNo(l)) || /^<!--.*-->$/.test(l), l).toBe(true);
  });
});

// ---------- S4 ----------
const roots: string[] = [];
afterEach(async () => {
  while (roots.length) await rm(roots.pop()!, { recursive: true, force: true, maxRetries: 3 });
});

async function drive(root: string, args: string[]): Promise<{ code: number; out: string }> {
  let out = "";
  const stdout = new Writable({ write(c, _e, cb) { out += String(c); cb(); } });
  const stderr = new Writable({ write(c, _e, cb) { out += String(c); cb(); } });
  const code = await runCli(args, { io: { cwd: root, stdout, stderr, stdin: Readable.from([]) } as never });
  return { code, out };
}

describe("STORY-006-10 S4: triage searches skip miss logging, and the prompt and search text match the CLI", () => {
  it("WIKI.md triage step 1, every extractor step 1 and every writer step 2 name wikeeper search --no-miss", async () => {
    const triage = (await wikiSection("Triage and extract")).split("\n").find((l) => l.startsWith("1. ")) ?? "";
    expect(triage).toContain("--no-miss");
    for (const a of AGENTS) {
      expect(await agentLine(a, "wiki-extractor", "1. "), `${a} extractor`).toContain("wikeeper search --no-miss");
      expect(await agentLine(a, "wiki-writer", "2. "), `${a} writer`).toContain("wikeeper search --no-miss");
    }
    expect(await readTpl("skills", "wiki-search", "SKILL.md")).not.toContain("--no-miss");
  });

  it("the ai items hold the Claude ask rules and the Codex abort prompt, and no apply rule", () => {
    const claude = CLAUDE_ENFORCE.items("cmd", "ai").map((i) => i.identity);
    expect(claude.some((i) => i.startsWith("permissions.ask[") && i.includes("--drop"))).toBe(true);
    expect(claude.some((i) => i.startsWith("permissions.ask[") && i.includes("--force-unlock"))).toBe(true);
    const lines = CODEX_ENFORCE.flatMap((s) => s.items("cmd", "ai")).map((i) => String(i.value)).filter((v) => v.startsWith("prefix_rule("));
    const tokens = (l: string): string[] => {
      const m = /pattern=\[([^\]]*)\]/.exec(l);
      const t = (m?.[1] ?? "").split(",").map((x) => x.trim().replace(/^"|"$/g, ""));
      return t[0] === "npx" ? t.slice(1) : t;
    };
    const prompts = lines.filter((l) => l.includes('decision="prompt"')).map(tokens);
    expect(prompts).toContainEqual(["wikeeper", "ingest", "abort"]);
    expect(lines.map(tokens).some((t) => t[0] === "wikeeper" && t[1] === "ingest" && t[2] === "apply")).toBe(false);
  });

  it("search with a text query and --mark exits 2 with usage", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "m4-mark-"));
    roots.push(root);
    await mkdir(path.join(root, ".git"), { recursive: true });
    expect((await drive(root, ["init", "--yes", "--agents", "claude", "--json"])).code).toBe(0);
    const r = await drive(root, ["search", "vendor", "--mark", "tentative", "--json"]);
    expect(r.code).toBe(2);
    const j = JSON.parse(r.out.trim().split("\n").filter(Boolean).pop() ?? "{}") as { command?: string; error?: { code?: string; message?: string } };
    expect(j.command).toBe("search");
    expect(j.error?.code).toBe("usage");
    expect(j.error?.message).toContain("--mark");
    // The text must say the same.
    expect(await wikiSection("Search")).toMatch(/--mark[\s\S]*refuses it \(exit code 2\)/);
  }, 20_000);

  it("the structural checks report no finding", async () => {
    expect(await runAllChecks(templatesDir(), await doctorCheckIds())).toEqual([]);
  }, 60_000);

  it("WIKI.md keeps its size cap and thirteen sections, and the agent block keeps its cap", async () => {
    const wiki = await readWiki();
    expect(wiki.split("\n").length).toBeLessThanOrEqual(400);
    const { headings } = splitSections(wiki);
    const expected = ["Ingest", "Register", "Triage and extract", "Write phase", "Facts file", "Brief", "Page format", "Delegation", "Ambient offers", "Search", "Answering questions", "Proposing rule changes", "Log and index"];
    let i = 0;
    for (const h of headings) if (h === expected[i]) i++;
    expect(i).toBe(expected.length);
    const block = await readTpl("agent-block.md");
    expect(block.trimEnd().split("\n").length).toBeLessThanOrEqual(14);
    expect(block).toContain("## Project Wiki");
    expect(block).toContain(".wiki/system/WIKI.md");
    // This story must add its text: the rules paragraph is the marker that the Developer ran.
    expect(wiki).toContain("In `whitelist` mode a source runs without asking");
  });
});

// ---------- S5 ----------
describe("STORY-006-10 S5: a broken kb example is caught", () => {
  it("an entity example that refers to Q9 gives unknown-question-ref on that line", async () => {
    const setupText = await readSetup();
    const broken = setupText.replace("decisions.md Q2", "decisions.md Q9");
    expect(broken).not.toBe(setupText);
    const kbText = stepExamples(broken);
    const n = kbText.split("\n").findIndex((l) => l.startsWith("decision ")) + 1;
    expect(n).toBeGreaterThan(0);
    const issue = parseInstructions(kbText).issues.find((i) => i.code === "unknown-question-ref");
    expect(issue?.line).toBe(n);
  });
});
