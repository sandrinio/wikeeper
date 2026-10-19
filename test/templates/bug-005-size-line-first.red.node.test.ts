import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { SHIPPED_BLOCKS } from "../../src/agents/shipped-blocks.js";
import { templatesDir } from "../../src/core/templates.js";
import { runCli } from "../../src/program.js";

// Red tests for BUG-005: the size line is the first text of a fresh session.
// Texts are BUG-005 Q1 verbatim. Older blocks are found in SHIPPED_BLOCKS by sha256, never by index.

const LINE_3_Q1 =
  "Managed by wikeeper — edit outside this block only. Wiki: `.wiki/`, content folder `content_dir` in `.wiki/config.yml`.";
const LINE_4_Q1 =
  "Once set up, start each session with `wikeeper statusline` and write its line before any other step or text; on 🔴 follow WIKI.md \"Lint and status\".";
const WIKI_SENTENCE =
  "Run it first in every session and write its line to the user at once, before any other command or text; then go on with the request.";
const OLD_WIKI_SENTENCE = "Show it to the user as the first text you write in every session";
const SHA_SPRINT_03 = "c6fc17d0ef7079d7cf7e6f88f6e5c28e8152cdb74880118167bb29eaf333e168";
const SHA_BUG_004 = "3ecca095227fd64ebaab33c1cf3a14f934a1407a864f97afcfa49fde2da4b662";
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

/** The new block: the BUG-004 block with lines 3 and 4 replaced by Q1's. */
function newBlock(): string {
  const lines = shippedBy(SHA_BUG_004).split("\n");
  lines[2] = LINE_3_Q1;
  lines[3] = LINE_4_Q1;
  return lines.join("\n");
}

async function readTemplateRaw(...rel: string[]): Promise<string> {
  return lf(await readFile(path.join(templatesDir(), ...rel), "utf8"));
}

function sectionText(text: string, name: string): string {
  let cur: string | null = null;
  let out = "";
  let fenced = false;
  for (const line of text.split("\n")) {
    if (line.startsWith("```")) {
      fenced = !fenced;
      if (cur === name) out += line + "\n";
      continue;
    }
    const m = !fenced ? /^## (.+)$/.exec(line) : null;
    if (m) {
      cur = m[1]!.trim();
      continue;
    }
    if (cur === name) out += line + "\n";
  }
  return out;
}

async function drive(root: string, args: string[]) {
  let out = "";
  const stdout = new Writable({ write(c, _e, cb) { out += String(c); cb(); } });
  const stderr = new Writable({ write(_c, _e, cb) { cb(); } });
  const code = await runCli(args, { io: { cwd: root, stdout, stderr, stdin: Readable.from([]) } as never });
  const line = out.trim().split("\n").filter(Boolean).pop();
  let json: any = null;
  try { json = line ? JSON.parse(line) : null; } catch { json = null; }
  return { code, json, out };
}
const file = (root: string, rel: string) => path.join(root, ...rel.split("/"));
const readText = (root: string, rel: string) => readFile(file(root, rel), "utf8");

async function repoWith(teamFile: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-bug005-"));
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

/** SHIPPED_BLOCKS ends with the new block, still holds the BUG-004 block unchanged, and the pin test holds the new sha256. */
async function staticAsserts(expected: string): Promise<void> {
  expect(SHIPPED_BLOCKS.at(-1)).toBe(expected);
  shippedBy(SHA_BUG_004);
  const pinTest = lf(await readFile(path.resolve(import.meta.dirname, "..", "agents", "shipped-blocks.test.ts"), "utf8"));
  expect(pinTest).toContain(`"${sha(expected)}"`);
}

describe("BUG-005: the size line is the first text of a fresh session", () => {
  it("@rules: lines 3 and 4 and the protocol put the size check first", async () => {
    const raw = await readTemplateRaw("agent-block.md");
    const lines = raw.replace(/\n$/, "").split("\n");
    expect(lines[2]).toBe(LINE_3_Q1);
    expect(lines[3]).toBe(LINE_4_Q1);
    expect(lines).toHaveLength(14);
    for (const l of lines) expect(l.length, `line over 200 UTF-16 units: ${l}`).toBeLessThanOrEqual(200);
    const wiki = await readTemplateRaw("system", "WIKI.md");
    expect(sectionText(wiki, "Lint and status")).toContain(WIKI_SENTENCE);
    expect(wiki).not.toContain(OLD_WIKI_SENTENCE);
  });

  it("@interfaces row 1: init --agents claude writes the new block into CLAUDE.md", { timeout: 60_000 }, async () => {
    const expected = newBlock();
    const root = await repoWith("CLAUDE.md");
    expect((await drive(root, ["init", "--yes", "--agents", "claude", "--json"])).code).toBe(0);
    expect(await readText(root, "CLAUDE.md")).toBe(expected + "\n\n" + TEAM);
    await staticAsserts(expected);
  });

  it("@interfaces row 2: init --agents codex writes the new block into AGENTS.md", { timeout: 60_000 }, async () => {
    const expected = newBlock();
    const root = await repoWith("AGENTS.md");
    expect((await drive(root, ["init", "--yes", "--agents", "codex", "--json"])).code).toBe(0);
    expect(await readText(root, "AGENTS.md")).toBe(expected + "\n\n" + TEAM);
    await staticAsserts(expected);
  });

  it("@interfaces row 3: update replaces the BUG-004 block in AGENTS.md", { timeout: 60_000 }, async () => {
    const expected = newBlock();
    const root = await repoWith("AGENTS.md");
    expect((await drive(root, ["init", "--yes", "--agents", "codex", "--json"])).code).toBe(0);
    const planted = withBlock(await readText(root, "AGENTS.md"), shippedBy(SHA_BUG_004));
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

  it("@interfaces row 4: update replaces the 0.3.0 block in CLAUDE.md", { timeout: 60_000 }, async () => {
    const expected = newBlock();
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
});
