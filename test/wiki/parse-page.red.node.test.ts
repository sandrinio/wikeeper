import { describe, expect, it } from "vitest";
import {
  CITATION_RE,
  linkTarget,
  normalizeName,
  owningEntityKey,
  pageEntities,
  parsePage,
} from "../../src/wiki/parse-page.js";

const SRC = "src-2026-10-16-q4-status";

function atlas(sourcesLine: string, nl = "\n"): string {
  return [
    "---",
    "type: project",
    "title: Atlas",
    'aliases: ["Atlas launch"]',
    sourcesLine,
    "---",
    "# Atlas",
    "owner:: [[Product Lead]]",
    "",
    "## Timeline",
    `- 2026-10-15 · decided · Launch targets 2026-11-17. [[${SRC}]]`,
    `See [[${SRC}|the Q4 report]].`,
    "",
    "```",
    "## Not a heading",
    "[[Not a link]]",
    "```",
    "",
  ].join(nl);
}

describe("Scenario: project page parses (frontmatter, typed links, facts, citations)", () => {
  it("reads frontmatter, typed link in root section, fact in Timeline, citations, wikilinks", () => {
    const p = parsePage(atlas(`sources: ["${SRC}"]`), "projects/atlas.md");
    expect(p.path).toBe("projects/atlas.md");
    expect(p.frontmatter.type).toBe("project");
    expect(p.frontmatter.title).toBe("Atlas");
    expect(p.frontmatter.aliases).toEqual(["Atlas launch"]);
    expect(p.frontmatter.sources).toEqual([SRC]);
    expect(p.errors).toEqual([]);
    const owner = p.typedLinks.find((t) => t.key === "owner");
    expect(owner?.targets).toEqual(["Product Lead"]);
    expect(owner?.section).toBe(1); // under "# Atlas"; a level-1 heading starts section 1
    expect(p.facts).toHaveLength(1);
    const f = p.facts[0];
    expect(f.date).toBe("2026-10-15");
    expect(f.status).toBe("decided");
    expect(f.sources).toEqual([SRC]);
    expect(f.contradiction).toBe(false);
    expect(p.sections[f.section].heading).toBe("Timeline");
    expect(p.citations).toEqual([SRC]);
    expect(p.wikilinks.filter((w) => w === "Product Lead")).toHaveLength(1);
    expect(p.wikilinks.filter((w) => w === SRC)).toHaveLength(1);
    expect(p.wikilinks).toEqual(["Product Lead", SRC]);
  });

  it("section 0 is the pre-heading text; code fences are not content", () => {
    const p = parsePage(atlas(`sources: ["${SRC}"]`), "projects/atlas.md");
    expect(p.sections[0]).toMatchObject({ index: 0, heading: "", level: 0, parent: null });
    expect(p.sections.map((s) => s.heading)).toEqual(["", "Atlas", "Timeline"]);
    expect(p.sections.some((s) => s.heading === "Not a heading")).toBe(false);
    expect(p.links.some((l) => l.target === "Not a link")).toBe(false);
    expect(p.wikilinks).not.toContain("Not a link");
  });

  it("sources in wikilink forms (quoted, unquoted flow list, block list, label) all give the bare id", () => {
    const want = [SRC];
    for (const line of [
      `sources: ["[[${SRC}]]"]`,
      `sources: [[${SRC}]]`,
      `sources: [[[${SRC}]]]`,
      `sources:\n  - "[[${SRC}]]"`,
      `sources:\n  - "[[${SRC}|label]]"`,
      `sources: ${SRC}`,
    ]) {
      const p = parsePage(atlas(line), "projects/atlas.md");
      expect(p.frontmatter.sources, line).toEqual(want);
    }
  });

  it("[[x|label]] adds no new wikilinks entry; links keeps every occurrence", () => {
    const p = parsePage(atlas(`sources: ["${SRC}"]`), "projects/atlas.md");
    expect(p.links.filter((l) => l.target === SRC).length).toBe(2);
  });

  it("CRLF and BOM input parses the same as LF", () => {
    const lf = parsePage(atlas(`sources: ["${SRC}"]`), "projects/atlas.md");
    const crlf = parsePage("﻿" + atlas(`sources: ["${SRC}"]`, "\r\n"), "projects/atlas.md");
    expect(crlf.frontmatter).toEqual(lf.frontmatter);
    expect(crlf.facts).toEqual(lf.facts);
    expect(crlf.sections.map((s) => [s.heading, s.line])).toEqual(lf.sections.map((s) => [s.heading, s.line]));
  });
});

