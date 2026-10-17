import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import type { WikeeperConfig } from "../../src/core/config.js";
import { resolvePaths } from "../../src/core/paths.js";
import type { ResolvedPaths } from "../../src/core/paths.js";
import { acquireLock } from "../../src/ingest/lock.js";
import type { IngestLogEvent, StoredLogEvent } from "../../src/ingest/log.js";
import { takeSnapshot } from "../../src/ingest/snapshot.js";
import type { LintContext } from "../../src/lint/checks.js";
import { pageHash, unloggedChangeCheck } from "../../src/lint/unlogged.js";
import { loadPages } from "../../src/wiki/parse-page.js";

let root: string;
let paths: ResolvedPaths;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "wk-unl-"));
  paths = resolvePaths(root, DEFAULT_CONFIG);
  await mkdir(paths.pagesDir, { recursive: true });
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const A = "a".repeat(64);
const put = async (rel: string, text: string): Promise<void> => {
  const f = path.join(paths.pagesDir, ...rel.split("/"));
  await mkdir(path.dirname(f), { recursive: true });
  await writeFile(f, text);
};
function ev(over: Record<string, unknown>, file = ".wiki/log/e1.md"): StoredLogEvent {
  const event = {
    type: "ingest", at: "2026-10-10T00:00:00.000Z", source_id: "src-1", kind: "k", rule_version: null,
    permission: "ai", origin: "o", created: [], updated: [], deleted: [], contradictions: 0, rule_suggestions: 0,
    ...over,
  } as unknown as IngestLogEvent;
  return { file, event };
}
async function check(log: StoredLogEvent[], config: WikeeperConfig = DEFAULT_CONFIG) {
  const ctx: LintContext = { paths, config, pages: await loadPages(paths.pagesDir), kb: null, log, now: new Date(), };
  return unloggedChangeCheck.run(ctx);
}

describe("pageHash", () => {
  it("ignores a leading BOM and CRLF, changes with content", () => {
    expect(pageHash("a\nb\n")).toBe(pageHash("﻿a\r\nb\r\n"));
    expect(pageHash("a\nb\n")).not.toBe(pageHash("a\nc\n"));
    expect(pageHash("x")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("unlogged-change decisions (R3)", () => {
  it("no event touches an existing page", async () => {
    await put("t.md", "# T\n");
    const f = await check([]);
    expect(f).toEqual([{ id: "unlogged-change", severity: "error", path: ".wiki/pages/t.md", message: "in no ingest log event" }]);
  });

  it("changed, matching, deleted, recreated, missing hash entry", async () => {
    await put("same.md", "s\n");
    await put("edit.md", "new\n");
    await put("again.md", "x\n");
    await put("nohash.md", "n\n");
    const log = [
      ev({ created: ["same.md", "edit.md", "gone.md", "nohash.md"], page_hashes: { "same.md": pageHash("s\n"), "edit.md": pageHash("old\n"), "gone.md": A } }),
      ev({ source_id: "src-2", deleted: ["again.md"], page_hashes: {}, at: "2026-10-11T00:00:00.000Z" }, ".wiki/log/e2.md"),
    ];
    const f = await check(log);
    const byPath = Object.fromEntries(f.filter((x) => x.path).map((x) => [x.path, x.message]));
    expect(byPath).toEqual({
      ".wiki/pages/again.md": "deleted by ingest src-2 (.wiki/log/e2.md) and created again without a log entry",
      ".wiki/pages/edit.md": "changed since ingest src-1 recorded it (.wiki/log/e1.md)",
      ".wiki/pages/gone.md": "deleted without a log entry (last recorded by ingest src-1, .wiki/log/e1.md)",
    });
    const info = f.filter((x) => x.path === undefined);
    expect(info).toHaveLength(1);
    expect(info[0]!.severity).toBe("info");
    expect(info[0]!.message.startsWith("1 page(s) were last recorded")).toBe(true);
  });

  it("an event without page_hashes is the baseline; a malformed page_hashes counts as missing; list values that are not arrays are empty", async () => {
    await put("old.md", "edited\n");
    await put("bad.md", "edited\n");
    const log = [
      ev({ created: ["old.md"] }),
      ev({ created: ["bad.md"], page_hashes: "oops", deleted: "nope" } as never, ".wiki/log/e2.md"),
    ];
    const f = await check(log);
    expect(f.filter((x) => x.severity === "error")).toEqual([]);
    expect(f.find((x) => x.severity === "info")!.message.startsWith("2 page(s)")).toBe(true);
  });

  it("only .md pages and non-ingest events are considered", async () => {
    await put("img.txt", "x");
    const log: StoredLogEvent[] = [{ file: ".wiki/log/m.md", event: { type: "miss", at: "2026-10-10T00:00:00.000Z", query: "q", filters: {} } }];
    expect(await check(log)).toEqual([]);
  });

  it("private pages are never judged: a file entry and a directory entry", async () => {
    await put("me.md", "x\n");
    await put("hr/pay.md", "x\n");
    await put("hr2.md", "x\n");
    const cfg = { ...DEFAULT_CONFIG, private: ["me.md", "hr"] } as WikeeperConfig;
    const f = await check([], cfg);
    expect(f.map((x) => x.path)).toEqual([".wiki/pages/hr2.md"]);
  });
});

describe("unlogged-change with an open write phase (R4)", () => {
  const SRC = "src-2026-10-12-open";
  it("judges the wiki as at apply; ignores pages created since and the open ingest's own event", async () => {
    await put("t.md", "before\n");
    await put("keep.md", "k\n");
    const taken = new Date("2026-10-12T00:00:00.000Z");
    await acquireLock(paths, SRC);
    await takeSnapshot(paths, SRC, "0".repeat(64), taken);
    await put("t.md", "after, edited by the writer\n");
    await put("new.md", "created since apply\n");
    const log = [
      ev({ created: ["t.md", "keep.md"], page_hashes: { "t.md": pageHash("recorded\n"), "keep.md": pageHash("k\n") } }),
      // the open ingest's own event, by id and a later time: ignored
      ev({ source_id: SRC, updated: ["t.md"], page_hashes: { "t.md": A }, at: "2026-10-12T00:00:01.000Z" }, ".wiki/log/e2.md"),
    ];
    const f = await check(log);
    expect(f).toEqual([
      { id: "unlogged-change", severity: "error", path: ".wiki/pages/t.md", message: `changed since ingest src-1 recorded it (.wiki/log/e1.md), before ingest ${SRC} was applied` },
    ]);
  });

  it("an event with the lock's source id is ignored even when its time is early", async () => {
    await put("t.md", "v\n");
    await acquireLock(paths, SRC);
    await takeSnapshot(paths, SRC, "0".repeat(64), new Date("2026-10-12T00:00:00.000Z"));
    const f = await check([ev({ source_id: SRC, created: ["t.md"], page_hashes: { "t.md": A }, at: "2026-10-01T00:00:00.000Z" })]);
    expect(f.map((x) => x.message)).toEqual([`in no ingest log event, before ingest ${SRC} was applied`]);
  });

  it("falls back to normal mode when the snapshot is unreadable", async () => {
    await put("t.md", "v\n");
    await acquireLock(paths, SRC);
    const f = await check([]);
    expect(f.map((x) => x.message)).toEqual(["in no ingest log event"]);
  });
});
