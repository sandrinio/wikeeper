import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerIntegration, resetIntegrations } from "../../src/core/integrations.js";
import { runCli } from "../../src/program.js";

// Red tests for STORY-002-06 (--enforce hooks and permission rules).
// The enforce modules do not exist yet: they are imported through literal dynamic import().
async function loadJsonMerge(): Promise<any> {
  return await import("../../src/agents/enforce/json-merge.js");
}
async function loadGuard(): Promise<any> {
  return await import("../../src/agents/enforce/guard-command.js");
}
async function loadClaude(): Promise<any> {
  return await import("../../src/agents/enforce/claude.js");
}
async function loadCodex(): Promise<any> {
  return await import("../../src/agents/enforce/codex.js");
}
async function loadAntigravity(): Promise<any> {
  return await import("../../src/agents/enforce/antigravity.js");
}
async function loadEnforce(): Promise<any> {
  return await import("../../src/agents/enforce/index.js");
}
async function loadAgents(): Promise<any> {
  return await import("../../src/agents/index.js");
}

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXTURES = path.join(PKG_ROOT, "test", "fixtures", "settings");
const IS_WIN = process.platform === "win32";
const CLAUDE_MATCHER = "Edit|Write|MultiEdit|NotebookEdit";
const cleanup: string[] = [];
const SEARCH_CLAUDE = ["Bash(npx wikeeper search *)", "Bash(wikeeper search *)"];
const SEARCH_CODEX = [
  'prefix_rule(pattern=["npx","wikeeper","search"], decision="allow")',
  'prefix_rule(pattern=["wikeeper","search"], decision="allow")',
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
/** PATH holding a fake `wikeeper`. */
async function pathWithWikeeper(): Promise<string> {
  const bin = await tmp("wikeeper-bin-");
  const file = path.join(bin, IS_WIN ? "wikeeper.cmd" : "wikeeper");
  await writeFile(file, IS_WIN ? "@echo off\r\n" : "#!/bin/sh\nexit 0\n");
  if (!IS_WIN) await chmod(file, 0o755);
  if (IS_WIN) vi.stubEnv("PATHEXT", ".CMD");
  vi.stubEnv("PATH", bin);
  return bin;
}
async function pathWithoutWikeeper(): Promise<void> {
  vi.stubEnv("PATH", await tmp("wikeeper-empty-"));
}

async function put(file: string, content: string | Buffer): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}
async function repo(config: string, files: Record<string, string | Buffer> = {}): Promise<string> {
  const root = await tmp("wikeeper-enforce-");
  await mkdir(path.join(root, ".git"), { recursive: true });
  for (const [rel, content] of Object.entries(files)) await put(path.join(root, ...rel.split("/")), content);
  await put(path.join(root, ".wiki", "config.yml"), config);
  return root;
}
async function drive(root: string, args: string[], stdin?: Readable) {
  let out = "";
  let err = "";
  const stdout = new Writable({ write(c, _e, cb) { out += String(c); cb(); } });
  const stderr = new Writable({ write(c, _e, cb) { err += String(c); cb(); } });
  const code = await runCli(args, {
    io: { cwd: root, stdout, stderr, stdin: stdin ?? Readable.from([]) } as never,
  });
  const line = out.trim().split("\n").filter(Boolean).pop();
  let json: any = null;
  try { json = line ? JSON.parse(line) : null; } catch { json = null; }
  return { code, out, err, json };
}
const abs = (root: string, rel: string) => path.join(root, ...rel.split("/"));
const read = (root: string, rel: string) => readFile(abs(root, rel), "utf8");
const readBytes = (root: string, rel: string) => readFile(abs(root, rel));
async function exists(root: string, rel: string): Promise<boolean> {
  try { await stat(abs(root, rel)); return true; } catch { return false; }
}
const readJson = async (root: string, rel: string): Promise<any> => JSON.parse(await read(root, rel));
async function manifest(root: string): Promise<{ files: any[] }> {
  return JSON.parse(await read(root, ".wiki/system/manifest.json"));
}
function guardGroups(settings: any, container: string[] = ["hooks", "PreToolUse"]): any[] {
  let cur = settings;
  for (const k of container) cur = cur?.[k];
  return Array.isArray(cur) ? cur.filter((g) => JSON.stringify(g).includes("hook guard --agent")) : [];
}
function guardCommands(groups: any[]): string[] {
  return groups.flatMap((g) => (g.hooks ?? []).map((h: any) => h.command as string));
}
async function doctor(root: string) {
  const r = await drive(root, ["doctor", "--json"]);
  return { code: r.code, checks: (r.json?.data?.checks ?? []) as Array<{ id: string; severity: string; file?: string }> };
}
function tty(chunks: string[]): Readable {
  return Object.assign(Readable.from(chunks), { isTTY: true }) as Readable;
}

