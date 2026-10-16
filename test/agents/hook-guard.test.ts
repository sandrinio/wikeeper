import path from "node:path";
import { describe, expect, it } from "vitest";
import { HOOK_ADAPTERS, failOpen, isInside, parsePatchPaths, resolveTarget } from "../../src/agents/hook-protocols.js";

describe("hook-protocols", () => {
  it("parsePatchPaths dedupes and trims", () => {
    expect(parsePatchPaths("*** Add File: a\n *** Update File:  b \n*** Update File: a")).toEqual(["a", "b"]);
  });
  it("resolveTarget normalises backslashes", () => {
    expect(resolveTarget("/r", ".wiki\\pages\\x.md")).toBe(path.resolve("/r", ".wiki/pages/x.md"));
  });
  it("isInside excludes the directory itself", () => {
    expect(isInside("/r/p", "/r/p")).toBe(false);
    expect(isInside("/r/p", "/r/p/x")).toBe(true);
  });
  it("codex targets read tool_input.command", () => {
    const t = HOOK_ADAPTERS.codex.targets({ tool_name: "apply_patch", tool_input: { command: "*** Add File: z" }, cwd: "/c" }, "/f");
    expect(t).toEqual({ cwd: "/c", paths: ["z"] });
  });
  it("antigravity targets use workspacePaths[0]", () => {
    const t = HOOK_ADAPTERS.antigravity.targets(
      { toolCall: { name: "write_to_file", args: { TargetFile: "a" } }, workspacePaths: ["/w"] },
      "/f",
    );
    expect(t).toEqual({ cwd: "/w", paths: ["a"] });
  });
  it("failOpen is a single line", () => {
    expect(failOpen("claude", "a\nb").stderr!.trim().split("\n")).toHaveLength(1);
  });
});
