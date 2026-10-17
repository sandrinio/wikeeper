import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Red tests for STORY-002-10: doctor names the files that hold the WIKI block (agent-wiring)
// and lists the setup-file sub-checks it ran (setup-files).

type Check = { id: string; severity: string; message: string; fix?: string; file?: string };

let root: string;
let scratch: string;

beforeEach(async () => {
  scratch = await mkdtemp(path.join(os.tmpdir(), "wikeeper-dm-"));
  root = path.join(scratch, "repo");
  await mkdir(root, { recursive: true });
  const emptyCfg = path.join(scratch, "empty-gitconfig");
  await writeFile(emptyCfg, "");
  vi.stubEnv("GIT_CONFIG_GLOBAL", emptyCfg);
  vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
  execFileSync("git", ["init", "-q"], { cwd: root });
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(scratch, { recursive: true, force: true, maxRetries: 3 });
});

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}
function commit(): void {
  git("-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", "commit", "-qm", "x");
}

async function cli(args: string[]) {
  const { runCli } = await import("../../src/program.js");
  const out: string[] = [];
  const err: string[] = [];
  const code: number = await (runCli as any)(args, {
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
    json = JSON.parse(text.trim().split("\n").pop() ?? "");
  } catch {
    json = undefined;
  }
  return { code, json, text };
}
async function doctor() {
  const r = await cli(["doctor", "--json"]);
  return { code: r.code, checks: (r.json?.data?.checks ?? []) as Check[] };
}

describe("STORY-002-10 S1: agent-wiring names the files", () => {
  it.each([
    [["AGENTS.md"], "claude", "agents claude: WIKI block in AGENTS.md (1 file), "],
    [["CLAUDE.md", "AGENTS.md"], "claude,codex", "agents claude, codex: WIKI block in CLAUDE.md, AGENTS.md (2 files), "],
  ])("files %j agents %s", async (files, agents, text) => {
    for (const f of files) await writeFile(path.join(root, f), "# Team\n");
    expect((await cli(["init", "--json", "--agents", agents, "--yes"])).code).toBe(0);
    const { checks } = await doctor();
    const w = checks.find((c) => c.id === "agent-wiring" && c.severity === "ok");
    expect(w).toBeDefined();
    expect(w!.message.startsWith(text)).toBe(true);
    expect(w!.message).not.toContain("1 files");
    expect(w!.message).not.toContain("1 skills");
    expect(w!.message).not.toContain("1 sub-agents");
  });
});

describe("STORY-002-10 S2: no wiring line while an agent check warns", () => {
  it("markers deleted -> warning, no agent-wiring ok", async () => {
    await writeFile(path.join(root, "CLAUDE.md"), "# Team\n");
    expect((await cli(["init", "--json", "--agents", "claude", "--yes"])).code).toBe(0);
    const file = path.join(root, "CLAUDE.md");
    const text = (await readFile(file, "utf8"))
      .split("\n")
      .filter((l) => !l.startsWith("<!-- WIKI:START") && l !== "<!-- WIKI:END -->")
      .join("\n");
    await writeFile(file, text);
    const { checks } = await doctor();
    expect(checks.find((c) => c.id === "agent-block-markers-deleted")?.severity).toBe("warning");
    expect(checks.some((c) => c.id === "agent-wiring" && c.severity === "ok")).toBe(false);
  });
});

describe("STORY-002-10 S3/S4: setup-files lists its sub-checks", () => {
  async function installed(): Promise<void> {
    expect((await cli(["init", "--json", "--agents", "claude", "--yes"])).code).toBe(0);
    await writeFile(path.join(root, ".wiki", "me.md"), "me\n");
    await writeFile(path.join(root, ".wiki", "project.md"), "project\n");
  }

  it("ok entry message names the ignore rule line; human output prints it", async () => {
    await installed();
    const lines = (await readFile(path.join(root, ".gitignore"), "utf8")).split("\n");
    const n = lines.indexOf(".wiki/me.md") + 1;
    expect(n).toBeGreaterThan(0);
    const expected = `.wiki/me.md present, ignored by .gitignore:${n}, not committed; .wiki/project.md present, not ignored`;
    const { checks } = await doctor();
    const sf = checks.filter((c) => c.id === "setup-files");
    expect(sf).toHaveLength(1);
    expect(sf[0]!.severity).toBe("ok");
    expect(sf[0]!.file).toBeUndefined();
    expect(sf[0]!.message).toBe(expected);
    const human = await cli(["doctor"]);
    expect(human.text).toContain(`[ok] setup-files: ${expected}`);
  });

  it("error: a committed me.md replaces the ok entry, exit 1", async () => {
    await installed();
    git("add", "-f", ".wiki/me.md");
    commit();
    const { code, checks } = await doctor();
    const sf = checks.filter((c) => c.id === "setup-files");
    expect(sf.some((c) => c.severity === "error" && c.message === ".wiki/me.md is committed to git")).toBe(true);
    expect(sf.some((c) => c.severity === "ok")).toBe(false);
    expect(code).toBe(1);
  });
});