describe("STORY-002-06 R1 outline: how enforcement gets turned on (red)", () => {
  const CFG = "agents: [claude]\n";

  it("--enforce flag, non-interactive: guard hook and config enforce true", async () => {
    await pathWithWikeeper();
    const root = await repo(CFG);
    const r = await drive(root, ["init", "--enforce", "--yes"]);
    expect(r.code).toBe(0);
    const groups = guardGroups(await readJson(root, ".claude/settings.json"));
    expect(groups).toHaveLength(1);
    expect(groups[0].matcher).toBe(CLAUDE_MATCHER);
    expect(await read(root, ".wiki/config.yml")).toMatch(/enforce:\s*true/);
  });

  it("config enforce: true, non-interactive: guard hook", async () => {
    await pathWithWikeeper();
    const root = await repo("agents: [claude]\nenforce: true\n");
    const r = await drive(root, ["init", "--yes"]);
    expect(r.code).toBe(0);
    expect(guardGroups(await readJson(root, ".claude/settings.json"))).toHaveLength(1);
  });

  it("no flag or config, answering y: guard hook and config enforce true", async () => {
    await pathWithWikeeper();
    const root = await repo(CFG);
    const r = await drive(root, ["init"], tty(["y\n"]));
    expect(r.code).toBe(0);
    expect(guardGroups(await readJson(root, ".claude/settings.json"))).toHaveLength(1);
    expect(await read(root, ".wiki/config.yml")).toMatch(/enforce:\s*true/);
  });

  it("no flag or config, pressing Enter: settings file not created", async () => {
    await pathWithWikeeper();
    const root = await repo(CFG);
    const r = await drive(root, ["init"], tty(["\n"]));
    expect(r.code).toBe(0);
    expect(await exists(root, ".claude/settings.json")).toBe(false);
    expect(await read(root, ".wiki/config.yml")).not.toMatch(/enforce:\s*true/);
  });

  it("no flag or config, non-interactive: settings file not created", async () => {
    await pathWithWikeeper();
    const root = await repo(CFG);
    const r = await drive(root, ["init"]);
    expect(r.code).toBe(0);
    expect(await exists(root, ".claude/settings.json")).toBe(false);
  });
});

describe("STORY-002-06 R2-R4 outline: each agent gets its hook and doctor note (red)", () => {
  const cases: Array<{ agent: string; files: string[]; note: (ids: string[]) => void }> = [
    {
      agent: "claude",
      files: [".claude/settings.json"],
      note: (ids) => {
        expect(ids.filter((i) => i.startsWith("codex-") || i.startsWith("antigravity-"))).toEqual([]);
      },
    },
    {
      agent: "codex",
      files: [".codex/hooks.json", ".codex/rules/wikeeper.rules"],
      note: (ids) => expect(ids).toContain("codex-trust"),
    },
    {
      agent: "antigravity",
      files: [".agents/hooks.json"],
      note: (ids) => {
        expect(ids).toContain("antigravity-ask-fallback");
        expect(ids).toContain("antigravity-trust");
      },
    },
  ];
  for (const c of cases) {
    it(`${c.agent}: guard entry runs "wikeeper hook guard --agent ${c.agent}" and doctor note`, async () => {
      await pathWithWikeeper();
      const root = await repo(`agents: [${c.agent}]\ningest:\n  permission: ask\n`);
      const r = await drive(root, ["init", "--enforce", "--yes"]);
      expect(r.code).toBe(0);
      for (const f of c.files) expect(await exists(root, f)).toBe(true);
      const want = `wikeeper hook guard --agent ${c.agent}`;
      if (c.agent === "claude") {
        expect(guardCommands(guardGroups(await readJson(root, ".claude/settings.json")))).toEqual([want]);
      } else if (c.agent === "codex") {
        const groups = guardGroups(await readJson(root, ".codex/hooks.json"));
        expect(guardCommands(groups)).toEqual([want]);
        expect(groups[0].matcher).toBe("apply_patch");
        expect(groups[0].hooks[0].timeout).toBe(30);
      } else {
        const file = await readJson(root, ".agents/hooks.json");
        const g = file["wikeeper-guard"].PreToolUse;
        expect(g).toHaveLength(1);
        expect(g[0].matcher).toBe("write_to_file|replace_file_content|multi_replace_file_content");
        expect(g[0].hooks).toEqual([{ type: "command", command: want, timeout: 10 }]);
      }
      const d = await doctor(root);
      expect(d.code).toBe(0);
      c.note(d.checks.map((x) => x.id));
    });
  }

  it("doctor shows no enforcement notes when enforce is off", async () => {
    await pathWithWikeeper();
    const root = await repo("agents: [claude, codex, antigravity]\ningest:\n  permission: ask\n");
    expect((await drive(root, ["init", "--yes"])).code).toBe(0);
    const ids = (await doctor(root)).checks.map((x) => x.id);
    expect(ids).not.toContain("codex-trust");
    expect(ids).not.toContain("antigravity-trust");
    expect(ids).not.toContain("antigravity-ask-fallback");
  });
});

