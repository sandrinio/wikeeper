import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { runCli, type CommandModule } from "../../src/program.js";

const pkgRoot = path.resolve(import.meta.dirname, "../..");
const REASON_FRAGMENT = "wikeeper ingest apply";

async function load<T = any>(rel: string): Promise<T> {
  return (await import(/* @vite-ignore */ rel)) as T;
}
const loadHook = () => load("../../src/commands/hook.js");
const loadProtocols = () => load("../../src/agents/hook-protocols.js");

function fixture(name: string): any {
  return JSON.parse(readFileSync(new URL(`../fixtures/hooks/${name}`, import.meta.url), "utf8"));
}

const roots: string[] = [];
function makeRepo(opts: { config?: string; lock?: boolean } = {}): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "wikeeper-hook-"));
  roots.push(root);
  mkdirSync(path.join(root, ".git"));
  mkdirSync(path.join(root, ".wiki"), { recursive: true });
  if (opts.config !== undefined) writeFileSync(path.join(root, ".wiki", "config.yml"), opts.config);
  if (opts.lock) {
    writeFileSync(path.join(root, ".wiki", ".lock"), JSON.stringify({ ingest_id: "i1", pid: 1, started_at: "x" }));
  }
  return root;
}
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

function claudePayload(root: string, file: string, tool = "Write"): any {
  const p = fixture("claude-write.json");
  p.cwd = root;
  p.tool_name = tool;
  p.tool_input = { file_path: file, content: "x" };
  return p;
}
function codexPayload(root: string, command?: string): any {
  const p = fixture("codex-apply-patch.json");
  p.cwd = root;
  if (command !== undefined) p.tool_input.command = command;
  return p;
}
function agyPayload(root: string, target: string): any {
  const p = fixture("antigravity-write.json");
  p.workspacePaths = [root];
  p.toolCall.args.TargetFile = target;
  return p;
}
const pageUpdatePatch = "*** Begin Patch\n*** Update File: .wiki/pages/team.md\n@@\n-a\n+b\n*** End Patch\n";

async function guard(root: string, args: string[], input: string) {
  const { hookCommand } = await loadHook();
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(["hook", "guard", ...args], {
    commands: [hookCommand as CommandModule],
    io: {
      cwd: root,
      stdin: Readable.from([input]),
      stdout: { write: (c: string) => out.push(c) },
      stderr: { write: (c: string) => err.push(c) },
    } as any,
  });
  return { code, stdout: out.join(""), stderr: err.join("") };
}
const run = (root: string, agent: string, payload: unknown) =>
  guard(root, ["--agent", agent], typeof payload === "string" ? payload : JSON.stringify(payload));

function expectFailOpen(r: { code: number; stderr: string }) {
  expect(r.code).toBe(0);
  const lines = r.stderr.split("\n").filter((l) => l.length > 0);
  expect(lines).toHaveLength(1);
  expect(lines[0]!.startsWith("warning:")).toBe(true);
}

