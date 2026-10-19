import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolvePaths } from "../../src/core/paths.js";
import { loadSearchCorpus, searchCacheFile } from "../../src/search/engine.js";

const dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true, maxRetries: 3 });
});

async function wiki(pages: Record<string, string>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "wikeeper-cache-"));
  dirs.push(root);
  const paths = resolvePaths(root, { content_dir: ".wiki" });
  await mkdir(paths.pagesDir, { recursive: true });
  for (const [rel, body] of Object.entries(pages)) {
    await mkdir(path.dirname(path.join(paths.pagesDir, rel)), { recursive: true });
    await writeFile(path.join(paths.pagesDir, rel), body);
  }
  return paths;
}
const page = (title: string, text: string) => `---\ntitle: ${title}\n---\n# ${title}\n\n${text}\n`;

describe("search cache", () => {
  it("writes the cache with the expected shape and reuses it", async () => {
    const paths = await wiki({ "a.md": page("Atlas", "atlas rocket") });
    let n = 0;
    await loadSearchCorpus(paths, { onRebuild: () => n++ });
    const cache = JSON.parse(await readFile(searchCacheFile(paths), "utf8"));
    expect(cache.version).toBe(1);
    expect(typeof cache.package_version).toBe("string");
    expect(cache.files).toHaveLength(1);
    expect(Array.isArray(cache.pages) && Array.isArray(cache.docs)).toBe(true);
    await loadSearchCorpus(paths, { onRebuild: () => n++ });
    expect(n).toBe(1);
  });

  it("rebuilds when a file hash or the file list changes", async () => {
    const paths = await wiki({ "a.md": page("Atlas", "atlas rocket") });
    let n = 0;
    await loadSearchCorpus(paths, { onRebuild: () => n++ });
    await writeFile(path.join(paths.pagesDir, "a.md"), page("Atlas", "atlas orbital"));
    await loadSearchCorpus(paths, { onRebuild: () => n++ });
    expect(n).toBe(2);
    await writeFile(path.join(paths.pagesDir, "b.md"), page("Zephyr", "zephyr"));
    await loadSearchCorpus(paths, { onRebuild: () => n++ });
    expect(n).toBe(3);
  });

  it("rebuilds when the stored file order differs", async () => {
    const paths = await wiki({ "a.md": page("A", "alpha"), "b.md": page("B", "beta") });
    let n = 0;
    await loadSearchCorpus(paths, { onRebuild: () => n++ });
    const file = searchCacheFile(paths);
    const cache = JSON.parse(await readFile(file, "utf8"));
    cache.files.reverse();
    await writeFile(file, JSON.stringify(cache));
    await loadSearchCorpus(paths, { onRebuild: () => n++ });
    expect(n).toBe(2);
  });

  it("rebuilds on a version mismatch or a wrong shape", async () => {
    const paths = await wiki({ "a.md": page("A", "alpha") });
    let n = 0;
    await loadSearchCorpus(paths, { onRebuild: () => n++ });
    const file = searchCacheFile(paths);
    const cache = JSON.parse(await readFile(file, "utf8"));
    await writeFile(file, JSON.stringify({ ...cache, version: 99 }));
    await loadSearchCorpus(paths, { onRebuild: () => n++ });
    await writeFile(file, JSON.stringify({ ...cache, pages: "no" }));
    await loadSearchCorpus(paths, { onRebuild: () => n++ });
    expect(n).toBe(3);
  });

  it("leaves no temp file behind and reports a failed write as a warning", async () => {
    const paths = await wiki({ "a.md": page("A", "alpha") });
    await loadSearchCorpus(paths);
    expect((await readdir(path.dirname(searchCacheFile(paths)))).filter((f) => f.endsWith(".tmp"))).toEqual([]);
    // a directory at the destination makes rename fail
    await rm(searchCacheFile(paths));
    await mkdir(path.join(searchCacheFile(paths), "x"), { recursive: true });
    const corpus = await loadSearchCorpus(paths);
    expect(corpus.warnings[0]).toMatch(/^search cache not written: /);
    expect((await readdir(path.dirname(searchCacheFile(paths)))).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  it("useCache false neither reads, writes nor calls onRebuild", async () => {
    const paths = await wiki({ "a.md": page("A", "alpha") });
    let n = 0;
    await loadSearchCorpus(paths, { useCache: false, onRebuild: () => n++ });
    expect(n).toBe(0);
    await expect(readFile(searchCacheFile(paths))).rejects.toThrow();
  });

  it("covers the archive tree: archive_files in the key, a change in either tree rebuilds once", async () => {
    const paths = await wiki({ "a.md": page("Atlas", "atlas rocket") });
    await mkdir(paths.archiveDir, { recursive: true });
    await writeFile(path.join(paths.archiveDir, "a.md"), page("Atlas", "old launch"));
    let n = 0;
    await loadSearchCorpus(paths, { onRebuild: () => n++ });
    const cache = JSON.parse(await readFile(searchCacheFile(paths), "utf8"));
    expect(cache.files.map((f: { path: string }) => f.path)).toEqual(["a.md"]);
    expect(cache.archive_files.map((f: { path: string }) => f.path)).toEqual(["a.md"]);
    await loadSearchCorpus(paths, { onRebuild: () => n++ });
    expect(n).toBe(1);
    await writeFile(path.join(paths.archiveDir, "a.md"), page("Atlas", "older launch"));
    await loadSearchCorpus(paths, { onRebuild: () => n++ });
    expect(n).toBe(2);
    await writeFile(path.join(paths.archiveDir, "b.md"), page("Beta", "beta"));
    await loadSearchCorpus(paths, { onRebuild: () => n++ });
    expect(n).toBe(3);
  });

  it("rebuilds a cache that has no archive_files (written before the archive existed)", async () => {
    const paths = await wiki({ "a.md": page("Atlas", "atlas rocket") });
    let n = 0;
    await loadSearchCorpus(paths, { onRebuild: () => n++ });
    const file = searchCacheFile(paths);
    const cache = JSON.parse(await readFile(file, "utf8"));
    delete cache.archive_files;
    await writeFile(file, JSON.stringify(cache));
    await loadSearchCorpus(paths, { onRebuild: () => n++ });
    expect(n).toBe(2);
    cache.archive_files = [{ path: "x.md", sha256: "0" }];
    await writeFile(file, JSON.stringify(cache));
    await loadSearchCorpus(paths, { onRebuild: () => n++ });
    expect(n).toBe(3);
  });
});
