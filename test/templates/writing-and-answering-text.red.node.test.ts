import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { chmod } from "node:fs/promises";
import { normaliseBlock } from "../../src/agents/inject.js";
import { SHIPPED_BLOCKS } from "../../src/agents/shipped-blocks.js";
import { setConfigValue } from "../../src/core/config.js";
import { templatesDir } from "../../src/core/templates.js";
import { runCli } from "../../src/program.js";
import type { Fact } from "../../src/wiki/parse-page.js";
import { parsePage } from "../../src/wiki/parse-page.js";
import { doctorCheckIds, runAllChecks } from "./structure.js";

// Red tests for STORY-006-12: CR-003 writing, answering and onboarding text; pointer-block lines (R14).
const TPL = templatesDir();
const T = 30_000;

const SPRINT02_HEADINGS = [
  "Ingest",
  "Register",
  "Triage and extract",
  "Write phase",
  "Facts file",
  "Brief",
  "Page format",
  "Delegation",
  "Ambient offers",
  "Search",
  "Answering questions",
  "Proposing rule changes",
  "Log and index",
];

const tmpDirs: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});

// ---------- helpers ----------
const norm = (s: string): string => s.replace(/\r\n/g, "\n");

async function readTpl(...rel: string[]): Promise<string> {
  try {
    return norm(await readFile(path.join(TPL, ...rel), "utf8"));
  } catch (e) {
    throw new Error(`not yet implemented: templates/${rel.join("/")} (${(e as Error).message})`);
  }
}

interface Fence { info: string; body: string }
interface Section { name: string; text: string; fences: Fence[] }

function splitSections(text: string): { headings: string[]; sections: Section[] } {
  const sections: Section[] = [];
  let cur: Section | null = null;
  let fence: Fence | null = null;
  for (const line of text.split("\n")) {
    if (line.startsWith("```")) {
      if (fence === null) fence = { info: line.slice(3).trim(), body: "" };
      else {
        cur?.fences.push(fence);
        fence = null;
      }
      if (cur) cur.text += line + "\n";
      continue;
    }
    if (fence !== null) {
      fence.body += line + "\n";
      if (cur) cur.text += line + "\n";
      continue;
    }
    const m = /^## (.+)$/.exec(line);
    if (m) {
      cur = { name: m[1]!.trim(), text: "", fences: [] };
      sections.push(cur);
      continue;
    }
    if (cur) cur.text += line + "\n";
  }
  return { headings: sections.map((s) => s.name), sections };
}

async function wikiSection(name: string): Promise<Section> {
  const s = splitSections(await readTpl("system", "WIKI.md")).sections.find((x) => x.name === name);
  if (!s) throw new Error(`not yet implemented: section "${name}" is missing from WIKI.md`);
  return s;
}