describe("STORY-002-05 hook guard (red) — Gherkin", () => {
  it("S1 claude: page write without ingest is denied (stdout JSON, exit 0)", async () => {
    const root = makeRepo();
    const r = await run(root, "claude", claudePayload(root, path.join(root, ".wiki", "pages", "team.md")));
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.hookSpecificOutput.hookEventName).toBe("PreToolUse");
    expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(out.hookSpecificOutput.permissionDecisionReason).toContain(REASON_FRAGMENT);
  });

  it("S1 codex: page write without ingest is denied (stderr reason, exit 2)", async () => {
    const root = makeRepo();
    const r = await run(root, "codex", codexPayload(root, pageUpdatePatch));
    expect(r.code).toBe(2);
    expect(r.stderr).toContain(REASON_FRAGMENT);
    expect(r.stdout).toBe("");
  });

  it("S1 antigravity: page write without ingest is denied (stdout decision deny, exit 0)", async () => {
    const root = makeRepo();
    const r = await run(root, "antigravity", agyPayload(root, path.join(root, ".wiki", "pages", "team.md")));
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.decision).toBe("deny");
    expect(out.reason).toContain(REASON_FRAGMENT);
  });

  it("S2 page write during an ingest (.wiki/.lock) is allowed with no output", async () => {
    const root = makeRepo({ lock: true });
    const r = await run(root, "claude", claudePayload(root, path.join(root, ".wiki", "pages", "team.md")));
    expect(r).toEqual({ code: 0, stdout: "", stderr: "" });
  });

  it("S3 write outside pages/ is allowed with no output", async () => {
    const root = makeRepo();
    const r = await run(root, "claude", claudePayload(root, path.join(root, "src", "index.ts")));
    expect(r).toEqual({ code: 0, stdout: "", stderr: "" });
  });

  it("S3b relative src/index.ts resolves against payload cwd and is allowed", async () => {
    const root = makeRepo();
    const r = await run(root, "claude", claudePayload(root, "src/index.ts"));
    expect(r).toEqual({ code: 0, stdout: "", stderr: "" });
  });

  it("S4 codex fixture (src/a.ts + .wiki/pages/risks.md) as-is exits 2", async () => {
    const root = makeRepo();
    const r = await run(root, "codex", codexPayload(root));
    expect(r.code).toBe(2);
    expect(r.stderr).toContain(REASON_FRAGMENT);
  });

  it("S5 unreadable payload 'not json' fails open with one warning line", async () => {
    const root = makeRepo();
    expectFailOpen(await run(root, "claude", "not json"));
  });

  it("S5 payload without tool_input fails open", async () => {
    const root = makeRepo();
    const p = claudePayload(root, path.join(root, ".wiki", "pages", "team.md"));
    delete p.tool_input;
    expectFailOpen(await run(root, "claude", p));
  });

  it("S5 unknown --agent cursor fails open", async () => {
    const root = makeRepo();
    expectFailOpen(
      await run(root, "cursor", claudePayload(root, path.join(root, ".wiki", "pages", "team.md"))),
    );
  });

  it("S5 missing --agent value / unknown options never produce usage-error exit 2", async () => {
    const root = makeRepo();
    const body = JSON.stringify(claudePayload(root, path.join(root, "src", "x.ts")));
    expect((await guard(root, [], body)).code).toBe(0);
    expect((await guard(root, ["--agent"], body)).code).toBe(0);
    expect((await guard(root, ["--agent", "claude", "--bogus", "extra"], body)).code).toBe(0);
  });
});