describe("Scenario: entities (pages or sections)", () => {
  const team = [
    "---",
    "type: team",
    "title: Team",
    "---",
    "Intro",
    "## Product Lead",
    "type:: person",
    "aliases:: PL, [[Product L.]]",
    "role:: lead",
    "## QA Engineer",
    "type:: Person",
    "",
  ].join("\n");

  it("page entity first, then section entities in order, with keys, types, aliases", () => {
    const p = parsePage(team, "team.md");
    const ents = pageEntities(p);
    expect(ents.map((e) => e.name)).toEqual(["Team", "Product Lead", "QA Engineer"]);
    expect(ents[0]).toMatchObject({ key: "team.md", kind: "page", type: "team", path: "team.md" });
    const product = ents[1];
    expect(product.kind).toBe("section");
    expect(product.key).toBe(`team.md#L${product.line}`);
    expect(product.line).toBe(6);
    expect(product.type).toBe("person");
    expect(product.aliases).toEqual(["PL", "Product L."]);
    expect(ents[2].type).toBe("person");
  });

  it("typed links under a section entity belong to it, not to the page", () => {
    const p = parsePage(team, "team.md");
    const ents = pageEntities(p);
    expect(ents[1].typedLinks.map((t) => t.key)).toEqual(["type", "aliases", "role"]);
    expect(ents[0].typedLinks).toEqual([]);
  });

  it("owningEntityKey walks up nested headings to the nearest entity section", () => {
    const text = ["# T", "## Product", "type:: person", "### Notes", "- 2026-01-01 · decided · x", "## Plain", ""].join("\n");
    const p = parsePage(text, "t.md");
    const product = p.sections.find((s) => s.heading === "Product")!;
    const notes = p.sections.find((s) => s.heading === "Notes")!;
    const plain = p.sections.find((s) => s.heading === "Plain")!;
    expect(notes.parent).toBe(product.index);
    expect(product.entity).toBe(true);
    expect(owningEntityKey(p, notes.index)).toBe(`t.md#L${product.line}`);
    expect(owningEntityKey(p, plain.index)).toBe("t.md");
    expect(pageEntities(p).find((e) => e.name === "Product")!.facts).toHaveLength(1);
  });

  it("level-1 heading with type:: is not an entity section; entity summary comes from summary::", () => {
    const text = ["# Top", "type:: x", "## S", "type:: thing", "summary:: A thing", ""].join("\n");
    const p = parsePage(text, "s.md");
    expect(p.sections.find((s) => s.heading === "Top")!.entity).toBe(false);
    const ents = pageEntities(p);
    expect(ents).toHaveLength(2);
    expect(ents[1].summary).toBe("A thing");
  });
});

