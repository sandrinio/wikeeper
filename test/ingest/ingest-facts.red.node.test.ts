import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { resolvePaths } from "../../src/core/paths.js";
import type { ResolvedPaths } from "../../src/core/paths.js";
import { writeLogEvent } from "../../src/ingest/log.js";
import { registerSource } from "../../src/ingest/registry.js";
import type { SourceMeta } from "../../src/ingest/registry.js";
import { runCli } from "../../src/program.js";

const NOW = new Date("2026-10-16T12:00:00Z");
const KB_RULE = "# KB\n\n## Source kinds\n\n- status-report (v2) → project.status, project.target_date, risk\n";
const T = 30_000;

const tmpDirs: string[] = [];
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});

async function run(root: string, args: string[], stdin?: string) {
  const out: string[] = [];
  const err: string[] = [];
  const input = Object.assign(Readable.from(stdin === undefined ? [] : [Buffer.from(stdin)]), { isTTY: false });
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
async function repo(permission = "ai", whitelist = "", kb = KB_RULE): Promise<Repo> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-ifacts-"));
  tmpDirs.push(root);
  await mkdir(path.join(root, ".git"), { recursive: true });
  const init = await run(root, ["init", "--yes", "--agents", "claude", "--json"]);
  expect(init.code).toBe(0);
  await writeFile(path.join(root, ".wiki", "config.yml"), `agents: [claude]\ningest:\n  permission: ${permission}\n${whitelist}`);
  await writeFile(path.join(root, ".wiki", "kb_instructions.md"), kb);
  return { root, paths: resolvePaths(root, DEFAULT_CONFIG) };
}

async function register(r: Repo, label: string, kind: string | null, kindPending = false): Promise<SourceMeta> {
  const rel = `docs/${label}.md`;
  await mkdir(path.join(r.root, "docs"), { recursive: true });
  await writeFile(path.join(r.root, rel), `content of ${label}\n`);
  return registerSource(r.paths, {
    originType: "file",
    origin: rel,
    label,
    originalPath: path.join(r.root, rel),
    text: null,
    kind,
    providedBy: "user",
    ruleVersion: null,
    reingestOf: null,
    permission: { mode: "ai", approved: false, matched: null, kind_pending: kindPending },
    now: NOW,
  });
}

function fact(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    entity: "project:atlas",
    field: "status",
    value: "green",
    status: "decided",
    as_of: "2026-10-16",
    anchor: "Status",
    page: "projects/atlas.md",
    exists: true,
    ...over,
  };
}
function doc(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source_id: id,
    kind: "status-report",
    rule_version: 2,
    facts: [fact(), fact({ field: "target_date", value: "2026-12-01" })],
    uncovered: ["org chart"],
    ...over,
  };
}
const factsPath = (r: Repo, id: string) => path.join(r.root, ".wiki", "raw", `${id}.facts.json`);
async function rawNames(r: Repo): Promise<string[]> {
  try {
    return (await readdir(r.paths.rawDir)).sort();
  } catch {
    return [];
  }
}
async function readOrNull(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch {
    return null;
  }
}

