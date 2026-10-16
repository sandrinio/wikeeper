import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { createAskAgents, createLineReader, parseAgentSelection } from "../../src/agents/ask-agents.js";
import {
  detectAgentFiles,
  needsInputError,
  parseAgentList,
  readersOf,
  resolveAgents,
  resolveTargets,
  type AgentFile,
} from "../../src/agents/detect.js";
import type { AgentName } from "../../src/agents/agent-names.js";

const rows: Array<[AgentFile[], AgentName[], Array<{ path: string; create: boolean }>]> = [
  [["CLAUDE.md", "AGENTS.md"], ["claude", "codex"], [{ path: "CLAUDE.md", create: false }, { path: "AGENTS.md", create: false }]],
  [["CLAUDE.md"], ["codex"], [{ path: "AGENTS.md", create: true }]],
  [["CLAUDE.md"], ["claude"], [{ path: "CLAUDE.md", create: false }]],
  [["GEMINI.md"], ["antigravity"], [{ path: "GEMINI.md", create: false }]],
  [["AGENTS.md", "GEMINI.md"], ["antigravity"], [{ path: "AGENTS.md", create: false }, { path: "GEMINI.md", create: false }]],
  [[], ["claude", "antigravity"], [{ path: "AGENTS.md", create: true }]],
];

describe("resolveTargets", () => {
  it.each(rows)("files %j agents %j", (files, agents, expected) => {
    expect(resolveTargets(agents, files)).toEqual(expected);
  });
  it("creates AGENTS.md between CLAUDE.md and GEMINI.md", () => {
    expect(resolveTargets(["claude", "codex", "antigravity"], ["CLAUDE.md", "GEMINI.md"])).toEqual([
      { path: "CLAUDE.md", create: false },
      { path: "AGENTS.md", create: true },
      { path: "GEMINI.md", create: false },
    ]);
  });
  it("readersOf honours whenAbsent", () => {
    expect(readersOf("AGENTS.md", ["CLAUDE.md"])).toEqual(["codex", "antigravity"]);
  });
});

describe("detectAgentFiles (integration)", () => {
  it("finds exact-case root files only", async () => {
    const d = await mkdtemp(path.join(os.tmpdir(), "wikeeper-d-"));
    try {
      await writeFile(path.join(d, "GEMINI.md"), "x");
      await writeFile(path.join(d, "claude.md"), "x");
      expect(await detectAgentFiles(d)).toEqual(["GEMINI.md"]);
    } finally {
      await rm(d, { recursive: true, force: true });
    }
  });
});

describe("resolveAgents", () => {
  it("flag beats config, no prompt", async () => {
    const ask = vi.fn();
    const r = await resolveAgents({ flag: "codex", config: { agents: ["claude"] }, isTTY: true, json: false, existing: [], ask });
    expect(r).toEqual({ status: "resolved", agents: ["codex"], source: "flag" });
    expect(ask).not.toHaveBeenCalled();
  });
  it("prompt result is returned", async () => {
    const ask = vi.fn().mockResolvedValue(["claude", "codex"]);
    const r = await resolveAgents({ config: { agents: [] }, isTTY: true, json: false, existing: [], ask });
    expect(r).toEqual({ status: "resolved", agents: ["claude", "codex"], source: "prompt" });
  });
  it("non-interactive needs input, exit 5", async () => {
    const r = await resolveAgents({ config: { agents: [] }, isTTY: false, json: false, existing: ["AGENTS.md"], ask: vi.fn() });
    if (r.status !== "needs_input") throw new Error("expected needs_input");
    expect(needsInputError(r).exitCode).toBe(5);
    expect(r.files).toEqual(["AGENTS.md"]);
  });
  it("unknown agent is a usage error naming allowed values", () => {
    expect(() => parseAgentList("claude,cursor", "--agents")).toThrow(/cursor.*claude, codex, antigravity/);
  });
});

describe("ask-agents", () => {
  it("parseAgentSelection", () => {
    const c = ["claude", "codex", "antigravity"] as const;
    expect(parseAgentSelection("", c, ["codex"])).toEqual(["codex"]);
    expect(parseAgentSelection("3,1", c, [])).toEqual(["claude", "antigravity"]);
    expect(parseAgentSelection("x", c, [])).toBeNull();
  });
  it("re-prompts then selects", async () => {
    const lines = createLineReader(Readable.from(["x\n", "2\n"]));
    try {
      const ask = createAskAgents({ stderr: { write: () => true } as never, lines });
      expect(await ask({ choices: ["claude", "codex", "antigravity"], preselected: [], files: [] })).toEqual(["codex"]);
    } finally {
      lines.close();
    }
  });
});
