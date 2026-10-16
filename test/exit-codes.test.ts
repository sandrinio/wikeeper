import { describe, expect, it } from "vitest";
import { ExitCode, WikeeperError } from "../src/core/exit-codes.js";

describe("exit codes", () => {
  it("defines the 0-5 table", () => {
    expect(ExitCode).toEqual({ OK: 0, ERROR: 1, USAGE: 2, NEEDS_APPROVAL: 3, DENIED: 4, NEEDS_INPUT: 5 });
  });

  it("WikeeperError carries exit code, code, message and details", () => {
    const e = new WikeeperError(ExitCode.DENIED, "denied", "nope", { a: 1 });
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("WikeeperError");
    expect(e.exitCode).toBe(4);
    expect(e.code).toBe("denied");
    expect(e.message).toBe("nope");
    expect(e.details).toEqual({ a: 1 });
  });
});
