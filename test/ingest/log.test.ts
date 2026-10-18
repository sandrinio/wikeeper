import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { resolvePaths } from "../../src/core/paths.js";
import type { ResolvedPaths } from "../../src/core/paths.js";
import { readLogEvents, renderLogView, writeLogEvent } from "../../src/ingest/log.js";

let root: string;
let paths: ResolvedPaths;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "wikeeper-logu-"));
  paths = resolvePaths(root, DEFAULT_CONFIG);
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("log events", () => {
  it("round-trips a rule-proposal with extra fields and body summary", async () => {
    const rel = await writeLogEvent(paths, { type: "rule-proposal", at: "2026-10-16T01:02:03.004Z", summary: "tighten", n: 2 });
    expect(rel).toBe(".wiki/log/20261016T010203004Z-rule-proposal.md");
    const text = await readFile(path.join(root, ...rel.split("/")), "utf8");
    expect(text.endsWith("---\nRule proposal: tighten\n")).toBe(true);
    const { events } = await readLogEvents(paths);
    expect(events[0]!.event).toMatchObject({ type: "rule-proposal", summary: "tighten", n: 2 });
  });

  it("since accepts a date and an ISO timestamp, rejects garbage", async () => {
    await writeLogEvent(paths, { type: "miss", at: "2026-10-16T00:00:00.000Z", query: "a", filters: {} });
    await writeLogEvent(paths, { type: "miss", at: "2026-10-15T23:59:59.000Z", query: "b", filters: {} });
    expect((await readLogEvents(paths, { since: "2026-10-16" })).events).toHaveLength(1);
    expect((await readLogEvents(paths, { since: "2026-10-15T23:59:59Z" })).events).toHaveLength(2);
    await expect(readLogEvents(paths, { since: "x" })).rejects.toMatchObject({ code: "invalid_since" });
  });

  it("sanitises the slug", async () => {
    const rel = await writeLogEvent(paths, { type: "abort", at: "2026-10-16T00:00:00.000Z", source_id: "Src_1:x", dropped: false, restored: [] });
    expect(rel).toBe(".wiki/log/20261016T000000000Z-src-1-x.md");
  });

  it("empty view", () => {
    expect(renderLogView([])).toContain("_No events yet._");
  });

  it("a miss names its filters in the body line and the view line", async () => {
    const at = "2026-10-16T00:00:00.000Z";
    const cases: Array<[string, Record<string, string | string[]>, string, string]> = [
      ["", { status: "tentative" }, "No results for --status tentative.", "· miss · --status tentative"],
      ["vendor", { type: "risk" }, 'No results for "vendor" --type risk.', '· miss · "vendor" --type risk'],
      ["", { entity: "Nobody" }, "No results for --entity Nobody.", "· miss · --entity Nobody"],
      ["", { where: ["a=1", "b=2"], mark: "decided", zed: "z", alpha: "a" }, "No results for --where a=1 --where b=2 --mark decided --alpha a --zed z.", "· miss · --where a=1 --where b=2 --mark decided --alpha a --zed z"],
      ["x", {}, 'No results for "x".', '· miss · "x"'],
      ["", {}, 'No results for "".', '· miss · ""'],
    ];
    for (const [query, filters, body, view] of cases) {
      const rel = await writeLogEvent(paths, { type: "miss", at, query, filters });
      const text = await readFile(path.join(root, ...rel.split("/")), "utf8");
      expect(text.endsWith(`---\n${body}\n`)).toBe(true);
      const { events } = await readLogEvents(paths);
      expect(renderLogView(events)).toContain(view);
      await rm(path.join(root, ...rel.split("/")));
    }
  });
});

describe("page_hashes (STORY-005-03)", () => {
  const base = {
    type: "ingest" as const, at: "2026-10-16T00:00:00.000Z", source_id: "src-1", kind: "k", rule_version: null,
    permission: "ai" as const, origin: "o", created: [] as string[], updated: [] as string[], deleted: [] as string[], contradictions: 0, rule_suggestions: 0,
  };
  it("isPageHashes accepts 64 lower-case hex values only", async () => {
    const { isPageHashes } = await import("../../src/ingest/log.js");
    const h = "ab".repeat(32);
    expect(isPageHashes({ "a.md": h })).toBe(true);
    expect(isPageHashes({})).toBe(true);
    for (const bad of [[], null, "x", { "a.md": "abc" }, { "a.md": h.toUpperCase() }, { "": h }, { "a.md": 1 }]) {
      expect(isPageHashes(bad)).toBe(false);
    }
  });
  it("an event without page_hashes is written without the key; a malformed one throws and writes nothing", async () => {
    const rel = await writeLogEvent(paths, base);
    expect(await readFile(path.join(root, ...rel.split("/")), "utf8")).not.toContain("page_hashes");
    const root2 = await mkdtemp(path.join(os.tmpdir(), "wikeeper-logu2-"));
    try {
      const p2 = resolvePaths(root2, DEFAULT_CONFIG);
      await expect(writeLogEvent(p2, { ...base, page_hashes: { "team.md": "abc" } })).rejects.toMatchObject({ code: "invalid_event" });
      expect((await readLogEvents(p2)).events).toEqual([]);
    } finally {
      await rm(root2, { recursive: true, force: true });
    }
  });
  it("round-trips page_hashes", async () => {
    const h = "cd".repeat(32);
    await writeLogEvent(paths, { ...base, page_hashes: { "a.md": h } });
    expect((await readLogEvents(paths)).events[0]!.event).toMatchObject({ page_hashes: { "a.md": h } });
  });
});

describe("archive_hashes and archive_restored (STORY-008-01)", () => {
  const base = {
    type: "ingest" as const, at: "2026-10-16T00:00:00.000Z", source_id: "src-1", kind: "k", rule_version: null,
    permission: "ai" as const, origin: "o", created: [] as string[], updated: [] as string[], deleted: [] as string[], contradictions: 0, rule_suggestions: 0,
  };
  it("round-trips archive_hashes and archive_restored, in key order after page_hashes and restored", async () => {
    const h = "ef".repeat(32);
    const f1 = await writeLogEvent(paths, { ...base, page_hashes: { "a.md": h }, archive_hashes: { "a.md": h } });
    const t1 = await readFile(path.join(root, ...f1.split("/")), "utf8");
    expect(t1.indexOf("page_hashes")).toBeLessThan(t1.indexOf("archive_hashes"));
    await writeLogEvent(paths, { type: "abort", at: "2026-10-16T00:00:01.000Z", source_id: "src-1", dropped: false, restored: [], archive_restored: ["a.md"] });
    const evs = (await readLogEvents(paths)).events.map((e) => e.event);
    expect(evs[0]).toMatchObject({ archive_hashes: { "a.md": h } });
    expect(evs[1]).toMatchObject({ archive_restored: ["a.md"] });
  });
  it("refuses malformed values and writes no file", async () => {
    await expect(writeLogEvent(paths, { ...base, archive_hashes: { "a.md": "abc" } })).rejects.toMatchObject({ code: "invalid_event" });
    await expect(
      writeLogEvent(paths, { type: "abort", at: base.at, source_id: "s", dropped: false, restored: [], archive_restored: "a.md" as never }),
    ).rejects.toMatchObject({ code: "invalid_event" });
  });
  it("writes today's bytes without them", async () => {
    const rel = await writeLogEvent(paths, base);
    expect(await readFile(path.join(root, ...rel.split("/")), "utf8")).not.toContain("archive_");
  });
});
