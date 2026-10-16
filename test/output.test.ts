import { describe, expect, it } from "vitest";
import { CommanderError } from "commander";
import { emitError, emitResult, type OutputContext } from "../src/core/output.js";
import { ExitCode, WikeeperError } from "../src/core/exit-codes.js";

function ctx(json: boolean) {
  const out: string[] = [];
  const err: string[] = [];
  const c: OutputContext = {
    json,
    isTTY: false,
    command: "t",
    cwd: ".",
    stdin: process.stdin,
    stdout: { write: (s: string) => out.push(s) },
    stderr: { write: (s: string) => err.push(s) },
    setExitCode: () => {},
  };
  return { c, out, err };
}

describe("output helpers", () => {
  it("emitResult JSON mode writes one envelope", () => {
    const { c, out } = ctx(true);
    emitResult(c, { command: "t", data: undefined, warnings: ["w"] });
    expect(out.join("")).toBe('{"ok":true,"command":"t","data":null,"warnings":["w"]}\n');
  });

  it("emitResult human mode prints message lines and warnings on stderr", () => {
    const { c, out, err } = ctx(false);
    emitResult(c, { command: "t", data: 1, message: ["a", "b"], warnings: ["w"] });
    expect(out.join("")).toBe("a\nb\n");
    expect(err.join("")).toBe("warning: w\n");
  });

  it("emitError JSON mode for WikeeperError", () => {
    const { c, out } = ctx(true);
    expect(emitError(c, new WikeeperError(ExitCode.NEEDS_INPUT, "needs_input", "m", { k: 1 }))).toBe(5);
    expect(JSON.parse(out.join(""))).toEqual({
      ok: false,
      command: "t",
      error: { code: "needs_input", message: "m", details: { k: 1 } },
    });
  });

  it("emitError human mode writes to stderr", () => {
    const { c, out, err } = ctx(false);
    expect(emitError(c, new Error("x"))).toBe(1);
    expect(out.join("")).toBe("");
    expect(err.join("")).toBe("error: x\n");
  });

  it("emitError maps CommanderError to usage (2) and help to 0", () => {
    const a = ctx(true);
    expect(emitError(a.c, new CommanderError(1, "commander.unknownOption", "error: unknown option"))).toBe(2);
    expect(JSON.parse(a.out.join("")).error).toMatchObject({ code: "usage", message: "unknown option" });
    const b = ctx(true);
    expect(emitError(b.c, new CommanderError(0, "commander.helpDisplayed", "(help)"))).toBe(0);
    expect(b.out.join("")).toBe("");
  });

  it("emitError keeps string code on plain errors and non-Error throws map to error", () => {
    const a = ctx(true);
    expect(emitError(a.c, Object.assign(new Error("p"), { code: "E_X" }))).toBe(1);
    expect(JSON.parse(a.out.join("")).error.code).toBe("E_X");
    const b = ctx(true);
    expect(emitError(b.c, "str")).toBe(1);
    expect(JSON.parse(b.out.join("")).error.code).toBe("error");
  });
});
