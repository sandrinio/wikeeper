import { describe, expect, it } from "vitest";
import { findKindRule, isValidKindId, normalizeKindId, parseSourceKinds } from "../../src/ingest/kind-rules.js";

describe("kind-rules", () => {
  it("normalizeKindId trims, lowercases and drops (vN)", () => {
    expect(normalizeKindId("  Meeting-Notes (v12) ")).toBe("meeting-notes");
    expect(normalizeKindId("a")).toBe("a");
  });
  it("isValidKindId", () => {
    expect(isValidKindId("status-report (v2)")).toBe(true);
    expect(isValidKindId("status report")).toBe(false);
    expect(isValidKindId("-x")).toBe(false);
  });
  it("ignores kind lines inside a code fence and in other sections", () => {
    const text = ["## Source kinds", "```", "a (v1) → x", "```", "b -> y", "## Other", "c → z"].join("\n");
    expect(parseSourceKinds(text)).toEqual([{ id: "b", version: 1, targets: "y", line: 5 }]);
  });
  it("heading is case-insensitive and tolerates trailing text", () => {
    const text = "## SOURCE KINDS (edit me)\n* a (v3) → t";
    expect(findKindRule(text, "A")).toEqual({ id: "a", version: 3, targets: "t", line: 2 });
    expect(findKindRule(text, "zz")).toBeNull();
  });
});
