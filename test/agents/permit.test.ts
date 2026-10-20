import { readFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { COPILOT_ENFORCE } from "../../src/agents/enforce/copilot.js";
import { commandWords, permitDecision, wikeeperArgs } from "../../src/agents/permit.js";
import { runPermit } from "../../src/commands/hook.js";

describe("permit rules", () => {
  it("reads wikeeper's own command forms only", () => {
    expect(wikeeperArgs(["wikeeper", "search", "x"])).toEqual(["search", "x"]);
    expect(wikeeperArgs(["npx", "wikeeper", "status"])).toEqual(["status"]);
    expect(wikeeperArgs(["npx", "-y", "wikeeper@0.4.0", "search", "x"])).toEqual(["search", "x"]);
    expect(wikeeperArgs(["npx", "--yes", "wikeeper@1.2.3-beta.1", "status"])).toEqual(["status"]);
    expect(wikeeperArgs(["git", "status"])).toBeNull();
  });
  it("refuses to read a command that could hide a second one", () => {
    expect(commandWords("wikeeper search x && rm -rf /")).toBeNull();
    expect(commandWords("wikeeper search $(whoami)")).toBeNull();
    expect(commandWords('wikeeper search "a b"')).toBeNull();
    expect(commandWords("wikeeper search x")).toEqual(["wikeeper", "search", "x"]);
  });
  it("allows search and the read-only commands in every mode", () => {
    for (const mode of ["ai", "ask", "whitelist"] as const) {
      expect(permitDecision("wikeeper search x", mode)).toBe("allow");
      expect(permitDecision("npx -y wikeeper@0.4.0 status", mode)).toBe("allow");
      expect(permitDecision("wikeeper rules list", mode)).toBe("allow");
      expect(permitDecision("wikeeper config get ingest.permission", mode)).toBe("allow");
    }
  });
  it("mirrors the Claude rules for ingest", () => {
    expect(permitDecision("wikeeper ingest start doc.pdf", "ai")).toBe("allow");
    expect(permitDecision("wikeeper read a", "ai")).toBe("allow");
    expect(permitDecision("wikeeper ingest abort 1 --drop", "ai")).toBe("ask");
    expect(permitDecision("wikeeper ingest apply 1 --force-unlock", "ai")).toBe("ask");
    expect(permitDecision("wikeeper ingest start doc.pdf", "ask")).toBe("ask");
    expect(permitDecision("wikeeper ingest apply 1", "ask")).toBeNull();
    expect(permitDecision("wikeeper ingest start doc.pdf", "whitelist")).toBeNull();
    expect(permitDecision("wikeeper read a", "ask")).toBeNull();
  });
  it("leaves everything that is not a wikeeper command alone", () => {
    expect(permitDecision("rm -rf /", "ai")).toBeNull();
    expect(permitDecision("npm test", "ai")).toBeNull();
    expect(permitDecision("wikeeper", "ai")).toBeNull();
    expect(permitDecision("wikeeper config set ingest.permission ai", "ai")).toBeNull();
  });

  // CR-008: only wikeeper itself is decided; any other program named wikeeper is left to the harness.
  const FORMS: ReadonlyArray<[string, "allow" | null]> = [
    ["wikeeper search x", "allow"],
    ["npx wikeeper status", "allow"],
    ["npx -y wikeeper@0.4.0 rules list", "allow"],
    ["npx --yes wikeeper@1.2.3-beta.1 search x", "allow"],
    ["npx --package=evil wikeeper search x", null],
    ["npx wikeeper@npm:evil search x", null],
    ["./tmp/wikeeper status", null],
    ["/repo/node_modules/.bin/wikeeper status", null],
    ["npx -p evil wikeeper search x", null],
    ["npx -y wikeeper@latest search x", null],
    ["wikeeper.cmd status", null],
    // bash splits words only on space and tab, so any other whitespace is part of the program name
    ["wikeeper\u00a0search x", null],
    ["wikeeper\u2003search x", null],
    ["wikeeper\u3000search x", null],
    ["wikeeper\u2028search", null],
    ["wikeeper\rsearch x", null],
    ["wikeeper\vsearch", null],
    ["wikeeper\fsearch", null],
    ["npx\u00a0wikeeper search", null],
    ["\u00a0wikeeper search x", null],
    ["wikeeper\tsearch x", "allow"],
    ["  wikeeper search x ", "allow"],
  ];
  for (const [command, decision] of FORMS) {
    it(`whitelist mode decides ${JSON.stringify(command)} as ${decision ?? "none"}`, () => {
      expect(permitDecision(command, "whitelist")).toBe(decision);
    });
  }
});

describe("permit fallback (CR-008)", () => {
  const run = (agent: string | undefined, payload: string | null, isTTY = false) =>
    runPermit({ agent, permission: "ai", stdin: Readable.from(payload === null ? [] : [payload]), isTTY, cwd: process.cwd() });
  const bash = JSON.stringify({ tool_name: "Bash", tool_input: { command: "rm -rf x" } });

  const cases: ReadonlyArray<[string, () => ReturnType<typeof run>]> = [
    ["an agent without a permit adapter", () => run("antigravity", bash)],
    ["an unknown agent", () => run("cursor", bash)],
    ["a missing --agent", () => run(undefined, bash)],
    ["no payload", () => run("copilot", null, true)],
    ["a payload that is not JSON", () => run("copilot", "{not json")],
  ];
  it("names the case in the warning", async () => {
    expect((await run(undefined, bash)).stderr).toContain(": no --agent given\n");
    expect((await run("antigravity", bash)).stderr).toContain(': no permit hook for --agent "antigravity"\n');
  });
  for (const [label, start] of cases) {
    it(`never allows on ${label}`, async () => {
      const res = await start();
      expect(res.exitCode).toBe(0);
      expect(res.stdout ?? "").toBe("");
      const lines = (res.stderr ?? "").trim().split("\n");
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatch(/^warning: wikeeper hook permit left the command to the agent's permission settings: /);
      expect(lines[0]).not.toContain("hook guard");
    });
  }
});

describe("the docs say which agents --enforce blocks (CR-008)", () => {
  const read = (...p: string[]) => readFile(path.join(process.cwd(), ...p), "utf8");
  it("README and docs/reference.md name Copilot and the VS Code Local limit", async () => {
    const readme = await read("README.md");
    const enforce = readme.split("\n").find((l) => l.includes("wikeeper init --enforce"))!;
    expect(enforce).toContain("Claude Code, Codex and Copilot are also blocked");
    expect(enforce).toContain("not the Local agent");
    const reference = await read("docs", "reference.md");
    expect(reference).toContain("into Claude Code, Codex and Copilot");
    expect(reference).toContain("not VS Code's Local agent, which reads another hook format");
  });
});

describe("Copilot hooks never block when wikeeper cannot run (CR-008)", () => {
  // Copilot denies a tool call when a preToolUse hook exits non-zero, so a teammate whose wikeeper is
  // missing or too old would be refused every shell command and edit. Each hook command ends in a
  // success exit; wikeeper's own decisions are on stdout with exit 0, so they still apply.
  const hooks = COPILOT_ENFORCE.items("wikeeper hook guard --agent copilot", "ai")
    .filter((i) => i.identity.startsWith("hooks."))
    .map((i) => (i.value as { hooks: Array<{ command: string; powershell: string; windows: string }> }).hooks[0]!);
  it("installs the guard and the permit hook", () => {
    expect(hooks.map((h) => h.command)).toEqual([
      "wikeeper hook guard --agent copilot || true",
      "wikeeper hook permit --agent copilot --permission ai || true",
    ]);
  });
  it("gives Windows the same commands in PowerShell form, for Copilot CLI and for VS Code (CR-010)", () => {
    const ps = ["wikeeper.cmd hook guard --agent copilot; exit 0", "wikeeper.cmd hook permit --agent copilot --permission ai; exit 0"];
    expect(hooks.map((h) => h.powershell)).toEqual(ps);
    expect(hooks.map((h) => h.windows)).toEqual(ps);
  });
});