describe("STORY-002-06 R2/R3 outline: permission mode decides the rules (red)", () => {
  const AI_RULES = [
    'prefix_rule(pattern=["npx","wikeeper","ingest"], decision="allow")',
    'prefix_rule(pattern=["wikeeper","ingest"], decision="allow")',
  ];
  const ASK_RULES = [
    'prefix_rule(pattern=["npx","wikeeper","ingest","start"], decision="prompt")',
    'prefix_rule(pattern=["wikeeper","ingest","start"], decision="prompt")',
  ];
  async function run(mode: string) {
    await pathWithWikeeper();
    const root = await repo(`agents: [claude, codex]\ningest:\n  permission: ${mode}\n`);
    const r = await drive(root, ["init", "--enforce", "--yes"]);
    expect(r.code).toBe(0);
    return root;
  }
  const lines = async (root: string) => (await read(root, ".codex/rules/wikeeper.rules")).split(/\r?\n/).filter(Boolean);

  it("ai: allow rules", async () => {
    const root = await run("ai");
    const s = await readJson(root, ".claude/settings.json");
    expect(s.permissions.allow).toEqual(expect.arrayContaining(["Bash(npx wikeeper ingest *)", "Bash(wikeeper ingest *)"]));
    expect(s.permissions.ask).toBeUndefined();
    expect(sorted(await lines(root))).toEqual(sorted([...AI_RULES, ...SEARCH_CODEX]));
  });

  it("ask: ask rules", async () => {
    const root = await run("ask");
    const s = await readJson(root, ".claude/settings.json");
    expect(s.permissions.ask).toEqual(
      expect.arrayContaining(["Bash(npx wikeeper ingest start *)", "Bash(wikeeper ingest start *)"]),
    );
    expect(sorted(s.permissions.allow)).toEqual(sorted(SEARCH_CLAUDE));
    expect(sorted(await lines(root))).toEqual(sorted([...ASK_RULES, ...SEARCH_CODEX]));
  });

  it("whitelist: no permission rule and no .rules file", async () => {
    const root = await run("whitelist");
    const s = await readJson(root, ".claude/settings.json");
    expect(s.permissions).toEqual({ allow: expect.any(Array) });
    expect(sorted(s.permissions.allow)).toEqual(sorted(SEARCH_CLAUDE));
    expect(guardGroups(s)).toHaveLength(1);
    expect(sorted(await lines(root))).toEqual(sorted(SEARCH_CODEX));
    expect(await exists(root, ".codex/hooks.json")).toBe(true);
  });

  it("switching ai to ask on re-run leaves only the ask rules", async () => {
    const root = await run("ai");
    await writeFile(abs(root, ".wiki/config.yml"), "agents: [claude, codex]\nenforce: true\ningest:\n  permission: ask\n");
    expect((await drive(root, ["init", "--yes"])).code).toBe(0);
    const s = await readJson(root, ".claude/settings.json");
    expect(sorted(s.permissions.allow)).toEqual(sorted(SEARCH_CLAUDE));
    expect(s.permissions.ask).toEqual(
      expect.arrayContaining(["Bash(npx wikeeper ingest start *)", "Bash(wikeeper ingest start *)"]),
    );
    expect(sorted(await lines(root))).toEqual(sorted([...ASK_RULES, ...SEARCH_CODEX]));
  });

  it("manifest records hook and rule entries with identities, sha256 null", async () => {
    const root = await run("ask");
    const files = (await manifest(root)).files;
    const claudeHook = files.find((f) => f.path === ".claude/settings.json" && f.kind === "hook" && f.identity === "hooks.PreToolUse[guard:claude]");
    expect(claudeHook).toBeTruthy();
    expect(claudeHook.sha256).toBeNull();
    expect(claudeHook.agent).toBe("claude");
    expect(files.some((f) => f.path === ".claude/settings.json" && f.kind === "rule" && f.identity === "permissions.ask[Bash(wikeeper ingest start *)]")).toBe(true);
    expect(files.some((f) => f.path === ".codex/rules/wikeeper.rules" && f.kind === "rule" && f.identity === ASK_RULES[0])).toBe(true);
    expect(files.some((f) => f.path === ".codex/hooks.json" && f.kind === "hook" && f.identity === "hooks.PreToolUse[guard:codex]")).toBe(true);
  });
});

