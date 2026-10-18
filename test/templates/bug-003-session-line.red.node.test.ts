import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { normaliseBlock } from "../../src/agents/inject.js";
import { SHIPPED_BLOCKS } from "../../src/agents/shipped-blocks.js";
import { templatesDir } from "../../src/core/templates.js";
import { runCli } from "../../src/program.js";

// Red tests for BUG-003: pointer-block line 4 says the size line goes in the first reply,
// WIKI.md says the same, and init/update write the new block.
// Pins only line 4: a later sprint that rewords it re-scopes LINE_4_BUG_003 here (BUG-004 re-scope #25: Q6's line).

const PKG = path.resolve(import.meta.dirname, "..", "..");
const LINE_4_BUG_003 =
  "Wiki: `.wiki/`, content folder `content_dir` in `.wiki/config.yml`. Once set up, open each session with the line `wikeeper statusline` prints, before any text; on 🔴 follow WIKI.md \"Lint and status\".";
const SHA_SPRINT_03 = "c6fc17d0ef7079d7cf7e6f88f6e5c28e8152cdb74880118167bb29eaf333e168";
const SHA_SPRINT_04_UNRELEASED = "054466b79532cec78d6ca94b0985eaeae2b7a3fa3d8ec706e8ea54689cf1382a";
const TEAM = "# Team rules\n\nKeep it short.\n";
const START_RE = /^<!-- WIKI:START\b.*-->$/m;
const END = "<!-- WIKI:END -->";

const lf = (s: string): string => s.replace(/\r\n/g, "\n");
const sha = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");
const cleanup: string[] = [];
afterEach(async () => {
  for (const d of cleanup.splice(0)) await rm(d, { recursive: true, force: true, maxRetries: 3 });
});

const shippedBy = (pin: string): string => {
  const b = SHIPPED_BLOCKS.find((x) => sha(x) === pin);
  expect(b, `SHIPPED_BLOCKS lost the entry ${pin}`).toBeDefined();
  return b!;
};

async function readTemplateRaw(...rel: string[]): Promise<string> {
  return lf(await readFile(path.join(templatesDir(), ...rel), "utf8"));
}
async function expectedBlock(): Promise<string> {
  return normaliseBlock(await readTemplateRaw("agent-block.md"));
}

function splitSections(text: string): Array<{ name: string; text: string }> {
  const sections: Array<{ name: string; text: string }> = [];
  let cur: { name: string; text: string } | null = null;
  let fenced = false;
  for (const line of text.split("\n")) {
    if (line.startsWith("```")) {
      fenced = !fenced;
      if (cur) cur.text += line + "\n";
      continue;
    }
    const m = !fenced ? /^## (.+)$/.exec(line) : null;
    if (m) {
      cur = { name: m[1]!.trim(), text: "" };
      sections.push(cur);
      continue;
    }
    if (cur) cur.text += line + "\n";
  }
  return sections;
}

async function drive(root: string, args: string[]) {
  let out = "";
  const stdout = new Writable({ write(c, _e, cb) { out += String(c); cb(); } });
  const stderr = new Writable({ write(_c, _e, cb) { cb(); } });
  const code = await runCli(args, { io: { cwd: root, stdout, stderr, stdin: Readable.from([]) } as never });
  const line = out.trim().split("\n").filter(Boolean).pop();
  let json: any = null;
  try { json = line ? JSON.parse(line) : null; } catch { json = null; }
  return { code, json };
}
const file = (root: string, rel: string) => path.join(root, ...rel.split("/"));
const readText = (root: string, rel: string) => readFile(file(root, rel), "utf8");

async function repoWith(teamFile: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-bug003-"));
  cleanup.push(root);
  await mkdir(path.join(root, ".git"), { recursive: true });
  await writeFile(file(root, teamFile), TEAM);
  return root;
}

function span(text: string): { start: number; end: number } {
  const m = START_RE.exec(text);
  if (!m) throw new Error("no START line");
  const endIdx = text.indexOf(END, m.index);
  if (endIdx < 0) throw new Error("no END line");
  return { start: m.index, end: endIdx + END.length };
}
function withBlock(text: string, block: string): string {
  const s = span(text);
  return text.slice(0, s.start) + block + text.slice(s.end);
}

/** SHIPPED_BLOCKS ends with the block, shipped-blocks.test.ts pins its sha256, and line 4 is Q1's (the canary). */
async function staticAsserts(expected: string): Promise<void> {
  expect(SHIPPED_BLOCKS.at(-1)).toBe(expected);
  const pinTest = lf(await readFile(path.resolve(PKG, "test", "agents", "shipped-blocks.test.ts"), "utf8"));
  expect(pinTest).toContain(`"${sha(expected)}"`);
  expect(expected.split("\n")[3]).toBe(LINE_4_BUG_003);
}

