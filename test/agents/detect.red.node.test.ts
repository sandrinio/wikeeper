import { mkdtemp, mkdir, rm, writeFile, readdir, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Command } from "commander";
import { runCli, type CommandModule } from "../../src/program.js";
import { getOutputContext } from "../../src/core/output.js";

// Red tests load the (not yet implemented) modules lazily so failures are per-test.
async function load() {
  return (await import("../../src/agents/detect.js")) as typeof import("../../src/agents/detect.js");
}
async function loadAsk() {
  return (await import("../../src/agents/ask-agents.js")) as typeof import("../../src/agents/ask-agents.js");
}

const dirs: string[] = [];
async function tmp(files: string[] = []): Promise<string> {
  const d = await mkdtemp(path.join(os.tmpdir(), "wikeeper-detect-"));
  dirs.push(d);
  for (const f of files) await writeFile(path.join(d, f), "x\n");
  return d;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true, maxRetries: 3 })));
});

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    sinks: { stdout: { write: (c: string) => out.push(c) }, stderr: { write: (c: string) => err.push(c) } },
  };
}

function probe(fn: () => Promise<unknown>): CommandModule {
  return {
    register(program: Command): void {
      program.command("probe").action(async (_o: unknown, cmd: Command) => {
        getOutputContext(cmd);
        await fn();
      });
    },
  };
}

async function runProbe(root: string, fn: () => Promise<unknown>) {
  const c = capture();
  const code = await runCli(["probe", "--json"], {
    commands: [probe(fn)],
    io: { cwd: root, ...c.sinks, stdin: Readable.from([]) },
  } as never);
  return { code, out: c.out.join(""), err: c.err.join("") };
}

const noConfig = { agents: [] as string[] };
const rows: Array<[string, string[], string[], Array<{ path: string; create: boolean }>]> = [
  ["CLAUDE+AGENTS, claude+codex", ["CLAUDE.md", "AGENTS.md"], ["claude", "codex"], [{ path: "CLAUDE.md", create: false }, { path: "AGENTS.md", create: false }]],
  ["CLAUDE, codex", ["CLAUDE.md"], ["codex"], [{ path: "AGENTS.md", create: true }]],
  ["CLAUDE, claude", ["CLAUDE.md"], ["claude"], [{ path: "CLAUDE.md", create: false }]],
  ["GEMINI, antigravity", ["GEMINI.md"], ["antigravity"], [{ path: "GEMINI.md", create: false }]],
  ["AGENTS+GEMINI, antigravity", ["AGENTS.md", "GEMINI.md"], ["antigravity"], [{ path: "AGENTS.md", create: false }, { path: "GEMINI.md", create: false }]],
  ["none, claude+antigravity", [], ["claude", "antigravity"], [{ path: "AGENTS.md", create: true }]],
];

