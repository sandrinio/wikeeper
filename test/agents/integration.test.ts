import { mkdir, mkdtemp, readFile, rm, writeFile, lstat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerIntegration, resetIntegrations } from "../../src/core/integrations.js";
import { agentsIntegration } from "../../src/agents/index.js";
import { runCli } from "../../src/program.js";

const dirs: string[] = [];
beforeEach(() => {
  resetIntegrations();
  registerIntegration({ name: "agents", ...agentsIntegration });
});
afterEach(async () => {
  resetIntegrations();
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true, maxRetries: 3 });
});

async function repo(config: string, files: Record<string, string> = {}): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wikeeper-int-"));
  dirs.push(root);
  await mkdir(path.join(root, ".git"));
  await mkdir(path.join(root, ".wiki"));
  await writeFile(path.join(root, ".wiki", "config.yml"), config);
  for (const [f, c] of Object.entries(files)) await writeFile(path.join(root, f), c);
  return root;
}
async function run(root: string, args: string[], stdin: string[] = []) {
  let out = "";
  let err = "";
  const stdout = new Writable({ write(c, _e, cb) { out += String(c); cb(); } });
  const stderr = new Writable({ write(c, _e, cb) { err += String(c); cb(); } });
  const code = await runCli(args, { io: { cwd: root, stdout, stderr, stdin: Readable.from(stdin) } as never });
  return { code, out, err };
}
const read = (root: string, rel: string) => readFile(path.join(root, ...rel.split("/")), "utf8");
async function exists(root: string, rel: string): Promise<boolean> {
  try { await lstat(path.join(root, ...rel.split("/"))); return true; } catch { return false; }
}

describe("agents integration", () => {
  it("init without agents and without a TTY exits 5", async () => {
    const root = await repo("");
    expect((await run(root, ["init", "--yes", "--json"])).code).toBe(5);
  });

  it("init --agents saves the choice to config and wires the files", async () => {
    const root = await repo("");
    const r = await run(root, ["init", "--agents", "claude", "--yes"]);
    expect(r.code).toBe(0);
    expect(await read(root, ".wiki/config.yml")).toContain("claude");
    expect(await exists(root, "AGENTS.md")).toBe(true);
    expect(await exists(root, ".claude/agents/wiki-writer.md")).toBe(true);
  });

  it("de-configuring an agent prunes its files and strips its block on init", async () => {
    const root = await repo("agents: [claude]\n", { "CLAUDE.md": "# Team\n" });
    expect((await run(root, ["init", "--yes"])).code).toBe(0);
    expect(await exists(root, ".claude/agents/wiki-writer.md")).toBe(true);
    const r = await run(root, ["init", "--yes", "--agents", "codex"]);
    expect(r.code).toBe(0);
    expect(await exists(root, ".claude/agents/wiki-writer.md")).toBe(false);
    expect(await read(root, "CLAUDE.md")).toBe("# Team\n");
    expect(await exists(root, ".codex/agents/wiki-writer.toml")).toBe(true);
  });

  it("remove keeps an agent file that gained user text, stripping only the block", async () => {
    const root = await repo("agents: [codex]\n");
    expect((await run(root, ["init", "--yes"])).code).toBe(0);
    await writeFile(path.join(root, "AGENTS.md"), (await read(root, "AGENTS.md")) + "\nmine\n");
    expect((await run(root, ["remove", "--json"])).code).toBe(0);
    expect((await read(root, "AGENTS.md")).trim()).toBe("mine");
  });

  it("update with no configured agents is a no-op", async () => {
    const root = await repo("agents: [codex]\n");
    expect((await run(root, ["init", "--yes"])).code).toBe(0);
    expect((await run(root, ["update", "--json"])).code).toBe(0);
  });
});
