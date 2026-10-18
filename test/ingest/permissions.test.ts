import { describe, expect, it } from "vitest";
import { checkSourceSize, evaluatePermission, matchesKind, matchesOrigin, sizeLimitText } from "../../src/ingest/permissions.js";

const H = { homeDir: "/home/t" };

describe("glob compile", () => {
  it.each([
    ["**/x.md", "x.md", true],
    ["**/x.md", "a/b/x.md", true],
    ["docs/**/x.md", "docs/x.md", true],
    ["docs/**/x.md", "docs/a/b/x.md", true],
    ["docs/**", "docs", true],
    ["docs/**", "docs/a/b", true],
    ["docs/**", "docsx/a", false],
    ["docs/*.md", "docs/a/b.md", false],
    ["docs/?.md", "docs/a.md", true],
    ["docs/?.md", "docs/ab.md", false],
    ["./a.b", "./a.b", true],
    ["./a.b", "./axb", false],
  ])("%s vs %s -> %s", (entry, origin, want) => {
    expect(matchesOrigin(entry, origin, "file", H)).toBe(want);
  });
  it("path entries never match urls, domain entries never match files", () => {
    expect(matchesOrigin("docs/**", "docs/a", "url", H)).toBe(false);
    expect(matchesOrigin("example.com", "example.com", "file", H)).toBe(false);
  });
});

describe("domain patterns", () => {
  it("exact, wildcard, apex, case, bad url", () => {
    expect(matchesOrigin("example.com", "https://Example.com/x", "url")).toBe(true);
    expect(matchesOrigin("example.com", "https://a.example.com/x", "url")).toBe(false);
    expect(matchesOrigin("*.example.com", "https://a.b.example.com", "url")).toBe(true);
    expect(matchesOrigin("*.example.com", "https://example.com", "url")).toBe(false);
    expect(matchesOrigin("example.com", "not a url", "url")).toBe(false);
  });
});

describe("matchesKind", () => {
  it("ignores versions", () => {
    expect(matchesKind("meeting-notes", "Meeting-Notes (v3)")).toBe(true);
    expect(matchesKind("meeting-notes", "other")).toBe(false);
  });
});

describe("whitelist order", () => {
  it("origin match wins before kind", () => {
    const r = evaluatePermission(
      { permission: "whitelist", whitelist: { kinds: ["k"], origins: ["docs/**"] } },
      { origin: "docs/a.md", originType: "file", kind: "k", approved: false },
      H,
    );
    expect(r.matched).toEqual({ by: "origin", entry: "docs/**" });
  });
  it("ask reason mentions --approved; ai ignores approved", () => {
    const wl = { kinds: [], origins: [] };
    const req = { origin: "a", originType: "file" as const, kind: null, approved: false };
    expect(evaluatePermission({ permission: "ask", whitelist: wl }, req).reason).toContain("--approved");
    expect(evaluatePermission({ permission: "ai", whitelist: wl }, req).decision).toBe("allowed");
  });
  it("denial with no kind says so and includes the hint", () => {
    const r = evaluatePermission(
      { permission: "whitelist", whitelist: { kinds: [], origins: [] } },
      { origin: "a", originType: "stdin", kind: null, approved: true },
    );
    expect(r.decision).toBe("denied");
    expect(r.reason).toContain("no kind");
    expect(r.reason).toContain("path entries support");
  });
});

describe("checkSourceSize and sizeLimitText", () => {
  const base = { yellow: 1000, red: 3000 };
  const levels = [
    [500, "green"],
    [1000, "yellow"],
    [3000, "red"],
  ] as const;
  const reachedAt = {
    yellow: { green: false, yellow: true, red: true },
    red: { green: false, yellow: false, red: true },
    never: { green: false, yellow: false, red: false },
  } as const;
  for (const confirmAt of ["yellow", "red", "never"] as const) {
    it.each(levels)(`confirm_at ${confirmAt}: %i tokens is %s`, (tokens, level) => {
      const c = checkSourceSize({ tokens, rough: false }, { ...base, confirm_at: confirmAt });
      expect(c.level).toBe(level);
      expect(c.reached).toBe(reachedAt[confirmAt][level]);
      expect(c.limit).toBe(confirmAt === "never" ? null : base[confirmAt]);
      expect(c.confirm_at).toBe(confirmAt);
    });
  }
  it("checks a rough count like an exact one", () => {
    const c = checkSourceSize({ tokens: 4800, rough: true }, { ...base, confirm_at: "yellow" });
    expect(c).toMatchObject({ rough: true, reached: true, level: "red" });
  });
  it("names the limit with formatLimit", () => {
    const c = checkSourceSize({ tokens: 25000, rough: false }, { yellow: 20000, red: 60000, confirm_at: "yellow" });
    expect(sizeLimitText(c)).toBe("at or above the approval limit tokens.source.yellow (20k)");
  });
});
