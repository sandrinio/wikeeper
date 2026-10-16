import { describe, expect, it } from "vitest";
import { createGit } from "../src/core/git.js";

describe("git helper", () => {
  it("parses an ignored rule", async () => {
    const g = createGit("/r", async () => ({ code: 0, stdout: ".gitignore\x003\x00.wiki/me.md\x00.wiki/me.md\x00" }));
    expect(await g.ignoreRule(".wiki/me.md")).toEqual({ source: ".gitignore", line: 3, pattern: ".wiki/me.md", negated: false });
  });
  it("parses a negated rule", async () => {
    const g = createGit("/r", async () => ({ code: 0, stdout: ".gitignore\x005\x00!/x\x00x\x00" }));
    expect((await g.ignoreRule("x"))?.negated).toBe(true);
  });
  it("returns null when no rule matches", async () => {
    const g = createGit("/r", async () => ({ code: 1, stdout: "\x00\x00\x00x\x00" }));
    expect(await g.ignoreRule("x")).toBeNull();
  });
  it("ENOENT means missing", async () => {
    expect(await createGit("/r", async () => "missing").inWorkTree()).toBe("missing");
  });
  it("exit 128 is not a work tree", async () => {
    expect(await createGit("/r", async () => ({ code: 128, stdout: "" })).inWorkTree()).toBe(false);
  });
  it("isTracked follows the exit code", async () => {
    expect(await createGit("/r", async () => ({ code: 0, stdout: "x" })).isTracked("x")).toBe(true);
    expect(await createGit("/r", async () => ({ code: 1, stdout: "" })).isTracked("x")).toBe(false);
  });
});
