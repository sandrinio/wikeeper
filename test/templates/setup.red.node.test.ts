import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { resolvePaths } from "../../src/core/paths.js";

// Red tests for STORY-006-02: SETUP.md, project.md template, wiki-setup skill, projectFile.
const PKG = path.resolve(import.meta.dirname, "..", "..");
const SETUP = path.join(PKG, "templates", "system", "SETUP.md");
const PROJECT_TPL = path.join(PKG, "templates", "system", "templates", "project.md");
const SKILL = path.join(PKG, "templates", "skills", "wiki-setup", "SKILL.md");

const TITLES = [
  "Onboard the user",
  "The project",
  "What the wiki answers",
  "Permission mode",
  "Wiring",
  "Session start",
  "First source",
  "Finish",
];
const MODES = ["ai", "ask", "whitelist"] as const;
type Mode = (typeof MODES)[number];

async function load<T = Record<string, any>>(spec: string): Promise<T> {
  try {
    return (await import(/* @vite-ignore */ spec)) as T;
  } catch (e) {
    throw new Error(`not yet implemented: ${spec} (${(e as Error).message})`);
  }
}

// ---------- helpers (parsers) ----------
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

function firstTable(body: string): string[] {
  const rows: string[] = [];
  let started = false;
  for (const line of body.split("\n")) {
    if (/^\s*\|/.test(line)) {
      started = true;
      rows.push(line);
    } else if (started) break;
  }
  return rows;
}

interface PreviewRow { mode: string; claude: string; codex: string; antigravity: string }

