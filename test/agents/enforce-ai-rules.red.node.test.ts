import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerIntegration, resetIntegrations } from "../../src/core/integrations.js";
import { runCli } from "../../src/program.js";

// Red tests for CR-001: `ai` permission mode allows only the ingest commands.
async function loadClaude(): Promise<any> {
  return await import("../../src/agents/enforce/claude.js");
}
async function loadCodex(): Promise<any> {
  return await import("../../src/agents/enforce/codex.js");
}
async function loadAgents(): Promise<any> {
  return await import("../../src/agents/index.js");
}

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXTURES = path.join(PKG_ROOT, "test", "fixtures", "settings");
const IS_WIN = process.platform === "win32";
const cleanup: string[] = [];

const NARROW_CLAUDE = ["Bash(npx wikeeper ingest *)", "Bash(wikeeper ingest *)"];
const NARROW_CODEX = [
  'prefix_rule(pattern=["npx","wikeeper","ingest"], decision="allow")',
  'prefix_rule(pattern=["wikeeper","ingest"], decision="allow")',
];
const OLD_CLAUDE = ["Bash(npx wikeeper *)", "Bash(wikeeper *)"];
const OLD_CODEX = [
  'prefix_rule(pattern=["npx","wikeeper"], decision="allow")',
  'prefix_rule(pattern=["wikeeper"], decision="allow")',
];
const ASK_RULES = [
  'prefix_rule(pattern=["npx","wikeeper","ingest","start"], decision="prompt")',
  'prefix_rule(pattern=["wikeeper","ingest","start"], decision="prompt")',
];
const SEARCH_CLAUDE = ["Bash(npx wikeeper search *)", "Bash(wikeeper search *)"];
const SEARCH_CODEX = [
  'prefix_rule(pattern=["npx","wikeeper","search"], decision="allow")',
  'prefix_rule(pattern=["wikeeper","search"], decision="allow")',
];
const ASK_CLAUDE = [
  "Bash(npx wikeeper ingest *--drop*)",
  "Bash(wikeeper ingest *--drop*)",
  "Bash(npx wikeeper ingest *--force-unlock*)",
  "Bash(wikeeper ingest *--force-unlock*)",
];
const PROMPT_CODEX = [
  'prefix_rule(pattern=["npx","wikeeper","ingest","abort"], decision="prompt")',
  'prefix_rule(pattern=["wikeeper","ingest","abort"], decision="prompt")',
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

async function tmp(prefix: string): Promise<string> {
  const d = await mkdtemp(path.join(os.tmpdir(), prefix));
  cleanup.push(d);
  return d;
}
async function pathWithWikeeper(): Promise<string> {
  const bin = await tmp("wikeeper-bin-");
  const file = path.join(bin, IS_WIN ? "wikeeper.cmd" : "wikeeper");
  await writeFile(file, IS_WIN ? "@echo off\r\n" : "#!/bin/sh\nexit 0\n");
  if (!IS_WIN) await chmod(file, 0o755);
  if (IS_WIN) vi.stubEnv("PATHEXT", ".CMD");
  vi.stubEnv("PATH", bin);
  return bin;
}
async function put(file: string, content: string | Buffer): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}
async function repo(config: string, files: Record<string, string | Buffer> = {}): Promise<string> {
  const root = await tmp("wikeeper-airules-");
  await mkdir(path.join(root, ".git"), { recursive: true });
  for (const [rel, content] of Object.entries(files)) await put(path.join(root, ...rel.split("/")), content);
  await put(path.join(root, ".wiki", "config.yml"), config);
  return root;
}
async function drive(root: string, args: string[]) {
  let out = "";
  let err = "";
  const stdout = new Writable({ write(c, _e, cb) { out += String(c); cb(); } });
  const stderr = new Writable({ write(c, _e, cb) { err += String(c); cb(); } });
  const code = await runCli(args, {
    io: { cwd: root, stdout, stderr, stdin: Readable.from([]) } as never,
  });
  const line = out.trim().split("\n").filter(Boolean).pop();
  let json: any = null;
  try { json = line ? JSON.parse(line) : null; } catch { json = null; }
  return { code, out, err, json };
}
const abs = (root: string, rel: string) => path.join(root, ...rel.split("/"));
const read = (root: string, rel: string) => readFile(abs(root, rel), "utf8");
const readJson = async (root: string, rel: string): Promise<any> => JSON.parse(await read(root, rel));
async function exists(root: string, rel: string): Promise<boolean> {
  try { await stat(abs(root, rel)); return true; } catch { return false; }
}
const ruleLines = async (root: string) =>
  (await read(root, ".codex/rules/wikeeper.rules")).split(/\r?\n/).filter(Boolean);

