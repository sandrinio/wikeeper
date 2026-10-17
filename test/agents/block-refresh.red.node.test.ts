import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerIntegration, resetIntegrations } from "../../src/core/integrations.js";
import { runCli } from "../../src/program.js";
import { createUpdateCommand } from "../../src/commands/update.js";
import { createInitCommand } from "../../src/commands/init.js";

// Red tests for STORY-002-11 (update refreshes an unedited pointer block).
// src/agents/shipped-blocks.ts does not exist yet: loaded through a literal dynamic import().
// Entries are indexed by position ([0] SPRINT-01, [1] SPRINT-02); the list length is never asserted.
async function loadShipped(): Promise<string[]> {
  const mod = (await import("../../src/agents/shipped-blocks.js")) as any;
  return mod.SHIPPED_BLOCKS as string[];
}
async function loadAgents(): Promise<{ agentsIntegration: Record<string, unknown> }> {
  return (await import("../../src/agents/index.js")) as any;
}

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const START_RE = /^<!-- WIKI:START\b.*-->$/m;
const END = "<!-- WIKI:END -->";
const TEAM = "# Team rules\n\nKeep it short.\n";
const BOM = "﻿";
const cleanup: string[] = [];

beforeEach(async () => {
  resetIntegrations();
  const mod = await loadAgents();
  registerIntegration({ name: "agents", ...mod.agentsIntegration } as never);
});
afterEach(async () => {
  resetIntegrations();
  for (const d of cleanup.splice(0)) await rm(d, { recursive: true, force: true, maxRetries: 3 });
});

async function drive(root: string, args: string[], commands?: unknown[]) {
  let out = "";
  let err = "";
  const stdout = new Writable({ write(c, _e, cb) { out += String(c); cb(); } });
  const stderr = new Writable({ write(c, _e, cb) { err += String(c); cb(); } });
  const code = await runCli(args, {
    ...(commands ? { commands: commands as never } : {}),
    io: { cwd: root, stdout, stderr, stdin: Readable.from([]) } as never,
  });
  const line = out.trim().split("\n").filter(Boolean).pop();
  let json: any = null;
  try { json = line ? JSON.parse(line) : null; } catch { json = null; }
  return { code, out, err, json };
}
const file = (root: string, rel: string) => path.join(root, ...rel.split("/"));
const readBuf = (root: string, rel: string) => readFile(file(root, rel));
const readText = (root: string, rel: string) => readFile(file(root, rel), "utf8");

async function initialised(agents: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wikeeper-refresh-"));
  cleanup.push(root);
  await mkdir(path.join(root, ".git"), { recursive: true });
  await writeFile(file(root, "CLAUDE.md"), TEAM);
  const r = await drive(root, ["init", "--json", "--agents", agents, "--yes"]);
  expect(r.code).toBe(0);
  return root;
}

/** A copy of templates/ whose agent-block.md has one more line before its WIKI:END line (read from the real template). */
async function templatesCopy(): Promise<{ dir: string; block: string }> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "wikeeper-tpl-"));
  cleanup.push(dir);
  await cp(path.join(PKG_ROOT, "templates"), dir, { recursive: true });
  const real = (await readFile(path.join(PKG_ROOT, "templates", "agent-block.md"), "utf8")).replace(/\r\n/g, "\n");
  const lines = real.replace(/\n+$/, "").split("\n");
  const endAt = lines.lastIndexOf(END);
  lines.splice(endAt, 0, "Extra line added by the red test.");
  const block = lines.join("\n");
  await writeFile(path.join(dir, "agent-block.md"), block + "\n");
  return { dir, block };
}

/** Locate the block (START line through END line) in a file's text. */
function span(text: string): { start: number; end: number } {
  const m = START_RE.exec(text);
  if (!m) throw new Error("no START line");
  const endIdx = text.indexOf(END, m.index);
  if (endIdx < 0) throw new Error("no END line");
  return { start: m.index, end: endIdx + END.length };
}
/** Replace the block in `text` with `block` (LF), keeping the bytes outside. */
function withBlock(text: string, block: string): string {
  const s = span(text);
  return text.slice(0, s.start) + block + text.slice(s.end);
}
const updateCmds = (dir: string) => [createUpdateCommand({ templatesDir: dir, packageVersion: "9.9.9" })];
const initCmds = (dir: string) => [createInitCommand({ templatesDir: dir })];
const blockChecks = (json: any) =>
  (json.data.checks as any[]).filter((c) => String(c.id).startsWith("agent-block-")).map((c) => `${c.id}|${c.severity}|${c.file ?? ""}`).sort();
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

