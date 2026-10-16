import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readdir, readlink, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { stripBlock } from "../../src/agents/inject.js";

// Goal Acceptance Check items 1-4 (SPRINT-01), run against the packed package.
const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let tmp = "";
let cli = "";

beforeAll(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "wikeeper-goal-"));
  execFileSync(process.execPath, [path.join(PKG_ROOT, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.build.json"], {
    cwd: PKG_ROOT,
    stdio: "pipe",
  });
  // Never spawn npm / npm.cmd directly: Node >= 20 rejects .cmd without a shell on Windows (EINVAL).
  const npmExec = process.env["npm_execpath"];
  const packArgs = ["pack", "--json", "--pack-destination", tmp];
  const packed = npmExec
    ? execFileSync(process.execPath, [npmExec, ...packArgs], { cwd: PKG_ROOT, encoding: "utf8" })
    : execFileSync("npm", packArgs, { cwd: PKG_ROOT, encoding: "utf8", shell: true });
  const info = JSON.parse(packed) as Array<{ filename: string }>;
  execFileSync("tar", ["-xzf", path.join(tmp, info[0]!.filename), "-C", tmp]);
  await symlink(path.join(PKG_ROOT, "node_modules"), path.join(tmp, "package", "node_modules"), "junction");
  cli = path.join(tmp, "package", "dist", "cli.js");
}, 180_000);

afterAll(async () => {
  if (tmp) await rm(tmp, { recursive: true, force: true, maxRetries: 3 });
});

function wk(cwd: string, args: string[]) {
  const r = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

async function list(root: string, dirs = true): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      const rel = path.relative(root, abs).split(path.sep).join("/");
      if (e.isDirectory()) {
        if (dirs) out.push(rel + "/");
        await walk(abs);
      } else out.push(rel);
    }
  };
  await walk(root);
  return out.sort();
}
async function hashes(root: string): Promise<Record<string, string>> {
  const h: Record<string, string> = {};
  for (const rel of await list(root, false)) {
    const abs = path.join(root, ...rel.split("/"));
    const data = (await lstat(abs)).isSymbolicLink() ? `link:${await readlink(abs)}` : await readFile(abs);
    h[rel] = createHash("sha256").update(data).digest("hex");
  }
  return h;
}

const FIXTURES: Record<string, Record<string, string>> = {
  empty: {},
  "agents-md": { "AGENTS.md": "# Ours\n\nkeep me\n" },
  "claude-md": { "CLAUDE.md": "# Team rules\n" },
};

describe.each(Object.keys(FIXTURES))("goal acceptance: %s fixture", (name) => {
  const make = async (): Promise<string> => {
    const root = await mkdtemp(path.join(tmp, `${name}-`));
    await mkdir(path.join(root, ".git"));
    for (const [f, c] of Object.entries(FIXTURES[name]!)) await writeFile(path.join(root, f), c);
    return root;
  };
  const AGENTS = ["init", "--json", "--agents", "claude,codex,antigravity"];

  it("(1) init installs the file set and touches nothing outside the markers", async () => {
    const root = await make();
    const r = wk(root, AGENTS);
    expect(r.code, r.err + r.out).toBe(0);
    const all = await list(root);
    expect(all).toContain(".wiki/system/manifest.json");
    for (const s of ["wiki-setup", "wiki-ingest", "wiki-search"]) {
      expect(all).toContain(`.agents/skills/${s}/SKILL.md`);
      expect(all.some((p) => p.startsWith(`.claude/skills/${s}`))).toBe(true);
    }
    for (const d of [".claude/agents", ".agents/agents", ".codex/agents"]) {
      expect(all.filter((p) => p.startsWith(`${d}/`) && !p.endsWith("/"))).toHaveLength(2);
    }
    for (const [f, original] of Object.entries(FIXTURES[name]!)) {
      expect(stripBlock(await readFile(path.join(root, f), "utf8")).text).toBe(original);
    }
    if (name !== "claude-md") expect(all).not.toContain("CLAUDE.md");
    expect(all).toContain("AGENTS.md");
  });

  it("(2) a second init changes 0 bytes", async () => {
    const root = await make();
    expect(wk(root, AGENTS).code).toBe(0);
    const before = await hashes(root);
    const r = wk(root, AGENTS);
    expect(r.code, r.err).toBe(0);
    expect(await hashes(root)).toEqual(before);
  });

  it("(3) update and remove leave user files alone; purge restores the tree", async () => {
    const root = await make();
    const pre = await list(root);
    const preHash = await hashes(root);
    expect(wk(root, AGENTS).code).toBe(0);
    const u = wk(root, ["update", "--json"]);
    expect(u.code, u.err).toBe(0);
    for (const f of Object.keys(FIXTURES[name]!)) {
      expect(stripBlock(await readFile(path.join(root, f), "utf8")).text).toBe(FIXTURES[name]![f]);
    }
    const rm1 = wk(root, ["remove", "--json"]);
    expect(rm1.code, rm1.err).toBe(0);
    const post = await hashes(root);
    for (const f of Object.keys(preHash)) expect(post[f]).toBe(preHash[f]);
    const outside = (await list(root)).filter((p) => !p.startsWith(".wiki/") && p !== ".wiki/");
    expect(outside).toEqual(pre.filter((p) => !p.startsWith(".wiki/") && p !== ".wiki/"));

    expect(wk(root, AGENTS).code).toBe(0);
    const purge = wk(root, ["remove", "--purge", "--confirm", "wikeeper", "--json"]);
    expect(purge.code, purge.err).toBe(0);
    expect(await list(root)).toEqual(pre);
    expect(await hashes(root)).toEqual(preHash);
  });

  it("(4) doctor passes after init and reports a deleted WIKI block", async () => {
    const root = await make();
    expect(wk(root, AGENTS).code).toBe(0);
    const ok = wk(root, ["doctor", "--json"]);
    expect(ok.code, ok.out).toBe(0);
    await writeFile(path.join(root, "AGENTS.md"), "");
    const bad = wk(root, ["doctor", "--json"]);
    expect(bad.code).toBe(1);
    const parsed = JSON.parse(bad.out.trim().split("\n").pop()!) as { data: { checks: Array<{ id: string; file?: string }> } };
    expect(parsed.data.checks.some((c) => c.id === "agent-block-missing" && c.file === "AGENTS.md")).toBe(true);
  });
});
