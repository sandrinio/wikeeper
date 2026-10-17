import { chmod, cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable, Writable } from "node:stream";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setConfigValue } from "../../src/core/config.js";
import { registerIntegration, resetIntegrations } from "../../src/core/integrations.js";
import { templatesDir } from "../../src/core/templates.js";
import { runCli } from "../../src/program.js";
import { checkCommands } from "../templates/structure.js";

// Red tests for STORY-002-09: ai-mode ask/prompt rules for --drop and --force-unlock,
// update brings installs up to date, update with enforce:false removes hook and rules.
// test/agents/rule-match.ts is written by the Developer: literal dynamic import (expected-missing).
const load = () => import("./rule-match.js");
async function loadAgents(): Promise<any> {
  return await import("../../src/agents/index.js");
}

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXTURES = path.join(PKG_ROOT, "test", "fixtures", "settings");
const SETUP = path.join(PKG_ROOT, "templates", "system", "SETUP.md");
const IS_WIN = process.platform === "win32";
const cleanup: string[] = [];
const keep: string[] = [];

const NARROW_CLAUDE = ["Bash(npx wikeeper ingest *)", "Bash(wikeeper ingest *)"];
const ASK_CLAUDE = [
  "Bash(npx wikeeper ingest *--drop*)",
  "Bash(wikeeper ingest *--drop*)",
  "Bash(npx wikeeper ingest *--force-unlock*)",
  "Bash(wikeeper ingest *--force-unlock*)",
];
const START_CLAUDE = ["Bash(npx wikeeper ingest start *)", "Bash(wikeeper ingest start *)"];
const SEARCH_CLAUDE = ["Bash(npx wikeeper search *)", "Bash(wikeeper search *)"];
const NARROW_CODEX = [
  'prefix_rule(pattern=["npx","wikeeper","ingest"], decision="allow")',
  'prefix_rule(pattern=["wikeeper","ingest"], decision="allow")',
];
const PROMPT_CODEX = [
  'prefix_rule(pattern=["npx","wikeeper","ingest","abort"], decision="prompt")',
  'prefix_rule(pattern=["wikeeper","ingest","abort"], decision="prompt")',
];
const START_CODEX = [
  'prefix_rule(pattern=["npx","wikeeper","ingest","start"], decision="prompt")',
  'prefix_rule(pattern=["wikeeper","ingest","start"], decision="prompt")',
];
const SEARCH_CODEX = [
  'prefix_rule(pattern=["npx","wikeeper","search"], decision="allow")',
  'prefix_rule(pattern=["wikeeper","search"], decision="allow")',
];
const READ_CLAUDE = ["Bash(npx wikeeper read *)", "Bash(wikeeper read *)"];
const READ_CODEX = [
  'prefix_rule(pattern=["npx","wikeeper","read"], decision="allow")',
  'prefix_rule(pattern=["wikeeper","read"], decision="allow")',
];
const sorted = (xs: readonly string[]): string[] => [...xs].sort();

beforeEach(async () => {
  resetIntegrations();
  const mod = await loadAgents();
  registerIntegration({ name: "agents", ...mod.agentsIntegration } as never);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  resetIntegrations();
  for (const d of cleanup.splice(0)) await rm(d, { recursive: true, force: true, maxRetries: 3 });
});
afterAll(async () => {
  for (const d of keep.splice(0)) await rm(d, { recursive: true, force: true, maxRetries: 3 });
});