describe("STORY-002-06 user settings survive install, re-run and remove (red)", () => {
  it("bak holds the original, one npx guard after two inits, remove restores bytes", async () => {
    await pathWithoutWikeeper();
    const original = await readFile(path.join(FIXTURES, "claude-settings-user.json"));
    const root = await repo("agents: [claude]\n", { ".claude/settings.json": original });
    const userKeys = (s: any) => ({ model: s.model, deny: s.permissions?.deny });

    expect((await drive(root, ["init", "--enforce", "--yes"])).code).toBe(0);
    expect((await readBytes(root, ".claude/settings.json.bak")).equals(original)).toBe(true);
    let s = await readJson(root, ".claude/settings.json");
    expect(userKeys(s)).toEqual({ model: "opus", deny: ["Read(./.env)"] });
    expect(Object.keys(s).slice(0, 2)).toEqual(["model", "permissions"]);

    expect((await drive(root, ["init", "--enforce", "--yes"])).code).toBe(0);
    s = await readJson(root, ".claude/settings.json");
    const groups = guardGroups(s);
    expect(groups).toHaveLength(1);
    expect(groups[0].hooks[0].command).toMatch(/^npx -y wikeeper@\S+ hook guard --agent claude$/);
    expect(userKeys(s)).toEqual({ model: "opus", deny: ["Read(./.env)"] });
    expect((await readBytes(root, ".claude/settings.json.bak")).equals(original)).toBe(true);

    expect((await drive(root, ["remove", "--json"])).code).toBe(0);
    expect((await readBytes(root, ".claude/settings.json")).equals(original)).toBe(true);
    expect(await exists(root, ".claude/settings.json.bak")).toBe(false);
  });

  it("a settings file wikeeper created is deleted by remove", async () => {
    await pathWithWikeeper();
    const root = await repo("agents: [claude, codex, antigravity]\ningest:\n  permission: ask\n");
    expect((await drive(root, ["init", "--enforce", "--yes"])).code).toBe(0);
    expect((await drive(root, ["remove", "--json"])).code).toBe(0);
    for (const f of [".claude/settings.json", ".codex/hooks.json", ".codex/rules/wikeeper.rules", ".agents/hooks.json"]) {
      expect(await exists(root, f)).toBe(false);
    }
  });
});

