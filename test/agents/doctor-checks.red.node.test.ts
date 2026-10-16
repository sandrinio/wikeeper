import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/core/config.js";

// Red unit tests for STORY-002-04 doctor-checks. The module does not exist yet,
// so it is loaded through a literal dynamic import().
interface Check { id: string; severity: string; message: string; file?: string; fix?: string }
interface Input {
  root: string;
  config: any;
  agents: string[];
  manifest: { package_version: string; files: any[] };
  existing: string[];
  signature: { heading: string; reference: string };
}
interface Mod {
  AGENT_CHECK_IDS: readonly string[];
  AGENT_CHECKS: readonly unknown[];
  readBlockSignature(text: string): { heading: string; reference: string };
  checkAgentBlocks(i: Input): Promise<Check[]>;
  checkClaudeAgentsMdOnly(i: Input): Promise<Check[]>;
  checkSkillLinks(i: Input): Promise<Check[]>;
  checkCodexTrust(i: Input): Promise<Check[]>;
}
async function load(): Promise<Mod> {
  return (await import("../../src/agents/doctor-checks.js")) as unknown as Mod;
}

const START = "<!-- WIKI:START v1 — managed by wikeeper -->";
const END = "<!-- WIKI:END -->";
const SIG = { heading: "## Project Wiki", reference: ".wiki/system/WIKI.md" };
const BLOCK = `${START}\n## Project Wiki\nread \`.wiki/system/WIKI.md\`\n${END}\n`;
const cleanup: string[] = [];
afterEach(async () => {
  for (const d of cleanup.splice(0)) await rm(d, { recursive: true, force: true, maxRetries: 3 });
});

async function tmp(): Promise<string> {
  const d = await mkdtemp(path.join(os.tmpdir(), "wikeeper-dchk-"));
  cleanup.push(d);
  return d;
}
function input(root: string, over: Partial<Input> = {}): Input {
  return {
    root,
    config: { ...structuredClone(DEFAULT_CONFIG), agents: ["claude", "codex"] },
    agents: ["claude", "codex"],
    manifest: { package_version: "0.0.0", files: [{ path: "AGENTS.md", sha256: null, kind: "block", created: true }] },
    existing: ["AGENTS.md"],
    signature: SIG,
    ...over,
  };
}