async function tmp(prefix: string, persist = false): Promise<string> {
  const d = await mkdtemp(path.join(os.tmpdir(), prefix));
  (persist ? keep : cleanup).push(d);
  return d;
}
async function pathWithWikeeper(): Promise<void> {
  const bin = await tmp("wikeeper-bin-");
  const file = path.join(bin, IS_WIN ? "wikeeper.cmd" : "wikeeper");
  await writeFile(file, IS_WIN ? "@echo off\r\n" : "#!/bin/sh\nexit 0\n");
  if (!IS_WIN) await chmod(file, 0o755);
  if (IS_WIN) vi.stubEnv("PATHEXT", ".CMD");
  vi.stubEnv("PATH", bin);
}
async function put(file: string, content: string | Buffer): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}
async function repo(config: string, files: Record<string, string | Buffer> = {}, persist = false): Promise<string> {
  const root = await tmp("wikeeper-prompts-", persist);
  await mkdir(path.join(root, ".git"), { recursive: true });
  for (const [rel, content] of Object.entries(files)) await put(path.join(root, ...rel.split("/")), content);
  await put(path.join(root, ".wiki", "config.yml"), config);
  return root;
}
async function drive(root: string, args: string[]) {
  let out = "";
  const stdout = new Writable({ write(c, _e, cb) { out += String(c); cb(); } });
  const stderr = new Writable({ write(_c, _e, cb) { cb(); } });
  const code = await runCli(args, {
    io: { cwd: root, stdout, stderr, stdin: Readable.from([]) } as never,
  });
  const line = out.trim().split("\n").filter(Boolean).pop();
  let json: any = null;
  try { json = line ? JSON.parse(line) : null; } catch { json = null; }
  return { code, out, json };
}
const abs = (root: string, rel: string) => path.join(root, ...rel.split("/"));
const read = (root: string, rel: string) => readFile(abs(root, rel), "utf8");
const readJson = async (root: string, rel: string): Promise<any> => JSON.parse(await read(root, rel));
async function exists(root: string, rel: string): Promise<boolean> {
  try { await stat(abs(root, rel)); return true; } catch { return false; }
}
const ruleLines = async (root: string) =>
  (await read(root, ".codex/rules/wikeeper.rules")).split(/\r?\n/).filter(Boolean);
const MANIFEST = ".wiki/system/manifest.json";

// ---------- SETUP.md step-4 row reader (S2-style comparison) ----------
function setupRow(text: string, mode: string): { claude: Record<string, string[]>; codex: string[] } {
  const row = text.split("\n").find((l) => l.trim().startsWith(`| \`${mode}\` |`));
  if (!row) throw new Error(`no ${mode} row in SETUP.md`);
  const cells = row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const spans = (s: string): string[] => [...s.matchAll(/`([^`]*)`/g)].map((m) => m[1]!);
  const claude: Record<string, string[]> = {};
  if (cells[1] !== "—") {
    for (const part of cells[1]!.split("; ")) {
      const m = /^\s*`([^`]+)`:\s*(.*)$/.exec(part);
      if (m) claude[m[1]!] = spans(m[2]!);
    }
  }
  return { claude, codex: cells[2] === "—" ? [] : spans(cells[2]!) };
}
async function expectRowMatchesFiles(root: string, mode: string): Promise<void> {
  const row = setupRow(await readFile(SETUP, "utf8"), mode);
  const s = await readJson(root, ".claude/settings.json");
  expect(sorted(row.claude["permissions.allow"] ?? [])).toEqual(sorted(s.permissions?.allow ?? []));
  expect(sorted(row.claude["permissions.ask"] ?? [])).toEqual(sorted(s.permissions?.ask ?? []));
  const lines = (await exists(root, ".codex/rules/wikeeper.rules")) ? await ruleLines(root) : [];
  expect(sorted(row.codex)).toEqual(sorted(lines));
}

