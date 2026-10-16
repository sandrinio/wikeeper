import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, lstat, readlink, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

type Agent = "claude" | "codex" | "antigravity";
interface Entry { path: string; sha256: string | null; kind: string; agent?: string; mode?: string }
interface Manifest { package_version: string; files: Entry[] }
interface Result { created: string[]; replaced: string[]; skipped: string[]; dirs: string[]; warnings: string[] }
interface SkillsModule {
  installSkills(o: Record<string, unknown>): Promise<Result>;
  skillConflicts(o: Record<string, unknown>): Promise<string[]>;
}
interface SubModule {
  installAgentAssets(o: Record<string, unknown>): Promise<Result>;
}

async function loadSkills(): Promise<SkillsModule> {
  return (await import("../../src/agents/skills.js")) as unknown as SkillsModule;
}
async function loadSub(): Promise<SubModule> {
  return (await import("../../src/agents/subagents.js")) as unknown as SubModule;
}

const SKILLS = ["wiki-setup", "wiki-ingest", "wiki-search"];
const config = { ingest: { extractor_model: "small", writer_model: "medium" } };

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "wikeeper-skills-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 3 });
});

async function walk(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    const rel = path.relative(base, full).split(path.sep).join("/");
    out.push(rel);
    if (e.isDirectory()) out.push(...(await walk(full, base)));
  }
  return out.sort();
}
async function treeHash(): Promise<string> {
  const h = createHash("sha256");
  for (const rel of await walk(root)) {
    const full = path.join(root, ...rel.split("/"));
    const st = await lstat(full);
    h.update(rel);
    if (st.isSymbolicLink()) h.update("L" + (await readlink(full)));
    else if (st.isFile()) h.update(await readFile(full));
    else h.update("D");
  }
  return h.digest("hex");
}
function newManifest(): Manifest {
  return { package_version: "0.0.0", files: [] };
}

describe("STORY-002-03 skills", () => {
  it("Install for all three agents: skills, claude links, sub-agents, manifest, idempotent", async () => {
    const { installAgentAssets } = await loadSub();
    const manifest = newManifest();
    const agents: Agent[] = ["claude", "codex", "antigravity"];
    await installAgentAssets({ root, agents, config, manifest });

    for (const s of SKILLS) {
      expect((await lstat(path.join(root, ".agents", "skills", s, "SKILL.md"))).isFile()).toBe(true);
    }
    const link = path.join(root, ".claude", "skills", "wiki-ingest");
    if (process.platform !== "win32") {
      expect((await lstat(link)).isSymbolicLink()).toBe(true);
      expect(await readlink(link)).toBe("../../.agents/skills/wiki-ingest");
      expect(manifest.files.find((f) => f.path === ".claude/skills/wiki-ingest")?.mode).toBe("symlink");
    } else {
      expect(manifest.files.some((f) => f.path.startsWith(".claude/skills/wiki-ingest/") && f.mode === "copy")).toBe(true);
    }
    for (const base of [".claude/agents", ".agents/agents"]) {
      for (const n of ["wiki-extractor", "wiki-writer"]) {
        expect((await lstat(path.join(root, ...base.split("/"), `${n}.md`))).isFile()).toBe(true);
      }
    }
    for (const n of ["wiki-extractor", "wiki-writer"]) {
      expect((await lstat(path.join(root, ".codex", "agents", `${n}.toml`))).isFile()).toBe(true);
    }
    for (const e of manifest.files) {
      expect(e.kind).toBeTruthy();
      expect(e.agent).toBeTruthy();
    }
    expect(manifest.files.some((f) => f.path === ".agents/skills/wiki-setup/SKILL.md" && f.kind === "skill" && f.agent === "shared")).toBe(true);
    expect(manifest.files.some((f) => f.path === ".claude/agents/wiki-writer.md" && f.kind === "subagent" && f.agent === "claude")).toBe(true);
    const sub = manifest.files.find((f) => f.path === ".codex/agents/wiki-extractor.toml");
    const bytes = await readFile(path.join(root, ".codex", "agents", "wiki-extractor.toml"));
    expect(sub?.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));

    const before = await treeHash();
    const manifestBefore = JSON.parse(JSON.stringify(manifest));
    const second = await installAgentAssets({ root, agents, config, manifest });
    expect(await treeHash()).toBe(before);
    expect(manifest).toEqual(manifestBefore);
    expect(second.created).toEqual([]);
  });

  it("Symlink failure falls back to copying with mode copy", async () => {
    const { installSkills } = await loadSkills();
    const manifest = newManifest();
    const symlink = async (): Promise<void> => {
      throw Object.assign(new Error("denied"), { code: "EPERM" });
    };
    await installSkills({ root, agents: ["claude"], manifest, platform: "linux", symlink });
    const dir = path.join(root, ".claude", "skills", "wiki-ingest");
    const st = await lstat(dir);
    expect(st.isSymbolicLink()).toBe(false);
    expect(st.isDirectory()).toBe(true);
    expect((await lstat(path.join(dir, "SKILL.md"))).isFile()).toBe(true);
    const claudeEntries = manifest.files.filter((f) => f.path.startsWith(".claude/skills/wiki-ingest"));
    expect(claudeEntries.length).toBeGreaterThan(0);
    for (const e of claudeEntries) {
      expect(e.mode).toBe("copy");
      expect(e.kind).toBe("skill");
      expect(e.agent).toBe("claude");
    }
  });

  it("Unconfigured agents get nothing", async () => {
    const { installAgentAssets } = await loadSub();
    const manifest = newManifest();
    await installAgentAssets({ root, agents: ["codex"], config, manifest });
    const top = await readdir(root);
    expect(top).not.toContain(".claude");
    expect(await walk(root)).not.toContain(".agents/agents");
    const codex = await readdir(path.join(root, ".codex", "agents"));
    expect(codex.sort()).toEqual(["wiki-extractor.toml", "wiki-writer.toml"]);
  });

  it("Error: an unowned file blocks the install and nothing is written", async () => {
    const { installAgentAssets } = await loadSub();
    await mkdir(path.join(root, ".claude", "agents"), { recursive: true });
    await writeFile(path.join(root, ".claude", "agents", "wiki-writer.md"), "mine\n");
    const before = await treeHash();
    const manifest = newManifest();
    let err: unknown;
    try {
      await installAgentAssets({ root, agents: ["claude", "codex", "antigravity"], config, manifest });
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    const we = err as { exitCode?: number; message: string; name: string };
    expect(we.name).toBe("WikeeperError");
    expect(we.exitCode).toBe(1);
    expect(we.message).toContain(".claude/agents/wiki-writer.md");
    expect(await treeHash()).toBe(before);
    expect(await walk(root)).not.toContain(".agents");
    expect(manifest.files).toEqual([]);
  });

  it("skillConflicts lists unowned skill paths", async () => {
    const { skillConflicts } = await loadSkills();
    await mkdir(path.join(root, ".agents", "skills", "wiki-setup"), { recursive: true });
    await writeFile(path.join(root, ".agents", "skills", "wiki-setup", "SKILL.md"), "mine\n");
    const list = await skillConflicts({ root, agents: ["codex"], manifest: newManifest() });
    expect(list).toContain(".agents/skills/wiki-setup/SKILL.md");
  });
});
