import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Command } from "commander";
import { afterEach, describe, expect, it } from "vitest";
import type { CliIO } from "../src/core/output.js";
import { createProgram, defaultCommands, runCli } from "../src/program.js";
import type { CommandModule } from "../src/program.js";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

function captureIO(cwd: string): { io: CliIO; out: () => string; err: () => string } {
  let out = "";
  let err = "";
  const io: CliIO = {
    stdout: { write: (s: string) => ((out += s), true) },
    stderr: { write: (s: string) => ((err += s), true) },
    stdin: Object.assign(process.stdin, { isTTY: false }),
    cwd,
  } as unknown as CliIO;
  return { io, out: () => out, err: () => err };
}

async function tmp(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), "wk-help-"));
  dirs.push(d);
  return d;
}

function walk(cmd: Command, acc: Command[] = []): Command[] {
  for (const c of cmd.commands) {
    acc.push(c);
    walk(c, acc);
  }
  return acc;
}

describe("STORY-001-09 --json in every help", () => {
  it("S1: every command and nested subcommand lists --json", async () => {
    const { io } = captureIO(await tmp());
    const program = createProgram(defaultCommands, io);
    const all = walk(program);
    expect(all.length).toBeGreaterThan(0);
    expect(all.map((c) => c.name())).toContain("guard");
    for (const cmd of all) {
      const help = cmd.helpInformation();
      expect(help, `help of ${cmd.name()}`).toContain("--json");
      expect(help, `help of ${cmd.name()}`).toContain("machine-readable output");
    }
  });

  it("S2: a command registered later through .command() inherits --json", async () => {
    const probe: CommandModule = {
      register(program: Command): void {
        const group = program.command("probe").description("probe group");
        group.command("run").description("probe run").action(() => undefined);
      },
    };
    const { io } = captureIO(await tmp());
    const program = createProgram([...defaultCommands, probe], io);
    const p = program.commands.find((c) => c.name() === "probe");
    expect(p).toBeDefined();
    const run = p!.commands.find((c) => c.name() === "run");
    expect(run).toBeDefined();
    expect(p!.helpInformation()).toContain("--json");
    expect(run!.helpInformation()).toContain("--json");
  });

  it("S3: remove --help names what --purge deletes", async () => {
    const { io, out } = captureIO(await tmp());
    await runCli(["remove", "--help"], { io });
    const text = out();
    for (const token of [".wiki/", "pages/", "raw/", "index.md", "log/", "content_dir"]) {
      expect(text, `help mentions ${token}`).toContain(token);
    }
    expect(text).not.toContain("the content directory");

    const program = createProgram(defaultCommands, io);
    const remove = program.commands.find((c) => c.name() === "remove")!;
    const purge = remove.options.find((o) => o.long === "--purge")!;
    for (const token of [".wiki/", "pages/", "raw/", "index.md", "log/", "content_dir"]) {
      expect(purge.description).toContain(token);
    }
    expect(purge.description).not.toContain("the content directory");
    expect(purge.description).toContain("confirm");
  });

  it("S4: option parsing is unchanged", async () => {
    const dir = await tmp();
    const bad = captureIO(dir);
    expect(await runCli(["doctor", "--jsn"], { io: bad.io })).toBe(2);
    const good = captureIO(dir);
    await runCli(["doctor", "--json"], { io: good.io });
    const envelope = JSON.parse(good.out()) as { ok: boolean };
    expect(typeof envelope.ok).toBe("boolean");
  });
});
