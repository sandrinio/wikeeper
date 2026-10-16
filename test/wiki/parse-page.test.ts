import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { linkTarget, normalizeName, owningEntityKey, pageEntities, parsePage } from "../../src/wiki/parse-page.js";

const PAGES = path.join(import.meta.dirname, "..", "fixtures", "wiki", "pages");
const SRC = "src-2026-10-16-q4-status";
const load = async (rel: string) => parsePage(await readFile(path.join(PAGES, ...rel.split("/")), "utf8"), rel);

describe("Scenario: A project page parses into frontmatter, typed links, facts and citations", () => {
  it("reads the atlas fixture", async () => {
    const p = await load("projects/atlas.md");
    expect(p.frontmatter).toMatchObject({ type: "project", title: "Atlas", aliases: ["Atlas launch"], sources: [SRC] });
    expect(p.errors).toEqual([]);
    const owner = p.typedLinks.find((t) => t.key === "owner")!;
    expect(owner.targets).toEqual(["Ana Kim"]);
    expect(p.facts).toHaveLength(1);
    expect(p.sections[p.facts[0]!.section]!.heading).toBe("Timeline");
    expect(p.citations).toEqual([SRC]);
    expect(p.wikilinks).toEqual(["Ana Kim", SRC]);
    expect(p.sections.map((s) => s.heading)).not.toContain("Not a heading");
  });
});

describe("Scenario: Entities can be whole pages or sections inside a page", () => {
  it("reads the team fixture", async () => {
    const p = await load("team.md");
    const ents = pageEntities(p);
    expect(ents.map((e) => e.name)).toEqual(["Team", "Ana Kim", "Luka B."]);
    expect(ents[1]!.key).toBe(`team.md#L${ents[1]!.line}`);
    expect(ents[1]).toMatchObject({ type: "person", aliases: ["AK", "Ana K."] });
    const role = p.typedLinks.find((t) => t.key === "role")!;
    expect(owningEntityKey(p, role.section)).toBe(ents[1]!.key);
  });
});

describe("Scenario: Error — broken frontmatter is reported, never thrown", () => {
  it("reads the broken fixture", async () => {
    const p = await load("broken-frontmatter.md");
    expect(p.errors.find((e) => e.code === "frontmatter_yaml")?.line).toBe(1);
    expect(p.frontmatter.aliases).toEqual([]);
    expect(p.title).toBe("Broken page");
    expect(p.wikilinks).toEqual(["Target"]);
  });
});

describe("Unit", () => {
  it("linkTarget forms", () => {
    expect(linkTarget("[[a#h|l]]")).toBe("a");
    expect(linkTarget("![[a.md]]")).toBe("a");
  });
  it("sources in block-list wikilink form give bare ids", () => {
    const p = parsePage(`---\nsources:\n  - [[${SRC}]]\n  - "[[src-2026-10-16-b|x]]"\n---\n`, "s.md");
    expect(p.frontmatter.sources).toEqual([SRC, "src-2026-10-16-b"]);
    expect(p.errors).toEqual([]);
  });
  it("normalizeName", () => {
    expect(normalizeName(" Ána \n KIM")).toBe("ána kim");
  });
  it("date validity and leap days", () => {
    const p = parsePage("- 2024-02-29 · decided · ok\n- 2026-02-29 · decided · no\n", "d.md");
    expect(p.facts.map((f) => f.date)).toEqual(["2024-02-29"]);
    expect(p.errors.map((e) => e.code)).toEqual(["fact_date"]);
  });
  it("inline code is blanked without shifting typed link values", () => {
    const p = parsePage("owner:: `x` [[A]]\n", "i.md");
    expect(p.typedLinks[0]).toMatchObject({ key: "owner", value: "`x` [[A]]", targets: ["A"] });
  });
  it("a dated list item without a status segment is a fact_status error", () => {
    const p = parsePage("- 2026-10-15 launch moves\n", "f.md");
    expect(p.facts).toEqual([]);
    expect(p.errors.map((e) => e.code)).toEqual(["fact_status"]);
  });
  it("section parent chain and entity ownership with nested headings", () => {
    const p = parsePage("# T\n## Ana\ntype:: person\n### Notes\n#### Deep\n## Plain\n", "t.md");
    const by = (h: string) => p.sections.find((s) => s.heading === h)!;
    expect(by("Deep").parent).toBe(by("Notes").index);
    expect(owningEntityKey(p, by("Deep").index)).toBe(`t.md#L${by("Ana").line}`);
    expect(owningEntityKey(p, by("Plain").index)).toBe("t.md");
  });
  it("YAML date in updated is written back as YYYY-MM-DD; wrong shapes keep defaults", () => {
    const p = parsePage("---\nupdated: 2026-10-15\ntitle: [x]\n---\n", "y.md");
    expect(p.frontmatter.updated).toBe("2026-10-15");
    expect(p.frontmatter.title).toBeNull();
    expect(p.errors.map((e) => e.code)).toEqual(["frontmatter_field"]);
  });
  it("links in fact contradiction tails still count as links", () => {
    const p = parsePage("- 2026-10-15 · decided · x [[src-2026-10-16-b]] · contradicts:: [[src-2026-10-01-a]]\n", "c.md");
    expect(p.wikilinks).toEqual(["src-2026-10-16-b", "src-2026-10-01-a"]);
    expect(p.facts[0]!.contradiction).toBe(true);
  });
});
