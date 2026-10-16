import { describe, expect, it } from "vitest";
import { validateFacts } from "../../src/ingest/facts.js";

const fact = {
  entity: "project:atlas", field: "status", value: "green", status: "decided",
  as_of: "2026-10-16", anchor: "Status", page: "projects/atlas.md", exists: true,
};
const doc = { source_id: "src-2026-10-16-a", kind: "status-report", rule_version: null, facts: [fact] };

describe("validateFacts (developer unit tests)", () => {
  it("accepts a minimal document and fills the lists", () => {
    const r = validateFacts(doc);
    expect(r.ok && r.value.uncovered).toEqual([]);
  });
  it("reports a non-object fact at its index", () => {
    const r = validateFacts({ ...doc, facts: [fact, 7] });
    expect(!r.ok && r.errors).toEqual([{ path: "facts[1]", message: "must be an object" }]);
  });
  it("orders errors by fact index, then key order, then root unknown keys", () => {
    const r = validateFacts({ ...doc, zzz: 1, facts: [{ ...fact, page: "x.txt", entity: "X" }, { ...fact, exists: 1 }] });
    expect(!r.ok && r.errors.map((e) => e.path)).toEqual(["facts[0].entity", "facts[0].page", "facts[1].exists", "zzz"]);
  });
  it("rejects year-0 leap-day edge and accepts a real leap day", () => {
    expect(validateFacts({ ...doc, facts: [{ ...fact, as_of: "2100-02-29" }] }).ok).toBe(false);
    expect(validateFacts({ ...doc, facts: [{ ...fact, as_of: "2000-02-29" }] }).ok).toBe(true);
  });
  it("rejects a non-string source_id and a fractional rule_version", () => {
    const r = validateFacts({ ...doc, source_id: 3, rule_version: 1.2 });
    expect(!r.ok && r.errors.map((e) => e.path)).toEqual(["source_id", "rule_version"]);
  });
  it("rejects a non-array new_entities", () => {
    const r = validateFacts({ ...doc, new_entities: "x" });
    expect(!r.ok && r.errors[0]?.path).toBe("new_entities");
  });
});
