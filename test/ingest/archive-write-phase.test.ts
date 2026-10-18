// STORY-008-01 unit tests: the archive in snapshot, restore, diff and the guard.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { resolvePaths } from "../../src/core/paths.js";
import type { ResolvedPaths } from "../../src/core/paths.js";
import { diffPages } from "../../src/ingest/diff.js";
import { hashOutside, readSnapshot, restoreSnapshot, snapshotDir, takeSnapshot } from "../../src/ingest/snapshot.js";
import { runGuard } from "../../src/commands/hook.js";

let root: string;
let paths: ResolvedPaths;
const ID = "src-2026-10-18-cleanup";
const put = async (file: string, text: string) => {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
};
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "wk-archive-"));
  await mkdir(path.join(root, ".wiki"), { recursive: true });
  paths = resolvePaths(root, DEFAULT_CONFIG);
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("takeSnapshot / readSnapshot with archive/", () => {
  it("copies and hashes archive/, skips symlinks", async () => {
    await put(path.join(paths.archiveDir, "p/a.md"), "a");
    await symlink(path.join(paths.archiveDir, "p/a.md"), path.join(paths.archiveDir, "link.md"));
    const info = await takeSnapshot(paths, ID, "x");
    expect(Object.keys(info.archive)).toEqual(["p/a.md"]);
    expect(await readFile(path.join(snapshotDir(paths, ID), "archive/p/a.md"), "utf8")).toBe("a");
    const json = JSON.parse(await readFile(path.join(snapshotDir(paths, ID), "snapshot.json"), "utf8"));
    expect(Object.keys(json)).toEqual(["source_id", "taken_at", "facts_sha256", "pages", "archive", "outside"]);
  });
  it("creates an empty archive copy when archive/ is missing", async () => {
    const info = await takeSnapshot(paths, ID, "x");
    expect(info.archive).toEqual({});
    expect((await stat(path.join(snapshotDir(paths, ID), "archive"))).isDirectory()).toBe(true);
  });
  it("readSnapshot: no key gives {}, bad value or missing copy gives null", async () => {
    await takeSnapshot(paths, ID, "x");
    const file = path.join(snapshotDir(paths, ID), "snapshot.json");
    const json = JSON.parse(await readFile(file, "utf8"));
    const write = (o: unknown) => writeFile(file, JSON.stringify(o));
    const { archive: _a, ...older } = json;
    await write(older);
    expect((await readSnapshot(paths, ID))?.archive).toEqual({});
    await write({ ...json, archive: ["x"] });
    expect(await readSnapshot(paths, ID)).toBeNull();
    await write({ ...json, archive: { "a.md": 1 } });
    expect(await readSnapshot(paths, ID)).toBeNull();
    await rm(path.join(snapshotDir(paths, ID), "archive"), { recursive: true });
    await write(json);
    expect(await readSnapshot(paths, ID)).toBeNull();
  });
});

describe("restoreSnapshot with archive/", () => {
  it("restores edited and deleted files, removes new ones and emptied folders, keeps archive/", async () => {
    await put(path.join(paths.archiveDir, "a.md"), "a");
    await put(path.join(paths.archiveDir, "b.md"), "b");
    await takeSnapshot(paths, ID, "x");
    await put(path.join(paths.archiveDir, "a.md"), "a2");
    await rm(path.join(paths.archiveDir, "b.md"));
    await put(path.join(paths.archiveDir, "n/m/c.md"), "c");
    const res = await restoreSnapshot(paths, ID);
    expect(res.archive).toEqual({ restored: ["a.md", "b.md"], removed: ["n/m/c.md"] });
    expect(await readFile(path.join(paths.archiveDir, "a.md"), "utf8")).toBe("a");
    await expect(stat(path.join(paths.archiveDir, "n"))).rejects.toThrow();
    expect((await stat(paths.archiveDir)).isDirectory()).toBe(true);
  });
  it("returns archive null for an older snapshot and leaves archive/ alone", async () => {
    await takeSnapshot(paths, ID, "x");
    const file = path.join(snapshotDir(paths, ID), "snapshot.json");
    const { archive: _a, ...older } = JSON.parse(await readFile(file, "utf8"));
    await writeFile(file, JSON.stringify(older));
    await rm(path.join(snapshotDir(paths, ID), "archive"), { recursive: true });
    await put(path.join(paths.archiveDir, "keep.md"), "k");
    const res = await restoreSnapshot(paths, ID);
    expect(res.archive).toBeNull();
    expect(await readFile(path.join(paths.archiveDir, "keep.md"), "utf8")).toBe("k");
  });
});

describe("diffPages archive lists", () => {
  it("are relative to archive/, ignore dot files, and treat a missing snapshot.archive as {}", async () => {
    await put(path.join(paths.archiveDir, "a.md"), "a");
    const info = await takeSnapshot(paths, ID, "x");
    await put(path.join(paths.archiveDir, "a.md"), "a2");
    await put(path.join(paths.archiveDir, "p/new.md"), "n");
    await put(path.join(paths.archiveDir, ".DS_Store"), "j");
    expect((await diffPages(paths, info)).archive).toEqual({ created: ["p/new.md"], updated: ["a.md"], deleted: [] });
    const legacy = { ...info } as Partial<typeof info>;
    delete legacy.archive;
    expect((await diffPages(paths, legacy as typeof info)).archive?.created).toEqual(["a.md", "p/new.md"]);
  });
});

describe("hashOutside never lists archive files", () => {
  for (const dir of [".wiki", "wiki", "."]) {
    it(`content_dir ${dir}`, async () => {
      const p = resolvePaths(root, { content_dir: dir });
      await put(path.join(p.archiveDir, "a.md"), "a");
      await put(path.join(p.logDir, "e.md"), "e");
      expect(Object.keys(await hashOutside(p)).some((k) => k.startsWith("archive"))).toBe(false);
    });
  }
});

describe("guard", () => {
  const guard = (target: string) =>
    runGuard({ agent: "claude", cwd: root, stdin: JSON.stringify({ tool_name: "Write", tool_input: { file_path: path.join(root, target) }, cwd: root }) } as never);
  it("denies archive/ writes without a lock, allows archive itself siblings and locked", async () => {
    const denied = JSON.stringify(await guard(".wiki/archive/x.md"));
    expect(denied).toContain("deny");
    expect(JSON.stringify(await guard(".wiki/archive-old/x.md"))).not.toContain("deny");
    await writeFile(paths.lockFile, "{}");
    expect(JSON.stringify(await guard(".wiki/archive/x.md"))).not.toContain("deny");
  });
});