// ---------- S1 outline ----------
describe("STORY-002-09 S1: ai mode prompts for the destructive flags (red)", () => {
  let ready: Promise<string> | null = null;
  function aiRepo(): Promise<string> {
    ready ??= (async () => {
      await pathWithWikeeper();
      const root = await repo("agents: [claude, codex]\ningest:\n  permission: ai\n", {}, true);
      const r = await drive(root, ["init", "--json", "--enforce", "--yes"]);
      expect(r.code).toBe(0);
      return root;
    })();
    return ready;
  }

  it("settings.json and wikeeper.rules hold exactly the ai rules, Codex in R3 order", async () => {
    const root = await aiRepo();
    const s = await readJson(root, ".claude/settings.json");
    expect(s.permissions.allow).toEqual([...NARROW_CLAUDE, ...READ_CLAUDE, ...SEARCH_CLAUDE]);
    expect(s.permissions.ask).toEqual(ASK_CLAUDE);
    expect(await ruleLines(root)).toEqual([...NARROW_CODEX, ...PROMPT_CODEX, ...READ_CODEX, ...SEARCH_CODEX]);
  });

  it("the ai row of the SETUP.md step-4 table lists exactly those rules", async () => {
    const root = await aiRepo();
    await expectRowMatchesFiles(root, "ai");
    const row = setupRow(await readFile(SETUP, "utf8"), "ai");
    expect(row.claude["permissions.ask"]).toEqual(ASK_CLAUDE);
    expect(row.codex).toEqual([...NARROW_CODEX, ...PROMPT_CODEX, ...READ_CODEX, ...SEARCH_CODEX]);
  });

  it("the template structure check reports no finding for the writer items or SETUP.md", async () => {
    const findings = await checkCommands(templatesDir());
    expect(findings).toEqual([]);
    const { CLAUDE_ENFORCE } = await import("../../src/agents/enforce/claude.js");
    expect((CLAUDE_ENFORCE.items("CMD", "ai") as any[]).map((i) => i.value)).toContain("Bash(wikeeper ingest *--drop*)");
  });

  const rows: Array<[string, string, string]> = [
    ["wikeeper ingest start ./notes.md --kind meeting", "allow", "allow"],
    ["npx wikeeper ingest apply src-2026-10-17-notes", "allow", "allow"],
    ["wikeeper ingest finish src-2026-10-17-notes --json", "allow", "allow"],
    ["wikeeper ingest abort src-2026-10-17-notes", "allow", "prompt"],
    ["wikeeper ingest abort src-2026-10-17-notes --drop", "ask", "prompt"],
    ["npx wikeeper ingest abort --drop src-2026-10-17-notes", "ask", "prompt"],
    ["npx wikeeper ingest apply src-2026-10-17-notes --force-unlock", "ask", "allow"],
    ["wikeeper search roadmap --json", "allow", "allow"],
  ];
  it.each(rows)("%s -> claude %s, codex %s", async (command, claude, codex) => {
    const root = await aiRepo();
    const { claudeDecision, codexDecision } = await load();
    const s = await readJson(root, ".claude/settings.json");
    expect(claudeDecision(s.permissions, command)).toBe(claude);
    expect(codexDecision(await ruleLines(root), command.split(" "))).toBe(codex);
  });
});

// ---------- R7 checker wildcard ----------
describe("STORY-002-09 R7: the template checker accepts a * where the subcommand would be (red)", () => {
  it("passes *--drop* and reports *--nope* naming --nope", async () => {
    const copy = await tmp("wikeeper-wild-");
    await put(path.join(copy, "a.md"), "Rule `Bash(wikeeper ingest *--drop*)` here.\n");
    expect(await checkCommands(copy)).toEqual([]);
    await put(path.join(copy, "a.md"), "Rule `Bash(wikeeper ingest *--nope*)` here.\n");
    const findings = await checkCommands(copy);
    expect(findings.some((f) => f.message.includes("--nope"))).toBe(true);
  });
  it("keeps the templates copy usable (cp of the real tree stays clean)", async () => {
    const copy = await tmp("wikeeper-tpl-copy-");
    await cp(templatesDir(), copy, { recursive: true });
    expect(await checkCommands(copy)).toEqual([]);
  }, 60_000);
});