describe("Scenario outline: fact lines", () => {
  const rows: Array<[string, number, string | null, boolean | null, string | null]> = [
    ["- 2026-10-15 · decided · Owner is the product lead. [[src-2026-10-16-a]]", 1, "decided", false, null],
    ["- 2026-10-15 · tentative · Launch may slip. [[src-2026-10-16-a]]", 1, "tentative", false, null],
    [
      "- 2026-10-15 · decided · Launch 2026-11-17. [[src-2026-10-16-b]] · contradicts:: [[src-2026-10-01-a]]",
      1,
      "decided",
      true,
      null,
    ],
    ["- 2026-10-15 · maybe · Launch may slip.", 0, null, null, "fact_status"],
    ["- 2026-02-30 · decided · Impossible date.", 0, null, null, "fact_date"],
  ];
  for (const [line, n, status, contra, err] of rows) {
    it(line, () => {
      const p = parsePage(`# P\n${line}\n`, "p.md");
      expect(p.facts).toHaveLength(n);
      if (n === 1) {
        expect(p.facts[0].status).toBe(status);
        expect(p.facts[0].contradiction).toBe(contra);
        expect(p.errors).toEqual([]);
      } else {
        expect(p.errors.map((e) => e.code)).toEqual([err]);
        expect(p.errors[0].line).toBe(2);
        expect(p.typedLinks).toEqual([]);
      }
    });
  }

  it("contradiction fact lists contradicts ids and sources of the text part", () => {
    const p = parsePage(rows[2][0] + "\n", "p.md");
    expect(p.facts[0].contradicts).toEqual(["src-2026-10-01-a"]);
    expect(p.facts[0].sources).toEqual(["src-2026-10-16-b"]);
  });

  it("a fact line with `::` in its text is a fact, never a typed link", () => {
    const p = parsePage("- 2026-10-15 · decided · key:: value\n", "p.md");
    expect(p.facts).toHaveLength(1);
    expect(p.typedLinks).toEqual([]);
  });
});

describe("Scenario: broken frontmatter is reported, never thrown", () => {
  it("unclosed frontmatter -> frontmatter_yaml with line, defaults, body still parsed", () => {
    const text = ["---", "aliases: [unclosed", "# My Heading", "body [[Target]]", ""].join("\n");
    let p!: ReturnType<typeof parsePage>;
    expect(() => {
      p = parsePage(text, "folder/broken.md");
    }).not.toThrow();
    const e = p.errors.find((x) => x.code === "frontmatter_yaml");
    expect(e).toBeDefined();
    expect(typeof e!.line).toBe("number");
    expect(p.frontmatter.aliases).toEqual([]);
    expect(p.title.length).toBeGreaterThan(0);
  });

  it("invalid YAML with closing line: error, defaults, title from first h1", () => {
    const text = ["---", "aliases: [unclosed", "---", "# Real Title", "x [[T]]", ""].join("\n");
    const p = parsePage(text, "broken.md");
    expect(p.errors.some((x) => x.code === "frontmatter_yaml" && typeof x.line === "number")).toBe(true);
    expect(p.frontmatter.aliases).toEqual([]);
    expect(p.title).toBe("Real Title");
    expect(p.sections.map((s) => s.heading)).toContain("Real Title");
    expect(p.wikilinks).toEqual(["T"]);
  });

  it("wrong-shaped field -> frontmatter_field, field at default", () => {
    const p = parsePage("---\ntype: [a]\naliases: 5\n---\n# T\n", "x.md");
    expect(p.errors.filter((e) => e.code === "frontmatter_field").length).toBeGreaterThanOrEqual(1);
    expect(p.frontmatter.type).toBeNull();
    expect(p.frontmatter.aliases).toEqual([]);
  });

  it("never throws on junk", () => {
    for (const t of ["", "---", "---\n", "﻿", "[[", "```\n", "---\n: : :\n---\n"]) {
      expect(() => parsePage(t, "j.md")).not.toThrow();
    }
  });
});