describe("STORY-002-05 hook guard (red) — unit", () => {
  it("parsePatchPaths: Add/Update/Delete/Move to, leading whitespace, Environment ID, End of File, CRLF", async () => {
    const { parsePatchPaths } = await loadProtocols();
    const patch = [
      "*** Begin Patch",
      "*** Environment ID: env-1",
      "*** Add File: a.txt",
      "+hi",
      "  *** Update File:   b/c.ts  ",
      "*** Move to: b/d.ts",
      "@@",
      "*** End of File",
      "*** Delete File: e.md",
      "*** Update File: a.txt",
      "*** End Patch",
    ].join("\r\n");
    expect(parsePatchPaths(patch)).toEqual(["a.txt", "b/c.ts", "b/d.ts", "e.md"]);
    expect(parsePatchPaths("nothing here")).toEqual([]);
  });

  it("claude NotebookEdit uses tool_input.notebook_path", async () => {
    const root = makeRepo();
    const p = claudePayload(root, "unused", "NotebookEdit");
    p.tool_input = { notebook_path: path.join(root, ".wiki", "pages", "nb.ipynb"), new_source: "x" };
    const r = await run(root, "claude", p);
    expect(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision).toBe("deny");
  });

  it("claude MultiEdit stays guarded", async () => {
    const root = makeRepo();
    const r = await run(root, "claude", claudePayload(root, path.join(root, ".wiki", "pages", "m.md"), "MultiEdit"));
    expect(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision).toBe("deny");
  });

  it("claude non-write tool is allowed", async () => {
    const root = makeRepo();
    const r = await run(root, "claude", claudePayload(root, path.join(root, ".wiki", "pages", "m.md"), "Read"));
    expect(r).toEqual({ code: 0, stdout: "", stderr: "" });
  });

  it("backslash-separated relative path .wiki\\pages\\team.md is denied", async () => {
    const root = makeRepo();
    const r = await run(root, "claude", claudePayload(root, ".wiki\\pages\\team.md"));
    expect(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision).toBe("deny");
  });

  it("antigravity: relative TargetFile resolves against workspacePaths[0]; allow prints decision allow", async () => {
    const root = makeRepo();
    const denied = await run(root, "antigravity", agyPayload(root, ".wiki/pages/team.md"));
    expect(JSON.parse(denied.stdout).decision).toBe("deny");
    const allowed = await run(root, "antigravity", agyPayload(root, "src/ok.ts"));
    expect(allowed.code).toBe(0);
    expect(JSON.parse(allowed.stdout)).toEqual({ decision: "allow" });
  });

  it("antigravity: all three write tools are guarded", async () => {
    const root = makeRepo();
    for (const name of ["write_to_file", "replace_file_content", "multi_replace_file_content"]) {
      const p = agyPayload(root, path.join(root, ".wiki", "pages", "t.md"));
      p.toolCall.name = name;
      expect(JSON.parse((await run(root, "antigravity", p)).stdout).decision).toBe("deny");
    }
    const other = agyPayload(root, path.join(root, ".wiki", "pages", "t.md"));
    other.toolCall.name = "view_file";
    expect(JSON.parse((await run(root, "antigravity", other)).stdout)).toEqual({ decision: "allow" });
  });

  it("codex: Bash tool (shell patch) is not guarded; Move to into pages is denied", async () => {
    const root = makeRepo();
    const bash = codexPayload(root, pageUpdatePatch);
    bash.tool_name = "Bash";
    expect(await run(root, "codex", bash)).toEqual({ code: 0, stdout: "", stderr: "" });
    const move = codexPayload(root, "*** Begin Patch\n*** Update File: src/a.ts\n*** Move to: .wiki/pages/a.md\n*** End Patch\n");
    expect((await run(root, "codex", move)).code).toBe(2);
  });

  it("payload larger than 1 MB fails open with a warning", async () => {
    const root = makeRepo();
    const p = claudePayload(root, path.join(root, ".wiki", "pages", "team.md"));
    p.tool_input.content = "x".repeat(1_100_000);
    expectFailOpen(await run(root, "claude", p));
  });

  it("content_dir: wiki guards wiki/pages/ and not .wiki/pages/", async () => {
    const root = makeRepo({ config: "content_dir: wiki\n" });
    const hit = await run(root, "claude", claudePayload(root, path.join(root, "wiki", "pages", "a.md")));
    expect(JSON.parse(hit.stdout).hookSpecificOutput.permissionDecision).toBe("deny");
    const miss = await run(root, "claude", claudePayload(root, path.join(root, ".wiki", "pages", "a.md")));
    expect(miss).toEqual({ code: 0, stdout: "", stderr: "" });
  });

  it("isInside: pages dir itself and sibling pages-old are outside; a child is inside", async () => {
    const { isInside } = await loadProtocols();
    const pages = path.join(os.tmpdir(), "r", ".wiki", "pages");
    expect(isInside(pages, path.join(pages, "team.md"))).toBe(true);
    expect(isInside(pages, path.join(pages, "sub", "x.md"))).toBe(true);
    expect(isInside(pages, pages)).toBe(false);
    expect(isInside(pages, pages + "-old/x.md")).toBe(false);
  });

  it("protocol constants and adapters", async () => {
    const p = await loadProtocols();
    expect(p.MAX_PAYLOAD_BYTES).toBe(1_048_576);
    expect(p.GUARD_REASON).toContain("wikeeper ingest apply <id>");
    expect(p.HOOK_ADAPTERS.antigravity.allow()).toEqual({ stdout: '{"decision":"allow"}\n', exitCode: 0 });
    expect(p.HOOK_ADAPTERS.claude.deny("R").exitCode).toBe(0);
    expect(p.HOOK_ADAPTERS.codex.deny("R")).toEqual({ stderr: "R\n", exitCode: 2 });
    expect(p.HOOK_ADAPTERS.antigravity.deny("R")).toEqual({ stdout: '{"decision":"deny","reason":"R"}\n', exitCode: 0 });
    expect(p.HOOK_ADAPTERS.claude.targets({ tool_name: "Write" }, "/x")).toBeNull();
  });
});

describe("STORY-002-05 hook guard (red) — built CLI", () => {
  beforeAll(() => {
    execFileSync(
      process.execPath,
      [path.join(pkgRoot, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.build.json"],
      { cwd: pkgRoot },
    );
  }, 120_000);

  function spawnGuard(root: string, agent: string, payload: unknown) {
    return spawnSync(process.execPath, [path.join(pkgRoot, "dist", "cli.js"), "hook", "guard", "--agent", agent], {
      cwd: root,
      input: JSON.stringify(payload),
      encoding: "utf8",
    });
  }

  it("claude fixture denied via spawned CLI", () => {
    const root = makeRepo();
    const r = spawnGuard(root, "claude", claudePayload(root, path.join(root, ".wiki", "pages", "team.md")));
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision).toBe("deny");
  });

  it("codex fixture denied via spawned CLI (exit 2)", () => {
    const root = makeRepo();
    const r = spawnGuard(root, "codex", codexPayload(root));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain(REASON_FRAGMENT);
  });

  it("antigravity fixture denied via spawned CLI", () => {
    const root = makeRepo();
    const r = spawnGuard(root, "antigravity", agyPayload(root, path.join(root, ".wiki", "pages", "team.md")));
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).decision).toBe("deny");
  });
});