// ---------- S2 ----------
describe("STORY-002-09 S2: update brings a SPRINT-02 ai install up to date; mode swaps (red)", () => {
  async function sprint02Install(): Promise<string> {
    await pathWithWikeeper();
    const original = await readFile(path.join(FIXTURES, "claude-settings-user.json"));
    const root = await repo("agents: [claude, codex]\ningest:\n  permission: ai\n", {
      ".claude/settings.json": original,
    });
    expect((await drive(root, ["init", "--json", "--enforce", "--yes"])).code).toBe(0);
    // Hand-build SPRINT-02 state: only the four old rules per agent, recorded in the manifest.
    const s = await readJson(root, ".claude/settings.json");
    s.permissions.allow = [...NARROW_CLAUDE, ...SEARCH_CLAUDE];
    delete s.permissions.ask;
    await writeFile(abs(root, ".claude/settings.json"), JSON.stringify(s, null, 2) + "\n");
    await writeFile(abs(root, ".codex/rules/wikeeper.rules"), [...NARROW_CODEX, ...SEARCH_CODEX].join("\n") + "\n");
    const m = await readJson(root, MANIFEST);
    const claudeHook = m.files.find((f: any) => f.path === ".claude/settings.json" && f.kind === "hook");
    const codexHook = m.files.find((f: any) => f.path === ".codex/hooks.json" && f.kind === "hook");
    m.files = m.files.filter((f: any) => f.kind !== "rule");
    for (const rule of [...NARROW_CLAUDE, ...SEARCH_CLAUDE]) {
      m.files.push({ path: ".claude/settings.json", sha256: null, kind: "rule", agent: "claude", identity: `permissions.allow[${rule}]`, created: claudeHook?.created ?? false });
    }
    for (const line of [...NARROW_CODEX, ...SEARCH_CODEX]) {
      m.files.push({ path: ".codex/rules/wikeeper.rules", sha256: null, kind: "rule", agent: "codex", identity: line, created: codexHook?.created ?? true });
    }
    await writeFile(abs(root, MANIFEST), JSON.stringify(m, null, 2) + "\n");
    return root;
  }
  const snapshot = async (root: string) =>
    (await Promise.all([".claude/settings.json", ".codex/rules/wikeeper.rules", ".codex/hooks.json", MANIFEST].map((f) => read(root, f)))).join("\u0000");

  it("adds the ask rules and prompt lines, records them, keeps user keys, is idempotent", async () => {
    const root = await sprint02Install();
    expect((await drive(root, ["update", "--json"])).code).toBe(0);
    const s = await readJson(root, ".claude/settings.json");
    expect(sorted(s.permissions.allow)).toEqual(sorted([...NARROW_CLAUDE, ...READ_CLAUDE, ...SEARCH_CLAUDE]));
    expect(sorted(s.permissions.ask)).toEqual(sorted(ASK_CLAUDE));
    expect(s.model).toBe("opus");
    expect(s.permissions.deny).toEqual(["Read(./.env)"]);
    expect(await ruleLines(root)).toEqual([...NARROW_CODEX, ...SEARCH_CODEX, ...PROMPT_CODEX, ...READ_CODEX]);
    const m = await readJson(root, MANIFEST);
    for (const rule of ASK_CLAUDE) {
      expect(m.files.some((f: any) => f.kind === "rule" && f.agent === "claude" && f.identity === `permissions.ask[${rule}]`)).toBe(true);
    }
    for (const line of PROMPT_CODEX) {
      expect(m.files.some((f: any) => f.kind === "rule" && f.agent === "codex" && f.identity === line)).toBe(true);
    }
    const before = await snapshot(root);
    expect((await drive(root, ["update", "--json"])).code).toBe(0);
    expect(await snapshot(root)).toBe(before);
  });

  it("changing ingest.permission to ask, then whitelist, swaps the rules and the SETUP.md row matches", async () => {
    const root = await sprint02Install();
    expect((await drive(root, ["update", "--json"])).code).toBe(0);
    expect(sorted((await readJson(root, ".claude/settings.json")).permissions.ask)).toEqual(sorted(ASK_CLAUDE));
    await expectRowMatchesFiles(root, "ai");
    await setConfigValue(root, "ingest.permission", "ask");
    expect((await drive(root, ["update", "--json"])).code).toBe(0);
    let s = await readJson(root, ".claude/settings.json");
    expect(sorted(s.permissions.ask)).toEqual(sorted(START_CLAUDE));
    expect(sorted(s.permissions.allow)).toEqual(sorted(SEARCH_CLAUDE));
    expect(sorted(await ruleLines(root))).toEqual(sorted([...START_CODEX, ...SEARCH_CODEX]));
    await expectRowMatchesFiles(root, "ask");

    await setConfigValue(root, "ingest.permission", "whitelist");
    expect((await drive(root, ["update", "--json"])).code).toBe(0);
    s = await readJson(root, ".claude/settings.json");
    expect(s.permissions.ask).toBeUndefined();
    expect(sorted(s.permissions.allow)).toEqual(sorted(SEARCH_CLAUDE));
    expect(sorted(await ruleLines(root))).toEqual(sorted(SEARCH_CODEX));
    await expectRowMatchesFiles(root, "whitelist");
  });
});