/** Claude `Bash(<p> *)` matches command c when c === p or c starts with p + " ". */
function claudeMatches(rule: string, command: string): boolean {
  const m = /^Bash\((.*) \*\)$/.exec(rule);
  if (!m) return false;
  const p = m[1]!;
  return command === p || command.startsWith(p + " ");
}
function codexPattern(line: string): string[] {
  const m = /pattern=(\[[^\]]*\])/.exec(line);
  return m ? (JSON.parse(m[1]!) as string[]) : [];
}
const isPrefix = (pat: string[], argv: string[]) => pat.length <= argv.length && pat.every((t, i) => argv[i] === t);

describe("CR-001 outline: init --enforce with permission ai writes only ingest allow rules (red)", () => {
  const REMOVE_CMDS = ["wikeeper remove --purge --confirm wikeeper", "npx wikeeper remove"];

  it("claude: permissions.allow is exactly the two ingest rules, none match remove", async () => {
    await pathWithWikeeper();
    const root = await repo("agents: [claude]\ningest:\n  permission: ai\n");
    const r = await drive(root, ["init", "--json", "--agents", "claude", "--enforce", "--yes"]);
    expect(r.code).toBe(0);
    const s = await readJson(root, ".claude/settings.json");
    expect(sorted(s.permissions.allow)).toEqual(sorted([...NARROW_CLAUDE, ...SEARCH_CLAUDE]));
    for (const cmd of REMOVE_CMDS) {
      for (const rule of s.permissions.allow as string[]) expect(claudeMatches(rule, cmd)).toBe(false);
    }
  });

  it("codex: wikeeper.rules holds exactly the two ingest rules, none prefix remove", async () => {
    await pathWithWikeeper();
    const root = await repo("agents: [codex]\ningest:\n  permission: ai\n");
    const r = await drive(root, ["init", "--json", "--agents", "codex", "--enforce", "--yes"]);
    expect(r.code).toBe(0);
    const lines = await ruleLines(root);
    expect(sorted(lines)).toEqual(sorted([...NARROW_CODEX, ...PROMPT_CODEX, ...SEARCH_CODEX]));
    for (const line of lines) {
      const pat = codexPattern(line);
      expect(isPrefix(pat, ["wikeeper", "remove"])).toBe(false);
      expect(isPrefix(pat, ["npx", "wikeeper", "remove"])).toBe(false);
    }
  });
});

describe("CR-001: update replaces old broad rules with the narrow ones (red)", () => {
  it("hand-built legacy state, then update leaves only the narrow pair and every user key", async () => {
    await pathWithWikeeper();
    const original = await readFile(path.join(FIXTURES, "claude-settings-user.json"));
    const root = await repo("agents: [claude, codex]\ningest:\n  permission: ai\n", {
      ".claude/settings.json": original,
    });
    expect((await drive(root, ["init", "--json", "--enforce", "--yes"])).code).toBe(0);

    // Force the legacy state (init writes the narrow rules once the CR is implemented).
    const s = await readJson(root, ".claude/settings.json");
    s.permissions.allow = [...OLD_CLAUDE];
    await writeFile(abs(root, ".claude/settings.json"), JSON.stringify(s, null, 2) + "\n");
    await writeFile(abs(root, ".codex/rules/wikeeper.rules"), OLD_CODEX.join("\n") + "\n");

    const mpath = ".wiki/system/manifest.json";
    const m = await readJson(root, mpath);
    const claudeHook = m.files.find((f: any) => f.path === ".claude/settings.json" && f.kind === "hook");
    const codexRules = m.files.find((f: any) => f.path === ".codex/rules/wikeeper.rules" && f.kind === "rule");
    const claudeCreated = claudeHook?.created ?? false;
    const codexCreated = codexRules?.created ?? true;
    m.files = m.files.filter((f: any) => f.kind !== "rule");
    for (const rule of OLD_CLAUDE) {
      m.files.push({ path: ".claude/settings.json", sha256: null, kind: "rule", agent: "claude", identity: `permissions.allow[${rule}]`, created: claudeCreated });
    }
    for (const line of OLD_CODEX) {
      m.files.push({ path: ".codex/rules/wikeeper.rules", sha256: null, kind: "rule", agent: "codex", identity: line, created: codexCreated });
    }
    await writeFile(abs(root, mpath), JSON.stringify(m, null, 2) + "\n");

    const u = await drive(root, ["update", "--json"]);
    expect(u.code).toBe(0);
    const after = await readJson(root, ".claude/settings.json");
    expect(sorted(after.permissions.allow)).toEqual(sorted([...NARROW_CLAUDE, ...SEARCH_CLAUDE]));
    expect(after.model).toBe("opus");
    expect(after.permissions.deny).toEqual(["Read(./.env)"]);
    expect(sorted(await ruleLines(root))).toEqual(sorted([...NARROW_CODEX, ...PROMPT_CODEX, ...SEARCH_CODEX]));
    const identities = (await readJson(root, mpath)).files.map((f: any) => String(f.identity ?? ""));
    expect(identities.some((i: string) => i.includes("wikeeper *]"))).toBe(false);
    for (const line of OLD_CODEX) expect(identities).not.toContain(line);
  });
});