describe("STORY-002-06 malformed settings are never overwritten (red)", () => {
  it("exits 1, file byte-identical, error names file and parse error", async () => {
    await pathWithWikeeper();
    const bad = await readFile(path.join(FIXTURES, "claude-settings-malformed.json"));
    const root = await repo("agents: [claude]\n", { ".claude/settings.json": bad });
    const r = await drive(root, ["init", "--enforce", "--yes", "--json"]);
    expect(r.code).toBe(1);
    expect((await readBytes(root, ".claude/settings.json")).equals(bad)).toBe(true);
    expect(await exists(root, ".claude/settings.json.bak")).toBe(false);
    const msg = String(r.json?.error?.message ?? "");
    expect(msg).toContain(".claude/settings.json");
    expect(msg).toContain("is not valid JSON");
  });

  it("a malformed second file stops before any file is written", async () => {
    await pathWithWikeeper();
    const root = await repo("agents: [claude, codex]\n", { ".codex/hooks.json": "{ not json" });
    const r = await drive(root, ["init", "--enforce", "--yes", "--json"]);
    expect(r.code).toBe(1);
    expect(await read(root, ".codex/hooks.json")).toBe("{ not json");
    expect(await exists(root, ".claude/settings.json")).toBe(false);
  });
});

describe("STORY-002-06 json-merge units (red)", () => {
  it("CRLF + BOM round-trip keeps BOM, EOL, indent, final newline", async () => {
    const { mergeJsonFile } = await loadJsonMerge();
    const dir = await tmp("wikeeper-jm-");
    const file = path.join(dir, "s.json");
    await writeFile(file, "\uFEFF" + '{\r\n  "a": 1\r\n}\r\n');
    const res = await mergeJsonFile(file, "s.json", (v: any) => { v.b = 2; });
    expect(res.written).toBe(true);
    expect(await readFile(file, "utf8")).toBe("\uFEFF" + '{\r\n  "a": 1,\r\n  "b": 2\r\n}\r\n');
  });

  it("tab indent and missing final newline are kept", async () => {
    const { mergeJsonFile } = await loadJsonMerge();
    const dir = await tmp("wikeeper-jm-");
    const file = path.join(dir, "s.json");
    await writeFile(file, '{\n\t"a": 1\n}');
    await mergeJsonFile(file, "s.json", (v: any) => { v.b = 2; });
    expect(await readFile(file, "utf8")).toBe('{\n\t"a": 1,\n\t"b": 2\n}');
  });

  it("no write and no .bak when the result is deep-equal", async () => {
    const { mergeJsonFile } = await loadJsonMerge();
    const dir = await tmp("wikeeper-jm-");
    const file = path.join(dir, "s.json");
    await writeFile(file, '{"a":1}');
    const res = await mergeJsonFile(file, "s.json", () => {});
    expect(res.written).toBe(false);
    expect(await readFile(file, "utf8")).toBe('{"a":1}');
    expect(await exists(dir, "s.json.bak")).toBe(false);
  });

  it(".bak is written once and never over a user .bak", async () => {
    const { mergeJsonFile } = await loadJsonMerge();
    const dir = await tmp("wikeeper-jm-");
    const file = path.join(dir, "s.json");
    await writeFile(file, '{"a":1}\n');
    const first = await mergeJsonFile(file, "s.json", (v: any) => { v.b = 2; });
    expect(first.backup).toBe("s.json.bak");
    const second = await mergeJsonFile(file, "s.json", (v: any) => { v.c = 3; });
    expect(second.backup).toBeNull();
    expect(await readFile(file + ".bak", "utf8")).toBe('{"a":1}\n');

    const file2 = path.join(dir, "t.json");
    await writeFile(file2, '{"a":1}\n');
    await writeFile(file2 + ".bak", "USER");
    const r = await mergeJsonFile(file2, "t.json", (v: any) => { v.b = 2; });
    expect(r.backup).toBeNull();
    expect(await readFile(file2 + ".bak", "utf8")).toBe("USER");
  });

  it("malformed, empty and non-object roots throw settings_invalid and leave the file alone", async () => {
    const { mergeJsonFile } = await loadJsonMerge();
    const dir = await tmp("wikeeper-jm-");
    for (const [name, text] of [["bad.json", "{ not json"], ["empty.json", ""], ["arr.json", "[]"]]) {
      const file = path.join(dir, name);
      await writeFile(file, text);
      let err: any;
      try { await mergeJsonFile(file, name, (v: any) => { v.x = 1; }); } catch (e) { err = e; }
      expect(err?.code).toBe("settings_invalid");
      expect(err?.exitCode).toBe(1);
      expect(err?.message).toContain(name);
      expect(err?.details?.file).toBe(name);
      expect(await readFile(file, "utf8")).toBe(text);
    }
  });

  it("upsertArrayItem rejects a container of the wrong type", async () => {
    const { upsertArrayItem } = await loadJsonMerge();
    const root = { hooks: { PreToolUse: "x" } };
    expect(() => upsertArrayItem(root, ["hooks", "PreToolUse"], () => false, { a: 1 }, "s.json")).toThrow(/is not an array/);
  });

  it("upsertArrayItem replaces the first match and dedupes later matches", async () => {
    const { upsertArrayItem } = await loadJsonMerge();
    const root: any = { list: [{ id: 1, v: "old" }, { id: 2 }, { id: 1, v: "dup" }] };
    upsertArrayItem(root, ["list"], (e: any) => e.id === 1, { id: 1, v: "new" }, "s.json");
    expect(root.list).toEqual([{ id: 1, v: "new" }, { id: 2 }]);
    const fresh: any = {};
    upsertArrayItem(fresh, ["a", "b"], () => false, 5, "s.json");
    expect(fresh).toEqual({ a: { b: [5] } });
  });

  it("removeArrayItems prunes containers that become empty", async () => {
    const { removeArrayItems } = await loadJsonMerge();
    const root: any = { hooks: { PreToolUse: [{ id: 1 }] }, other: 1 };
    expect(removeArrayItems(root, ["hooks", "PreToolUse"], (e: any) => e.id === 1)).toBe(true);
    expect(root).toEqual({ other: 1 });
    expect(removeArrayItems(root, ["hooks", "PreToolUse"], () => true)).toBe(false);
  });
});