// ---------- S3 ----------
describe("STORY-002-09 S3: update never rewrites a malformed settings file (red)", () => {
  it("exits 1 settings_invalid naming the file; file byte-identical; no new rule in the manifest", async () => {
    await pathWithWikeeper();
    const root = await repo("agents: [claude]\ningest:\n  permission: ai\n");
    expect((await drive(root, ["init", "--json", "--agents", "claude", "--enforce", "--yes"])).code).toBe(0);
    const s = await readJson(root, ".claude/settings.json");
    s.permissions.allow = [...NARROW_CLAUDE, ...SEARCH_CLAUDE];
    delete s.permissions.ask;
    await writeFile(abs(root, ".claude/settings.json"), JSON.stringify(s, null, 2) + "\n");
    const m = await readJson(root, MANIFEST);
    m.files = m.files.filter((f: any) => !(f.kind === "rule" && String(f.identity).startsWith("permissions.ask[")));
    await writeFile(abs(root, MANIFEST), JSON.stringify(m, null, 2) + "\n");
    await writeFile(abs(root, ".claude/settings.json"), "{ not json");
    const manifestBefore = await read(root, MANIFEST);

    const r = await drive(root, ["update", "--json"]);
    expect(r.code).toBe(1);
    expect(r.json?.error?.code).toBe("settings_invalid");
    expect(String(r.json?.error?.message ?? "")).toContain(".claude/settings.json");
    expect(await read(root, ".claude/settings.json")).toBe("{ not json");
    const after = await read(root, MANIFEST);
    expect(after).toBe(manifestBefore);
    expect(after).not.toContain("--drop");
  });
});

// ---------- S4 ----------
describe("STORY-002-09 S4: update with enforce false removes wikeeper's hook and rules (red)", () => {
  it("restores the user's settings, deletes created files, clears the manifest, doctor says off", async () => {
    await pathWithWikeeper();
    const original = await readFile(path.join(FIXTURES, "claude-settings-user.json"));
    const root = await repo("agents: [claude, codex, antigravity]\ningest:\n  permission: ai\n", {
      ".claude/settings.json": original,
    });
    const init = await drive(root, ["init", "--json", "--agents", "claude,codex,antigravity", "--enforce", "--yes"]);
    expect(init.code).toBe(0);
    expect(await exists(root, ".codex/rules/wikeeper.rules")).toBe(true);

    await setConfigValue(root, "enforce", false);
    const u = await drive(root, ["update", "--json"]);
    expect(u.code).toBe(0);
    expect((await readFile(abs(root, ".claude/settings.json"))).equals(original)).toBe(true);
    expect(await exists(root, ".claude/settings.json.bak")).toBe(false);
    for (const f of [".codex/hooks.json", ".codex/rules/wikeeper.rules", ".agents/hooks.json"]) {
      expect(await exists(root, f)).toBe(false);
    }
    const m = await readJson(root, MANIFEST);
    expect(m.files.filter((f: any) => f.kind === "hook" || f.kind === "rule")).toEqual([]);

    const d = await drive(root, ["doctor", "--json"]);
    expect(d.json.data.state.enforce.enabled).toBe(false);
    expect(d.json.data.state.enforce.agents).toEqual([]);
    const ids = (d.json.data.checks as any[]).map((c) => c.id);
    expect(ids).not.toContain("backup-stale");
    expect(ids).not.toContain("enforce-entry-missing");
    expect((await drive(root, ["doctor"])).out).toContain("enforce: off");

    expect((await drive(root, ["update", "--json"])).code).toBe(0);
    expect((await readFile(abs(root, ".claude/settings.json"))).equals(original)).toBe(true);
    for (const f of [".claude/settings.json.bak", ".codex/hooks.json", ".codex/rules/wikeeper.rules", ".agents/hooks.json"]) {
      expect(await exists(root, f)).toBe(false);
    }
  }, 30_000);
});
