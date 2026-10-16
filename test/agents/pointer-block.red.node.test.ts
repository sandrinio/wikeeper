import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { HOOK_ADAPTERS, GUARD_REASON } from "../../src/agents/hook-protocols.js";
import { templatesDir } from "../../src/core/templates.js";
import { hookCommand } from "../../src/commands/hook.js";
import { runCli, type CommandModule } from "../../src/program.js";

// Red tests for STORY-006-01 (pointer block and guard deny message).
const START = "<!-- WIKI:START v1 — managed by wikeeper -->";
const END = "<!-- WIKI:END -->";
const VERBS = ["start", "plan", "facts", "apply", "finish", "abort"];

export function checkLineCap(text: string, cap: number): string | null {
  const n = text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
  return n > cap ? `block has ${n} lines, cap is ${cap}` : null;
}
export function ingestVerbs(text: string): string[] {
  return [...text.matchAll(/wikeeper ingest ([a-z]+)/g)].map((m) => m[1]!);
}

const blockText = () => readFileSync(path.join(templatesDir(), "agent-block.md"), "utf8");

const roots: string[] = [];
function makeRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "wikeeper-pointer-"));
  roots.push(root);
  mkdirSync(path.join(root, ".git"));
  return root;
}
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

function io(root: string, stdin: string[], out: string[], err: string[]): any {
  return {
    cwd: root,
    stdin: Readable.from(stdin),
    stdout: { write: (c: string) => out.push(c) },
    stderr: { write: (c: string) => err.push(c) },
  };
}

describe("STORY-006-01 pointer block (red)", () => {
  it("S1: block stays within the cap and keeps its markers", () => {
    const text = blockText();
    const lines = text.split("\n");
    expect(text.endsWith("\n")).toBe(true);
    expect(text.includes("\r")).toBe(false);
    lines.pop();
    expect(lines.length).toBeLessThanOrEqual(14);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(200);
    expect(lines[0]).toBe(START);
    expect(lines[lines.length - 1]).toBe(END);
    expect(lines.find((l, i) => i > 0 && l.startsWith("#"))).toBe("## Project Wiki");
    expect(checkLineCap(text, 14)).toBeNull();
  });

  it("S2: block is visibly managed after HTML comments are stripped", async () => {
    const root = makeRoot();
    const out: string[] = [];
    const err: string[] = [];
    const code = await runCli(["init", "--yes", "--agents", "claude"], { io: io(root, [], out, err) });
    expect(code).toBe(0);
    const agents = readFileSync(path.join(root, "AGENTS.md"), "utf8");
    const stripped = agents.replace(/<!--[\s\S]*?-->/g, "");
    expect(stripped).toContain("Managed by wikeeper — edit outside this block only.");
    for (const f of [".wiki/config.yml", ".wiki/kb_instructions.md", ".wiki/me.md", ".wiki/project.md"]) {
      expect(stripped).toContain(f);
    }
    expect(stripped).toContain(".wiki/system/");
    for (const f of [".wiki/system/SETUP.md", ".wiki/system/WIKI.md", ".wiki/system/ONBOARDING.md"]) {
      expect(stripped).toContain(f);
    }
    const session = stripped
      .split("\n")
      .find((l) => l.includes(".wiki/me.md") && l.includes(".wiki/project.md") && l.includes(".wiki/system/ONBOARDING.md") && /session/i.test(l));
    expect(session).toBeDefined();
    expect(stripped).toMatch(/wikeeper ingest. is unavailable|unavailable/i);
    const fallback = stripped.split("\n").find((l) => /unavailable/i.test(l));
    expect(fallback).toMatch(/wikeeper ingest/);
    expect(fallback).toMatch(/not write|do not write|never write/i);
  }, 20_000);

  it("S3: block and guard use one ingest vocabulary", () => {
    const block = blockText();
    const verbs = ingestVerbs(block + "\n" + GUARD_REASON);
    expect(verbs.length).toBeGreaterThan(0);
    for (const v of verbs) expect(VERBS).toContain(v);
    expect(block).toContain("wikeeper ingest apply");
    expect(block).toContain("wikeeper ingest finish");
    expect(block).not.toMatch(/wikeeper ingest start. ?\/ ?.wikeeper ingest finish/);
  });

  it("S4: guard deny message points to the write-phase section", async () => {
    const root = makeRoot();
    mkdirSync(path.join(root, ".wiki"), { recursive: true });
    const payload = JSON.parse(readFileSync(new URL("../fixtures/hooks/claude-write.json", import.meta.url), "utf8"));
    payload.cwd = root;
    payload.tool_input = { file_path: path.join(root, ".wiki", "pages", "team.md"), content: "x" };
    const out: string[] = [];
    const err: string[] = [];
    const code = await runCli(["hook", "guard", "--agent", "claude"], {
      commands: [hookCommand as CommandModule],
      io: io(root, [JSON.stringify(payload)], out, err),
    });
    expect(code).toBe(0);
    const reason: string = JSON.parse(out.join("")).hookSpecificOutput.permissionDecisionReason;
    expect(reason).toContain("wikeeper ingest apply <id>");
    expect(reason).toContain('.wiki/system/WIKI.md, section "Write phase"');
    expect(HOOK_ADAPTERS.claude).toBeDefined();
  });

  it("S5: an edited block over the cap fails the check", () => {
    const lines = blockText().split("\n");
    lines.pop();
    const end = lines.pop()!;
    while (lines.length < 13) lines.push("filler");
    const over = [...lines, "extra", end].join("\n") + "\n";
    expect(over.split("\n").length - 1).toBe(15);
    const msg = checkLineCap(over, 14);
    expect(msg).not.toBeNull();
    expect(msg).toContain("15");
    expect(msg).toContain("14");
  });
});