describe("STORY-002-02 detect + targets (red)", () => {
  it.each(rows)("S1 outline: %s", async (_n, files, agents, expected) => {
    const m = await load();
    const root = await tmp(files);
    const existing = await m.detectAgentFiles(root);
    expect(m.resolveTargets(agents as never, existing)).toEqual(expected);
  });

  it("resolveTargets with no agents returns []", async () => {
    const m = await load();
    expect(m.resolveTargets([], ["CLAUDE.md"])).toEqual([]);
  });

  it("claude reads AGENTS.md only when CLAUDE.md absent", async () => {
    const m = await load();
    expect(m.readersOf("AGENTS.md", [])).toEqual(expect.arrayContaining(["claude", "codex", "antigravity"]));
    expect(m.readersOf("AGENTS.md", ["CLAUDE.md"]).includes("claude")).toBe(false);
    expect(m.readersOf("CLAUDE.md", ["CLAUDE.md"])).toEqual(["claude"]);
    expect(m.readersOf("GEMINI.md", [])).toEqual(["antigravity"]);
    expect(m.resolveTargets(["claude"], ["AGENTS.md"])).toEqual([{ path: "AGENTS.md", create: false }]);
  });

  it("exports the reader table constant", async () => {
    const m = await load();
    expect(m.AGENT_FILES).toEqual(["CLAUDE.md", "AGENTS.md", "GEMINI.md"]);
    expect(m.AGENT_FILE_READERS["GEMINI.md"].always).toEqual(["antigravity"]);
  });

  it("detectAgentFiles: canonical order, root only, exact case", async () => {
    const m = await load();
    const root = await tmp(["GEMINI.md", "AGENTS.md", "claude.md"]);
    await mkdir(path.join(root, "sub"));
    await writeFile(path.join(root, "sub", "CLAUDE.md"), "x\n");
    expect(await m.detectAgentFiles(root)).toEqual(["AGENTS.md", "GEMINI.md"]);
    expect((await readdir(root)).sort()).toEqual(["AGENTS.md", "GEMINI.md", "claude.md", "sub"]);
  });

  it.skipIf(process.platform === "win32")("detectAgentFiles ignores a dangling CLAUDE.md symlink", async () => {
    const m = await load();
    const root = await tmp(["AGENTS.md"]);
    await symlink(path.join(root, "missing-target"), path.join(root, "CLAUDE.md"));
    expect(await m.detectAgentFiles(root)).toEqual(["AGENTS.md"]);
  });

  it("S2: --agents flag wins over config and skips the prompt", async () => {
    const m = await load();
    const ask = vi.fn().mockResolvedValue(["claude"]);
    const r = await m.resolveAgents({ flag: "codex", config: { agents: ["claude"] }, isTTY: true, json: false, existing: [], ask });
    expect(r).toEqual({ status: "resolved", agents: ["codex"], source: "flag" });
    expect(ask).not.toHaveBeenCalled();
  });

  it("config agents used when no flag", async () => {
    const m = await load();
    const ask = vi.fn();
    const r = await m.resolveAgents({ flag: undefined, config: { agents: ["antigravity", "claude"] }, isTTY: true, json: false, existing: [], ask });
    expect(r).toEqual({ status: "resolved", agents: ["claude", "antigravity"], source: "config" });
    expect(ask).not.toHaveBeenCalled();
  });

  it("S3: no files + TTY prompts, returns selection, targets AGENTS.md (create)", async () => {
    const m = await load();
    const ask = vi.fn().mockResolvedValue(["claude", "codex"]);
    const r = await m.resolveAgents({ config: noConfig, isTTY: true, json: false, existing: [], ask });
    expect(r).toEqual({ status: "resolved", agents: ["claude", "codex"], source: "prompt" });
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask.mock.calls[0]![0]).toMatchObject({ choices: ["claude", "codex", "antigravity"], preselected: [], files: [] });
    if (r.status === "resolved") expect(m.resolveTargets(r.agents, [])).toEqual([{ path: "AGENTS.md", create: true }]);
  });

  it("prompt preselects from files found", async () => {
    const m = await load();
    const ask = vi.fn().mockResolvedValue(["claude"]);
    await m.resolveAgents({ config: noConfig, isTTY: true, json: false, existing: ["CLAUDE.md", "AGENTS.md", "GEMINI.md"], ask });
    expect(ask.mock.calls[0]![0].preselected).toEqual(["claude", "codex", "antigravity"]);
    expect(PRESEL(ask)).toBeTruthy();
  });

  it("empty prompt answer yields needs_input", async () => {
    const m = await load();
    const ask = vi.fn().mockResolvedValue([]);
    const r = await m.resolveAgents({ config: noConfig, isTTY: true, json: false, existing: [], ask });
    expect(r.status).toBe("needs_input");
  });

  it("--json never prompts even on a TTY", async () => {
    const m = await load();
    const ask = vi.fn();
    const r = await m.resolveAgents({ config: noConfig, isTTY: true, json: true, existing: [], ask });
    expect(r.status).toBe("needs_input");
    expect(ask).not.toHaveBeenCalled();
  });

  it("S4: non-interactive without agents -> needs_input -> exit 5 with choices, nothing created", async () => {
    const m = await load();
    const root = await tmp();
    const before = await readdir(root);
    const ask = vi.fn();
    const res = await runProbe(root, async () => {
      const r = await m.resolveAgents({ config: noConfig, isTTY: false, json: true, existing: await m.detectAgentFiles(root), ask });
      expect(r.status).toBe("needs_input");
      if (r.status === "needs_input") throw m.needsInputError(r);
    });
    expect(res.code).toBe(5);
    const obj = JSON.parse(res.out);
    expect(obj.error.code).toBe("needs_input");
    expect(obj.error.details.choices).toEqual(["claude", "codex", "antigravity"]);
    expect(obj.error.details.files).toEqual([]);
    expect(ask).not.toHaveBeenCalled();
    expect(await readdir(root)).toEqual(before);
  });

  it("needs_input lists files found", async () => {
    const m = await load();
    const r = await m.resolveAgents({ config: noConfig, isTTY: false, json: false, existing: ["GEMINI.md"], ask: vi.fn() });
    expect(r).toMatchObject({ status: "needs_input", choices: ["claude", "codex", "antigravity"], files: ["GEMINI.md"] });
  });

  it("S5: unknown agent in --agents -> exit 2 naming it and allowed values", async () => {
    const m = await load();
    const root = await tmp();
    const res = await runProbe(root, async () => {
      await m.resolveAgents({ flag: "claude,cursor", config: noConfig, isTTY: false, json: true, existing: [], ask: vi.fn() });
    });
    expect(res.code).toBe(2);
    const msg: string = JSON.parse(res.out).error.message;
    expect(msg).toContain("cursor");
    expect(msg).toContain("claude, codex, antigravity");
  });

  it("unknown agent in config -> exit 2", async () => {
    const m = await load();
    const root = await tmp();
    const res = await runProbe(root, async () => {
      await m.resolveAgents({ config: { agents: ["cursor"] }, isTTY: false, json: true, existing: [], ask: vi.fn() });
    });
    expect(res.code).toBe(2);
    expect(JSON.parse(res.out).error.message).toContain("cursor");
  });

  it("parseAgentList trims, dedupes, canonical order; empty is usage error", async () => {
    const m = await load();
    expect(m.parseAgentList(" antigravity, claude ,claude,,", "--agents")).toEqual(["claude", "antigravity"]);
    expect(m.parseAgentList(["codex", "claude"], "config agents")).toEqual(["claude", "codex"]);
    expect(() => m.parseAgentList(" , ", "--agents")).toThrow(/no agents given/);
  });
});

