import { describe, expect, it } from "vitest";
import { buildDocs, createSearchIndex, hitSources, makeSnippet, MINISEARCH_OPTIONS } from "../../src/search/engine.js";
import { parsePage } from "../../src/wiki/parse-page.js";

const page = (rel: string, text: string) => parsePage(text, rel);

describe("makeSnippet", () => {
  it("returns the line with a match in the middle", () => {
    expect(makeSnippet("intro\nthe vendor delay is real\nend", ["delay"])).toBe("the vendor delay is real");
  });
  it("returns a match at the start of a long line cut with an ellipsis at the end", () => {
    const line = `delay ${"word ".repeat(80)}`.trim();
    const s = makeSnippet(line, ["delay"]);
    expect(s.startsWith("delay")).toBe(true);
    expect(s.endsWith("…")).toBe(true);
    expect(s.length).toBeLessThanOrEqual(162);
  });
  it("cuts both sides for a match in the middle of a long line", () => {
    const line = `${"alpha ".repeat(60)}needle ${"omega ".repeat(60)}`.trim();
    const s = makeSnippet(line, ["needle"]);
    expect(s.startsWith("…")).toBe(true);
    expect(s.endsWith("…")).toBe(true);
    expect(s).toContain("needle");
  });
  it("falls back to the first 160 characters when no line has a term", () => {
    const text = "x".repeat(200);
    expect(makeSnippet(text, ["zzz"])).toBe(`${"x".repeat(160)}…`);
    expect(makeSnippet("short text", ["zzz"])).toBe("short text");
  });
});

describe("hitSources", () => {
  const p = page("a.md", "---\nsources: [src-2026-10-01-fm]\n---\n# A\nplain\n\n## B\ncites [[src-2026-10-16-q4]] and [[src-2026-10-16-q4]] and [[other]]\n");
  it("lists citations in the section, deduplicated", () => {
    expect(hitSources(p, 2)).toEqual(["src-2026-10-16-q4"]);
  });
  it("falls back to frontmatter sources", () => {
    expect(hitSources(p, 1)).toEqual(["src-2026-10-01-fm"]);
  });
});

describe("buildDocs", () => {
  it("skips sections with no heading and no text and carries aliases", () => {
    const p = page("a.md", "---\naliases: [Alpha]\n---\n# A\n\n## Risks\nsome text\n");
    const docs = buildDocs([p]);
    expect(docs.map((d) => d.heading)).toEqual(["A", "Risks"]);
    expect(docs[0]!.aliases).toBe("Alpha");
    expect(docs.map((d) => d.id)).toEqual([0, 1]);
    expect(buildDocs([page("e.md", "")])).toEqual([]);
  });
});

describe("createSearchIndex", () => {
  it("breaks equal scores by path then line, and exposes the options", async () => {
    const body = "# Same\n\n## Review\nquarterly review notes\n";
    const docs = buildDocs([page("a/z.md", body), page("b.md", body)]);
    const index = await createSearchIndex(docs);
    const hits = index.query("quarterly review");
    expect(hits.map((h) => h.doc.path)).toEqual(["a/z.md", "b.md"]);
    expect(hits[0]!.score).toBe(hits[1]!.score);
    expect(MINISEARCH_OPTIONS.fields).toEqual(["title", "heading", "aliases", "text"]);
  });
});