interface Step { n: number; title: string; body: string }
function steps(text: string): Step[] {
  const out: Step[] = [];
  let fenced = false;
  for (const line of text.split("\n")) {
    if (/^```/.test(line)) fenced = !fenced;
    const m = !fenced ? /^## (\d+)\. (.+?)\s*$/.exec(line) : null;
    if (m) out.push({ n: Number(m[1]), title: m[2]!, body: "" });
    else if (out.length > 0) out[out.length - 1]!.body += line + "\n";
  }
  return out;
}
async function setupStep(n: number): Promise<string> {
  const s = steps(await readTpl("system", "SETUP.md")).find((x) => x.n === n);
  if (!s) throw new Error(`not yet implemented: SETUP.md step ${n}`);
  return s.body;
}
async function onboardingStep(n: number): Promise<string> {
  const s = steps(await readTpl("system", "ONBOARDING.md")).find((x) => x.n === n);
  if (!s) throw new Error(`not yet implemented: ONBOARDING.md step ${n}`);
  return s.body;
}

/** Top-level `key = "value"` lines plus one `developer_instructions = """..."""` block (copied from skills-subagents.red). */
function readTomlLines(text: string): { fields: Record<string, string>; instructions: string } {
  const fields: Record<string, string> = {};
  let inBlock = false;
  const block: string[] = [];
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    if (inBlock) {
      if (line.includes('"""')) { inBlock = false; continue; }
      block.push(line);
      continue;
    }
    if (line === "" || line.startsWith("#")) continue;
    if (line.startsWith('developer_instructions = """')) { inBlock = true; fields.developer_instructions = ""; continue; }
    const m = /^([a-z_]+) = "([^"\n]*)"$/.exec(line);
    if (m) fields[m[1]!] = m[2]!;
  }
  return { fields, instructions: block.join("\n") };
}

const AGENTS = ["claude", "antigravity", "codex"] as const;
async function instructionText(agent: (typeof AGENTS)[number], name: "wiki-writer" | "wiki-extractor"): Promise<string> {
  if (agent === "codex") return readTomlLines(await readTpl("agents", "codex", `${name}.toml`)).instructions.trim();
  const raw = await readTpl("agents", agent, `${name}.md`);
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
  if (!m) throw new Error(`no frontmatter in ${agent}/${name}.md`);
  return m[2]!.trim();
}

/** The first fact whose date is earlier than the previous fact's, or null. */
function dateOrderViolation(facts: readonly Fact[]): Fact | null {
  for (let i = 1; i < facts.length; i++) if (facts[i]!.date < facts[i - 1]!.date) return facts[i]!;
  return null;
}

async function pageFormatFence(): Promise<string> {
  const f = (await wikiSection("Page format")).fences.filter((x) => x.info === "md")[0];
  if (!f) throw new Error('not yet implemented: no md fence in WIKI.md section "Page format"');
  return f.body;
}

// ---------- CLI driver ----------
async function drive(root: string, args: string[], stdin?: string) {
  let out = "";
  const stdout = new Writable({ write(c, _e, cb) { out += String(c); cb(); } });
  const stderr = new Writable({ write(_c, _e, cb) { cb(); } });
  const input = Object.assign(Readable.from(stdin === undefined ? [] : [Buffer.from(stdin)]), { isTTY: false });
  const code = await runCli(args, { io: { cwd: root, stdout, stderr, stdin: input } as never });
  let json: any = null;
  try {
    json = JSON.parse(out.trim().split("\n")[0]!);
  } catch {
    /* human output */
  }
  return { code, json, out };
}
async function tmpRepo(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  tmpDirs.push(root);
  await mkdir(path.join(root, ".git"), { recursive: true });
  return root;
}
async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}
async function pathWithWikeeper(): Promise<void> {
  const bin = await mkdtemp(path.join(os.tmpdir(), "wk-bin-"));
  tmpDirs.push(bin);
  if (process.platform === "win32") {
    await writeFile(path.join(bin, "wikeeper.cmd"), "@echo off\r\n");
    vi.stubEnv("PATHEXT", ".CMD");
  } else {
    const file = path.join(bin, "wikeeper");
    await writeFile(file, "#!/bin/sh\nexit 0\n");
    await chmod(file, 0o755);
  }
  vi.stubEnv("PATH", bin);
}

// ---------- the R14 block ----------
const BLOCK_LINES = [
  "<!-- WIKI:START v1 — managed by wikeeper -->",
  "## Project Wiki",
  "Managed by wikeeper — edit outside this block only.",
  "This repo has a knowledge wiki in `.wiki/`; its content folder is set by `content_dir` in `.wiki/config.yml`.",
  "If `.wiki/config.yml` has no `setup_completed_at`, follow `.wiki/system/SETUP.md` first.",
  "Otherwise read `.wiki/system/WIKI.md` before ingesting, searching or editing anything in the wiki (skills: `wiki-ingest`, `wiki-search`).",
  "At the start of every session read `.wiki/me.md` and `.wiki/project.md`; if `.wiki/me.md` is missing, first onboard the user with `.wiki/system/ONBOARDING.md`.",
  "Before you answer a question about the project or draft material for it, search the wiki with `wikeeper search`, even when the user does not mention the wiki.",
  "When a decision, a date, an owner or a commitment comes up in conversation and is not in the wiki, offer to capture it (`.wiki/system/WIKI.md`, section \"Ambient offers\").",
  "Wiki pages change only in an ingest's write phase, between `wikeeper ingest apply <id>` and `wikeeper ingest finish <id>`.",
  "If `wikeeper ingest` is unavailable, do not write pages; tell the user.",
  "You may edit, with the user's approval: `.wiki/config.yml`, `.wiki/kb_instructions.md`, `.wiki/me.md`, `.wiki/project.md`.",
  "Package-owned, never edit: `.wiki/system/`, the wiki skills, the wiki sub-agents and wikeeper's entries in agent settings files.",
  "<!-- WIKI:END -->",
];
// SPRINT-04 (STORY-007-07 R1, reworded by BUG-003 Q1 and BUG-004 Q6): only line 4 differs from the SPRINT-03 block above
const LINE_4_SPRINT_04 =
  "Once set up, start each session with `wikeeper statusline` and write its line before any other step or text; on 🔴 follow WIKI.md \"Lint and status\".";
const LINE_3_SPRINT_04 =
  "Managed by wikeeper — edit outside this block only. Wiki: `.wiki/`, content folder `content_dir` in `.wiki/config.yml`.";
const PINS = [
  "4f32351f65f803b265a2bbca697724e6f06738c71680622e8267efc23078fb1b",
  "9bc080837857cacb59c42db9907fad82a148e1c000973d5f08792a7d62295d66",
  "c6fc17d0ef7079d7cf7e6f88f6e5c28e8152cdb74880118167bb29eaf333e168",
];
const sha = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

// ---------- S1: each walkthrough item lands in its file and part ----------
type Part = () => Promise<string>;
const meComment = async (): Promise<string> =>
  (await readTpl("system", "templates", "me.md")).split("\n").filter((l) => /^<!--.*-->$/.test(l)).join("\n");
const blockLine = (i: number): Part => async () => (await readTpl("agent-block.md")).split("\n")[i] ?? "";

const ROWS: Array<{ item: string; part: Part; phrases: string[] }> = [
  { item: "E1 (R1)", part: async () => (await wikiSection("Answering questions")).text, phrases: [".wiki/project.md", "uncited", "cited page wins"] },
  { item: "E2 (R2)", part: async () => (await wikiSection("Write phase")).text, phrases: ["wikeeper lint", "`unlogged-change` finding", "shell write"] },
  { item: "E3 (R3)", part: async () => (await wikiSection("Write phase")).text, phrases: ["not sources", "only when a fact carries it"] },
  { item: "B1 (R4)", part: async () => (await wikiSection("Write phase")).text, phrases: ["fact lines dropped", "new dated line", "exactly as it was"] },
  { item: "E5 (R5)", part: async () => (await wikiSection("Write phase")).text, phrases: ["wikeeper ingest start -", "correction", "change nothing under `pages/`"] },
  { item: "E4 (R6)", part: async () => (await wikiSection("Page format")).text, phrases: ["oldest first"] },
  { item: "E7 (R8)", part: async () => (await wikiSection("Triage and extract")).text, phrases: ["initiatives/initiative-005.md", "slug"] },
  { item: "E8 (R9)", part: async () => (await wikiSection("Triage and extract")).text, phrases: ["read … for the rest", "decides"] },
  { item: "E9a (R10) me.md", part: meComment, phrases: ["## Other"] },
  { item: "E9a (R10) ONBOARDING", part: () => onboardingStep(4), phrases: ["## Other"] },
  { item: "E10a (R11)", part: () => onboardingStep(2), phrases: ['`.wiki/system/WIKI.md`, section "Proposing rule changes"'] },
  { item: "E10b (R12)", part: () => setupStep(4), phrases: ["enforce: false", "wikeeper update"] },
  { item: "D22 (R14) line 8", part: blockLine(7), phrases: ["search the wiki with `wikeeper search`", "even when the user does not mention the wiki"] },
  { item: "D22 (R14) line 9", part: blockLine(8), phrases: ["offer to capture it", '`.wiki/system/WIKI.md`, section "Ambient offers"'] },
  {
    item: "D25 (R15)",
    part: async () => (await wikiSection("Ambient offers")).text,
    phrases: ["wikeeper ingest start - --kind <kind>", "`.wiki/kb_instructions.md`", "chat captures", 'section "Register"'],
  },
];

describe("STORY-006-12 S1: each walkthrough item lands in its file and part (red)", () => {
  for (const row of ROWS) {
    it(`${row.item}`, async () => {
      const text = await row.part();
      for (const p of row.phrases) expect(text, `missing ${JSON.stringify(p)}`).toContain(p);
    });
  }
});

// ---------- S2: the fact-line rules are what finish enforces ----------
describe("STORY-006-12 S2: fact-line rules", () => {
  it("the text says to add a new dated line, and finish refuses an in-place change then accepts the recovery", async () => {
    const write = (await wikiSection("Write phase")).text;
    for (const p of ["fact lines dropped", "new dated line", "exactly as it was"]) expect(write).toContain(p);
    for (const agent of AGENTS) {
      const t = await instructionText(agent, "wiki-writer");
      for (const p of ["add a new dated line", "leave the old line as it is", "put a dropped fact line back exactly as it was"]) {
        expect(t, `${agent} writer lacks ${JSON.stringify(p)}`).toContain(p);
      }
    }

    // live run
    const root = await tmpRepo("wk-s2-");
    expect((await drive(root, ["init", "--yes", "--agents", "claude", "--json"])).code).toBe(0);
    await setConfigValue(root, "ingest.permission", "ai");
    await writeFile(path.join(root, "notes-1.md"), "atlas notes one\n");
    await writeFile(path.join(root, "notes-2.md"), "atlas notes two\n");
    const pagesDir = path.join(root, ".wiki", "pages");
    const put = async (rel: string, body: string): Promise<void> => {
      const f = path.join(pagesDir, ...rel.split("/"));
      await mkdir(path.dirname(f), { recursive: true });
      await writeFile(f, body);
    };
    const fact = (value: string, asOf: string) => ({
      entity: "project:atlas",
      field: "status",
      value,
      status: "decided",
      as_of: asOf,
      anchor: "p.1",
      page: "projects/atlas.md",
      exists: true,
    });
    const start = async (file: string, facts: unknown[]): Promise<string> => {
      const s = await drive(root, ["ingest", "start", file, "--kind", "status-report", "--approved", "--json"]);
      expect(s.code).toBe(0);
      const id = s.json.data.id as string;
      await writeFile(
        path.join(root, `facts-${id}.json`),
        JSON.stringify({ source_id: id, kind: "status-report", rule_version: null, new_entities: [], uncovered: [], facts }),
      );
      expect((await drive(root, ["ingest", "facts", id, "--file", `facts-${id}.json`, "--json"])).code).toBe(0);
      expect((await drive(root, ["ingest", "apply", id, "--json"])).code).toBe(0);
      return id;
    };
    const sourcePage = (id: string) => `---\ntype: source\ntitle: Notes\nsources: [${id}]\n---\n# Notes\n`;
    const head = "---\ntype: project\ntitle: Atlas\nsummary: Atlas project\n---\n# Atlas\n\n## Facts\n\n";

    const idA = await start("notes-1.md", [fact("kickoff", "2026-09-30"), fact("vendor call", "2026-10-14"), fact("status", "2026-10-15")]);
    const lineA = (d: string, t: string) => `- ${d} · decided · ${t} [[${idA}]]`;
    await put(
      "projects/atlas.md",
      head + [lineA("2026-09-30", "Scope is the portal."), lineA("2026-10-14", "Vendor call held."), lineA("2026-10-15", "Launch targets March.")].join("\n") + "\n",
    );
    await put(`sources/${idA}.md`, sourcePage(idA));
    expect((await drive(root, ["ingest", "finish", idA, "--json"])).code).toBe(0);

    const idB = await start("notes-2.md", [fact("corrected", "2026-10-16")]);
    const original = lineA("2026-10-14", "Vendor call held.");
    const kept = [lineA("2026-09-30", "Scope is the portal."), original, lineA("2026-10-15", "Launch targets March.")];
    // change the date of one line in place
    await put(
      "projects/atlas.md",
      head + [kept[0], lineA("2026-10-13", "Vendor call held."), kept[2], `- 2026-10-16 · decided · Launch moves to April. [[${idB}]]`].join("\n") + "\n",
    );
    await put(`sources/${idB}.md`, sourcePage(idB));
    const refused = await drive(root, ["ingest", "finish", idB, "--json"]);
    expect(refused.code).toBe(1);
    expect(refused.json.error.code).toBe("validation_failed");
    expect((refused.json.error.details.dropped as Array<{ line: string }>).some((d) => d.line === original)).toBe(true);
    expect(await exists(path.join(root, ".wiki", ".lock"))).toBe(true);

    // restore, add the corrected fact as a new dated line, in date order
    await put(
      "projects/atlas.md",
      head + [...kept, `- 2026-10-16 · decided · Launch moves to April. [[${idB}]]`].join("\n") + "\n",
    );
    expect((await drive(root, ["ingest", "finish", idB, "--json"])).code).toBe(0);
  }, T);
});

