import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { resolvePaths } from "../../src/core/paths.js";
import {
  FACT_ENTITY_RE,
  FACT_AS_OF_RE,
  FACT_PAGE_RE,
  FACT_KEYS,
  FACT_REQUIRED,
  FACT_STATUSES,
  FACTS_KEYS,
  FACTS_REQUIRED,
  FACTS_SCHEMA_REL,
  factsFilePath,
  readFacts,
  validateFacts,
  writeFacts,
} from "../../src/ingest/facts.js";
import type { FactsFile } from "../../src/ingest/facts.js";
import { isValidKindId } from "../../src/ingest/kind-rules.js";

const tmpDirs: string[] = [];
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});

const ID = "src-2026-10-16-q4-status";
function fact(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    entity: "project:atlas",
    field: "status",
    value: "green",
    status: "decided",
    as_of: "2026-10-16",
    anchor: "Status",
    page: "projects/atlas.md",
    exists: true,
    ...over,
  };
}
function doc(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { source_id: ID, kind: "status-report", rule_version: 2, facts: [fact()], new_entities: [], uncovered: [], ...over };
}
function paths(root: string) {
  return resolvePaths(root, DEFAULT_CONFIG);
}
async function tmp(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-facts-"));
  tmpDirs.push(root);
  return root;
}
function errPaths(input: unknown): string[] {
  const r = validateFacts(input);
  if (r.ok) return [];
  return r.errors.map((e) => e.path);
}