function PRESEL(ask: ReturnType<typeof vi.fn>) {
  return ask.mock.calls.length === 1;
}

describe("STORY-002-02 ask-agents (red)", () => {
  it("parseAgentSelection: Enter, numbers, names, junk", async () => {
    const a = await loadAsk();
    const choices = ["claude", "codex", "antigravity"] as const;
    expect(a.parseAgentSelection("", choices, ["codex"])).toEqual(["codex"]);
    expect(a.parseAgentSelection("", choices, [])).toBeNull();
    expect(a.parseAgentSelection("3,1", choices, [])).toEqual(["claude", "antigravity"]);
    expect(a.parseAgentSelection("codex, claude, codex", choices, [])).toEqual(["claude", "codex"]);
    expect(a.parseAgentSelection("banana", choices, [])).toBeNull();
    expect(a.parseAgentSelection("9", choices, [])).toBeNull();
  });

  it("createAskAgents re-prompts on junk then returns the selection", async () => {
    const a = await loadAsk();
    const lines = a.createLineReader(Readable.from(["x\n", "2\n"]));
    const c = capture();
    try {
      const ask = a.createAskAgents({ stderr: c.sinks.stderr, lines });
      const res = await ask({ choices: ["claude", "codex", "antigravity"], preselected: [], files: [] });
      expect(res).toEqual(["codex"]);
      const text = c.err.join("");
      expect(text).toContain("Which agents do you use?");
      expect(text).toContain("1) [ ] claude");
    } finally {
      lines.close();
    }
  });

  it("returns [] on EOF", async () => {
    const a = await loadAsk();
    const lines = a.createLineReader(Readable.from([]));
    try {
      const ask = a.createAskAgents({ stderr: capture().sinks.stderr, lines });
      expect(await ask({ choices: ["claude", "codex", "antigravity"], preselected: [], files: [] })).toEqual([]);
    } finally {
      lines.close();
    }
  });

  it("returns [] after 3 junk attempts; Enter accepts preselection", async () => {
    const a = await loadAsk();
    const l1 = a.createLineReader(Readable.from(["a\n", "b\n", "c\n", "1\n"]));
    const l2 = a.createLineReader(Readable.from(["\n"]));
    try {
      const req = { choices: ["claude", "codex", "antigravity"], preselected: ["claude"], files: ["CLAUDE.md"] } as never;
      expect(await a.createAskAgents({ stderr: capture().sinks.stderr, lines: l1 })(req)).toEqual([]);
      expect(await a.createAskAgents({ stderr: capture().sinks.stderr, lines: l2 })(req)).toEqual(["claude"]);
    } finally {
      l1.close();
      l2.close();
    }
  });
});
