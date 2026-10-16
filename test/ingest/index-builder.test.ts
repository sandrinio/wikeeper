import { describe, expect, it } from "vitest";
import { buildIndex } from "../../src/ingest/index-builder.js";
import { parsePage } from "../../src/wiki/parse-page.js";

describe("buildIndex", () => {
  it("orders known types, then others alphabetically, then untyped; omits empty summary", () => {
    const pages = [
      parsePage("# U\n", "u.md"),
      parsePage("---\ntype: zebra\n---\n", "z.md"),
      parsePage("---\ntype: apple\nsummary: 'a   b\n  c'\n---\n", "a.md"),
      parsePage("---\ntype: person\n---\n", "p.md"),
    ];
    const out = buildIndex(pages);
    const idx = ["## person", "## apple", "## zebra", "## untyped"].map((h) => out.indexOf(h));
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    expect(out).toContain("- [p](pages/p.md)\n");
    expect(out).toContain("- [a](pages/a.md) — a b c");
  });
});
