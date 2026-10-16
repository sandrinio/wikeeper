import { describe, expect, it } from "vitest";
import { evaluatePermission, matchesKind, matchesOrigin } from "../../src/ingest/permissions.js";

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
