import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { resolvePaths } from "../../src/core/paths.js";
import type { ResolvedPaths } from "../../src/core/paths.js";

vi.mock("node:fs/promises", async (importOriginal) => {
  const m = await importOriginal<typeof import("node:fs/promises")>();
  return { ...m, readdir: vi.fn(m.readdir) };
});

async function load() {
  return await import("../../src/ingest/registry.js");
}

const PERM = { mode: "ai" as const, approved: false, matched: null, kind_pending: false };
const NOW = new Date("2026-10-16T09:30:00.000Z");
const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");

const META_KEYS = [
  "id", "origin", "origin_type", "kind", "provided_by", "captured_at", "size", "sha256",
  "rule_version", "original", "text", "reingest_of", "permission",
];

function input(over: Record<string, unknown>) {
  return {
    originType: "stdin" as const,
    origin: "stdin",
    label: "notes",
    originalPath: null,
    text: null,
    kind: null,
    providedBy: "agent" as const,
    ruleVersion: null,
    reingestOf: null,
    permission: PERM,
    now: NOW,
    ...over,
  };
}

let root: string;
let paths: ResolvedPaths;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "wk-registry-"));
  paths = resolvePaths(root, DEFAULT_CONFIG);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

async function names(): Promise<string[]> {
  return (await readdir(paths.rawDir)).sort();
}

