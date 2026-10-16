import { describe, expect, it } from "vitest";

// Red tests for STORY-003-02 (contract C2). Dynamic imports: the modules do not exist on the clean baseline.
type Origin = "file" | "url" | "stdin";
type Ingest = { permission: "ai" | "ask" | "whitelist"; whitelist: { kinds: string[]; origins: string[] } };
type Req = { origin: string; originType: Origin; kind: string | null; approved: boolean };

async function loadPermissions(): Promise<{
  evaluatePermission: (i: Ingest, r: Req, o?: { homeDir?: string }) => {
    decision: string;
    mode: string;
    reason: string;
    matched: { by: string; entry: string } | null;
    kind_pending: boolean;
  };
}> {
  return (await import("../../src/ingest/permissions.js")) as never;
}
async function loadKindRules(): Promise<{
  parseSourceKinds: (t: string) => Array<{ id: string; version: number; targets: string; line: number }>;
  findKindRule: (t: string, k: string) => { id: string; version: number; targets: string; line: number } | null;
  isValidKindId: (k: string) => boolean;
  normalizeKindId: (k: string) => string;
}> {
  return (await import("../../src/ingest/kind-rules.js")) as never;
}

const HOME = { homeDir: "/home/tester" };
const wl = (kinds: string[], origins: string[]): Ingest => ({ permission: "whitelist", whitelist: { kinds, origins } });

describe("STORY-003-02 permission modes", () => {
  it.each([
    ["ai", false, "allowed"],
    ["ask", false, "needs_approval"],
    ["ask", true, "allowed"],
  ] as const)("mode %s approved %s -> %s", async (mode, approved, decision) => {
    const { evaluatePermission } = await loadPermissions();
    const r = evaluatePermission(
      { permission: mode, whitelist: { kinds: [], origins: [] } },
      { origin: "docs/q4.pdf", originType: "file", kind: null, approved },
    );
    expect(r.decision).toBe(decision);
    expect(r.mode).toBe(mode);
    if (decision === "needs_approval") expect(r.reason).toContain("--approved");
  });
});

describe("STORY-003-02 origin entries match by shape", () => {
  const origins = ["docs/meetings/**", "~/Downloads/*.pdf", "*.atlassian.net"];
  it.each([
    ["file", "docs/meetings/2026/q4.md", "allowed"],
    ["file", "docs/notes.md", "denied"],
    ["file", "Docs/Meetings/q4.md", "denied"],
    ["file", "/home/tester/Downloads/q4.pdf", "allowed"],
    ["url", "https://acme.atlassian.net/wiki/q4", "allowed"],
    ["url", "https://ACME.Atlassian.net/wiki/q4", "allowed"],
    ["url", "https://atlassian.net/wiki/q4", "denied"],
    ["stdin", "stdin", "denied"],
  ] as const)("%s %s -> %s", async (originType, origin, decision) => {
    const { evaluatePermission } = await loadPermissions();
    const r = evaluatePermission(wl([], origins), { origin, originType, kind: null, approved: false }, HOME);
    expect(r.decision).toBe(decision);
    expect(r.kind_pending).toBe(false);
    if (decision === "allowed") expect(r.matched?.by).toBe("origin");
  });
});

describe("STORY-003-02 kind entries ignore the version", () => {
  it.each([
    ["meeting-notes (v1)", "allowed", false],
    ["meeting-notes (v2)", "allowed", false],
    ["status-report", "denied", false],
    [null, "allowed", true],
  ] as const)("kind %s -> %s pending %s", async (kind, decision, pending) => {
    const { evaluatePermission } = await loadPermissions();
    const r = evaluatePermission(
      wl(["meeting-notes"], []),
      { origin: "docs/x.md", originType: "file", kind, approved: false },
      HOME,
    );
    expect(r.decision).toBe(decision);
    expect(r.kind_pending).toBe(pending);
    if (kind === "meeting-notes (v2)") expect(r.matched).toEqual({ by: "kind", entry: "meeting-notes" });
  });
});

describe("STORY-003-02 source-kind lines", () => {
  it("parses the Source kinds section only", async () => {
    const { parseSourceKinds, findKindRule, isValidKindId } = await loadKindRules();
    const text = [
      "# KB instructions", // 1
      "", // 2
      "## Source kinds", // 3
      "meeting-notes (v2) → decision, risk", // 4
      "- status-report -> project.status", // 5
      "Some prose line without an arrow.", // 6
      "", // 7
      "## Write policy", // 8
      "contract (v3) → decision", // 9
    ].join("\n");
    const rules = parseSourceKinds(text);
    expect(rules).toEqual([
      { id: "meeting-notes", version: 2, targets: "decision, risk", line: 4 },
      { id: "status-report", version: 1, targets: "project.status", line: 5 },
    ]);
    expect(findKindRule(text, "Meeting-Notes (v1)")).toEqual(rules[0]);
    expect(findKindRule(text, "contract")).toBeNull();
    expect(isValidKindId("status-report (v2)")).toBe(true);
    expect(isValidKindId("status report")).toBe(false);
  });
});

describe("STORY-003-02 whitelist denies unlisted source even when approved", () => {
  it("names origin, kind and both entry lists", async () => {
    const { evaluatePermission } = await loadPermissions();
    const r = evaluatePermission(
      wl(["status-report"], ["docs/meetings/**"]),
      { origin: "docs/notes.md", originType: "file", kind: "meeting-notes", approved: true },
      HOME,
    );
    expect(r.decision).toBe("denied");
    expect(r.matched).toBeNull();
    for (const s of ["docs/notes.md", "meeting-notes", "docs/meetings/**", "status-report"]) {
      expect(r.reason).toContain(s);
    }
  });
});
