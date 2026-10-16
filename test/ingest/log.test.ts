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
});