describe("registry (red, STORY-003-01)", () => {
  it("S1: a file source is copied and described", async () => {
    const m = await load();
    const bytes = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff, 0x0d, 0x0a, 0x01]);
    await mkdir(path.join(root, "docs"), { recursive: true });
    const abs = path.join(root, "docs", "Q4 Status.PDF");
    await writeFile(abs, bytes);
    const meta = await m.registerSource(
      paths,
      input({ originType: "file", origin: m.fileOrigin(root, abs), label: "Q4 Status", originalPath: abs }),
    );
    expect(meta.id).toBe("src-2026-10-16-q4-status");
    expect(await names()).toEqual(["src-2026-10-16-q4-status.meta.json", "src-2026-10-16-q4-status.pdf"]);
    expect(await readFile(path.join(paths.rawDir, "src-2026-10-16-q4-status.pdf"))).toEqual(bytes);
    const read = await m.readMeta(paths, "src-2026-10-16-q4-status");
    expect(read).not.toBeNull();
    expect(read!.origin).toBe("docs/Q4 Status.PDF");
    expect(read!.origin_type).toBe("file");
    expect(read!.original).toBe("src-2026-10-16-q4-status.pdf");
    expect(read!.text).toBeNull();
    expect(read!.size).toBe(bytes.length);
    expect(read!.sha256).toBe(sha(bytes));
    expect(read!.captured_at).toBe(NOW.toISOString());
    expect(Object.keys(read!)).toEqual(META_KEYS);
    const raw = await readFile(path.join(paths.rawDir, "src-2026-10-16-q4-status.meta.json"), "utf8");
    expect(raw.endsWith("}\n")).toBe(true);
    expect(raw).toBe(JSON.stringify(meta, null, 2) + "\n");
  });

  it("S2a: stdin text is stored as raw/<id>.md", async () => {
    const m = await load();
    const text = "We decided to drop vendor X";
    const meta = await m.registerSource(paths, input({ text, label: "chat" }));
    expect(await names()).toEqual([`${meta.id}.md`, `${meta.id}.meta.json`]);
    expect(await readFile(path.join(paths.rawDir, `${meta.id}.md`), "utf8")).toBe(text);
    expect(meta.origin).toBe("stdin");
    expect(meta.original).toBeNull();
    expect(meta.text).toBe(`${meta.id}.md`);
    expect(meta.sha256).toBe(sha(Buffer.from(text, "utf8")));
    expect(meta.size).toBe(Buffer.byteLength(text, "utf8"));
  });

  it("S2b: URL text is stored under the normalized URL", async () => {
    const m = await load();
    const text = "# Q4 page\n";
    const meta = await m.registerSource(
      paths,
      input({ originType: "url", origin: "HTTPS://Acme.Example.com:443/q4#top", label: "q4 page", text }),
    );
    expect(await names()).toEqual([`${meta.id}.md`, `${meta.id}.meta.json`]);
    expect(meta.origin).toBe("https://acme.example.com/q4");
    expect(meta.origin_type).toBe("url");
    expect(meta.original).toBeNull();
    expect(meta.sha256).toBe(sha(Buffer.from(text, "utf8")));
  });

  it("S2c: a file plus agent text stores both, hashing the original", async () => {
    const m = await load();
    const bytes = Buffer.from("%PDF-1.7 fake bytes\n");
    await mkdir(path.join(root, "docs"), { recursive: true });
    const abs = path.join(root, "docs", "q4.pdf");
    await writeFile(abs, bytes);
    const meta = await m.registerSource(
      paths,
      input({ originType: "file", origin: "docs/q4.pdf", label: "q4", originalPath: abs, text: "Q4 extracted text" }),
    );
    expect(await names()).toEqual([`${meta.id}.md`, `${meta.id}.meta.json`, `${meta.id}.pdf`]);
    expect(meta.origin).toBe("docs/q4.pdf");
    expect(meta.original).toBe(`${meta.id}.pdf`);
    expect(meta.text).toBe(`${meta.id}.md`);
    expect(meta.sha256).toBe(sha(bytes));
    expect(meta.size).toBe(bytes.length);
    expect(await readFile(path.join(paths.rawDir, `${meta.id}.md`), "utf8")).toBe("Q4 extracted text");
  });

  it("S3: colliding ids get a suffix, nothing is overwritten, removeSource is exact", async () => {
    const m = await load();
    await mkdir(paths.rawDir, { recursive: true });
    const baseMd = path.join(paths.rawDir, "src-2026-10-16-notes.md");
    const baseMeta = path.join(paths.rawDir, "src-2026-10-16-notes.meta.json");
    await writeFile(baseMd, "original notes");
    await writeFile(baseMeta, "{}\n");
    const a = await m.registerSource(paths, input({ text: "second" }));
    const b = await m.registerSource(paths, input({ text: "third" }));
    expect(a.id).toBe("src-2026-10-16-notes-2");
    expect(b.id).toBe("src-2026-10-16-notes-3");
    expect(await readFile(baseMd, "utf8")).toBe("original notes");
    expect(await readFile(baseMeta, "utf8")).toBe("{}\n");
    const removed = await m.removeSource(paths, "src-2026-10-16-notes");
    expect([...removed].sort()).toEqual(["src-2026-10-16-notes.md", "src-2026-10-16-notes.meta.json"]);
    expect(await names()).toEqual([
      "src-2026-10-16-notes-2.md",
      "src-2026-10-16-notes-2.meta.json",
      "src-2026-10-16-notes-3.md",
      "src-2026-10-16-notes-3.meta.json",
    ]);
  });

  it("S3 race: an EEXIST on the meta file retries with the next free id and leaves no partial files", async () => {
    const m = await load();
    await mkdir(paths.rawDir, { recursive: true });
    for (const n of ["", "-2", "-3"]) {
      await writeFile(path.join(paths.rawDir, `src-2026-10-16-notes${n}.md`), "x");
      await writeFile(path.join(paths.rawDir, `src-2026-10-16-notes${n}.meta.json`), "{}\n");
    }
    await writeFile(path.join(paths.rawDir, "src-2026-10-16-notes-4.meta.json"), "{}\n");
    const fsp = await import("node:fs/promises");
    const hidden = "src-2026-10-16-notes-4.meta.json";
    const original = (await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises")).readdir;
    vi.mocked(fsp.readdir).mockReset();
    vi.mocked(fsp.readdir).mockImplementationOnce((async (p: string) => {
      const all = (await original(p)) as string[];
      return all.filter((n) => n !== hidden);
    }) as never);
    vi.mocked(fsp.readdir).mockImplementation(original as never);

    const meta = await m.registerSource(paths, input({ text: "raced" }));
    expect(meta.id).toBe("src-2026-10-16-notes-5");
    const after = await names();
    expect(after).toContain("src-2026-10-16-notes-5.md");
    expect(after).toContain("src-2026-10-16-notes-5.meta.json");
    expect(after).not.toContain("src-2026-10-16-notes-4.md");
    expect(after.filter((n) => n.startsWith("src-2026-10-16-notes-4."))).toEqual([hidden]);
    expect(await readFile(path.join(paths.rawDir, hidden), "utf8")).toBe("{}\n");
  });

  describe("S4: duplicates", () => {
    async function seed() {
      const m = await load();
      const bytes = Buffer.from("known file bytes");
      await mkdir(path.join(root, "docs"), { recursive: true });
      const abs = path.join(root, "docs", "known.txt");
      await writeFile(abs, bytes);
      const file = await m.registerSource(
        paths,
        input({ originType: "file", origin: "docs/known.txt", label: "known", originalPath: abs }),
      );
      const url = await m.registerSource(
        paths,
        input({ originType: "url", origin: "https://acme.example.com/q4", label: "q4", text: "page v1" }),
      );
      await writeFile(path.join(paths.rawDir, "x.meta.json"), "{ not json");
      await writeFile(path.join(paths.rawDir, "y.meta.json"), JSON.stringify({ id: 5 }));
      return { m, bytes, abs, file, url };
    }

    it("listSources skips malformed metas and sorts by id", async () => {
      const { m, file, url } = await seed();
      const list = await m.listSources(paths);
      expect(list.map((s) => s.id)).toEqual([file.id, url.id].sort());
    });

    it("same bytes as a registered file -> sha256 match", async () => {
      const { m, bytes, abs, file } = await seed();
      const list = await m.listSources(paths);
      const h = await m.hashSource({ originalPath: abs, text: null });
      expect(h).toEqual({ sha256: sha(bytes), size: bytes.length });
      const hit = m.findDuplicate(list, { ...h, originType: "file", origin: "docs/other.txt" });
      expect(hit?.match).toBe("sha256");
      expect(hit?.meta.id).toBe(file.id);
    });

    it("URL with different text -> origin match on the normalized URL", async () => {
      const { m, url } = await seed();
      const list = await m.listSources(paths);
      const h = m.hashText("page v2 totally different");
      const hit = m.findDuplicate(list, { ...h, originType: "url", origin: "https://acme.example.com/q4#v2" });
      expect(hit?.match).toBe("origin");
      expect(hit?.meta.id).toBe(url.id);
    });

    it("new bytes -> null; non-url origin equality is not a duplicate", async () => {
      const { m } = await seed();
      const list = await m.listSources(paths);
      const h = m.hashText("brand new");
      expect(m.findDuplicate(list, { ...h, originType: "file", origin: "docs/known.txt" })).toBeNull();
      expect(m.findDuplicate(list, { ...h, originType: "url", origin: "https://other.example.com/" })).toBeNull();
    });
  });

  it("S5: a markdown original refuses agent text and writes nothing", async () => {
    const m = await load();
    const abs = path.join(root, "notes.md");
    await writeFile(abs, "# notes\n");
    await expect(
      m.registerSource(paths, input({ originType: "file", origin: "notes.md", originalPath: abs, text: "extra" })),
    ).rejects.toMatchObject({ code: "usage", exitCode: 2, message: expect.stringContaining("already markdown") });
    const exists = await readdir(paths.rawDir).then(
      (n) => n,
      () => [] as string[],
    );
    expect(exists).toEqual([]);
  });

  it("fileOrigin: repo-relative POSIX inside, absolute POSIX outside", async () => {
    const m = await load();
    expect(m.fileOrigin(root, path.join(root, "a", "B c.txt"))).toBe("a/B c.txt");
    const other = await mkdtemp(path.join(os.tmpdir(), "wk-outside-"));
    try {
      const abs = path.join(other, "f.txt");
      expect(m.fileOrigin(root, abs)).toBe(abs.split(path.sep).join("/"));
    } finally {
      await rm(other, { recursive: true, force: true });
    }
  });

  it("normalizeUrl lowercases host, drops fragment and default port, keeps path and query", async () => {
    const m = await load();
    expect(m.normalizeUrl("HTTPS://Acme.Example.com:443/Q4?x=1#top")).toBe("https://acme.example.com/Q4?x=1");
    expect(m.normalizeUrl("http://a.example.com:80/p")).toBe("http://a.example.com/p");
    expect(m.normalizeUrl("http://a.example.com:8080/p")).toBe("http://a.example.com:8080/p");
  });

  it("hashText hashes UTF-8 bytes", async () => {
    const m = await load();
    expect(m.hashText("héllo")).toEqual({ sha256: sha(Buffer.from("héllo", "utf8")), size: 6 });
  });

  it("readMeta tolerates a BOM, returns null for missing/invalid ids; removeSource rejects bad ids", async () => {
    const m = await load();
    await mkdir(paths.rawDir, { recursive: true });
    const id = "src-2026-10-16-bom";
    await writeFile(path.join(paths.rawDir, `${id}.meta.json`), "﻿" + JSON.stringify({ id, sha256: "ab" }) + "\n");
    expect((await m.readMeta(paths, id))?.id).toBe(id);
    expect(await m.readMeta(paths, "src-2026-10-16-missing")).toBeNull();
    expect(await m.readMeta(paths, "../x")).toBeNull();
    await expect(m.removeSource(paths, "../x")).rejects.toMatchObject({ code: "usage" });
  });

  it("listSources returns [] when raw/ does not exist", async () => {
    const m = await load();
    expect(await m.listSources(paths)).toEqual([]);
  });
});
