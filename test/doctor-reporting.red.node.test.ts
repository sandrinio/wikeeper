import { mkdir, mkdtemp, readFile, rm, writeFile, lstat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/program.js";
import { setConfigValue } from "../src/core/config.js";
import { resetIntegrations } from "../src/core/integrations.js";

// Red tests for STORY-002-07 (doctor reporting). New exports are loaded through literal dynamic imports.
const cleanup: string[] = [];
beforeEach(() => {
  resetIntegrations();
});
afterEach(async () => {
  vi.unstubAllEnvs();
  resetIntegrations();
  for (const d of cleanup.splice(0)) await rm(d, { recursive: true, force: true, maxRetries: 3 });
});

async function tmp(prefix = "wikeeper-dr-"): Promise<string> {
  const d = await mkdtemp(path.join(os.tmpdir(), prefix));
  cleanup.push(d);
  return d;
}
async function repo(): Promise<string> {
  vi.stubEnv("PATH", await tmp("wikeeper-empty-"));
  const root = await tmp();
  await mkdir(path.join(root, ".git"), { recursive: true });
  return root;
}
const abs = (root: string, rel: string) => path.join(root, ...rel.split("/"));
async function exists(root: string, rel: string): Promise<boolean> {
  try { await lstat(abs(root, rel)); return true; } catch { return false; }
}
async function drive(root: string, args: string[]) {
  let out = "";
  const stdout = new Writable({ write(c, _e, cb) { out += String(c); cb(); } });
  const stderr = new Writable({ write(_c, _e, cb) { cb(); } });
  const code = await runCli(args, { io: { cwd: root, stdout, stderr, stdin: Readable.from([]) } as never });
  const lines = out.trim().split("\n").filter(Boolean);
  const last = lines[lines.length - 1];
  let json: any = null;
  try { json = last ? JSON.parse(last) : null; } catch { json = null; }
  return { code, json, out, last: last ?? "" };
}
async function init(root: string, args: string[]): Promise<void> {
  expect((await drive(root, ["init", "--json", "--yes", ...args])).code).toBe(0);
}
const check = (r: { json: any }, id: string) => (r.json?.data?.checks ?? []).find((c: any) => c.id === id);
const manifest = async (root: string) => JSON.parse(await readFile(abs(root, ".wiki/system/manifest.json"), "utf8")).files as any[];
const USER_SETTINGS = JSON.stringify({ permissions: { allow: ["Bash(ls)"] } }, null, 2) + "\n";

describe("STORY-002-07 @rules: claude-agents-md-only is information (red)", () => {
  it("info severity, 0 warnings, exit 0, human summary 0 errors, 0 warnings", async () => {
    const root = await repo();
    await init(root, ["--agents", "claude"]);
    expect(await exists(root, "CLAUDE.md")).toBe(false);
    const j = await drive(root, ["doctor", "--json"]);
    const c = check(j, "claude-agents-md-only");
    expect(c?.severity).toBe("info");
    expect(c?.message).toContain("older than v2.1.277");
    expect(j.json.data.warnings).toBe(0);
    expect(j.code).toBe(0);
    expect((await drive(root, ["doctor"])).last).toBe("0 errors, 0 warnings");
  });
});

describe("STORY-002-07 @data: the effective state is reported (red)", () => {
  const rows = [
    { permission: undefined, stamp: undefined, mode: "ask", dflt: true, setup: null, printed: "ask (default)" },
    { permission: "ask", stamp: undefined, mode: "ask", dflt: false, setup: null, printed: "ask" },
    { permission: "whitelist", stamp: "2026-10-16T12:00:00Z", mode: "whitelist", dflt: false, setup: "2026-10-16T12:00:00Z", printed: "whitelist" },
  ];
  for (const row of rows) {
    it(`permission ${row.permission ?? "(unset)"}, stamp ${row.stamp ?? "(unset)"}`, async () => {
      const root = await repo();
      await init(root, ["--agents", "claude"]);
      if (row.permission) await setConfigValue(root, "ingest.permission", row.permission);
      if (row.stamp) await setConfigValue(root, "setup_completed_at", row.stamp);
      const j = await drive(root, ["doctor", "--json"]);
      expect(j.json.data.state.permission).toEqual({ mode: row.mode, default: row.dflt });
      expect(j.json.data.state.setup_completed_at).toBe(row.setup);
      const human = await drive(root, ["doctor"]);
      expect(human.out.split("\n")).toContain(`ingest permission: ${row.printed}`);
      expect(human.out).toContain("setup: ");
    });
  }
  it("unset setup prints the SETUP.md hint", async () => {
    const root = await repo();
    await init(root, ["--agents", "claude"]);
    expect((await drive(root, ["doctor"])).out).toContain("setup: not completed — ask your agent to follow .wiki/system/SETUP.md");
  });
});

describe("STORY-002-07 @paths: enforce entries listed and missing ones flagged (red)", () => {
  async function enforced(): Promise<string> {
    const root = await repo();
    await init(root, ["--agents", "claude,codex", "--enforce"]);
    return root;
  }
  function expectedAgents(files: any[]) {
    const owned = files.filter((e) => (e.kind === "hook" || e.kind === "rule") && e.identity !== "backup" && e.agent);
    const out: any[] = [];
    for (const agent of ["claude", "codex"]) {
      const mine = owned.filter((e) => e.agent === agent);
      if (!mine.length) continue;
      const paths = [...new Set(mine.map((e) => e.path as string))].sort();
      out.push({
        agent,
        files: paths.map((file) => ({
          file,
          hooks: mine.filter((e) => e.path === file && e.kind === "hook").map((e) => e.identity),
          rules: mine.filter((e) => e.path === file && e.kind === "rule").map((e) => e.identity),
        })),
      });
    }
    return out;
  }
  it("nothing changed: state.enforce matches the manifest, no enforce-entry-missing", async () => {
    const root = await enforced();
    const j = await drive(root, ["doctor", "--json"]);
    expect(j.json.data.state.enforce.enabled).toBe(true);
    const want = expectedAgents(await manifest(root));
    expect(want.length).toBeGreaterThan(0);
    expect(j.json.data.state.enforce.agents).toEqual(want);
    expect(check(j, "enforce-entry-missing")).toBeUndefined();
    expect((await drive(root, ["doctor"])).out).toContain("enforce: on — claude: .claude/settings.json");
  });
  it("guard hook deleted from .claude/settings.json: warning naming file and identity", async () => {
    const root = await enforced();
    const file = abs(root, ".claude/settings.json");
    const doc = JSON.parse(await readFile(file, "utf8"));
    doc.hooks.PreToolUse = doc.hooks.PreToolUse.filter((h: unknown) => !/guard/i.test(JSON.stringify(h)));
    await writeFile(file, JSON.stringify(doc, null, 2) + "\n");
    const j = await drive(root, ["doctor", "--json"]);
    const c = check(j, "enforce-entry-missing");
    expect(c?.severity).toBe("warning");
    expect(c?.message).toContain(".claude/settings.json");
    expect(c?.message).toContain("hooks.PreToolUse[guard:claude]");
    expect(c?.fix).toBe("run wikeeper update");
  });
});

describe("STORY-002-07 @rules: backups no remove will handle are flagged (red)", () => {
  it("orphaned: hand-written .claude/settings.json.bak", async () => {
    const root = await repo();
    await init(root, ["--agents", "claude", "--enforce"]);
    await writeFile(abs(root, ".claude/settings.json.bak"), "{}\n");
    const j = await drive(root, ["doctor", "--json"]);
    const c = check(j, "backup-orphaned");
    expect(c?.severity).toBe("warning");
    expect(c?.message).toContain(".claude/settings.json.bak");
    expect(j.code).toBe(0);
    expect((await drive(root, ["doctor"])).last).toBe("0 errors, 1 warning");
  });
  it("stale: manifest records the backup but the file holds no wikeeper entry", async () => {
    const root = await repo();
    await mkdir(abs(root, ".claude"), { recursive: true });
    await writeFile(abs(root, ".claude/settings.json"), USER_SETTINGS);
    await init(root, ["--agents", "claude,codex", "--enforce"]);
    await setConfigValue(root, "agents", ["codex"]);
    expect((await drive(root, ["update", "--json"])).code).toBe(0);
    const j = await drive(root, ["doctor", "--json"]);
    const c = check(j, "backup-stale");
    expect(c?.severity).toBe("warning");
    expect(c?.message).toContain(".claude/settings.json.bak");
    expect(j.code).toBe(0);
    expect((await drive(root, ["doctor"])).last).toBe("0 errors, 1 warning");
  });
});

describe("STORY-002-07 error: an unreadable settings file is reported, not thrown (red)", () => {
  it("enforce-settings-invalid error, exit 1, 1 error, 0 warnings", async () => {
    const root = await repo();
    await init(root, ["--agents", "claude", "--enforce"]);
    await writeFile(abs(root, ".claude/settings.json"), "{ not json");
    const j = await drive(root, ["doctor", "--json"]);
    const c = check(j, "enforce-settings-invalid");
    expect(c?.severity).toBe("error");
    expect(c?.message + (c?.file ?? "")).toContain(".claude/settings.json");
    expect(j.code).toBe(1);
    expect((await drive(root, ["doctor"])).last).toBe("1 error, 0 warnings");
  });
});

describe("STORY-002-07 units (red)", () => {
  it("configKeyIsSet: set, unset, missing file, unparsable file", async () => {
    const { configKeyIsSet } = (await import("../src/core/config.js")) as unknown as {
      configKeyIsSet(root: string, k: string): Promise<boolean>;
    };
    const root = await tmp();
    expect(await configKeyIsSet(root, "ingest.permission")).toBe(false);
    await mkdir(path.join(root, ".wiki"), { recursive: true });
    const cfg = path.join(root, ".wiki", "config.yml");
    await writeFile(cfg, "agents: [claude]\n");
    expect(await configKeyIsSet(root, "ingest.permission")).toBe(false);
    await writeFile(cfg, "ingest:\n  permission: ask\n");
    expect(await configKeyIsSet(root, "ingest.permission")).toBe(true);
    await writeFile(cfg, "ingest: [unclosed\n  : :\n");
    expect(await configKeyIsSet(root, "ingest.permission")).toBe(false);
    await writeFile(cfg, "﻿ingest:\r\n  permission: ask\r\n");
    expect(await configKeyIsSet(root, "ingest.permission")).toBe(true);
  });

  it("plural: singular only for exactly 1", async () => {
    const { plural } = (await import("../src/commands/doctor.js")) as unknown as { plural(n: number, w: string): string };
    expect(plural(0, "error")).toBe("0 errors");
    expect(plural(1, "warning")).toBe("1 warning");
    expect(plural(2, "warning")).toBe("2 warnings");
  });

  it("inspectOwnedEntries: JSON file intact, entry missing, file invalid", async () => {
    const m = (await import("../src/agents/enforce/index.js")) as unknown as {
      ENFORCE_JSON_FILES: readonly string[];
      inspectOwnedEntries(root: string, mf: any): Promise<Array<{ file: string; agent: string; missing: string[]; invalid: boolean }>>;
    };
    expect([...m.ENFORCE_JSON_FILES].sort()).toEqual([".agents/hooks.json", ".claude/settings.json", ".codex/hooks.json", ".github/hooks/wikeeper.json"]);
    const root = await repo();
    await init(root, ["--agents", "claude", "--enforce"]);
    const mf = { package_version: "0.0.0", files: await manifest(root) };
    const ok = await m.inspectOwnedEntries(root, mf);
    const claude = ok.find((r) => r.file === ".claude/settings.json");
    expect(claude).toMatchObject({ agent: "claude", missing: [], invalid: false });
    const file = abs(root, ".claude/settings.json");
    const doc = JSON.parse(await readFile(file, "utf8"));
    doc.hooks.PreToolUse = doc.hooks.PreToolUse.filter((h: unknown) => !/guard/i.test(JSON.stringify(h)));
    await writeFile(file, JSON.stringify(doc));
    const gone = (await m.inspectOwnedEntries(root, mf)).find((r) => r.file === ".claude/settings.json");
    expect(gone?.missing).toContain("hooks.PreToolUse[guard:claude]");
    await writeFile(file, "{ not json");
    const bad = (await m.inspectOwnedEntries(root, mf)).find((r) => r.file === ".claude/settings.json");
    expect(bad).toMatchObject({ invalid: true, missing: [] });
  });

  it("doctor-checks.ts imports on its own and lists the new ids (no import cycle)", async () => {
    const m = (await import("../src/agents/doctor-checks.js")) as unknown as { AGENT_CHECK_IDS: readonly string[] };
    expect(m.AGENT_CHECK_IDS).toEqual(
      expect.arrayContaining(["enforce-entry-missing", "enforce-settings-invalid", "backup-orphaned", "backup-stale"]),
    );
  });
});