function previewRows(text: string): PreviewRow[] {
  const step4 = steps(text).find((s) => s.n === 4);
  if (!step4) return [];
  const rows = firstTable(step4.body);
  return rows
    .map((r) => r.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim()))
    .filter((c) => c.length >= 4 && /^`[a-z]+`$/.test(c[0]!))
    .map((c) => ({ mode: c[0]!.replace(/`/g, ""), claude: c[1]!, codex: c[2]!, antigravity: c[3]! }));
}

const spans = (s: string): string[] => [...s.matchAll(/`([^`]*)`/g)].map((m) => m[1]!);

/** Claude cell: "`permissions.allow`: `r1`, `r2`; `permissions.ask`: `r3`" or an em dash. */
function parseClaudeCell(cell: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (cell.trim() === "—") return out;
  for (const part of cell.split("; ")) {
    const m = /^\s*`([^`]+)`:\s*(.*)$/.exec(part);
    if (m) out[m[1]!] = spans(m[2]!);
  }
  return out;
}

async function expectedCells(mode: Mode): Promise<{ claude: Record<string, string[]>; codex: string[] }> {
  const { CLAUDE_ENFORCE } = await load<any>("../../src/agents/enforce/claude.js");
  const { CODEX_ENFORCE } = await load<any>("../../src/agents/enforce/codex.js");
  const claude: Record<string, string[]> = {};
  for (const it of CLAUDE_ENFORCE.items("CMD", mode)) {
    if (it.kind !== "rule") continue;
    const id: string = it.identity;
    const open = id.indexOf("[");
    const list = id.slice(0, open);
    const rule = id.slice(open + 1, id.lastIndexOf("]"));
    (claude[list] ??= []).push(rule);
  }
  const codex: string[] = (CODEX_ENFORCE as any[])
    .flatMap((s) => s.items("CMD", mode))
    .filter((i: any) => i.kind === "rule")
    .map((i: any) => i.value as string);
  return { claude, codex };
}

const diff = (want: string[], got: string[]) => ({
  missing: want.filter((x) => !got.includes(x)),
  unexpected: got.filter((x) => !want.includes(x)),
});

async function checkPreview(text: string, mode: Mode): Promise<string[]> {
  const problems: string[] = [];
  const row = previewRows(text).find((r) => r.mode === mode);
  if (!row) return [`mode ${mode}: no row in the step 4 preview table`];
  const want = await expectedCells(mode);
  const got = parseClaudeCell(row.claude);
  for (const list of new Set([...Object.keys(want.claude), ...Object.keys(got)])) {
    const d = diff(want.claude[list] ?? [], got[list] ?? []);
    if (d.missing.length || d.unexpected.length) {
      problems.push(
        `mode ${mode} agent claude ${list}: missing [${d.missing.join(", ")}] unexpected [${d.unexpected.join(", ")}]`,
      );
    }
  }
  const dc = diff(want.codex, row.codex.trim() === "—" ? [] : spans(row.codex));
  if (dc.missing.length || dc.unexpected.length) {
    problems.push(`mode ${mode} agent codex: missing [${dc.missing.join(", ")}] unexpected [${dc.unexpected.join(", ")}]`);
  }
  if (!/no project rule file/.test(row.antigravity)) {
    problems.push(`mode ${mode} agent antigravity: cell must say "no project rule file"`);
  }
  return problems;
}

function codeCommands(textWithoutTable: string): Set<string> {
  const code: string[] = [];
  let rest = textWithoutTable.replace(/```[^\n]*\n([\s\S]*?)```/g, (_m, c: string) => {
    code.push(c);
    return "\n";
  });
  for (const m of rest.matchAll(/`([^`\n]+)`/g)) code.push(m[1]!);
  const cmds = new Set<string>();
  for (const c of code) for (const m of c.matchAll(/\bwikeeper\s+([a-z][a-z-]*)/g)) cmds.add(m[1]!);
  return cmds;
}

function frontmatter(text: string): { raw: string; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!m) throw new Error("no frontmatter");
  return { raw: m[1]!, body: m[2]! };
}

// ---------- S1 ----------
describe("STORY-006-02 S1: SETUP.md steps and skill", () => {
  let text: string;
  let st: Step[];
  beforeEach(async () => {
    text = await readFile(SETUP, "utf8");
    st = steps(text);
  });
  const step = (n: number) => st.find((s) => s.n === n)?.body ?? "";

  it("has the eight step headings in order", () => {
    expect(st.map((s) => `${s.n}. ${s.title}`)).toEqual(TITLES.map((t, i) => `${i + 1}. ${t}`));
  });

  it("step 1 names ONBOARDING.md", () => {
    expect(step(1)).toContain(".wiki/system/ONBOARDING.md");
  });

  it("step 2 names project.md, its template and approval", () => {
    const b = step(2);
    expect(b).toContain(".wiki/project.md");
    expect(b).toContain(".wiki/system/templates/project.md");
    expect(b).toMatch(/approv/i);
  });

  it("step 3 names kb_instructions.md and the management profile; the agent drafts, the user approves", () => {
    const b = step(3);
    expect(b).toContain(".wiki/kb_instructions.md");
    expect(b).toContain(".wiki/system/profiles/management.md");
    expect(b).toMatch(/draft/i);
    expect(b).toMatch(/approv/i);
  });

  it("steps 5, 7 and 8 run the documented commands", () => {
    expect(step(5)).toContain("wikeeper doctor");
    expect(step(7)).toContain("wikeeper ingest start");
    expect(step(7)).toContain("WIKI.md");
    expect(step(7)).toContain("Ingest");
    expect(step(8)).toContain("wikeeper setup --done");
  });

  it("names no team.md and only SPRINT-02 commands outside the preview table", () => {
    expect(text).not.toMatch(/team\.md/);
    const s4 = st.find((s) => s.n === 4);
    let stripped = text;
    if (s4) for (const row of firstTable(s4.body)) stripped = stripped.replace(row, "");
    const cmds = codeCommands(stripped);
    expect([...cmds].sort()).toEqual(expect.arrayContaining(["doctor", "ingest", "setup", "update"]));
    for (const c of cmds) expect(["doctor", "update", "setup", "ingest"]).toContain(c);
  });

  it("states the defaults: unset ingest.permission means DEFAULT_CONFIG's value, enforce is off", () => {
    const want = DEFAULT_CONFIG.ingest.permission;
    const enforceWord = DEFAULT_CONFIG.enforce ? "on" : "off";
    const sentence = text
      .split(/\n\n+/)
      .flatMap((p) => p.split(/(?<=[.!?])\s+/))
      .find((s) => s.includes("`ingest.permission`") && s.includes(`\`${want}\``));
    expect(sentence, "defaults sentence").toBeDefined();
    expect(sentence).toMatch(/enforce/);
    expect(sentence).toMatch(new RegExp(`\\b${enforceWord}\\b`));
  });

  it("step 4 writes to .wiki/config.yml, runs wikeeper update and explains all three modes", () => {
    const b = step(4);
    expect(b).toContain(".wiki/config.yml");
    expect(b).toContain("wikeeper update");
    for (const m of MODES) expect(b).toContain(`\`${m}\``);
  });

  it("wiki-setup skill: frontmatter keys, setup_completed_at, SETUP.md path", async () => {
    const t = await readFile(SKILL, "utf8");
    const { raw, body } = frontmatter(t);
    const fm = parseYaml(raw) as Record<string, unknown>;
    expect(Object.keys(fm)).toEqual(["name", "description"]);
    expect(fm.name).toBe("wiki-setup");
    expect(String(fm.description)).toContain("setup_completed_at");
    expect(body).toContain(".wiki/system/SETUP.md");
    expect(t.includes("\r")).toBe(false);
  });

  it("SETUP.md is LF-only with a trailing newline", () => {
    expect(text.includes("\r")).toBe(false);
    expect(text.endsWith("\n")).toBe(true);
  });
});

// ---------- S2 ----------
describe("STORY-006-02 S2: the permission preview matches --enforce", () => {
  it.each(MODES)("mode %s: preview row equals the enforce writers", async (mode) => {
    const text = await readFile(SETUP, "utf8");
    expect(await checkPreview(text, mode)).toEqual([]);
  });
});

// ---------- S3 ----------
describe("STORY-006-02 S3: project.md template and session-start step", () => {
  it("project.md template: <= 20 lines, frontmatter keys, sections in order, stable-facts rule", async () => {
    const t = await readFile(PROJECT_TPL, "utf8");
    expect(t.includes("\r")).toBe(false);
    expect(t.trimEnd().split("\n").length).toBeLessThanOrEqual(20);
    const { raw, body } = frontmatter(t);
    const fm = parseYaml(raw) as Record<string, unknown>;
    expect(Object.keys(fm)).toEqual(["type", "name", "aliases"]);
    expect(fm.type).toBe("project");
    expect(Array.isArray(fm.aliases)).toBe(true);
    const heads = body.split("\n").filter((l) => /^## /.test(l)).map((l) => l.slice(3).trim());
    expect(heads).toEqual(["What it is", "Scope", "Where things live", "Core terms"]);
    for (const w of ["status", "dates", "decisions", "people", "roadmap"]) expect(body.toLowerCase()).toContain(w);
    expect(body).toMatch(/<!--[^\n]*-->/);
  });

  it("SETUP.md step 6 names me.md, project.md, doctor, setup-files and fix lines; no git check-ignore", async () => {
    const text = await readFile(SETUP, "utf8");
    const b = steps(text).find((s) => s.n === 6)?.body ?? "";
    for (const s of [".wiki/me.md", ".wiki/project.md", "wikeeper doctor", "setup-files", "fix:"]) {
      expect(b).toContain(s);
    }
    expect(b).not.toContain("git check-ignore");
  });
});

// ---------- S4 ----------
describe("STORY-006-02 S4: projectFile and remove", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "wikeeper-setup-"));
    await mkdir(path.join(root, ".git"), { recursive: true });
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true, maxRetries: 3 });
  });

  async function cli(args: string[]) {
    const { runCli } = await load<any>("../../src/program.js");
    const out: string[] = [];
    const err: string[] = [];
    const code: number = await runCli(args, {
      io: {
        cwd: root,
        stdout: { write: (c: string) => out.push(c) },
        stderr: { write: (c: string) => err.push(c) },
        stdin: Readable.from([]),
      },
    });
    const text = out.join("");
    let json: any;
    try {
      json = JSON.parse(text.trim().split("\n").pop() ?? "");
    } catch {
      json = undefined;
    }
    return { code, json, text, err: err.join("") };
  }

  it("resolvePaths exposes projectFile next to meFile", () => {
    const p: any = resolvePaths(root, DEFAULT_CONFIG);
    expect(p.projectFile).toBe(path.join(root, ".wiki", "project.md"));
  });

  it("init --yes installs the new SETUP.md and system/templates/project.md", async () => {
    const r = await cli(["init", "--yes", "--agents", "claude", "--json"]);
    expect(r.code).toBe(0);
    const tpl = await readFile(path.join(root, ".wiki", "system", "templates", "project.md"), "utf8");
    expect(tpl).toBe(await readFile(PROJECT_TPL, "utf8"));
    const setup = await readFile(path.join(root, ".wiki", "system", "SETUP.md"), "utf8");
    expect(setup).toBe(await readFile(SETUP, "utf8"));
    expect(setup).toContain("## 1. Onboard the user");
  });

  it("remove --json keeps project.md byte-identical and lists both user files in sorted kept", async () => {
    expect((await cli(["init", "--yes", "--agents", "claude", "--json"])).code).toBe(0);
    const project = "---\ntype: project\nname: X\naliases: []\n---\n\n## What it is\nstuff\n";
    await writeFile(path.join(root, ".wiki", "me.md"), "me\n");
    await writeFile(path.join(root, ".wiki", "project.md"), project);
    const r = await cli(["remove", "--json"]);
    expect(r.code).toBe(0);
    expect(r.json.ok).toBe(true);
    expect(await readFile(path.join(root, ".wiki", "project.md"), "utf8")).toBe(project);
    const kept: string[] = r.json.data.kept;
    expect(kept).toEqual(expect.arrayContaining([".wiki/me.md", ".wiki/project.md"]));
    expect(kept).toEqual([...kept].sort());
  });
});

