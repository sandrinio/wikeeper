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

  it("adds one archived line after the generated line, singular for one, byte-identical at 0", () => {
    const pages = [parsePage("---\ntype: person\n---\n", "p.md")];
    const base = buildIndex(pages);
    expect(buildIndex(pages, { archived: 0 })).toBe(base);
    const one = buildIndex(pages, { archived: 1 });
    expect(one).toContain("Do not edit._\n\n_1 archived page — search it with `wikeeper search --archive`._\n\n## person");
    const three = buildIndex(pages, { archived: 3 });
    expect(three).toContain("_3 archived pages — search them with `wikeeper search --archive`._\n\n## person");
    expect(three).not.toContain("archive/");
  });

  it("puts the archived line after _No pages yet._ when pages is empty", () => {
    expect(buildIndex([])).toBe("# Wiki index\n\n_No pages yet._\n");
    expect(buildIndex([], { archived: 3 })).toBe(
      "# Wiki index\n\n_No pages yet._\n\n_3 archived pages — search them with `wikeeper search --archive`._\n",
    );
  });
});