describe("STORY-003-06 ingest facts (red)", () => {
  it.each(["stdin", "file"])("S1: valid facts are stored (%s)", async (via) => {
    const r = await repo();
    const meta = await register(r, "q4-status", "status-report");
    const d = doc(meta.id);
    let res;
    if (via === "stdin") {
      res = await run(r.root, ["ingest", "facts", meta.id, "--json"], JSON.stringify(d));
    } else {
      await writeFile(path.join(r.root, "facts.json"), JSON.stringify(d));
      res = await run(r.root, ["ingest", "facts", meta.id, "--file", "facts.json", "--json"]);
    }
    expect(res.code).toBe(0);
    expect(res.json.data.source_id).toBe(meta.id);
    expect(res.json.data.file).toBe(`.wiki/raw/${meta.id}.facts.json`);
    expect(res.json.data.facts).toBe(2);
    expect(res.json.data.uncovered).toBe(1);
    expect(res.json.data.new_entities).toBe(0);
    expect(res.json.data.replaced).toBe(false);
    expect(res.json.data.kind).toBe("status-report");
    expect(res.json.data.rule_version).toBe(2);
    expect(res.json.warnings ?? []).toEqual([]);
    const stored = JSON.parse((await readFile(factsPath(r, meta.id), "utf8")));
    expect(stored).toEqual({ ...d, new_entities: [] });
    const text = await readFile(factsPath(r, meta.id), "utf8");
    expect(text.endsWith("\n")).toBe(true);
    expect(text.includes("\r")).toBe(false);
    const schema = JSON.parse(await readFile(path.join(r.root, ".wiki", "system", "schemas", "facts.schema.json"), "utf8"));
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
  }, T);

  it("S1: the human message names the stored facts", async () => {
    const r = await repo();
    const meta = await register(r, "q4-status", "status-report");
    const res = await run(r.root, ["ingest", "facts", meta.id], JSON.stringify(doc(meta.id)));
    expect(res.code).toBe(0);
    expect(res.text).toContain("stored 2 facts");
    expect(res.text).toContain(meta.id);
  }, T);

  it.each([
    ["status-report", 1, "v2"],
    ["chat-excerpt", null, "no rule for kind chat-excerpt"],
  ])("S2: resubmission replaces; kind %s version %s warns", async (kind, version, warning) => {
    const r = await repo("ai", "", "# KB\n\n## Source kinds\n\n- status-report (v2) → project.status, risk\n");
    const meta = await register(r, "chat", null);
    await mkdir(r.paths.rawDir, { recursive: true });
    await writeFile(factsPath(r, meta.id), "{}\n");
    const res = await run(r.root, ["ingest", "facts", meta.id, "--json"], JSON.stringify(doc(meta.id, { kind, rule_version: version })));
    expect(res.code).toBe(0);
    expect(res.json.data.replaced).toBe(true);
    expect((res.json.warnings as string[]).some((w) => w.includes(warning))).toBe(true);
    const stored = JSON.parse(await readFile(factsPath(r, meta.id), "utf8"));
    expect(stored.kind).toBe(kind);
  }, T);

  it("S3: every schema problem is reported and nothing is stored", async () => {
    const r = await repo();
    const meta = await register(r, "q4-status", null);
    const bad = doc(meta.id, { notes: "x" });
    const f1 = fact();
    delete f1.anchor;
    bad.facts = [fact({ status: "maybe" }), f1];
    const res = await run(r.root, ["ingest", "facts", meta.id, "--json"], JSON.stringify(bad));
    expect(res.code).toBe(1);
    expect(res.json.error.code).toBe("invalid_facts");
    const paths = (res.json.error.details.errors as Array<{ path: string }>).map((e) => e.path);
    expect(paths).toContain("facts[0].status");
    expect(paths).toContain("facts[1].anchor");
    expect(paths).toContain("notes");
    expect(res.json.error.message).toContain(".wiki/system/schemas/facts.schema.json");
    expect(await readOrNull(factsPath(r, meta.id))).toBeNull();
  }, T);

  it("S3: invalid JSON is invalid_facts at path $", async () => {
    const r = await repo();
    const meta = await register(r, "q4-status", null);
    const res = await run(r.root, ["ingest", "facts", meta.id, "--json"], "{not json");
    expect(res.code).toBe(1);
    expect(res.json.error.code).toBe("invalid_facts");
    expect(res.json.error.details.errors[0].path).toBe("$");
    expect(await readOrNull(factsPath(r, meta.id))).toBeNull();
  }, T);

  it("S4: the whitelist denies the kind learned at facts and removes the source", async () => {
    const r = await repo("whitelist", "  whitelist:\n    origins:\n      - docs/**\n    kinds:\n      - meeting-notes\n");
    await mkdir(path.join(r.root, "notes"), { recursive: true });
    await writeFile(path.join(r.root, "notes", "contract.md"), "the contract\n");
    const start = await run(r.root, ["ingest", "start", "notes/contract.md", "--json"]);
    expect(start.code).toBe(0);
    const id = start.json.data.id as string;
    expect(start.json.data.source.permission.kind_pending).toBe(true);
    const res = await run(r.root, ["ingest", "facts", id, "--json"], JSON.stringify(doc(id, { kind: "contract", rule_version: null })));
    expect(res.code).toBe(4);
    expect(res.json.error.code).toBe("denied");
    expect(await readOrNull(factsPath(r, id))).toBeNull();
    expect((await rawNames(r)).filter((n) => n.startsWith(`${id}.`))).toEqual([]);
    const removed = res.json.error.details.removed as string[];
    expect(removed).toContain(`${id}.md`);
    expect(removed).toContain(`${id}.meta.json`);
    const again = await run(r.root, ["ingest", "start", "notes/contract.md", "--json"]);
    expect(again.json.data.status).toBe("registered");
  }, T);

  describe("S5: refusals leave the facts file untouched", () => {
    const cases = [
      ["unknown_source", "ghost"],
      ["source_id_mismatch", "mismatch"],
      ["kind_mismatch", "kindmm"],
      ["ingest_finished", "finished"],
    ] as const;
    it.each(cases)("%s", async (code, variant) => {
      const r = await repo();
      let id = "src-2026-10-16-ghost";
      let docId = id;
      let before: string | null = null;
      if (variant !== "ghost") {
        const meta = await register(r, "a", variant === "kindmm" ? "meeting-notes" : null);
        id = meta.id;
        docId = variant === "mismatch" ? "src-2026-10-16-b" : id;
        if (variant === "finished") {
          await writeLogEvent(r.paths, {
            type: "ingest",
            at: "2026-10-16T12:30:00.000Z",
            source_id: id,
            kind: "status-report",
            rule_version: 2,
            permission: "ai",
            origin: meta.origin,
            created: [],
            updated: [],
            deleted: [],
            contradictions: 0,
            rule_suggestions: 0,
          });
        }
        await writeFile(factsPath(r, id), '{"keep":"me"}\n');
        before = '{"keep":"me"}\n';
      }
      const res = await run(r.root, ["ingest", "facts", id, "--json"], JSON.stringify(doc(docId, { kind: "status-report" })));
      expect(res.code).toBe(1);
      expect(res.json.error.code).toBe(code);
      expect(await readOrNull(factsPath(r, id))).toBe(before);
    }, T);
  });

  it("not initialised repository exits 1 with not_initialised", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "wk-ifacts-"));
    tmpDirs.push(root);
    await mkdir(path.join(root, ".git"), { recursive: true });
    const res = await run(root, ["ingest", "facts", "src-2026-10-16-a", "--json"], "{}");
    expect(res.code).toBe(1);
    expect(res.json.error.code).toBe("not_initialised");
  }, T);

  it("a missing --file is a usage error", async () => {
    const r = await repo();
    const meta = await register(r, "a", null);
    const res = await run(r.root, ["ingest", "facts", meta.id, "--file", "nope.json", "--json"]);
    expect(res.code).toBe(2);
    expect(res.json.error.message).toContain("nope.json");
  }, T);
});
