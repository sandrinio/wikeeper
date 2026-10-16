import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile, lstat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerIntegration, resetIntegrations } from "../../src/core/integrations.js";
import { runCli } from "../../src/program.js";
import { createUpdateCommand } from "../../src/commands/update.js";

// Red tests for STORY-002-04 (integration wiring and doctor checks).
// src/agents/index.ts does not exist yet: it is imported through a literal dynamic import().
interface AgentsIndex {
  agentsIntegration: Record<string, unknown>;
}
async function loadAgents(): Promise<AgentsIndex> {
  return (await import("../../src/agents/index.js")) as unknown as AgentsIndex;
}

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const START_V1 = "<!-- WIKI:START v1 — managed by wikeeper -->";
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

async function put(file: string, content: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}
async function repo(files: Record<string, string>, config: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wikeeper-agents-"));
  cleanup.push(root);
  await mkdir(path.join(root, ".git"), { recursive: true });
  for (const [rel, content] of Object.entries(files)) await put(path.join(root, ...rel.split("/")), content);
  await put(path.join(root, ".wiki", "config.yml"), config);
  return root;
}
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
const read = (root: string, rel: string) => readFile(path.join(root, ...rel.split("/")), "utf8");
async function exists(root: string, rel: string): Promise<boolean> {
  try { await lstat(path.join(root, ...rel.split("/"))); return true; } catch { return false; }
}
async function names(root: string, rel: string): Promise<string[]> {
  try { return (await readdir(path.join(root, ...rel.split("/")))).sort(); } catch { return []; }
}
async function manifest(root: string): Promise<{ files: any[] }> {
  return JSON.parse(await read(root, ".wiki/system/manifest.json"));
}

const TEAM = "# Team rules\n";
const CONFIG = "agents: [claude, codex]\n";

async function initialised(extra: Record<string, string> = { "CLAUDE.md": TEAM }, config = CONFIG): Promise<string> {
  const root = await repo(extra, config);
  const r = await drive(root, ["init", "--yes"]);
  expect(r.code).toBe(0);
  return root;
}

describe("STORY-002-04 integration (red)", () => {
  it("S1: init wires a repository with an existing CLAUDE.md", async () => {
    const root = await initialised();
    const claude = await read(root, "CLAUDE.md");
    expect(claude.startsWith(START_V1)).toBe(true);
    expect(claude.endsWith("\n" + TEAM)).toBe(true);
    const agentsMd = await read(root, "AGENTS.md");
    expect(agentsMd).toContain(START_V1);
    expect(agentsMd).toContain("<!-- WIKI:END -->");
    for (const s of ["wiki-setup", "wiki-ingest", "wiki-search"]) {
      expect(await exists(root, `.agents/skills/${s}/SKILL.md`)).toBe(true);
    }
    expect(await names(root, ".claude/agents")).toEqual(["wiki-extractor.md", "wiki-writer.md"]);
    expect(await names(root, ".codex/agents")).toEqual(["wiki-extractor.toml", "wiki-writer.toml"]);
    const blocks = (await manifest(root)).files.filter((f) => f.kind === "block");
    expect(blocks.find((b) => b.path === "CLAUDE.md")?.created).toBe(false);
    expect(blocks.find((b) => b.path === "AGENTS.md")?.created).toBe(true);
    expect(blocks).toHaveLength(2);
  });

  it("S1b: a second init keeps manifest created flags and changes nothing", async () => {
    const root = await initialised();
    const before = { c: await read(root, "CLAUDE.md"), a: await read(root, "AGENTS.md"), m: await read(root, ".wiki/system/manifest.json") };
    const r = await drive(root, ["init", "--yes"]);
    expect(r.code).toBe(0);
    expect(await read(root, "CLAUDE.md")).toBe(before.c);
    expect(await read(root, "AGENTS.md")).toBe(before.a);
    expect(await read(root, ".wiki/system/manifest.json")).toBe(before.m);
  });

  it("S2: update refreshes skills but leaves an edited block alone", async () => {
    const root = await initialised();
    const edited = (await read(root, "CLAUDE.md")).replace("## Project Wiki", "## Edited by the team");
    await writeFile(path.join(root, "CLAUDE.md"), edited);
    const fixture = await mkdtemp(path.join(os.tmpdir(), "wikeeper-tpl-"));
    cleanup.push(fixture);
    await cp(path.join(PKG_ROOT, "templates"), fixture, { recursive: true });
    const newSkill = "---\nname: wiki-ingest\ndescription: refreshed\n---\nNEWER TEMPLATE\n";
    await put(path.join(fixture, "skills", "wiki-ingest", "SKILL.md"), newSkill);
    const r = await drive(root, ["update", "--json"], [
      createUpdateCommand({ templatesDir: fixture, packageVersion: "9.9.9" }),
    ]);
    expect(r.code).toBe(0);
    expect(await read(root, "CLAUDE.md")).toBe(edited);
    expect(await read(root, ".agents/skills/wiki-ingest/SKILL.md")).toBe(newSkill);
  });

  it("S3: remove restores agent files", async () => {
    const root = await initialised();
    const r = await drive(root, ["remove", "--json"]);
    expect(r.code).toBe(0);
    expect(await read(root, "CLAUDE.md")).toBe(TEAM);
    expect(await exists(root, "AGENTS.md")).toBe(false);
    for (const d of [".agents", ".claude", ".codex"]) expect(await exists(root, d)).toBe(false);
  });
});