describe("STORY-003-06 facts module (red)", () => {
  it("exports the frozen constants with their frozen values", () => {
    expect([...FACT_STATUSES]).toEqual(["decided", "tentative"]);
    expect([...FACTS_KEYS]).toEqual(["source_id", "kind", "rule_version", "facts", "new_entities", "uncovered"]);
    expect([...FACTS_REQUIRED]).toEqual(["source_id", "kind", "rule_version", "facts"]);
    expect([...FACT_KEYS]).toEqual(["entity", "field", "value", "status", "as_of", "anchor", "page", "exists"]);
    expect([...FACT_REQUIRED]).toEqual([...FACT_KEYS]);
    expect(FACT_ENTITY_RE.source).toBe("^[a-z][a-z0-9-]*:\\S(?:.*\\S)?$");
    expect(FACT_AS_OF_RE.source).toBe("^\\d{4}-\\d{2}-\\d{2}$");
    expect(FACT_PAGE_RE.source).toBe("^(?![/\\\\])(?!(?:.*\\/)?\\.\\.(?:\\/|$))[^\\\\]+\\.md$");
    expect(FACTS_SCHEMA_REL).toBe(".wiki/system/schemas/facts.schema.json");
  });

  it("regexes accept and reject the documented samples", () => {
    for (const ok of ["project:atlas", "person:Ana Kim", "risk:vendor-delay"]) expect(FACT_ENTITY_RE.test(ok)).toBe(true);
    for (const bad of ["Project:x", "project:", "project: x", "project:x "]) expect(FACT_ENTITY_RE.test(bad)).toBe(false);
    for (const ok of ["projects/atlas.md", "risks.md", "sources/src-2026-10-16-q4.md", "a..b.md"]) expect(FACT_PAGE_RE.test(ok)).toBe(true);
    for (const bad of ["/x.md", "\\x.md", "../x.md", "a/../x.md", "x.MD", "a\\b.md", ".md", "a/b.txt"]) expect(FACT_PAGE_RE.test(bad)).toBe(false);
  });

  it("schema and validator agree (required, properties, enum, patterns)", async () => {
    const schema = JSON.parse(await readFile(path.join(process.cwd(), "templates", "system", "schemas", "facts.schema.json"), "utf8"));
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.required).toEqual([...FACTS_REQUIRED]);
    expect(Object.keys(schema.properties)).toEqual([...FACTS_KEYS]);
    expect(schema.additionalProperties).toBe(false);
    const def = schema.$defs.fact;
    expect(def.required).toEqual([...FACT_REQUIRED]);
    expect(Object.keys(def.properties)).toEqual([...FACT_KEYS]);
    expect(def.additionalProperties).toBe(false);
    expect(def.properties.status.enum).toEqual([...FACT_STATUSES]);
    expect(def.properties.entity.pattern).toBe(FACT_ENTITY_RE.source);
    expect(def.properties.as_of.pattern).toBe(FACT_AS_OF_RE.source);
    expect(def.properties.page.pattern).toBe(FACT_PAGE_RE.source);
  });

  it("schema kind pattern agrees with isValidKindId", async () => {
    const schema = JSON.parse(await readFile(path.join(process.cwd(), "templates", "system", "schemas", "facts.schema.json"), "utf8"));
    const re = new RegExp(schema.properties.kind.pattern);
    const samples = ["status-report", "Status-Report", "status-report (v2)", "status-report(V2)", " x ", "-x", "a b", "", "a (v2) (v3)", "meeting-notes ", "x_y", "9a"];
    for (const s of samples) expect(re.test(s), JSON.stringify(s)).toBe(isValidKindId(s));
  });

  it("validateFacts accepts a valid document and normalises the lists", () => {
    const input = doc();
    delete input.new_entities;
    delete input.uncovered;
    const r = validateFacts(input);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.new_entities).toEqual([]);
      expect(r.value.uncovered).toEqual([]);
      expect(Object.keys(r.value)).toEqual([...FACTS_KEYS]);
      expect(Object.keys(r.value.facts[0]!)).toEqual([...FACT_KEYS]);
    }
  });

  it("validateFacts accepts an empty facts array, null rule_version and number/boolean values", () => {
    const r = validateFacts(doc({ facts: [], rule_version: null }));
    expect(r.ok).toBe(true);
    const r2 = validateFacts(doc({ facts: [fact({ value: 3.5 }), fact({ value: false, field: "x" })] }));
    expect(r2.ok).toBe(true);
  });

  it("reports every problem at once, in order, with the documented messages", () => {
    const input = doc({ facts: [fact({ status: "maybe" }), (() => { const f = fact(); delete f.anchor; return f; })()], notes: "x" });
    const r = validateFacts(input);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.map((e) => e.path)).toEqual(["facts[0].status", "facts[1].anchor", "notes"]);
    expect(r.errors[0]!.message).toBe("must be one of decided, tentative");
    expect(r.errors[1]!.message).toBe("required");
    expect(r.errors[2]!.message).toBe('unknown key "notes"; allowed keys: source_id, kind, rule_version, facts, new_entities, uncovered');
  });

  it("rejects unknown keys at the fact level naming the allowed keys", () => {
    const r = validateFacts(doc({ facts: [fact({ extra: 1 })] }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]!.path).toBe("facts[0].extra");
    expect(r.errors[0]!.message).toBe('unknown key "extra"; allowed keys: entity, field, value, status, as_of, anchor, page, exists');
  });

  it("non-object roots stop at $", () => {
    for (const bad of [null, [], "x", 3]) {
      const r = validateFacts(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.errors).toHaveLength(1);
        expect(r.errors[0]).toEqual({ path: "$", message: "must be an object" });
      }
    }
  });

  it("checks each field rule", () => {
    expect(errPaths(doc({ kind: "bad kind" }))).toEqual(["kind"]);
    expect(errPaths(doc({ rule_version: 0 }))).toEqual(["rule_version"]);
    expect(errPaths(doc({ rule_version: 1.5 }))).toEqual(["rule_version"]);
    expect(errPaths(doc({ rule_version: "2" }))).toEqual(["rule_version"]);
    expect(errPaths(doc({ facts: "no" }))).toEqual(["facts"]);
    expect(errPaths(doc({ new_entities: [""] }))).toEqual(["new_entities[0]"]);
    expect(errPaths(doc({ uncovered: ["  "] }))).toEqual(["uncovered[0]"]);
    expect(errPaths(doc({ facts: [fact({ entity: "Project:x" })] }))).toEqual(["facts[0].entity"]);
    expect(errPaths(doc({ facts: [fact({ field: " " })] }))).toEqual(["facts[0].field"]);
    expect(errPaths(doc({ facts: [fact({ value: null })] }))).toEqual(["facts[0].value"]);
    expect(errPaths(doc({ facts: [fact({ value: Infinity })] }))).toEqual(["facts[0].value"]);
    expect(errPaths(doc({ facts: [fact({ value: { a: 1 } })] }))).toEqual(["facts[0].value"]);
    expect(errPaths(doc({ facts: [fact({ anchor: "" })] }))).toEqual(["facts[0].anchor"]);
    expect(errPaths(doc({ facts: [fact({ exists: "yes" })] }))).toEqual(["facts[0].exists"]);
  });

  it("as_of must be a real calendar date", () => {
    expect(errPaths(doc({ facts: [fact({ as_of: "2026-02-30" })] }))).toEqual(["facts[0].as_of"]);
    expect(errPaths(doc({ facts: [fact({ as_of: "2026-13-01" })] }))).toEqual(["facts[0].as_of"]);
    expect(errPaths(doc({ facts: [fact({ as_of: "2026-1-1" })] }))).toEqual(["facts[0].as_of"]);
    expect(errPaths(doc({ facts: [fact({ as_of: "2024-02-29" })] }))).toEqual([]);
    expect(errPaths(doc({ facts: [fact({ as_of: "2026-02-29" })] }))).toEqual(["facts[0].as_of"]);
  });

  it("page must be a POSIX path under pages/ ending in .md", () => {
    for (const bad of ["../x.md", "/x.md", "a/../x.md", "a\\b.md", "x.txt"]) {
      expect(errPaths(doc({ facts: [fact({ page: bad })] })), bad).toEqual(["facts[0].page"]);
    }
  });

  it("missing required top-level keys are reported as required", () => {
    const r = validateFacts({});
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.map((e) => e.path)).toEqual(["source_id", "kind", "rule_version", "facts"]);
    expect(r.errors.every((e) => e.message === "required")).toBe(true);
  });

  it("factsFilePath joins raw/<id>.facts.json and rejects a non-source id", async () => {
    const root = await tmp();
    const p = paths(root);
    expect(factsFilePath(p, ID)).toBe(path.join(p.rawDir, `${ID}.facts.json`));
    expect(() => factsFilePath(p, "../etc")).toThrow(/not a source id/);
  });

  it("writeFacts writes 2-space LF JSON atomically, reports replaced and the sha256", async () => {
    const root = await tmp();
    const p = paths(root);
    await mkdir(p.rawDir, { recursive: true });
    const value = validateFacts(doc());
    expect(value.ok).toBe(true);
    if (!value.ok) return;
    const first = await writeFacts(p, value.value);
    const target = factsFilePath(p, ID);
    const text = await readFile(target, "utf8");
    expect(text).toBe(JSON.stringify(value.value, null, 2) + "\n");
    expect(text.includes("\r")).toBe(false);
    expect(first.replaced).toBe(false);
    expect(first.file).toBe(`.wiki/raw/${ID}.facts.json`);
    expect(first.sha256).toBe(createHash("sha256").update(text).digest("hex"));
    const second = await writeFacts(p, { ...value.value, uncovered: ["x"] });
    expect(second.replaced).toBe(true);
    expect(second.sha256).not.toBe(first.sha256);
    expect((await readdir(p.rawDir)).sort()).toEqual([`${ID}.facts.json`]);
  });

  it("readFacts returns null when absent, the value when valid, throws invalid_facts when corrupt", async () => {
    const root = await tmp();
    const p = paths(root);
    await mkdir(p.rawDir, { recursive: true });
    expect(await readFacts(p, ID)).toBeNull();
    const v = validateFacts(doc());
    if (!v.ok) throw new Error("fixture invalid");
    await writeFile(factsFilePath(p, ID), "﻿" + JSON.stringify(v.value));
    expect(await readFacts(p, ID)).toEqual(v.value);
    await writeFile(factsFilePath(p, ID), "{not json");
    await expect(readFacts(p, ID)).rejects.toMatchObject({ code: "invalid_facts" });
    await writeFile(factsFilePath(p, ID), JSON.stringify({ source_id: ID }));
    await expect(readFacts(p, ID)).rejects.toMatchObject({ code: "invalid_facts" });
  });

  it("FactsFile type is usable", () => {
    const f: FactsFile = { source_id: ID, kind: "k", rule_version: null, facts: [], new_entities: [], uncovered: [] };
    expect(f.facts).toEqual([]);
  });
});