describe("STORY-002-04 doctor-checks (red)", () => {
  it("exports the C8 contract", async () => {
    const m = await load();
    expect(m.AGENT_CHECK_IDS).toEqual(expect.arrayContaining([
      "agent-wiring", "agent-block-missing", "agent-block-duplicated", "agent-block-markers-deleted",
      "claude-agents-md-only", "skill-link-broken", "codex-trust",
    ]));
    expect(m.AGENT_CHECKS.length).toBeGreaterThanOrEqual(4);
  });

  it("readBlockSignature takes the first heading after START", async () => {
    const m = await load();
    expect(m.readBlockSignature(BLOCK)).toEqual(SIG);
    expect(m.readBlockSignature(`${START}\nintro\n# Other Heading \n${END}\n`).heading).toBe("# Other Heading");
  });

  it("checkAgentBlocks: healthy file returns []", async () => {
    const m = await load();
    const root = await tmp();
    await writeFile(path.join(root, "AGENTS.md"), "# Ours\n" + BLOCK);
    expect(await m.checkAgentBlocks(input(root))).toEqual([]);
  });

  it("checkAgentBlocks: missing file and empty file are agent-block-missing errors", async () => {
    const m = await load();
    const root = await tmp();
    const gone = await m.checkAgentBlocks(input(root));
    expect(gone).toEqual([expect.objectContaining({ id: "agent-block-missing", severity: "error", file: "AGENTS.md" })]);
    await writeFile(path.join(root, "AGENTS.md"), "# nothing here\n");
    const empty = await m.checkAgentBlocks(input(root));
    expect(empty).toEqual([expect.objectContaining({ id: "agent-block-missing", severity: "error", file: "AGENTS.md" })]);
  });

  it("checkAgentBlocks: two START markers (CRLF too) are agent-block-duplicated", async () => {
    const m = await load();
    const root = await tmp();
    await writeFile(path.join(root, "AGENTS.md"), (BLOCK + "\n" + BLOCK).replace(/\n/g, "\r\n"));
    const out = await m.checkAgentBlocks(input(root));
    expect(out).toEqual([expect.objectContaining({ id: "agent-block-duplicated", severity: "error", file: "AGENTS.md" })]);
  });

  it("checkAgentBlocks: START without END is agent-block-missing", async () => {
    const m = await load();
    const root = await tmp();
    await writeFile(path.join(root, "AGENTS.md"), `${START}\n## Project Wiki\n`);
    const out = await m.checkAgentBlocks(input(root));
    expect(out).toEqual([expect.objectContaining({ id: "agent-block-missing", severity: "error" })]);
  });

  it("checkAgentBlocks: block text without markers is a markers-deleted warning", async () => {
    const m = await load();
    const root = await tmp();
    await writeFile(path.join(root, "AGENTS.md"), "## Project Wiki\nsee .wiki/system/WIKI.md\n");
    const out = await m.checkAgentBlocks(input(root));
    expect(out).toEqual([expect.objectContaining({ id: "agent-block-markers-deleted", severity: "warning", file: "AGENTS.md" })]);
  });

  it("checkClaudeAgentsMdOnly fires only for claude + AGENTS.md without CLAUDE.md", async () => {
    const m = await load();
    const root = await tmp();
    const fired = await m.checkClaudeAgentsMdOnly(input(root));
    expect(fired).toEqual([expect.objectContaining({ id: "claude-agents-md-only", severity: "info", file: "AGENTS.md" })]);
    expect(await m.checkClaudeAgentsMdOnly(input(root, { existing: ["AGENTS.md", "CLAUDE.md"] }))).toEqual([]);
    expect(await m.checkClaudeAgentsMdOnly(input(root, { agents: ["codex"] }))).toEqual([]);
  });

  it("checkCodexTrust is info only when codex is configured and enforce is on", async () => {
    const m = await load();
    const root = await tmp();
    const on = { ...structuredClone(DEFAULT_CONFIG), agents: ["codex"], enforce: true };
    const out = await m.checkCodexTrust(input(root, { config: on, agents: ["codex"] }));
    expect(out).toEqual([expect.objectContaining({ id: "codex-trust", severity: "info", file: ".codex/hooks.json" })]);
    expect(await m.checkCodexTrust(input(root, { config: { ...on, enforce: false }, agents: ["codex"] }))).toEqual([]);
    expect(await m.checkCodexTrust(input(root, { config: { ...on, agents: ["claude"] }, agents: ["claude"] }))).toEqual([]);
  });

  it.skipIf(process.platform === "win32")("checkSkillLinks flags missing, non-link and dangling links", async () => {
    const m = await load();
    const root = await tmp();
    const link = (p: string) => ({ path: p, sha256: null, kind: "link", agent: "claude", mode: "symlink" });
    await mkdir(path.join(root, ".claude", "skills"), { recursive: true });
    await mkdir(path.join(root, ".agents", "skills", "wiki-setup"), { recursive: true });
    await symlink("../../.agents/skills/wiki-setup", path.join(root, ".claude", "skills", "wiki-setup"));
    await symlink("../../.agents/skills/wiki-ingest", path.join(root, ".claude", "skills", "wiki-ingest"));
    await mkdir(path.join(root, ".claude", "skills", "wiki-search"), { recursive: true });
    const manifest = {
      package_version: "0.0.0",
      files: [
        link(".claude/skills/wiki-setup"),
        link(".claude/skills/wiki-ingest"),
        link(".claude/skills/wiki-search"),
        link(".claude/skills/wiki-gone"),
      ],
    };
    const out = await m.checkSkillLinks(input(root, { manifest }));
    expect(out.every((c) => c.id === "skill-link-broken" && c.severity === "error")).toBe(true);
    expect(out).toHaveLength(3);
    const text = out.map((c) => c.message).join("\n");
    expect(text).toContain("wiki-ingest");
    expect(text).toContain("wiki-search");
    expect(text).toContain("wiki-gone");
    expect(text).not.toContain("wiki-setup");
  });
});
