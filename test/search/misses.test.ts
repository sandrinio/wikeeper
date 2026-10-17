import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolvePaths } from "../../src/core/paths.js";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import type { LogEvent, StoredLogEvent } from "../../src/ingest/log.js";
import type { MissSummary, SearchData, SearchFilters } from "../../src/search/engine.js";
import {
  decodeMissFilters,
  encodeMissFilters,
  recordMiss,
  renderMisses,
  shouldRecordMiss,
  summarizeMisses,
} from "../../src/search/misses.js";

const NO: SearchFilters = { type: null, where: [], status: null, since: null };
function data(over: Partial<SearchData>): SearchData {
  return { mode: "query", query: "x", filters: NO, entity_query: null, total: 0, results: [], entity: null, changes: null, misses: null, ...over };
}
function ev(at: string, query: string, filters: Record<string, unknown> = {}, file = at): StoredLogEvent {
  return { file, event: { type: "miss", at, query, filters } as unknown as LogEvent };
}

describe("shouldRecordMiss", () => {
  it("records zero-result query and entity searches only", () => {
    expect(shouldRecordMiss(data({ total: 0 }))).toBe(true);
    expect(shouldRecordMiss(data({ total: 2 }))).toBe(false);
    expect(shouldRecordMiss(data({ mode: "entity", query: null, entity_query: "A", total: 0 }))).toBe(true);
    expect(shouldRecordMiss(data({ mode: "misses", total: 0 }))).toBe(false);
  });
});

describe("encode / decode", () => {
  it("round-trips set filters and entity", () => {
    const f: SearchFilters = { type: "risk", where: [{ key: "owner", value: "Ana" }], status: "open", since: "2026-10-01" };
    const raw = encodeMissFilters(f, "Nobody");
    expect(Object.keys(raw)).toEqual(["type", "where", "status", "since", "entity"]);
    expect(decodeMissFilters(raw)).toEqual({ filters: f, entity: "Nobody" });
    expect(encodeMissFilters(NO, null)).toEqual({});
  });
  it("decodes lists, bare where items and ignores unknown keys", () => {
    const d = decodeMissFilters({ type: ["a", "b"], where: "k", junk: "z" });
    expect(d.filters.type).toBe("a, b");
    expect(d.filters.where).toEqual([{ key: "k", value: "" }]);
    expect(d.entity).toBeNull();
  });
});

describe("summarizeMisses", () => {
  it("groups by normalised query and entity, newest group first", () => {
    const out = summarizeMisses([
      ev("2026-10-12T00:00:00Z", "Budget  Burn", {}, "b"),
      ev("2026-10-10T00:00:00Z", "budget burn", {}, "a"),
      ev("2026-10-13T00:00:00Z", "", { entity: "Nobody" }, "c"),
    ]);
    expect(out.map((m) => [m.query, m.entity, m.count])).toEqual([["budget burn", null, 2], [null, "Nobody", 1]]);
    expect(out[0]!.first_at).toBe("2026-10-10T00:00:00Z");
    expect(out[0]!.last_at).toBe("2026-10-12T00:00:00Z");
  });
  it("sorts equal counts by last_at, then query with null last", () => {
    const at = "2026-10-10T00:00:00Z";
    const out = summarizeMisses([ev(at, "b"), ev(at, "a"), ev(at, "", { entity: "E" })]);
    expect(out.map((m) => m.query)).toEqual(["a", "b", null]);
  });
  it("skips malformed events", () => {
    const out = summarizeMisses([
      ev("2026-10-10T00:00:00Z", 3 as unknown as string),
      ev("2026-10-10T00:00:00Z", "q", { type: 1 }),
      ev("2026-10-10T00:00:00Z", "q", "x" as unknown as Record<string, unknown>),
      ev("2026-10-10T00:00:00Z", "ok"),
    ]);
    expect(out.map((m) => m.query)).toEqual(["ok"]);
  });
});

describe("recordMiss", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "wk-miss-"));
    await mkdir(path.join(root, ".wiki"), { recursive: true });
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });
  it("turns a write failure into a warning", async () => {
    const paths = resolvePaths(root, DEFAULT_CONFIG);
    await writeFile(paths.logDir, "not a directory");
    const r = await recordMiss(paths, data({ query: "budget burn" }), new Date("2026-10-10T00:00:00Z"));
    expect(r.logged).toBe(false);
    expect(r.warning).toMatch(/^miss not logged: /);
  });
  it("writes one event", async () => {
    const paths = resolvePaths(root, DEFAULT_CONFIG);
    const r = await recordMiss(paths, data({ query: "budget burn" }), new Date("2026-10-10T00:00:00Z"));
    expect(r).toEqual({ logged: true, warning: null });
  });
});

describe("renderMisses", () => {
  const m = (over: Partial<MissSummary>): MissSummary => ({ query: "q", filters: NO, entity: null, count: 1, first_at: "2026-10-12T00:00:00Z", last_at: "2026-10-12T00:00:00Z", ...over });
  it("pluralises and formats lines", () => {
    expect(renderMisses(data({ mode: "misses", total: 0, misses: [] }))).toBe("no recorded misses");
    expect(renderMisses(data({ mode: "misses", total: 1, misses: [m({})] }))).toBe('1 recorded miss\n1× "q" (last 2026-10-12)');
    const out = renderMisses(data({ mode: "misses", total: 2, misses: [m({ count: 2 }), m({ query: null, entity: "Nobody" })] }));
    expect(out).toBe('2 recorded misses\n2× "q" (last 2026-10-12)\n1× entity Nobody (last 2026-10-12)');
  });
});