describe("BUG-003: the agent shows the size line in its first reply and tells about a red page", () => {
  it("S1: line 4 is Q1's text and the block keeps its shape", async () => {
    const raw = await readTemplateRaw("agent-block.md");
    const lines = raw.replace(/\n$/, "").split("\n");
    expect(lines).toHaveLength(14);
    for (const l of lines) expect(l.length, `line over 200 UTF-16 units: ${l}`).toBeLessThanOrEqual(200);
    expect(raw).not.toMatch(/wikeeper status(?!line)/);
    expect(lines[3]).toBe(LINE_4_BUG_003);
    for (const phrase of ["Once set up", "open each session", "before any text", "`wikeeper statusline`", "🔴"]) {
      expect(lines[3]).toContain(phrase);
    }
  });

  it('S2: WIKI.md "Lint and status" says first reply, and the section line 4 names exists', async () => {
    const wiki = await readTemplateRaw("system", "WIKI.md");
    const sections = splitSections(wiki);
    const lint = sections.find((s) => s.name === "Lint and status");
    expect(lint, 'WIKI.md has no section "Lint and status"').toBeDefined();
    expect(lint!.text).toContain("Show it to the user as the first text you write in every session, before any other words.");
    expect(wiki).not.toContain("Show it to the user at the start of every session.");
    const line4 = lf(await readFile(path.join(templatesDir(), "agent-block.md"), "utf8")).split("\n")[3]!;
    const m = /WIKI\.md "([^"]+)"/.exec(line4);
    expect(m, "line 4 names no WIKI.md section").not.toBeNull();
    expect(sections.map((s) => s.name)).toContain(m![1]);
  });

  it("S3 row 1: init --agents claude writes the new block into CLAUDE.md", { timeout: 60_000 }, async () => {
    const expected = await expectedBlock();
    const root = await repoWith("CLAUDE.md");
    const r = await drive(root, ["init", "--yes", "--agents", "claude", "--json"]);
    expect(r.code).toBe(0);
    expect(await readText(root, "CLAUDE.md")).toBe(expected + "\n\n" + TEAM);
    await staticAsserts(expected);
  });

  it("S3 row 2: init --agents codex writes the new block into AGENTS.md", { timeout: 60_000 }, async () => {
    const expected = await expectedBlock();
    const root = await repoWith("AGENTS.md");
    const r = await drive(root, ["init", "--yes", "--agents", "codex", "--json"]);
    expect(r.code).toBe(0);
    expect(await readText(root, "AGENTS.md")).toBe(expected + "\n\n" + TEAM);
    await staticAsserts(expected);
  });

  it("S3 row 3: update replaces the SPRINT-03 block in CLAUDE.md", { timeout: 60_000 }, async () => {
    const expected = await expectedBlock();
    const root = await repoWith("CLAUDE.md");
    expect((await drive(root, ["init", "--yes", "--agents", "claude", "--json"])).code).toBe(0);
    const planted = withBlock(await readText(root, "CLAUDE.md"), shippedBy(SHA_SPRINT_03));
    await writeFile(file(root, "CLAUDE.md"), planted, "utf8");
    const s = span(planted);
    const before = planted.slice(0, s.start);
    const after = planted.slice(s.end);
    const u = await drive(root, ["update", "--json"]);
    expect(u.code).toBe(0);
    expect(u.json.data.replaced).toContain("CLAUDE.md#wiki-block");
    expect(await readText(root, "CLAUDE.md")).toBe(before + expected + after);
    await staticAsserts(expected);
  });

  it("S3 row 4: update replaces the unreleased SPRINT-04 block in AGENTS.md", { timeout: 60_000 }, async () => {
    const expected = await expectedBlock();
    const root = await repoWith("AGENTS.md");
    expect((await drive(root, ["init", "--yes", "--agents", "codex", "--json"])).code).toBe(0);
    const planted = withBlock(await readText(root, "AGENTS.md"), shippedBy(SHA_SPRINT_04_UNRELEASED));
    await writeFile(file(root, "AGENTS.md"), planted, "utf8");
    const s = span(planted);
    const before = planted.slice(0, s.start);
    const after = planted.slice(s.end);
    const u = await drive(root, ["update", "--json"]);
    expect(u.code).toBe(0);
    expect(u.json.data.replaced).toContain("AGENTS.md#wiki-block");
    expect(await readText(root, "AGENTS.md")).toBe(before + expected + after);
    await staticAsserts(expected);
  });

  it("S4: update leaves a hand-edited block in CLAUDE.md and reports it as before", { timeout: 60_000 }, async () => {
    const expected = await expectedBlock();
    const root = await repoWith("CLAUDE.md");
    expect((await drive(root, ["init", "--yes", "--agents", "claude,codex", "--json"])).code).toBe(0);
    const edited = withBlock(
      await readText(root, "CLAUDE.md"),
      shippedBy(SHA_SPRINT_04_UNRELEASED).replace("## Project Wiki", "## Edited by the team"),
    );
    await writeFile(file(root, "CLAUDE.md"), edited, "utf8");
    const editedBytes = await readFile(file(root, "CLAUDE.md"));
    const control = withBlock(await readText(root, "AGENTS.md"), shippedBy(SHA_SPRINT_03));
    await writeFile(file(root, "AGENTS.md"), control, "utf8");

    const u = await drive(root, ["update", "--json"]);
    expect(u.code).toBe(0);
    expect((await readFile(file(root, "CLAUDE.md"))).equals(editedBytes)).toBe(true);
    expect(u.json.data.replaced).not.toContain("CLAUDE.md#wiki-block");
    expect(u.json.data.warnings).toContain(
      "CLAUDE.md: WIKI block was edited, so update left it unchanged; to get the current block, delete it from its WIKI:START line to its WIKI:END line and run wikeeper init",
    );
    expect(u.json.data.replaced).toContain("AGENTS.md#wiki-block");
    const agents = await readText(root, "AGENTS.md");
    const s = span(agents);
    expect(agents.slice(s.start, s.end)).toBe(expected);
    expect(expected.split("\n")[3]).toBe(LINE_4_BUG_003);
  });
});