describe("STORY-002-04 doctor outline (red)", () => {
  async function doctor(root: string) {
    const r = await drive(root, ["doctor", "--json"]);
    return { code: r.code, checks: (r.json?.data?.checks ?? []) as Array<{ id: string; severity: string; file?: string }> };
  }

  it("clean init: doctor exits 0", async () => {
    const root = await initialised();
    expect((await doctor(root)).code).toBe(0);
  });

  it("duplicated markers: agent-block-duplicated error, exit 1", async () => {
    const root = await initialised();
    const text = await read(root, "CLAUDE.md");
    const block = text.slice(0, text.indexOf("<!-- WIKI:END -->") + "<!-- WIKI:END -->".length);
    await writeFile(path.join(root, "CLAUDE.md"), text + "\n" + block + "\n");
    const r = await doctor(root);
    expect(r.checks.find((c) => c.id === "agent-block-duplicated")?.severity).toBe("error");
    expect(r.code).toBe(1);
  });

  it("markers deleted: agent-block-markers-deleted warning, exit 0", async () => {
    const root = await initialised();
    const text = (await read(root, "AGENTS.md"))
      .split("\n")
      .filter((l) => !l.startsWith("<!-- WIKI:START") && l !== "<!-- WIKI:END -->")
      .join("\n");
    await writeFile(path.join(root, "AGENTS.md"), text);
    const r = await doctor(root);
    expect(r.checks.find((c) => c.id === "agent-block-markers-deleted")?.severity).toBe("warning");
    expect(r.code).toBe(0);
  });

  it("claude configured and only AGENTS.md: claude-agents-md-only warning, exit 0", async () => {
    const root = await initialised({ "AGENTS.md": "# Ours\n" }, "agents: [claude]\n");
    expect(await exists(root, "CLAUDE.md")).toBe(false);
    const r = await doctor(root);
    expect(r.checks.find((c) => c.id === "claude-agents-md-only")?.severity).toBe("warning");
    expect(r.code).toBe(0);
  });

  it.skipIf(process.platform === "win32")("broken skill link: skill-link-broken error, exit 1", async () => {
    const root = await initialised();
    await rm(path.join(root, ".agents", "skills", "wiki-ingest"), { recursive: true, force: true });
    const r = await doctor(root);
    expect(r.checks.find((c) => c.id === "skill-link-broken")?.severity).toBe("error");
    expect(r.code).toBe(1);
  });

  it("codex configured and enforce true: codex-trust info, exit 0", async () => {
    const root = await initialised();
    await writeFile(path.join(root, ".wiki", "config.yml"), CONFIG + "enforce: true\n");
    const r = await doctor(root);
    expect(r.checks.find((c) => c.id === "codex-trust")?.severity).toBe("info");
    expect(r.code).toBe(0);
  });

  it("Error: a target lost its block: agent-block-missing naming AGENTS.md, exit 1", async () => {
    const root = await initialised();
    await writeFile(path.join(root, "AGENTS.md"), "");
    const r = await doctor(root);
    expect(r.code).toBe(1);
    expect(r.checks.some((c) => c.id === "agent-block-missing" && c.file === "AGENTS.md")).toBe(true);
  });
});