describe("Unit: title, sections, helpers", () => {
  it("title precedence: frontmatter, first h1, file name", () => {
    expect(parsePage("---\ntitle: FM\n---\n# H\n", "a/b.md").title).toBe("FM");
    expect(parsePage("text\n# H1\n## H2\n", "a/b.md").title).toBe("H1");
    expect(parsePage("no heading\n", "a/b.md").title).toBe("b");
  });

  it("frontmatter keeps unknown keys in data; YAML date coerces to YYYY-MM-DD", () => {
    const p = parsePage("---\nupdated: 2026-10-15\nfoo: bar\nsummary: S\n---\nx\n", "u.md");
    expect(p.frontmatter.updated).toBe("2026-10-15");
    expect(p.frontmatter.summary).toBe("S");
    expect(p.frontmatter.data.foo).toBe("bar");
  });

  it("frontmatter ending with `...` closes it; single string aliases becomes a list", () => {
    const p = parsePage("---\naliases: Solo\n...\n# T\n", "u.md");
    expect(p.frontmatter.aliases).toEqual(["Solo"]);
    expect(p.errors).toEqual([]);
  });

  it("section lines: heading line is 1-based over the whole file, endLine, parent chain", () => {
    const text = ["---", "title: T", "---", "pre", "# A", "a", "## B", "b", "### C", "c", "## D", ""].join("\n");
    const p = parsePage(text, "t.md");
    const by = (h: string) => p.sections.find((s) => s.heading === h)!;
    expect(by("A").line).toBe(5);
    expect(by("B").line).toBe(7);
    expect(by("B").parent).toBe(by("A").index);
    expect(by("C").parent).toBe(by("B").index);
    expect(by("D").parent).toBe(by("A").index);
    expect(by("A").endLine).toBeGreaterThanOrEqual(5);
    expect(by("B").level).toBe(2);
    expect(by("A").text).toContain("a");
    expect(p.sections[0].text).toContain("pre");
  });

  it("up to three leading spaces allowed on ATX headings; four is not a heading", () => {
    const p = parsePage("   ## Ok\n    ## Not\n", "h.md");
    expect(p.sections.map((s) => s.heading)).toEqual(["", "Ok"]);
  });

  it("inline code spans are ignored for links and typed links", () => {
    const p = parsePage("see `[[Hidden]]` and [[Shown]]\n`k:: v`\n~~~\n[[Fenced]]\n~~~\n", "i.md");
    expect(p.wikilinks).toEqual(["Shown"]);
    expect(p.typedLinks).toEqual([]);
  });

  it("typed link: list-item form, key lower-cased, value trimmed, targets in order", () => {
    const p = parsePage("- Owner:: [[A]] and [[B|b]]  \n9bad:: x\n", "t.md");
    expect(p.typedLinks).toHaveLength(1);
    expect(p.typedLinks[0]).toMatchObject({ key: "owner", value: "[[A]] and [[B|b]]", targets: ["A", "B"] });
  });

  it("citations are distinct targets matching CITATION_RE", () => {
    const p = parsePage("[[src-2026-10-16-a]] [[src-2026-10-16-a]] [[Src-bad]] [[src-2026-10-16-b-c]]\n", "c.md");
    expect(p.citations).toEqual(["src-2026-10-16-a", "src-2026-10-16-b-c"]);
    expect(CITATION_RE.test("src-2026-10-16-x")).toBe(true);
    expect(CITATION_RE.test("src-2026-10-16")).toBe(false);
  });

  it("![[embed]] counts as a link", () => {
    expect(parsePage("![[Img]]\n", "e.md").wikilinks).toEqual(["Img"]);
  });

  it("linkTarget forms", () => {
    expect(linkTarget("a")).toBe("a");
    expect(linkTarget("a|label")).toBe("a");
    expect(linkTarget("a#head")).toBe("a");
    expect(linkTarget("a.md")).toBe("a");
    expect(linkTarget("  a.md#h|l ")).toBe("a");
    expect(linkTarget("[[src-2026-10-16-x]]")).toBe("src-2026-10-16-x");
    expect(linkTarget("[[src-2026-10-16-x|label]]")).toBe("src-2026-10-16-x");
  });

  it("normalizeName: NFC, trim, collapse whitespace, lower-case", () => {
    expect(normalizeName("  Product   LEAD \t")).toBe("product lead");
    expect(normalizeName("Café")).toBe(normalizeName("Café"));
    expect(normalizeName("Café")).toBe("café");
  });

  it("pages are plain JSON-serialisable data", () => {
    const p = parsePage(atlas(`sources: ["${SRC}"]`), "projects/atlas.md");
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
  });
});
