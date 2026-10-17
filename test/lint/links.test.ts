import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { resolvePaths } from "../../src/core/paths.js";
import { brokenLinkCheck, linkResolver, orphanPageCheck } from "../../src/lint/links.js";
import type { LintContext } from "../../src/lint/checks.js";
import { parsePage } from "../../src/wiki/parse-page.js";

const paths = resolvePaths("/repo", DEFAULT_CONFIG);
const ctxOf = (pages: ReturnType<typeof parsePage>[]): LintContext => ({
  paths,
  config: DEFAULT_CONFIG,
  pages,
  kb: null,
  log: [],
  now: new Date(0),
});

const PRODUCT = parsePage("---\ntype: person\ntitle: Product Lead\naliases: [Product]\n---\n# Product Lead\n", "people/product-lead.md");
const RISKS = parsePage("# Risks\n\n## Vendor delay\ntype:: risk\naliases:: vendor slip\n", "risks.md");
const Q4 = "src-2026-10-16-q4";

describe("linkResolver", () => {
  const resolve = linkResolver([PRODUCT, RISKS]);
  it("resolves path, file name, title, alias and entity section names, case and space insensitive", () => {
    expect(resolve("people/product-lead")).toEqual(["people/product-lead.md"]);
    expect(resolve("product-lead")).toEqual(["people/product-lead.md"]);
    expect(resolve("Product  LEAD")).toEqual(["people/product-lead.md"]);
    expect(resolve("Product")).toEqual(["people/product-lead.md"]);
    expect(resolve("Vendor delay")).toEqual(["risks.md"]);
    expect(resolve("vendor slip")).toEqual(["risks.md"]);
    expect(resolve("Nobody")).toEqual([]);
  });

  it("a key shared by several pages resolves to all of them", () => {
    const other = parsePage("---\naliases: [Product]\n---\n# Other\n", "other.md");
    expect(linkResolver([PRODUCT, other])("product")).toEqual(["people/product-lead.md", "other.md"]);
  });
});

describe("broken-link", () => {
  it("names the missing source page for a citation, and reports one finding per target per line", async () => {
    const page = parsePage(`# A\n\nGone [[${Q4}]] [[${Q4}]] and [[Nope]] [[nope]].\n`, "a.md");
    const f = await brokenLinkCheck.run(ctxOf([page]));
    expect(f).toHaveLength(2);
    expect(f[0]).toMatchObject({ id: "broken-link", severity: "error", path: ".wiki/pages/a.md", line: 3 });
    expect(f[0]!.message).toBe(`[[${Q4}]] cites a source with no page .wiki/pages/sources/${Q4}.md`);
    expect(f[1]!.message).toBe("[[Nope]] does not resolve to a page");
  });

  it("a citation resolves to sources/<id>.md by file name", async () => {
    const page = parsePage(`# A\n\nOk [[${Q4}]]\n`, "a.md");
    const src = parsePage(`# Q4\n`, `sources/${Q4}.md`);
    expect(await brokenLinkCheck.run(ctxOf([page, src]))).toEqual([]);
  });
});

describe("orphan-page", () => {
  it("self-links do not count", async () => {
    const a = parsePage("# A\n\nSee [[a]].\n", "a.md");
    const b = parsePage("# B\n\nSee [[a]].\n", "b.md");
    const f = await orphanPageCheck.run(ctxOf([a, b]));
    expect(f).toEqual([{ id: "orphan-page", severity: "warning", message: "no other page links to it", path: ".wiki/pages/b.md" }]);
  });
});