// ---------- S5 ----------
describe("STORY-006-02 S5: a preview row that differs from the writers fails", () => {
  it("ai row listing Bash(wikeeper *) for Claude Code fails naming mode, agent and rules", async () => {
    const real = await readFile(SETUP, "utf8");
    const row = previewRows(real).find((r) => r.mode === "ai");
    expect(row, "ai preview row in SETUP.md").toBeDefined();
    const mutated = real.replace(row!.claude, "`permissions.allow`: `Bash(wikeeper *)`");
    expect(mutated).not.toBe(real);
    const problems = await checkPreview(mutated, "ai");
    expect(problems.length).toBeGreaterThan(0);
    const joined = problems.join("\n");
    expect(joined).toContain("mode ai");
    expect(joined).toContain("agent claude");
    expect(joined).toContain("missing [Bash(npx wikeeper ingest *), Bash(wikeeper ingest *), Bash(npx wikeeper read *), Bash(wikeeper read *), Bash(npx wikeeper search *), Bash(wikeeper search *), Bash(npx wikeeper lint *), Bash(wikeeper lint *), Bash(npx wikeeper status *), Bash(wikeeper status *), Bash(npx wikeeper rules list *), Bash(wikeeper rules list *)]");
    expect(joined).toContain("unexpected [Bash(wikeeper *)]");
  });
});