describe("CR-001: ask and whitelist are unchanged (guard)", () => {
  it("ask writes the ask rules; whitelist then removes them", async () => {
    await pathWithWikeeper();
    const root = await repo("agents: [claude, codex]\ningest:\n  permission: ask\n");
    expect((await drive(root, ["init", "--json", "--enforce", "--yes"])).code).toBe(0);
    const s = await readJson(root, ".claude/settings.json");
    expect(s.permissions.ask).toEqual(["Bash(npx wikeeper ingest start *)", "Bash(wikeeper ingest start *)"]);
    expect(sorted(s.permissions.allow)).toEqual(sorted(SEARCH_CLAUDE));
    expect(sorted(await ruleLines(root))).toEqual(sorted([...ASK_RULES, ...SEARCH_CODEX]));

    await writeFile(abs(root, ".wiki/config.yml"), "agents: [claude, codex]\nenforce: true\ningest:\n  permission: whitelist\n");
    expect((await drive(root, ["update", "--json"])).code).toBe(0);
    const w = await readJson(root, ".claude/settings.json");
    expect(Object.keys(w.permissions)).toEqual(["allow"]);
    expect(sorted(w.permissions.allow)).toEqual(sorted(SEARCH_CLAUDE));
    expect(sorted(await ruleLines(root))).toEqual(sorted(SEARCH_CODEX));
  });
});

describe("CR-001: obsolete wildcard allow rules are gone from the writer specs (red)", () => {
  for (const mode of ["ai", "ask", "whitelist"]) {
    it(`${mode}: no writer item allows "wikeeper *" or the bare wikeeper / npx wikeeper prefixes`, async () => {
      const { CLAUDE_ENFORCE } = await loadClaude();
      const { CODEX_ENFORCE } = await loadCodex();
      const claudeValues = CLAUDE_ENFORCE.items("CMD", mode).map((i: any) => i.value);
      expect(claudeValues).not.toContain("Bash(npx wikeeper *)");
      expect(claudeValues).not.toContain("Bash(wikeeper *)");
      const codexLines = (CODEX_ENFORCE as any[])
        .flatMap((spec) => spec.items("CMD", mode))
        .map((i: any) => i.value)
        .filter((v: unknown): v is string => typeof v === "string" && v.startsWith("prefix_rule("));
      for (const line of codexLines) {
        const pat = codexPattern(line);
        expect(pat).not.toEqual(["wikeeper"]);
        expect(pat).not.toEqual(["npx", "wikeeper"]);
      }
    });
  }

  it("ai: the writers emit exactly the narrow ingest values", async () => {
    const { CLAUDE_ENFORCE } = await loadClaude();
    const { CODEX_ENFORCE } = await loadCodex();
    const claudeAllow = CLAUDE_ENFORCE.items("CMD", "ai").filter((i: any) => i.kind === "rule").map((i: any) => i.value);
    expect(claudeAllow).toEqual([...NARROW_CLAUDE, ...ASK_CLAUDE, ...SEARCH_CLAUDE]);
    expect(CODEX_ENFORCE[1].items("CMD", "ai").map((i: any) => i.value)).toEqual([...NARROW_CODEX, ...PROMPT_CODEX, ...SEARCH_CODEX]);
  });
});
