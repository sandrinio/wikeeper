import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Command } from "commander";
import { runCli, type CommandModule } from "../src/program.js";
import { emitResult, getOutputContext } from "../src/core/output.js";
import { ExitCode, WikeeperError } from "../src/core/exit-codes.js";

const root = path.resolve(import.meta.dirname, "..");

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    io: {
      stdout: { write: (c: string) => out.push(c) },
      stderr: { write: (c: string) => err.push(c) },
      cwd: root,
    },
  };
}

const okCommand: CommandModule = {
  register(program: Command): void {
    program.command("ok").description("test").action((_o: unknown, cmd: Command) => {
      const ctx = getOutputContext(cmd);
      emitResult(ctx, { command: "ok", data: { x: 1 }, message: "hello human" });
    });
  },
};

const failCommand: CommandModule = {
  register(program: Command): void {
    program
      .command("fail <exit> <code>")
      .description("test")
      .action((exit: string, code: string) => {
        throw new WikeeperError(Number(exit) as ExitCode, code, `boom ${code}`);
      });
  },
};

const plainCodeCommand: CommandModule = {
  register(program: Command): void {
    program.command("plain").action(() => {
      throw Object.assign(new Error("plain boom"), { code: "E_PLAIN" });
    });
  },
};

const argCommand: CommandModule = {
  register(program: Command): void {
    program.command("needarg <thing>").action(() => {});
  },
};

describe("STORY-001-01 cli core (red)", () => {
  it("S1: registered command returns one JSON envelope, exit 0", async () => {
    const c = capture();
    const code = await runCli(["ok", "--json"], { commands: [okCommand], io: c.io });
    expect(code).toBe(0);
    const text = c.out.join("");
    expect(text.endsWith("\n")).toBe(true);
    expect(text.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(text)).toEqual({ ok: true, command: "ok", data: { x: 1 }, warnings: [] });
    expect(Object.keys(JSON.parse(text))).toEqual(["ok", "command", "data", "warnings"]);
  });

  it("S1b: global --json before the subcommand also works", async () => {
    const c = capture();
    const code = await runCli(["--json", "ok"], { commands: [okCommand], io: c.io });
    expect(code).toBe(0);
    expect(JSON.parse(c.out.join("")).ok).toBe(true);
  });

  it("S2: human mode prints message, no JSON, exit 0", async () => {
    const c = capture();
    const code = await runCli(["ok"], { commands: [okCommand], io: c.io });
    expect(code).toBe(0);
    const text = c.out.join("");
    expect(text).toBe("hello human\n");
    expect(() => JSON.parse(text)).toThrow();
  });

  it.each([
    [1, "error"],
    [3, "needs_approval"],
    [4, "denied"],
    [5, "needs_input"],
  ])("S3: WikeeperError exit %i maps to code %s", async (exit, errCode) => {
    const c = capture();
    const code = await runCli(["fail", String(exit), errCode, "--json"], {
      commands: [failCommand],
      io: c.io,
    });
    expect(code).toBe(exit);
    const obj = JSON.parse(c.out.join(""));
    expect(obj.ok).toBe(false);
    expect(obj.error.code).toBe(errCode);
    expect(obj.error.message).toContain("boom");
    expect(obj.error).toHaveProperty("details");
  });

  it("S3b: human mode writes error to stderr", async () => {
    const c = capture();
    const code = await runCli(["fail", "4", "denied"], { commands: [failCommand], io: c.io });
    expect(code).toBe(4);
    expect(c.out.join("")).toBe("");
    expect(c.err.join("")).toContain("error: boom denied");
  });

  it("S3c: plain Error with string code maps to exit 1 keeping code", async () => {
    const c = capture();
    const code = await runCli(["plain", "--json"], { commands: [plainCodeCommand], io: c.io });
    expect(code).toBe(1);
    expect(JSON.parse(c.out.join("")).error.code).toBe("E_PLAIN");
  });

  it("S4: unknown flag with --json gives usage envelope, exit 2, empty stderr", async () => {
    const c = capture();
    const code = await runCli(["--json", "--no-such-flag"], { commands: [okCommand], io: c.io });
    expect(code).toBe(2);
    const text = c.out.join("");
    expect(text.trim().split("\n")).toHaveLength(1);
    const obj = JSON.parse(text);
    expect(obj.ok).toBe(false);
    expect(obj.error.code).toBe("usage");
    expect(c.err.join("")).toBe("");
  });

  it("S4b: unknown command, missing arg and excess args exit 2", async () => {
    for (const argv of [["nope", "--json"], ["needarg", "--json"], ["ok", "extra", "--json"]]) {
      const c = capture();
      const code = await runCli(argv, { commands: [okCommand, argCommand], io: c.io });
      expect(code).toBe(2);
      expect(JSON.parse(c.out.join("")).error.code).toBe("usage");
      expect(c.err.join("")).toBe("");
    }
  });

  it("S4c: --json after -- is not treated as JSON mode", async () => {
    const c = capture();
    const code = await runCli(["--no-such-flag", "--", "--json"], { commands: [okCommand], io: c.io });
    expect(code).toBe(2);
    expect(() => JSON.parse(c.out.join(""))).toThrow();
  });

  it("S4d: --version and --help exit 0", async () => {
    for (const flag of ["--version", "--help"]) {
      const c = capture();
      const code = await runCli([flag], { commands: [okCommand], io: c.io });
      expect(code).toBe(0);
      expect(c.out.join("").length).toBeGreaterThan(0);
    }
  });

  it("S5a: ci.yml runs on three OSes x Node 22 and 24", () => {
    const yml = readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
    expect(yml).toContain("runs-on: ${{ matrix.os }}");
    for (const os of ["ubuntu-latest", "macos-latest", "windows-latest"]) expect(yml).toContain(os);
    expect(yml).toMatch(/node:\s*\[\s*22\s*,\s*24\s*\]/);
    expect(yml).toMatch(/fail-fast:\s*false/);
  });

  it("S5b: .gitattributes forces LF", () => {
    const text = readFileSync(path.join(root, ".gitattributes"), "utf8");
    expect(text.trim()).toBe("* text=auto eol=lf");
  });
});