describe("STORY-002-06 guard-command units (red)", () => {
  // Simulates Linux with host temp paths; a win32 host path has a drive-letter colon, so the win32 case below covers that host.
  it.skipIf(IS_WIN)("PATH entry holding wikeeper gives the path form", async () => {
    const { resolveGuardForm } = await loadGuard();
    const root = await tmp("wikeeper-gc-");
    const bin = await tmp("wikeeper-gc-bin-");
    const form = resolveGuardForm({ root, env: { PATH: bin }, platform: "linux", isExecutable: (f: string) => f === path.join(bin, "wikeeper") });
    expect(form).toBe("path");
  });

  it("a PATH entry ending in node_modules/.bin is ignored", async () => {
    const { resolveGuardForm } = await loadGuard();
    const root = await tmp("wikeeper-gc-");
    const nm = path.join(root, "node_modules", ".bin");
    const form = resolveGuardForm({ root, env: { PATH: nm }, platform: "linux", isExecutable: (f: string) => f === path.join(nm, "wikeeper") });
    expect(form).toBe("npx");
  });

  // Simulates Linux with host temp paths; a win32 host path has a drive-letter colon, so the win32 case below covers that host.
  it.skipIf(IS_WIN)("local node_modules/.bin beats npx; PATH beats local", async () => {
    const { resolveGuardForm } = await loadGuard();
    const root = await tmp("wikeeper-gc-");
    const bin = path.join(root, "node_modules", ".bin");
    await mkdir(bin, { recursive: true });
    await writeFile(path.join(bin, "wikeeper"), "");
    expect(resolveGuardForm({ root, env: { PATH: "" }, platform: "linux", isExecutable: () => false })).toBe("local");
    const other = await tmp("wikeeper-gc-bin-");
    expect(
      resolveGuardForm({ root, env: { PATH: other }, platform: "linux", isExecutable: (f: string) => f === path.join(other, "wikeeper") }),
    ).toBe("path");
  });

  it("win32 matches PATHEXT case-insensitively", async () => {
    const { resolveGuardForm } = await loadGuard();
    const root = await tmp("wikeeper-gc-");
    const form = resolveGuardForm({
      root,
      env: { PATH: "C:\\bin", PATHEXT: ".COM;.CMD" },
      platform: "win32",
      isExecutable: (f: string) => f.toLowerCase().endsWith("wikeeper.cmd"),
    });
    expect(form).toBe("path");
  });

  it("guardCommand renders the table", async () => {
    const { guardCommand } = await loadGuard();
    expect(guardCommand("path", "claude", "1.2.3")).toBe("wikeeper hook guard --agent claude");
    expect(guardCommand("local", "claude", "1.2.3")).toBe('"$CLAUDE_PROJECT_DIR"/node_modules/.bin/wikeeper hook guard --agent claude');
    expect(guardCommand("local", "codex", "1.2.3")).toBe('"$(git rev-parse --show-toplevel)"/node_modules/.bin/wikeeper hook guard --agent codex');
    expect(guardCommand("local", "antigravity", "1.2.3")).toBe('"$(git rev-parse --show-toplevel)"/node_modules/.bin/wikeeper hook guard --agent antigravity');
    expect(guardCommand("npx", "codex", "1.2.3")).toBe("npx -y wikeeper@1.2.3 hook guard --agent codex");
  });
});

