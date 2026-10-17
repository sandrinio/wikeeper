import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { collectStatus } from "../src/commands/status.js";
import { loadConfig } from "../src/core/config.js";
import { resolvePaths } from "../src/core/paths.js";
import type { ResolvedPaths } from "../src/core/paths.js";
import { writeFacts } from "../src/ingest/facts.js";
import { writeLogEvent } from "../src/ingest/log.js";
import { registerSource } from "../src/ingest/registry.js";
import { runCli } from "../src/program.js";

const NOW = new Date("2026-10-17T12:00:00Z");
const tmpDirs: string[] = [];
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});

async function cli(root: string, args: string[]) {
  const out: string[] = [];
  const code = await runCli(args, {
    io: {
      cwd: root,
      stdout: { write: (c: string) => out.push(c) },
      stderr: { write: () => undefined },
      stdin: Object.assign(Readable.from([]), { isTTY: false }),
    },
  } as never);
  return { code, text: out.join("") };
}

async function repo() {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-status-unit-"));
  tmpDirs.push(root);
  await mkdir(path.join(root, ".git"), { recursive: true });
  expect((await cli(root, ["init", "--yes", "--agents", "claude", "--json"])).code).toBe(0);
  const config = (await loadConfig(root)).config;
  const paths: ResolvedPaths = resolvePaths(root, config);
  await writeFile(paths.kbInstructions, "# KB\n\n## Source kinds\n\nmeeting-notes (v2) → decision\n");
  return { root, paths, config };
}

async function reg(paths: ResolvedPaths, root: string, label: string, date: string, reingestOf: string | null = null) {
  const rel = `docs/${label}-${date}.md`;
  await mkdir(path.join(root, "docs"), { recursive: true });
  await writeFile(path.join(root, rel), `${label} ${date}\n`);
  const m = await registerSource(paths, {
    originType: "file",
    origin: rel,
    label,
    originalPath: path.join(root, rel),
    text: null,
    kind: "meeting-notes",
    providedBy: "user",
    ruleVersion: null,
    reingestOf,
    permission: { mode: "ai", approved: false, matched: null, kind_pending: false },
    now: new Date(`${date}T09:00:00Z`),
  } as never);
  return m.id;
}
async function finish(paths: ResolvedPaths, id: string, at: string, version: number | null, origin = "o.md") {
  await writeLogEvent(paths, {
    type: "ingest", at, source_id: id, kind: "meeting-notes", rule_version: version, permission: "ai", origin,
    created: [], updated: [], deleted: [], contradictions: 0, rule_suggestions: 0,
  } as never);
}

describe("collectStatus", () => {
  it("follows reingest_of in both directions and counts only the newest ingest", async () => {
    const { root, paths, config } = await repo();
    const a = await reg(paths, root, "w", "2026-10-01");
    const b = await reg(paths, root, "w", "2026-10-05", a);
    const c = await reg(paths, root, "w", "2026-10-08", a);
    await finish(paths, a, "2026-10-01T10:00:00.000Z", 1);
    await finish(paths, b, "2026-10-05T10:00:00.000Z", 1);
    await finish(paths, c, "2026-10-08T10:00:00.000Z", 1, "c.md");
    const { data } = await collectStatus(paths, config, NOW);
    expect(data.reingest_candidates).toEqual([
      { source_id: c, origin: "c.md", kind: "meeting-notes", rule_version: 1, current_version: 2 },
    ]);
  });

  it("lists registered sources with no ingest event as unfinished", async () => {
    const { root, paths, config } = await repo();
    const a = await reg(paths, root, "a", "2026-10-02");
    const b = await reg(paths, root, "b", "2026-10-03");
    await finish(paths, b, "2026-10-03T10:00:00.000Z", 2);
    const { data } = await collectStatus(paths, config, NOW);
    expect(data.unfinished_sources).toEqual([a]);
  });

  it("warns about a missing facts file and a missing kb_instructions.md", async () => {
    const { root, paths, config } = await repo();
    const a = await reg(paths, root, "a", "2026-10-02");
    await finish(paths, a, "2026-10-02T10:00:00.000Z", 1);
    await rm(paths.kbInstructions);
    const { data, warnings } = await collectStatus(paths, config, NOW);
    expect(data.reingest_candidates).toEqual([]);
    expect(warnings.some((w) => w.includes("kb_instructions.md is missing"))).toBe(true);
    expect(warnings.some((w) => w.includes(`.wiki/raw/${a}.facts.json`))).toBe(true);
  });

  it("pending suggestions pluralise and skip unfinished sources", async () => {
    const { root, paths, config } = await repo();
    const a = await reg(paths, root, "a", "2026-10-02");
    const d = await reg(paths, root, "d", "2026-10-03");
    await finish(paths, a, "2026-10-02T10:00:00.000Z", 2);
    await writeFacts(paths, { source_id: a, kind: "meeting-notes", rule_version: 2, facts: [], uncovered: ["x", "y"] } as never);
    await writeFacts(paths, { source_id: d, kind: "meeting-notes", rule_version: 2, facts: [], uncovered: ["z"] } as never);
    const { data } = await collectStatus(paths, config, NOW);
    expect(data.pending_rule_suggestions).toEqual([{ source_id: a, items: ["x", "y"] }]);
    const human = await cli(root, ["status"]);
    expect(human.text).toContain("pending rule suggestions: 1 source, 2 items");
  });

  it("counts every miss event", async () => {
    const { paths, config } = await repo();
    for (let i = 0; i < 3; i++) {
      await writeLogEvent(paths, { type: "miss", at: `2026-10-17T11:0${i}:00.000Z`, query: "q", filters: {} } as never);
    }
    expect((await collectStatus(paths, config, NOW)).data.misses).toBe(3);
  });
});