// ---------- S3: the skill, the sub-agents, SETUP.md and the pointer block agree with WIKI.md and the CLI ----------
describe("STORY-006-12 S3: interfaces", () => {
  it("the skill names the same actors as each Delegation row and drops 'Every write phase'", async () => {
    const delegation = (await wikiSection("Delegation")).text;
    const rows = delegation
      .split("\n")
      .filter((l) => l.startsWith("|"))
      .map((l) => l.split("|").slice(1, -1).map((c) => c.trim()))
      .filter((c) => c.length === 3 && c[0] !== "Case" && !/^-+$/.test(c[0]!));
    expect(rows.length).toBe(4);
    const prefix: Record<string, string> = {
      "File shared in chat": "- A file shared in chat:",
      "Something said in chat": "- Something said in chat:",
      Directory: "- A directory:",
      Link: "- A link:",
    };
    const skill = await readTpl("skills", "wiki-ingest", "SKILL.md");
    expect(skill).not.toContain("Every write phase");
    const lines = skill.split("\n");
    for (const [caseName, triage, write] of rows as Array<[string, string, string]>) {
      const p = prefix[caseName];
      expect(p, `unknown Delegation case ${caseName}`).toBeDefined();
      const bullet = lines.find((l) => l.startsWith(p!));
      expect(bullet, `skill has no bullet starting ${p}`).toBeDefined();
      expect(bullet!.includes("`wiki-extractor`"), `${caseName}: wiki-extractor`).toBe(triage.includes("wiki-extractor"));
      expect(bullet!.includes("`wiki-writer`"), `${caseName}: wiki-writer`).toBe(write.includes("wiki-writer"));
      expect(/\byou\b/.test(bullet!), `${caseName}: main agent ('you')`).toBe(`${triage} ${write}`.includes("main agent"));
    }
  });

  it("every extractor's return line names a source that only points to another file", async () => {
    for (const agent of AGENTS) {
      const t = await instructionText(agent, "wiki-extractor");
      const line = t.split("\n").find((l) => l.startsWith("Return to the parent:"));
      expect(line, `${agent} extractor has no return line`).toBeDefined();
      expect(line!).toContain("only points to another file");
    }
  });

  it("enforce: false and wikeeper update remove wikeeper's hook and rules, as SETUP.md step 4 says", async () => {
    await pathWithWikeeper();
    const root = await tmpRepo("wk-enf-");
    expect((await drive(root, ["init", "--yes", "--enforce", "--agents", "claude,codex", "--json"])).code).toBe(0);
    await setConfigValue(root, "ingest.permission", "ai");
    expect((await drive(root, ["update", "--json"])).code).toBe(0);
    await setConfigValue(root, "enforce", false);
    expect((await drive(root, ["update", "--json"])).code).toBe(0);
    const manifest = JSON.parse(await readFile(path.join(root, ".wiki", "system", "manifest.json"), "utf8"));
    expect(manifest.files.filter((f: any) => f.kind === "hook" || f.kind === "rule")).toEqual([]);
    expect((await drive(root, ["doctor"])).out).toContain("enforce: off");
    for (const rel of [".claude/settings.json", ".codex/hooks.json", ".codex/rules/wikeeper.rules"]) {
      const f = path.join(root, ...rel.split("/"));
      if (!(await exists(f))) continue;
      const text = await readFile(f, "utf8");
      expect(text, `${rel} still holds the guard hook`).not.toContain("hook guard");
      expect(text, `${rel} still holds a wikeeper rule`).not.toMatch(/Bash\([^)]*wikeeper |prefix_rule\([^)]*wikeeper/);
    }
  }, T);

  it("update gives a SPRINT-02 pointer block the R14 text", async () => {
    const root = await tmpRepo("wk-refresh-");
    expect((await drive(root, ["init", "--yes", "--agents", "claude", "--json"])).code).toBe(0);
    const file = path.join(root, "AGENTS.md");
    const text = norm(await readFile(file, "utf8"));
    const lines = text.split("\n");
    const start = lines.findIndex((l) => l.startsWith("<!-- WIKI:START"));
    const end = lines.findIndex((l) => l === "<!-- WIKI:END -->");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const old = SHIPPED_BLOCKS[1];
    expect(old).toBeDefined();
    await writeFile(file, [...lines.slice(0, start), ...old!.split("\n"), ...lines.slice(end + 1)].join("\n"));
    const u = await drive(root, ["update", "--json"]);
    expect(u.code).toBe(0);
    expect(u.json.data.replaced).toContain("AGENTS.md#wiki-block");
    const after = norm(await readFile(file, "utf8")).split("\n");
    const s2 = after.findIndex((l) => l.startsWith("<!-- WIKI:START"));
    const e2 = after.findIndex((l) => l === "<!-- WIKI:END -->");
    const span = after.slice(s2, e2 + 1).join("\n");
    expect(normaliseBlock(span)).toBe(normaliseBlock(await readTpl("agent-block.md")));
  }, T);
});

