import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const load = () => import("../src/commands/init.js");
const loadInteg = () => import("../src/core/integrations.js");
const loadProgram = () => import("../src/program.js");

const START = "# >>> wikeeper >>>";
const END = "# <<< wikeeper <<<";

const tmpDirs: string[] = [];
async function repo(): Promise<string> {
  const d = await mkdtemp(path.join(os.tmpdir(), "wikeeper-init-"));
  tmpDirs.push(d);
  await mkdir(path.join(d, ".git"));
  return d;
}
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});
beforeEach(async () => {
  const { resetIntegrations } = await loadInteg();
  resetIntegrations();
});

const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");

/** posix relative paths of all entries (files and dirs) under root; dirs end with "/". */
async function listTree(root: string, includeDirs = false): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      const rel = path.relative(root, abs).split(path.sep).join("/");
      if (e.isDirectory()) {
        if (includeDirs) out.push(rel + "/");
        await walk(abs);
      } else out.push(rel);
    }
  }
  await walk(root);
  return out.sort();
}
async function hashTree(root: string): Promise<Record<string, string>> {
  const h: Record<string, string> = {};
  for (const rel of await listTree(root)) h[rel] = sha(await readFile(path.join(root, ...rel.split("/"))));
  return h;
}

async function run(root: string, args: string[]) {
  const { createInitCommand } = await load();
  const { runCli } = await loadProgram();
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(args, {
    commands: [createInitCommand()],
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
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { code, json, out: text, err: err.join("") };
}

describe("STORY-001-04 init (red)", () => {
  it("S1: init scaffolds a fresh repository", async () => {
    const { registerIntegration } = await loadInteg();
    const root = await repo();
    const handler = vi.fn();
    registerIntegration({ name: "test", init: handler });

    const r = await run(root, ["init", "--profile", "management", "--yes", "--json"]);
    expect(r.code).toBe(0);

    const tree = await listTree(root);
    for (const p of [
      ".wiki/config.yml",
      ".wiki/kb_instructions.md",
      ".wiki/system/manifest.json",
      ".wiki/system/SETUP.md",
      ".wiki/system/WIKI.md",
      ".wiki/index.md",
      ".wiki/raw/.gitkeep",
      ".wiki/pages/.gitkeep",
      ".wiki/log/.gitkeep",
      ".gitignore",
    ]) {
      expect(tree, p).toContain(p);
    }

    // manifest lists every file under .wiki/system/ except itself, kind system, real hashes
    const manifest = JSON.parse(await readFile(path.join(root, ".wiki", "system", "manifest.json"), "utf8"));
    const sysFiles = tree.filter((p) => p.startsWith(".wiki/system/") && p !== ".wiki/system/manifest.json");
    const sysEntries = manifest.files.filter((f: any) => f.kind === "system");
    expect(sysEntries.map((f: any) => f.path).sort()).toEqual(sysFiles);
    for (const f of sysEntries) {
      expect(f.sha256).toBe(sha(await readFile(path.join(root, ...f.path.split("/")))));
    }

    const gi = await readFile(path.join(root, ".gitignore"), "utf8");
    expect(gi).toContain(START);
    expect(gi).toContain(END);

    expect(handler).toHaveBeenCalledTimes(1);
    const ctx = handler.mock.calls[0]![0];
    expect(ctx.paths.systemDir).toBe(path.join(root, ".wiki", "system"));
    expect(ctx.root).toBe(root);

    expect(r.json.ok).toBe(true);
    expect(r.json.command).toBe("init");
    expect(r.json.data.manifest).toBe(".wiki/system/manifest.json");
    expect([...r.json.data.created].sort()).toEqual(tree);
  });

  it("S2: init is idempotent", async () => {
    const { registerIntegration } = await loadInteg();
    const root = await repo();
    registerIntegration({ name: "test", init: vi.fn() });
    expect((await run(root, ["init", "--yes", "--json"])).code).toBe(0);
    const before = await hashTree(root);
    const r = await run(root, ["init", "--yes", "--json"]);
    expect(r.code).toBe(0);
    expect(await hashTree(root)).toEqual(before);
    expect(r.json.data.created).toEqual([]);
    expect(r.json.data.updated).toEqual([]);
  });

  it("S3: existing user files are left alone", async () => {
    const root = await repo();
    await mkdir(path.join(root, ".wiki"), { recursive: true });
    const kb = "# my custom kb\n\npurpose: mine\n";
    await writeFile(path.join(root, ".wiki", "kb_instructions.md"), kb);
    await writeFile(path.join(root, ".gitignore"), "node_modules/\n");

    const r = await run(root, ["init", "--yes"]);
    expect(r.code).toBe(0);
    expect(await readFile(path.join(root, ".wiki", "kb_instructions.md"), "utf8")).toBe(kb);
    const gi = await readFile(path.join(root, ".gitignore"), "utf8");
    expect(gi.startsWith("node_modules/\n")).toBe(true);
    expect(gi.split("\n").filter((l) => l === START)).toHaveLength(1);
    expect(gi.split("\n").filter((l) => l === END)).toHaveLength(1);
  });

  it("S4: content_dir moves content and ignore paths", async () => {
    const root = await repo();
    await mkdir(path.join(root, ".wiki"), { recursive: true });
    await writeFile(path.join(root, ".wiki", "config.yml"), "content_dir: wiki\nprivate: [team.md]\n");

    const r = await run(root, ["init", "--yes"]);
    expect(r.code).toBe(0);
    const tree = await listTree(root);
    for (const p of ["wiki/raw/.gitkeep", "wiki/pages/.gitkeep", "wiki/log/.gitkeep", "wiki/index.md"]) {
      expect(tree, p).toContain(p);
    }
    expect(tree.some((p) => p.startsWith(".wiki/system/"))).toBe(true);
    const lines = (await readFile(path.join(root, ".gitignore"), "utf8")).split(/\r?\n/);
    expect(lines).toContain("wiki/log.md");
    expect(lines).toContain("wiki/pages/team.md");
    // config.yml is user-owned: untouched
    expect(await readFile(path.join(root, ".wiki", "config.yml"), "utf8")).toBe(
      "content_dir: wiki\nprivate: [team.md]\n",
    );
  });

  it("S5: unknown profile is rejected with exit 2 and nothing is created", async () => {
    const root = await repo();
    const before = await listTree(root, true);
    const r = await run(root, ["init", "--profile", "research", "--json"]);
    expect(r.code).toBe(2);
    expect(r.json.ok).toBe(false);
    expect(r.json.error.message).toContain("management");
    expect(await listTree(root, true)).toEqual(before);
  });

  it("S6: a handler throwing needs_input (exit 5) rolls back what this run created", async () => {
    const { registerIntegration } = await loadInteg();
    const { WikeeperError, ExitCode } = await import("../src/core/exit-codes.js");
    const root = await repo();
    await writeFile(path.join(root, ".gitignore"), "node_modules/\n");
    const before = await hashTree(root);
    const dirsBefore = await listTree(root, true);
    registerIntegration({
      name: "needy",
      init: () => {
        throw new WikeeperError(ExitCode.NEEDS_INPUT, "needs_input", "need agents", { choices: [] });
      },
    });
    const r = await run(root, ["init", "--json"]);
    expect(r.code).toBe(5);
    expect(r.json.error.code).toBe("needs_input");
    expect(await hashTree(root)).toEqual(before);
    expect(await listTree(root, true)).toEqual(dirsBefore);
  });

  it("S7: a handler throwing a plain error (exit 1) rolls back and keeps pre-existing files", async () => {
    const { registerIntegration } = await loadInteg();
    const root = await repo();
    await mkdir(path.join(root, ".wiki"), { recursive: true });
    const kb = "# custom\n";
    await writeFile(path.join(root, ".wiki", "kb_instructions.md"), kb);
    registerIntegration({
      name: "boom",
      init: () => {
        throw new Error("handler exploded");
      },
    });
    const r = await run(root, ["init", "--yes", "--json"]);
    expect(r.code).toBe(1);
    expect(await listTree(root)).toEqual([".wiki/kb_instructions.md"]);
    expect(await readFile(path.join(root, ".wiki", "kb_instructions.md"), "utf8")).toBe(kb);
    expect(await readdir(root)).not.toContain(".gitignore");
  });

  it("S8: init is registered in the default command list", async () => {
    const { defaultCommands } = await loadProgram();
    const { initCommand } = await load();
    expect(defaultCommands).toContain(initCommand);
  });
});