describe("STORY-002-06 writer specs and resolveEnforce units (red)", () => {
  it("CLAUDE_ENFORCE items per permission mode", async () => {
    const { CLAUDE_ENFORCE } = await loadClaude();
    expect(CLAUDE_ENFORCE.file).toBe(".claude/settings.json");
    expect(CLAUDE_ENFORCE.format).toBe("json");
    const ai = CLAUDE_ENFORCE.items("CMD", "ai");
    expect(ai.map((i: any) => i.identity)).toEqual([
      "hooks.PreToolUse[guard:claude]",
      "permissions.allow[Bash(npx wikeeper ingest *)]",
      "permissions.allow[Bash(wikeeper ingest *)]",
      "permissions.allow[Bash(npx wikeeper search *)]",
      "permissions.allow[Bash(wikeeper search *)]",
    ]);
    expect(ai[0]).toMatchObject({ kind: "hook", agent: "claude", value: { matcher: CLAUDE_MATCHER, hooks: [{ type: "command", command: "CMD" }] } });
    expect(CLAUDE_ENFORCE.items("CMD", "ask").map((i: any) => i.identity)).toEqual([
      "hooks.PreToolUse[guard:claude]",
      "permissions.ask[Bash(npx wikeeper ingest start *)]",
      "permissions.ask[Bash(wikeeper ingest start *)]",
      "permissions.allow[Bash(npx wikeeper search *)]",
      "permissions.allow[Bash(wikeeper search *)]",
    ]);
    expect(CLAUDE_ENFORCE.items("CMD", "whitelist")).toHaveLength(3);
  });

  it("CODEX_ENFORCE and ANTIGRAVITY_ENFORCE items", async () => {
    const { CODEX_ENFORCE } = await loadCodex();
    const { ANTIGRAVITY_ENFORCE } = await loadAntigravity();
    expect(CODEX_ENFORCE.map((s: any) => s.file)).toEqual([".codex/hooks.json", ".codex/rules/wikeeper.rules"]);
    expect(CODEX_ENFORCE[1].format).toBe("lines");
    expect(CODEX_ENFORCE[1].items("CMD", "whitelist").map((i: any) => i.value)).toEqual(SEARCH_CODEX);
    expect(CODEX_ENFORCE[1].items("CMD", "ai").map((i: any) => i.value)).toEqual([
      'prefix_rule(pattern=["npx","wikeeper","ingest"], decision="allow")',
      'prefix_rule(pattern=["wikeeper","ingest"], decision="allow")',
      ...SEARCH_CODEX,
    ]);
    expect(ANTIGRAVITY_ENFORCE.file).toBe(".agents/hooks.json");
    const items = ANTIGRAVITY_ENFORCE.items("CMD", "ask");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "hook", agent: "antigravity", identity: "wikeeper-guard" });
  });

  it("resolveEnforce: flag > config > prompt > default; never prompts non-interactively", async () => {
    const { resolveEnforce } = await loadEnforce();
    const ask = vi.fn(async () => true);
    expect(await resolveEnforce({ flag: true, config: false, interactive: true, ask })).toEqual({ enabled: true, source: "flag" });
    expect(await resolveEnforce({ flag: undefined, config: true, interactive: true, ask })).toEqual({ enabled: true, source: "config" });
    expect(ask).not.toHaveBeenCalled();
    expect(await resolveEnforce({ flag: undefined, config: false, interactive: false, ask })).toEqual({ enabled: false, source: "default" });
    expect(ask).not.toHaveBeenCalled();
    expect(await resolveEnforce({ flag: undefined, config: false, interactive: true, ask })).toEqual({ enabled: true, source: "prompt" });
    expect(await resolveEnforce({ flag: undefined, config: false, interactive: true, ask: async () => false })).toEqual({ enabled: false, source: "default" });
  });
});