// ---------- S4: examples and templates keep their shape ----------
describe("STORY-006-12 S4: examples and templates keep their shape", () => {
  it("the single-entity example's facts are in date order and still parse", async () => {
    const page = parsePage(await pageFormatFence(), "projects/atlas.md");
    expect(page.facts.length).toBe(3);
    expect(dateOrderViolation(page.facts)).toBeNull();
    const marks = page.facts.map((f) => f.status).sort();
    expect(marks).toContain("decided");
    expect(marks).toContain("tentative");
    expect(page.facts.some((f) => f.contradiction)).toBe(true);
  });

  it("me.md stays at 15 lines, with '## Other' only inside its comment", async () => {
    const lines = (await readTpl("system", "templates", "me.md")).replace(/\n$/, "").split("\n");
    expect(lines.length).toBeLessThanOrEqual(15);
    const other = lines.filter((l) => l.includes("## Other"));
    expect(other.length).toBeGreaterThan(0);
    for (const l of other) expect(l).toMatch(/^<!--.*-->$/);
    expect(lines.filter((l) => l.startsWith("## "))).toEqual([]);
  });

  it("the structural checks report no finding, WIKI.md stays within 400 lines and keeps its headings", async () => {
    const findings = await runAllChecks(TPL, await doctorCheckIds());
    expect(findings).toEqual([]);
    const wiki = await readTpl("system", "WIKI.md");
    expect(wiki.replace(/\n$/, "").split("\n").length).toBeLessThanOrEqual(400);
    const { headings } = splitSections(wiki);
    let at = 0;
    for (const h of headings) if (h === SPRINT02_HEADINGS[at]) at++;
    expect(at).toBe(SPRINT02_HEADINGS.length);
  }, 60_000);

  it("templates/agent-block.md is exactly R14's 14 lines", async () => {
    const raw = await readFile(path.join(TPL, "agent-block.md"), "utf8");
    const sprint04Lines = BLOCK_LINES.map((l, i) => (i === 2 ? LINE_3_SPRINT_04 : i === 3 ? LINE_4_SPRINT_04 : l));
    expect(raw).toBe(sprint04Lines.join("\n") + "\n");
    for (const l of sprint04Lines) expect(l.length).toBeLessThanOrEqual(200);
    expect(BLOCK_LINES.length).toBe(14);
    expect(raw.split("\n")[0]).toBe("<!-- WIKI:START v1 — managed by wikeeper -->");
    expect(raw).not.toMatch(/wikeeper status(?!line)/);
    expect(sha(BLOCK_LINES.join("\n"))).toBe(PINS[2]);
  });

  it("SHIPPED_BLOCKS[2] is that text and the three entries match the three pins", () => {
    expect(SHIPPED_BLOCKS[2]).toBe(BLOCK_LINES.join("\n"));
    expect([0, 1, 2].map((i) => sha(SHIPPED_BLOCKS[i] ?? ""))).toEqual(PINS);
  });
});

// ---------- S5: example facts out of date order are caught ----------
describe("STORY-006-12 S5: out-of-order example facts are caught", () => {
  it("the date-order check names the 2026-09-30 line of the SPRINT-02 order", async () => {
    const lines = (await pageFormatFence()).split("\n");
    const idx = (d: string) => lines.findIndex((l) => l.startsWith(`- ${d} ·`));
    const slots = ["2026-09-30", "2026-10-14", "2026-10-15"].map(idx).sort((a, b) => a - b);
    expect(slots.every((i) => i >= 0)).toBe(true);
    const texts = new Map(["2026-09-30", "2026-10-14", "2026-10-15"].map((d) => [d, lines[idx(d)]!]));
    const sprint02 = ["2026-10-15", "2026-09-30", "2026-10-14"];
    sprint02.forEach((d, n) => {
      lines[slots[n]!] = texts.get(d)!;
    });
    const bad = parsePage(lines.join("\n"), "projects/atlas.md");
    const v = dateOrderViolation(bad.facts);
    expect(v).not.toBeNull();
    expect(v!.date).toBe("2026-09-30");
    expect(v!.line).toBe(lines.findIndex((l) => l.startsWith("- 2026-09-30 ·")) + 1);
  });
});
