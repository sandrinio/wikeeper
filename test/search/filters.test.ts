import { describe, expect, it } from "vitest";
import { EMPTY_FILTERS } from "../../src/search/engine.js";
import type { SearchFilters } from "../../src/search/engine.js";
import {
  describeFilters,
  hasFilters,
  matchesFilters,
  parseFilterValue,
  parseWhere,
} from "../../src/search/filters.js";
import { pageEntities, parsePage } from "../../src/wiki/parse-page.js";

const risks = parsePage(
  [
    "# Risks",
    "",
    "## Vendor delay",
    "type:: risk",
    "owner:: [[Ana Kim]]",
    "status:: open",
    "",
    "## Reopened item",
    "type:: risk",
    "status:: reopened",
    "",
  ].join("\n"),
  "risks.md",
);
const [vendor, reopened] = pageEntities(risks).filter((e) => e.kind === "section");

const f = (over: Partial<SearchFilters>): SearchFilters => ({ ...EMPTY_FILTERS, where: [], ...over });

describe("parseWhere", () => {
  it("splits at the first = and trims", () => {
    expect(parseWhere(" owner = Ana=B ")).toEqual({ key: "owner", value: "Ana=B" });
  });
  it.each(["owner", "=Ana", "owner="])("rejects %s", (raw) => {
    expect(() => parseWhere(raw)).toThrow(expect.objectContaining({ code: "invalid_filter", details: { expected: "key=value", got: raw } }));
  });
});

describe("parseFilterValue", () => {
  it("maps undefined to null, trims, and rejects blanks", () => {
    expect(parseFilterValue("--type", undefined)).toBeNull();
    expect(parseFilterValue("--type", " risk ")).toBe("risk");
    expect(() => parseFilterValue("--status", "")).toThrow(expect.objectContaining({ code: "invalid_filter" }));
  });
});

describe("matchesFilters", () => {
  it("matches whole tokens, not partial ones, and multi-token values", () => {
    expect(matchesFilters(vendor!, f({ where: [{ key: "owner", value: "kim" }] }), risks)).toBe(true);
    expect(matchesFilters(vendor!, f({ where: [{ key: "Owner", value: "An" }] }), risks)).toBe(false);
    expect(matchesFilters(vendor!, f({ where: [{ key: "owner", value: "Kim Ana" }] }), risks)).toBe(true);
    expect(matchesFilters(vendor!, f({ where: [{ key: "owner", value: "Ana Lopez" }] }), risks)).toBe(false);
  });
  it("reads list-valued frontmatter keys on page entities", () => {
    const page = parsePage("---\ntype: project\ntags: [alpha, beta gamma]\n---\n# Atlas\n", "projects/atlas.md");
    const atlas = pageEntities(page).find((e) => e.kind === "page")!;
    expect(matchesFilters(atlas, f({ type: "project", where: [{ key: "tags", value: "gamma" }] }), page)).toBe(true);
    expect(matchesFilters(atlas, f({ where: [{ key: "tags", value: "delta" }] }), page)).toBe(false);
  });
  it("matches status exactly", () => {
    expect(matchesFilters(vendor!, f({ status: "open" }), risks)).toBe(true);
    expect(matchesFilters(reopened!, f({ status: "open" }), risks)).toBe(false);
    expect(matchesFilters(reopened!, f({ status: "Reopened" }), risks)).toBe(true);
  });
});

describe("hasFilters / describeFilters", () => {
  it("ignores since", () => {
    expect(hasFilters(f({ since: "2026-01-01" }))).toBe(false);
    expect(hasFilters(f({ status: "open" }))).toBe(true);
  });
  it("lists only the set filters", () => {
    expect(describeFilters(f({ type: "risk", where: [{ key: "owner", value: "Ana" }], status: "open" }))).toBe(
      "--type risk --where owner=Ana --status open",
    );
    expect(describeFilters(f({}))).toBe("");
  });
});
