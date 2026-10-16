import { describe, expect, it } from "vitest";
import { entityBacklinks, entityKeys, resolveEntity } from "../../src/search/aliases.js";
import { buildBacklinks, pageEntities, parsePage } from "../../src/wiki/parse-page.js";
import type { Entity } from "../../src/wiki/parse-page.js";

const atlas = parsePage("---\ntitle: Atlas\n---\n# Atlas\nowner:: [[Product Lead]]\n", "projects/atlas.md");
const glossary = parsePage("# Glossary\n\n## ATL\ntype:: term\naliases:: Atlas\n\n## Atlas Zed\ntype:: term\naliases:: Atlas\n", "glossary.md");
const other = parsePage("# Other\n\n## Atlas\ntype:: term\n", "a-other.md");
const team = parsePage(
  "# Team\n\n## Product Lead\ntype:: person\naliases:: PL, Product L.\nSee [[PL]].\n",
  "team.md",
);
const risks = parsePage("# Risks\n\n## Vendor delay\nowner:: [[PL]]\n", "risks.md");
const pages = [atlas, glossary, other, team, risks];
const entities: Entity[] = pages.flatMap(pageEntities);

describe("resolveEntity", () => {
  it("name beats alias", () => {
    const r = resolveEntity(entities, "atlas")!;
    expect(r.matched).toBe("name");
    expect(r.entity.name).toBe("Atlas");
  });
  it("page beats section among equal name matches", () => {
    const r = resolveEntity(entities, "atlas")!;
    expect(r.entity.kind).toBe("page");
    expect(r.others.map((o) => o.name)).toContain("Atlas");
  });
  it("path orders equal matches", () => {
    const r = resolveEntity([...pageEntities(other), ...pageEntities(glossary)], "atlas")!;
    expect(r.entity.path).toBe("a-other.md");
    expect(r.matched).toBe("name");
  });
  it("line orders equal alias matches, and the alias is returned as written", () => {
    const r = resolveEntity(pageEntities(glossary), "ATLAS")!;
    expect(r.entity.name).toBe("ATL");
    expect(r.matched).toBe("alias");
    expect(r.matchedAlias).toBe("Atlas");
    expect(r.others.map((o) => o.name)).toEqual(["Atlas Zed"]);
  });
  it("returns null for unknown or empty names", () => {
    expect(resolveEntity(entities, "Nobody")).toBeNull();
    expect(resolveEntity(entities, "  ")).toBeNull();
  });
  it("entityKeys adds the file name for a page entity", () => {
    expect(entityKeys(pageEntities(atlas)[0]!).names).toEqual(["atlas"]);
  });
});

describe("entityBacklinks", () => {
  it("excludes links inside the entity and sorts by path", () => {
    const r = resolveEntity(entities, "PL")!;
    const links = entityBacklinks(r.entity, pages, buildBacklinks(pages));
    expect(links.map((l) => l.path)).toEqual(["projects/atlas.md", "risks.md"]);
    expect(links.some((l) => l.path === "team.md")).toBe(false);
  });
});
