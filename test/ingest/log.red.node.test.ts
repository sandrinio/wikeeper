import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { resolvePaths } from "../../src/core/paths.js";
import type { ResolvedPaths } from "../../src/core/paths.js";
import { loadPages } from "../../src/wiki/parse-page.js";

// Modules this story creates are imported dynamically (flashcard #qa #test-harness).
async function load<T = Record<string, any>>(spec: string): Promise<T> {
  try {
    return (await import(/* @vite-ignore */ spec)) as T;
  } catch (e) {
    throw new Error(`not yet implemented: ${spec} (${(e as Error).message})`);
  }
}
const logMod = () => load<any>("../../src/ingest/log.js");
const idxMod = () => load<any>("../../src/ingest/index-builder.js");

let root: string;
let paths: ResolvedPaths;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "wikeeper-log-"));
  paths = resolvePaths(root, DEFAULT_CONFIG);
  await mkdir(paths.pagesDir, { recursive: true });
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function putPage(rel: string, text: string) {
  const abs = path.join(paths.pagesDir, ...rel.split("/"));
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, text);
}

describe("STORY-003-07 index builder (red)", () => {
  it("S1: deterministic index built from frontmatter only", async () => {
    await putPage("notes/loose.md", "# Loose\n\nbody\n");
    await putPage("team.md", "---\ntype: team\n---\n# Team\n");
    await putPage(
      "projects/atlas.md",
      "---\ntype: project\ntitle: Atlas\nsummary: Launch platform\n---\n# Atlas\n",
    );
    const { buildIndex } = await idxMod();
    const a = buildIndex(await loadPages(paths.pagesDir));
    const b = buildIndex(await loadPages(paths.pagesDir));
    expect(a).toBe(b);
    const iTeam = a.indexOf("## team");
    const iProject = a.indexOf("## project");
    const iUntyped = a.indexOf("## untyped");
    expect(iTeam).toBeGreaterThan(-1);
    expect(iProject).toBeGreaterThan(iTeam);
    expect(iUntyped).toBeGreaterThan(iProject);
    expect(a).toContain("- [Atlas](pages/projects/atlas.md) — Launch platform");
    expect(a).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(a).not.toMatch(/\d{2}:\d{2}/);
    expect(a.startsWith("# Wiki index\n")).toBe(true);
    expect(a.endsWith("\n")).toBe(true);
    expect(a).not.toContain("\r");
  });

  it("empty index text, escaping and omitted summary", async () => {
    const { buildIndex, INDEX_TYPE_ORDER } = await idxMod();
    expect(buildIndex([])).toBe("# Wiki index\n\n_No pages yet._\n");
    expect(INDEX_TYPE_ORDER).toEqual(["person", "team", "project", "risk", "decision", "glossary", "source"]);
    await putPage("a b/x(1).md", "---\ntype: person\ntitle: 'A [x] b'\n---\n");
    const out = buildIndex(await loadPages(paths.pagesDir));
    expect(out).toContain("- [A \\[x\\] b](pages/a%20b/x%281%29.md)\n");
  });

  it("writeIndex writes only when bytes differ and returns parse errors", async () => {
    await putPage("a.md", "---\ntype: team\ntitle: A\n---\n");
    await putPage("broken.md", "---\ntitle: [unclosed\n");
    const { writeIndex, buildIndex } = await idxMod();
    const r1 = await writeIndex(paths);
    expect(r1.changed).toBe(true);
    expect(r1.pages).toBe(2);
    expect(r1.file).toBe(".wiki/index.md");
    expect(r1.errors.some((e: any) => e.path === "broken.md")).toBe(true);
    expect(await readFile(paths.indexFile, "utf8")).toBe(buildIndex(await loadPages(paths.pagesDir)));
    const r2 = await writeIndex(paths);
    expect(r2.changed).toBe(false);
  });
});

