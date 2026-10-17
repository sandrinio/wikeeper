import { describe, expect, it } from "vitest";
import { CLAUDE_ENFORCE } from "../../src/agents/enforce/claude.js";
import { CODEX_ENFORCE } from "../../src/agents/enforce/codex.js";
import type { IngestPermission } from "../../src/core/config.js";
import { claudeDecision, codexDecision, type ClaudePermissions } from "./rule-match.js";

function claudePerms(mode: IngestPermission): ClaudePermissions {
  const perms: { allow: string[]; ask: string[] } = { allow: [], ask: [] };
  for (const i of CLAUDE_ENFORCE.items("CMD", mode)) {
    const m = /^permissions\.(allow|ask)\[/.exec(i.identity);
    if (i.kind === "rule" && m !== null) perms[m[1] as "allow" | "ask"].push(i.value as string);
  }
  return perms;
}
const codexLines = (mode: IngestPermission): string[] =>
  CODEX_ENFORCE[1]!.items("CMD", mode).map((i) => i.value as string);
const argv = (c: string): string[] => c.split(/\s+/);
const codexArgv = argv;

describe("rule-match helper against the ai-mode writer output", () => {
  const rows: Array<[string, string, string]> = [
    ["wikeeper ingest start ./notes.md --kind meeting", "allow", "allow"],
    ["npx wikeeper ingest apply src-2026-10-17-notes", "allow", "allow"],
    ["wikeeper ingest finish src-2026-10-17-notes --json", "allow", "allow"],
    ["wikeeper ingest abort src-2026-10-17-notes", "allow", "prompt"],
    ["wikeeper ingest abort src-2026-10-17-notes --drop", "ask", "prompt"],
    ["npx wikeeper ingest abort --drop src-2026-10-17-notes", "ask", "prompt"],
    ["npx wikeeper ingest apply src-2026-10-17-notes --force-unlock", "ask", "allow"],
    ["wikeeper search roadmap --json", "allow", "allow"],
  ];
  for (const [command, claude, codex] of rows) {
    it(`${command}: claude ${claude}, codex ${codex}`, () => {
      expect(claudeDecision(claudePerms("ai"), command)).toBe(claude);
      expect(codexDecision(codexLines("ai"), codexArgv(command))).toBe(codex);
    });
  }

  it("wikeeper ingest --json abort x --drop: claude ask, codex allow (the documented gap)", () => {
    const cmd = "wikeeper ingest --json abort x --drop";
    expect(claudeDecision(claudePerms("ai"), cmd)).toBe("ask");
    expect(codexDecision(codexLines("ai"), argv(cmd))).toBe("allow");
  });

  for (const mode of ["ask", "whitelist"] as const) {
    it(`${mode} mode: ingest abort x --drop is default in both`, () => {
      const cmd = "wikeeper ingest abort x --drop";
      expect(claudeDecision(claudePerms(mode), cmd)).toBe("default");
      expect(codexDecision(codexLines(mode), argv(cmd))).toBe("default");
    });
  }

  it("deny beats ask beats allow; a trailing ' *' also matches the bare command", () => {
    expect(claudeDecision({ allow: ["Bash(x *)"], ask: ["Bash(x *)"], deny: ["Bash(x *)"] }, "x y")).toBe("deny");
    expect(claudeDecision({ allow: ["Bash(x *)"] }, "x")).toBe("allow");
    expect(codexDecision(['prefix_rule(pattern=["a"], decision="allow")', 'prefix_rule(pattern=["a","b"], decision="forbidden")'], ["a", "b"])).toBe("forbidden");
  });
});
