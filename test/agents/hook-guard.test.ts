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
  it("copilot targets read the paths out of an apply_patch string", () => {
    const t = HOOK_ADAPTERS.copilot.targets(
      { hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: "*** Begin Patch\n*** Add File: .wiki/pages/a.md\n+x\n*** End Patch\n", cwd: "/c" },
      "/f",
    );
    expect(t).toEqual({ cwd: "/c", paths: [".wiki/pages/a.md"] });
  });
  it("copilot targets also read an object tool_input", () => {
    const t = HOOK_ADAPTERS.copilot.targets({ tool_name: "Write", tool_input: { path: "a.md" } }, "/f");
    expect(t).toEqual({ cwd: "/f", paths: ["a.md"] });
  });
  it("copilot ignores the tools it does not guard", () => {
    const t = HOOK_ADAPTERS.copilot.targets({ tool_name: "Bash", tool_input: { command: "echo hi" }, cwd: "/c" }, "/f");
    expect(t).toEqual({ cwd: "/c", paths: [] });
  });
  it("copilot denies with both decision shapes and exits 0", () => {
    const res = HOOK_ADAPTERS.copilot.deny("because");
    expect(res.exitCode).toBe(0); // a non-zero exit would deny every call, including the allowed ones
    const body = JSON.parse(res.stdout!);
    expect(body.permissionDecision).toBe("deny");
    expect(body.hookSpecificOutput).toEqual({ hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "because" });
  });
  it("copilot reads the shell command of either payload casing", () => {
    expect(HOOK_ADAPTERS.copilot.shellCommand!({ tool_name: "Bash", tool_input: { command: "wikeeper search x" } })).toBe("wikeeper search x");
    expect(HOOK_ADAPTERS.copilot.shellCommand!({ toolName: "bash", toolArgs: { command: "wikeeper status" } })).toBe("wikeeper status");
    expect(HOOK_ADAPTERS.copilot.shellCommand!({ tool_name: "Edit", tool_input: "*** Begin Patch" })).toBeNull();
  });
  it("copilot stays silent when it has no rule", () => {
    expect(HOOK_ADAPTERS.copilot.permit!(null, "r")).toEqual({ exitCode: 0 });
  });
});