describe("STORY-003-07 log events (red)", () => {
  const AT = "2026-10-16T17:45:01.123Z";
  const rows = [
    { type: "ingest", slug: "src-2026-10-16-q4-status" },
    { type: "abort", slug: "src-2026-10-16-notes" },
    { type: "miss", slug: "miss" },
  ];
  for (const row of rows) {
    it(`S2: ${row.type} event gets its own file, -2 on repeat`, async () => {
      const { writeLogEvent, LOG_EVENT_TYPES } = await logMod();
      expect(LOG_EVENT_TYPES).toEqual(["ingest", "abort", "miss", "rule-proposal"]);
      const event: any =
        row.type === "ingest"
          ? {
              type: "ingest", at: AT, source_id: row.slug, kind: "doc", rule_version: null, permission: "ai",
              origin: "file:a.md", created: ["a.md"], updated: [], deleted: [], contradictions: 0, rule_suggestions: 0,
            }
          : row.type === "abort"
            ? { type: "abort", at: AT, source_id: row.slug, dropped: true, restored: [] }
            : { type: "miss", at: AT, query: "budget burn", filters: {} };
      const rel1 = await writeLogEvent(paths, event);
      const rel2 = await writeLogEvent(paths, event);
      expect(rel1).toBe(`.wiki/log/20261016T174501123Z-${row.slug}.md`);
      expect(rel2).toBe(`.wiki/log/20261016T174501123Z-${row.slug}-2.md`);
      const text = await readFile(path.join(root, ...rel1.split("/")), "utf8");
      expect(text.startsWith("---\n")).toBe(true);
      expect(text).toContain(`type: ${row.type}`);
      expect(text).toContain(AT);
      const { readLogEvents } = await logMod();
      const read = await readLogEvents(paths);
      expect(read.events[0].event.type).toBe(row.type);
      expect(read.events[0].event.at).toBe(AT);
      for (const name of await readdir(paths.logDir)) expect(name).not.toContain(":");
    });
  }

  it("invalid at or missing required field throws invalid_event", async () => {
    const { writeLogEvent } = await logMod();
    await expect(writeLogEvent(paths, { type: "miss", at: "nope", query: "q", filters: {} })).rejects.toMatchObject({
      code: "invalid_event",
    });
    await expect(writeLogEvent(paths, { type: "miss", at: AT })).rejects.toMatchObject({ code: "invalid_event" });
  });

  async function seed() {
    await mkdir(paths.logDir, { recursive: true });
    const ev = (at: string, id: string) =>
      `---\ntype: ingest\nat: "${at}"\nsource_id: ${id}\n---\nIngested ${id}.\n`;
    await writeFile(path.join(paths.logDir, "b.md"), ev("2026-10-16T08:00:00Z", "src-2026-10-16-b"));
    await writeFile(path.join(paths.logDir, "a.md"), ev("2026-10-15T09:00:00Z", "src-2026-10-15-a"));
    await writeFile(path.join(paths.logDir, "README.md"), "just notes\n");
    await writeFile(path.join(paths.logDir, "x.md"), `---\ntype: party\nat: "2026-10-16T10:00:00Z"\n---\n`);
    await writeFile(path.join(paths.logDir, ".gitkeep"), "");
  }

  it("S3: hand-edited and foreign files are skipped, not fatal", async () => {
    await seed();
    const { readLogEvents } = await logMod();
    const r = await readLogEvents(paths, { type: "ingest" });
    expect(r.events.map((e: any) => e.event.at)).toEqual(["2026-10-15T09:00:00Z", "2026-10-16T08:00:00Z"]);
    expect(r.events[0].file).toBe(".wiki/log/a.md");
    expect(r.skipped).toHaveLength(2);
    expect(r.skipped.map((s: any) => s.file).sort()).toEqual([".wiki/log/README.md", ".wiki/log/x.md"]);
    for (const s of r.skipped) expect(s.reason.length).toBeGreaterThan(0);
    const since = await readLogEvents(paths, { type: "ingest", since: "2026-10-16" });
    expect(since.events.map((e: any) => e.event.at)).toEqual(["2026-10-16T08:00:00Z"]);
    const iso = await readLogEvents(paths, { since: "2026-10-16T08:00:00Z" });
    expect(iso.events).toHaveLength(1);
    const bySource = await readLogEvents(paths, { sourceId: "src-2026-10-15-a" });
    expect(bySource.events).toHaveLength(1);
  });

  it("since invalid throws invalid_since; missing log dir yields nothing", async () => {
    const { readLogEvents } = await logMod();
    const empty = await readLogEvents(paths);
    expect(empty).toEqual({ events: [], skipped: [] });
    await expect(readLogEvents(paths, { since: "yesterday-ish" })).rejects.toMatchObject({
      code: "invalid_since",
    });
  });

  it("log view lists events newest first, deterministic", async () => {
    await seed();
    const { readLogEvents, renderLogView, regenerateLogView } = await logMod();
    const { events } = await readLogEvents(paths, { type: "ingest" });
    const view = renderLogView(events);
    expect(view.endsWith("\n")).toBe(true);
    expect(view).not.toContain("\r");
    expect(view.indexOf("2026-10-16 08:00 UTC")).toBeGreaterThan(-1);
    expect(view.indexOf("2026-10-16 08:00 UTC")).toBeLessThan(view.indexOf("2026-10-15 09:00 UTC"));
    expect(renderLogView([])).toContain("_No events yet._");
    const r = await regenerateLogView(paths);
    expect(r.events).toBe(2);
    expect(r.file).toBe(".wiki/log.md");
    const first = await readFile(path.join(paths.contentDir, "log.md"), "utf8");
    await regenerateLogView(paths);
    expect(await readFile(path.join(paths.contentDir, "log.md"), "utf8")).toBe(first);
  });
});
