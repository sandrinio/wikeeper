import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { AGENT_CHECKS, checkAgentBlocks, readBlockSignature } from "../../src/agents/doctor-checks.js";
import type { AgentCheckInput } from "../../src/agents/doctor-checks.js";

const START = "<!-- WIKI:START v1 — managed by wikeeper -->";
const END = "<!-- WIKI:END -->";
const BLOCK = `${START}\n## Project Wiki\nread .wiki/system/WIKI.md\n${END}\n`;
const dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true, maxRetries: 3 });
});

async function input(files: Record<string, string>): Promise<AgentCheckInput> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wikeeper-dc-"));
  dirs.push(root);
  for (const [f, c] of Object.entries(files)) await writeFile(path.join(root, f), c);
  return {
    root,
    config: { ...structuredClone(DEFAULT_CONFIG), agents: ["codex"] },
    agents: ["codex"],
    manifest: { package_version: "0", files: [{ path: "AGENTS.md", sha256: null, kind: "block", created: true }] },
    existing: ["AGENTS.md"],
    signature: { heading: "## Project Wiki", reference: ".wiki/system/WIKI.md" },
  };
}

describe("doctor-checks", () => {
  it("a healthy block yields no findings", async () => {
    expect(await checkAgentBlocks(await input({ "AGENTS.md": BLOCK }))).toEqual([]);
  });
  it("duplicated START markers are an error", async () => {
    const out = await checkAgentBlocks(await input({ "AGENTS.md": BLOCK + BLOCK }));
    expect(out).toEqual([expect.objectContaining({ id: "agent-block-duplicated", severity: "error", file: "AGENTS.md" })]);
  });
  it("a deleted file is reported as missing", async () => {
    const out = await checkAgentBlocks(await input({}));
    expect(out).toEqual([expect.objectContaining({ id: "agent-block-missing", file: "AGENTS.md" })]);
  });
  it("CRLF files with a BOM are read correctly", async () => {
    const text = "﻿" + BLOCK.replace(/\n/g, "\r\n");
    expect(await checkAgentBlocks(await input({ "AGENTS.md": text }))).toEqual([]);
  });
  it("readBlockSignature falls back to the default heading", () => {
    expect(readBlockSignature("no markers here").heading).toBe("## Project Wiki");
  });
  it("AGENT_CHECKS has the four core checks", () => {
    expect(AGENT_CHECKS.length).toBeGreaterThanOrEqual(4);
  });
});