describe("STORY-002-11 update refreshes an unedited pointer block (red)", () => {
  for (const row of [
    { release: "SPRINT-01", idx: 0, crlf: false },
    { release: "SPRINT-02", idx: 1, crlf: true },
  ]) {
    it(`S1: update replaces the ${row.release} block and keeps the rest of the file`, async () => {
      const shipped = await loadShipped();
      const root = await initialised("claude");
      const blockEntry = async () =>
        (JSON.parse(await readText(root, ".wiki/system/manifest.json")).files as any[]).find((e) => e.kind === "block" && e.path === "CLAUDE.md");
      const entryBefore = await blockEntry();
      expect(entryBefore).toBeDefined();
      let text = withBlock(await readText(root, "CLAUDE.md"), shipped[row.idx]);
      if (row.crlf) text = BOM + text.replace(/\r?\n/g, "\r\n");
      await writeFile(file(root, "CLAUDE.md"), text, "utf8");
      const eol = row.crlf ? "\r\n" : "\n";
      const off = row.crlf ? 1 : 0; // the BOM is one UTF-16 unit and is not part of any line
      const s0 = span(text.slice(off));
      const before = text.slice(0, s0.start + off);
      const after = text.slice(s0.end + off);
      const tpl = await templatesCopy();

      const d = await drive(root, ["doctor", "--json"]);
      expect(d.json.data.checks.filter((c: any) => String(c.id).startsWith("agent-block-") && c.severity !== "ok")).toEqual([]);
      expect(d.json.data.checks.find((c: any) => c.id === "agent-wiring").severity).toBe("ok");

      const u = await drive(root, ["update", "--json"], updateCmds(tpl.dir));
      expect(u.code).toBe(0);
      expect(u.json.data.replaced).toContain("CLAUDE.md#wiki-block");
      const expected = before + tpl.block.split("\n").join(eol) + after;
      expect((await readBuf(root, "CLAUDE.md")).toString("utf8")).toBe(expected);
      expect(await blockEntry()).toEqual(entryBefore);

      const bytes = await readBuf(root, "CLAUDE.md");
      const u2 = await drive(root, ["update", "--json"], updateCmds(tpl.dir));
      expect(u2.code).toBe(0);
      expect(u2.json.data.replaced).not.toContain("CLAUDE.md#wiki-block");
      expect((await readBuf(root, "CLAUDE.md")).equals(bytes)).toBe(true);
    });
  }

  it("S2: an edited block is left alone with a warning that says how to refresh it", async () => {
    const shipped = await loadShipped();
    const root = await initialised("claude,codex");
    const claude = (await readText(root, "CLAUDE.md")).replace("## Project Wiki", "## Edited by the team");
    await writeFile(file(root, "CLAUDE.md"), claude);
    await writeFile(file(root, "AGENTS.md"), withBlock(await readText(root, "AGENTS.md"), shipped[0]));
    const tpl = await templatesCopy();

    const u = await drive(root, ["update", "--json"], updateCmds(tpl.dir));
    expect(u.code).toBe(0);
    expect(await readText(root, "CLAUDE.md")).toBe(claude);
    expect(u.json.data.replaced).toContain("AGENTS.md#wiki-block");
    expect(u.json.data.replaced).not.toContain("CLAUDE.md#wiki-block");
    expect(u.json.data.warnings).toContain(
      "CLAUDE.md: WIKI block was edited, so update left it unchanged; to get the current block, delete it from its WIKI:START line to its WIKI:END line and run wikeeper init",
    );
    // every update repeats the warning while the block stays edited
    const u2 = await drive(root, ["update", "--json"], updateCmds(tpl.dir));
    expect(u2.json.data.warnings.filter((w: string) => w.startsWith("CLAUDE.md: WIKI block was edited"))).toHaveLength(1);

    // the fix: delete the block, run init with the same templates
    const now = await readText(root, "CLAUDE.md");
    const s = span(now);
    const rest = (now.slice(0, s.start) + now.slice(s.end)).replace(/^\n+/, "");
    await writeFile(file(root, "CLAUDE.md"), rest);
    const i = await drive(root, ["init", "--json", "--yes"], initCmds(tpl.dir));
    expect(i.code).toBe(0);
    const fixed = await readText(root, "CLAUDE.md");
    const fs_ = span(fixed);
    expect(fixed.slice(fs_.start, fs_.end).replace(/\r\n/g, "\n")).toBe(tpl.block);
    expect(fixed).toContain(TEAM);
  });

  const BAD = "CLAUDE.md is not valid UTF-8; WIKI block left unchanged";
  const rows: { name: string; idx: number; mutate: (text: string, shipped: string[]) => string | Buffer | null; warn: "none" | "utf8"; missing?: boolean }[] = [
    { name: "the block is deleted", idx: 1, warn: "none", mutate: (t) => { const s = span(t); return t.slice(0, s.start) + t.slice(s.end); } },
    {
      name: "the two marker lines are deleted and the text kept", idx: 1, warn: "none",
      mutate: (t) => t.split("\n").filter((l) => !START_RE.test(l) && l !== END).join("\n"),
    },
    { name: "the WIKI:END line is deleted", idx: 1, warn: "none", mutate: (t) => t.split("\n").filter((l) => l !== END).join("\n") },
    { name: "a second copy of the SPRINT-01 block follows the first", idx: 0, warn: "none", mutate: (t, sh) => { const s = span(t); return t.slice(0, s.end) + "\n" + sh[0] + t.slice(s.end); } },
    { name: "the file is deleted", idx: 1, warn: "none", missing: true, mutate: () => null },
    { name: "the SPRINT-01 block is followed by the byte 0xFF", idx: 0, warn: "utf8", mutate: (t, sh) => Buffer.concat([Buffer.from(withBlock(t, sh[0]), "utf8"), Buffer.from([0xff])]) },
  ];
  for (const row of rows) {
    it(`S3: update never recreates, repairs or rewrites a block it cannot match (${row.name})`, async () => {
      const shipped = await loadShipped();
      const root = await initialised("claude,codex");
      // positive control: AGENTS.md holds a shipped block, so update does run the refresh step
      await writeFile(file(root, "AGENTS.md"), withBlock(await readText(root, "AGENTS.md"), shipped[0]));
      const next = row.mutate(await readText(root, "CLAUDE.md"), shipped);
      if (next === null) await rm(file(root, "CLAUDE.md"));
      else await writeFile(file(root, "CLAUDE.md"), next);
      const before = next === null ? null : await readBuf(root, "CLAUDE.md");
      const tpl = await templatesCopy();
      const doctorBefore = blockChecks((await drive(root, ["doctor", "--json"])).json);

      const u = await drive(root, ["update", "--json"], updateCmds(tpl.dir));
      expect(u.code).toBe(0);
      expect(u.json.data.replaced).toContain("AGENTS.md#wiki-block");
      expect(u.json.data.replaced).not.toContain("CLAUDE.md#wiki-block");
      if (before === null) await expect(readBuf(root, "CLAUDE.md")).rejects.toThrow();
      else expect((await readBuf(root, "CLAUDE.md")).equals(before)).toBe(true);
      const w: string[] = u.json.data.warnings;
      if (row.warn === "none") expect(w.filter((x) => x.startsWith("CLAUDE.md:"))).toEqual([]);
      else expect(w.some((x) => x.includes(BAD))).toBe(true);
      expect(blockChecks((await drive(root, ["doctor", "--json"])).json)).toEqual(doctorBefore);
    });
  }

  it("S4: the first two shipped blocks keep their sha256 and the last entry is the current template", async () => {
    const shipped = await loadShipped();
    expect(sha(shipped[0])).toBe("4f32351f65f803b265a2bbca697724e6f06738c71680622e8267efc23078fb1b");
    expect(sha(shipped[1])).toBe("9bc080837857cacb59c42db9907fad82a148e1c000973d5f08792a7d62295d66");
    const tpl = (await readFile(path.join(PKG_ROOT, "templates", "agent-block.md"), "utf8"))
      .replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\n+$/, "");
    expect(shipped.at(-1)).toBe(tpl);
  });
});
