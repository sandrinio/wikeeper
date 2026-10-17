import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { resolvePaths } from "../../src/core/paths.js";
import type { ResolvedPaths } from "../../src/core/paths.js";
import { writeFacts } from "../../src/ingest/facts.js";
import { registerSource } from "../../src/ingest/registry.js";
import { runCli } from "../../src/program.js";

// Red tests for STORY-003-08 R4 (walkthrough row 8.2): apply prints only the brief's `ingest` line.
const NOW = new Date("2026-10-16T10:00:00Z");
const T = 30_000;

const tmpDirs: string[] = [];
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});

async function run(root: string, args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const input = Object.assign(Readable.from([]), { isTTY: false });
  const code = await runCli(args, {
    io: {
      cwd: root,
      stdout: { write: (c: string) => out.push(c) },
      stderr: { write: (c: string) => err.push(c) },
      stdin: input,
    },
  } as never);
  const text = out.join("");
  let json: any = null;
  try {
    json = JSON.parse(text.trim().split("\n")[0]!);
  } catch {
    /* human output */
  }
  return { code, json, text, err: err.join("") };
}

interface Repo {
  root: string;
  paths: ResolvedPaths;
}
async function repo(): Promise<Repo> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-brief-"));
  tmpDirs.push(root);
  await mkdir(path.join(root, ".git"), { recursive: true });
  expect((await run(root, ["init", "--yes", "--agents", "claude", "--json"])).code).toBe(0);
  return { root, paths: resolvePaths(root, DEFAULT_CONFIG) };
}

async function registerWithFacts(r: Repo, label: string): Promise<string> {
  const rel = `docs/${label}.md`;
  await mkdir(path.join(r.root, "docs"), { recursive: true });
  await writeFile(path.join(r.root, rel), `content of ${label}\n`);
  const meta = await registerSource(r.paths, {
    originType: "file",
    origin: rel,
    label,
    originalPath: path.join(r.root, rel),
    text: null,
    kind: "status-report",
    providedBy: "user",
    ruleVersion: null,
    reingestOf: null,
    permission: { mode: "ai", approved: false, matched: null, kind_pending: false },
    now: NOW,
  });
  await writeFacts(r.paths, {
    source_id: meta.id,
    kind: "status-report",
    rule_version: 2,
    facts: [
      {
        entity: "project:atlas",
        field: "status",
        value: "green",
        status: "decided",
        as_of: "2026-10-16",
        anchor: "Status",
        page: "projects/atlas.md",
        exists: true,
      },
    ],
    uncovered: [],
  } as never);
  return meta.id;
}

describe("ingest apply — brief is the one ingest line (R4)", () => {
  it("B1: data.brief is exactly the ingest line", async () => {
    const r = await repo();
    const id = await registerWithFacts(r, "q4");
    const res = await run(r.root, ["ingest", "apply", id, "--json"]);
    expect(res.code).toBe(0);
    expect(res.json.data.brief).toBe(`ingest:    ${id}   facts: raw/${id}.facts.json`);
  }, T);

  it("B2: human output carries the ingest line and no placeholder lines", async () => {
    const r = await repo();
    const id = await registerWithFacts(r, "q4");
    const res = await run(r.root, ["ingest", "apply", id]);
    expect(res.code).toBe(0);
    expect(res.text).toContain("ingest:");
    expect(res.text).not.toMatch(/user said|resolved:|focus:|<what/);
  }, T);
});
