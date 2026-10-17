import { describe, expect, it } from "vitest";
import { FACT_DIFF_FIELDS, diffFacts } from "../../src/ingest/facts.js";
import type { Fact, FactsFile } from "../../src/ingest/facts.js";

const base: Fact = {
  entity: "project:atlas",
  field: "target_date",
  value: "2026-11-01",
  status: "decided",
  as_of: "2026-10-15",
  anchor: "p.3",
  page: "projects/atlas.md",
  exists: true,
};
const file = (facts: Fact[]): FactsFile => ({
  source_id: "src-2026-10-17-a",
  kind: "status-report",
  rule_version: 1,
  facts,
  new_entities: [],
  uncovered: [],
});
const other: Record<(typeof FACT_DIFF_FIELDS)[number], Fact[keyof Fact]> = {
  value: "x",
  status: "tentative",
  as_of: "2026-10-16",
  page: "other.md",
  exists: false,
};

describe("diffFacts", () => {
  for (const k of FACT_DIFF_FIELDS) {
    it(`reports a change in ${k} alone`, () => {
      const after = { ...base, [k]: other[k] } as Fact;
      expect(diffFacts(file([base]), file([after]))).toEqual({
        added: [],
        removed: [],
        changed: [{ before: base, after }],
      });
    });
  }
  it("a key change is one removed and one added fact", () => {
    const n = { ...base, anchor: "p.4" };
    expect(diffFacts(file([base]), file([n]))).toEqual({ added: [n], removed: [base], changed: [] });
  });
  it("pairs duplicate keys in order", () => {
    const a = { ...base, value: "a" };
    const b = { ...base, value: "b" };
    const r = diffFacts(file([a, b]), file([a]));
    expect(r.removed).toEqual([b]);
    expect(r.changed).toEqual([]);
  });
  it("orders added and changed by next, removed by stored", () => {
    const s1 = { ...base, entity: "project:s1" };
    const s2 = { ...base, entity: "project:s2" };
    const n1 = { ...base, entity: "project:n1" };
    const n2 = { ...base, entity: "project:n2" };
    const r = diffFacts(file([s1, s2]), file([n2, n1]));
    expect(r.added).toEqual([n2, n1]);
    expect(r.removed).toEqual([s1, s2]);
  });
});
