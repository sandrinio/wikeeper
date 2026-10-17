import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { setConfigValue } from "../../src/core/config.js";
import { hashTree } from "../../src/ingest/snapshot.js";
import { runCli } from "../../src/program.js";

const T = 30_000;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const FIXTURE = path.join(REPO, "test", "fixtures", "kb", "real-management.md");
const SEED = path.join(REPO, "templates", "kb_instructions.management.md");
const KB = ".wiki/kb_instructions.md";

const tmpDirs: string[] = [];
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});

async function run(root: string, args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const input = Object.assign(Readable.from([]), { isTTY: false });
  const code = await runCli(args, {
    io: { cwd: root, stdout: { write: (c: string) => out.push(c) }, stderr: { write: (c: string) => err.push(c) }, stdin: input },
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

async function initWiki(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-rules-"));
  tmpDirs.push(root);
  await mkdir(path.join(root, ".git"), { recursive: true });
  expect((await run(root, ["init", "--json", "--agents", "claude", "--yes"])).code).toBe(0);
  return root;
}

const kbFile = (root: string) => path.join(root, ".wiki", "kb_instructions.md");

/** Replace 1-based lines of a text. */
function edit(text: string, changes: Record<number, string>): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  for (const [n, v] of Object.entries(changes)) lines[Number(n) - 1] = v;
  return lines.join("\n");
}

async function cleanFile(): Promise<string> {
  const base = (await readFile(FIXTURE, "utf8")).replace(/\r\n/g, "\n");
  const lines = base.split("\n");
  expect(lines[9]).toMatch(/^Q4 /);
  return edit(base, { 10: lines[9] + " (dated facts)" });
}

async function wikiWith(text: string): Promise<string> {
  const root = await initWiki();
  await writeFile(kbFile(root), text);
  return root;
}

async function lintRules(root: string, extra: string[] = []) {
  const r = await run(root, ["lint", "--rules", ...extra, "--json"]);
  return { ...r, findings: (r.json?.data?.findings ?? []) as any[] };
}

async function seedLine(pred: (l: string, i: number, all: string[]) => boolean): Promise<number> {
  const lines = (await readFile(SEED, "utf8")).replace(/\r\n/g, "\n").split("\n");
  const i = lines.findIndex(pred);
  expect(i).toBeGreaterThanOrEqual(0);
  return i + 1;
}

describe("lint --rules: each check reports its problem (S1)", () => {
  type Row = {
    name: string;
    seed?: boolean;
    changes: Record<number, string>;
    cfgKinds?: string[];
    id: string;
    severity: string;
    path: string;
    line: number | null;
    names: string[];
    exit: number;
  };
  const rows: Row[] = [
    { name: "duplicate-rule", changes: { 44: "roadmap (v3) → milestone" }, id: "duplicate-rule", severity: "error", path: KB, line: 44, names: ["line 40"], exit: 1 },
    { name: "unknown-entity", changes: { 44: "status-report (v1) → project.status, vendor" }, id: "unknown-entity", severity: "error", path: KB, line: 44, names: ["project", "vendor"], exit: 1 },
    { name: "unknown-field", changes: { 44: "status-report (v1) → milestone.owner" }, id: "unknown-field", severity: "warning", path: KB, line: 44, names: ["milestone.owner"], exit: 0 },
    { name: "rule-without-question", changes: { 25: "vendor name, contact → vendors.md", 44: "contract (v1) → vendor" }, id: "rule-without-question", severity: "warning", path: KB, line: 25, names: ["vendor", "contract"], exit: 0 },
    { name: "changelog-version-mismatch (kind)", changes: { 41: "initiative-doc (v2) → initiative, initiative.purpose, decision, risk, term" }, id: "changelog-version-mismatch", severity: "warning", path: KB, line: 41, names: ["initiative-doc v2"], exit: 0 },
    { name: "changelog-version-mismatch (entry)", changes: { 40: "roadmap (v1) → milestone, epic" }, id: "changelog-version-mismatch", severity: "warning", path: KB, line: 68, names: ["roadmap v2"], exit: 0 },
    { name: "unknown-whitelist-kind", changes: {}, cfgKinds: ["meeting-notes", "standup"], id: "unknown-whitelist-kind", severity: "warning", path: ".wiki/config.yml", line: null, names: ["standup"], exit: 0 },
    { name: "ambiguous-line (prose arrow)", changes: { 44: "Use roadmap → milestone for sprints" }, id: "ambiguous-line", severity: "warning", path: KB, line: 44, names: ["note:"], exit: 0 },
    { name: "ambiguous-line (commented kind)", changes: { 44: "<!--", 45: "standup (v1) → decision", 46: "-->" }, id: "ambiguous-line", severity: "warning", path: KB, line: 45, names: ["ingest"], exit: 0 },
    { name: "malformed-entity", changes: { 25: "vendor name →" }, id: "malformed-entity", severity: "error", path: KB, line: 25, names: ["<page>"], exit: 1 },
    { name: "unknown-question-ref", changes: { 23: "risk owner, impact → risks.md Q6 Q9" }, id: "unknown-question-ref", severity: "error", path: KB, line: 23, names: ["Q9"], exit: 1 },
    { name: "malformed-question", changes: { 14: "Q8" }, id: "malformed-question", severity: "error", path: KB, line: 14, names: ["Q8"], exit: 1 },
    { name: "missing-section", seed: true, changes: {}, id: "missing-section", severity: "error", path: KB, line: null, names: ["## Entities"], exit: 1 },
  ];

  for (const row of rows) {
    it(
      `reports exactly one ${row.id} (${row.name})`,
      async () => {
        let text: string;
        let changes = row.changes;
        if (row.seed) {
          const n = await seedLine((l) => l === "## Entities");
          text = edit((await readFile(SEED, "utf8")).replace(/\r\n/g, "\n"), { [n]: "## Entity list" });
          changes = {};
        } else {
          text = edit(await cleanFile(), changes);
        }
        const root = await wikiWith(text);
        if (row.cfgKinds) await setConfigValue(root, "ingest.whitelist.kinds", row.cfgKinds);
        const r = await lintRules(root);
        expect(r.json?.ok, r.text + r.err).toBeTypeOf("boolean");
        expect(r.findings).toHaveLength(1);
        const f = r.findings[0];
        expect(f.id).toBe(row.id);
        expect(f.severity).toBe(row.severity);
        expect(f.path).toBe(row.path);
        if (row.line === null) expect(f.line).toBeUndefined();
        else expect(f.line).toBe(row.line);
        for (const n of row.names) expect(f.message).toContain(n);
        expect(r.code).toBe(row.exit);
      },
      T,
    );
  }
});

describe("lint --rules: served questions (S2)", () => {
  const baseText = async () => (await readFile(FIXTURE, "utf8")).replace(/\r\n/g, "\n");

  it("no change: one question-without-rule warning at line 10 naming Q4 and (dated facts)", async () => {
    const root = await wikiWith(await baseText());
    const r = await lintRules(root);
    expect(r.code).toBe(0);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ id: "question-without-rule", severity: "warning", line: 10, path: KB });
    expect(r.findings[0].message).toContain("Q4");
    expect(r.findings[0].message).toContain("(dated facts)");
  }, T);

  it("dated facts: empty, paired with a --check run that is ok", async () => {
    const root = await wikiWith(await cleanFile());
    const chk = await run(root, ["lint", "--rules", "--check", "question-without-rule", "--json"]);
    expect(chk.json?.ok).toBe(true);
    const r = await lintRules(root);
    expect(r.code).toBe(0);
    expect(r.findings).toEqual([]);
  }, T);

  it("Q8 listed by vendor, which no kind targets: one warning at line 14 naming Q8 and vendor", async () => {
    const text = edit(await cleanFile(), { 14: "Q8 Who supplies X?", 25: "vendor name, contact → vendors.md Q8" });
    const root = await wikiWith(text);
    const r = await lintRules(root);
    expect(r.code).toBe(0);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ id: "question-without-rule", severity: "warning", line: 14 });
    expect(r.findings[0].message).toContain("Q8");
    expect(r.findings[0].message).toContain("vendor");
  }, T);
});

describe("lint --rules: a fresh seed and scopes (S3)", () => {
  it("passes on a fresh seed, changes nothing, and each scope runs only its own checks", async () => {
    const root = await initWiki();
    const before = await hashTree(path.join(root, ".wiki"));
    const r = await lintRules(root);
    expect(r.code).toBe(0);
    expect(r.json.data.scope).toBe("rules");
    expect(r.json.data.findings).toEqual([]);
    expect(r.json.data.counts).toEqual({ error: 0, warning: 0, info: 0 });
    expect(await hashTree(path.join(root, ".wiki"))).toEqual(before);

    const n1 = await seedLine((l, i, all) => i > 0 && all.slice(0, i).includes("## Source kinds") && l === "");
    const n2 = await seedLine((l, i, all) => {
      const k = all.indexOf("## Source kinds");
      return i > k && l === "" && all.slice(k + 1, i).some((x) => x === "") && i !== k + 1;
    });
    await writeFile(
      kbFile(root),
      edit(await readFile(kbFile(root), "utf8"), { [n1]: "status-report (v1) → project.status", [n2]: "Use roadmap → milestone" }),
    );

    const c = await run(root, ["lint", "--rules", "--check", "unknown-entity", "--json"]);
    expect(c.json.data.findings).toHaveLength(1);
    expect(c.json.data.findings[0]).toMatchObject({ id: "unknown-entity", path: KB, line: n1 });
    const h = await run(root, ["lint", "--rules", "--check", "unknown-entity"]);
    expect(h.text).toContain(`[error] unknown-entity ${KB}:${n1}: `);

    const plain = await run(root, ["lint", "--json"]);
    const ruleIds = new Set([
      "missing-file", "missing-section", "malformed-question", "malformed-entity", "unknown-question-ref",
      "ambiguous-line", "duplicate-rule", "unknown-entity", "unknown-field", "question-without-rule",
      "rule-without-question", "changelog-version-mismatch", "unknown-whitelist-kind",
    ]);
    expect(plain.json?.ok).toBeTypeOf("boolean");
    expect((plain.json.data.findings as any[]).filter((f) => ruleIds.has(f.id))).toEqual([]);
  }, T);
});

describe("doctor: kb-instructions-valid (S4)", () => {
  const rowsOf = (j: any) => (j.data.checks as any[]).filter((c) => c.id === "kb-instructions-valid");

  it("no change: one ok row, 0 warnings", async () => {
    const root = await initWiki();
    const d = await run(root, ["doctor", "--json"]);
    expect(d.code).toBe(0);
    const rows = rowsOf(d.json);
    expect(rows).toHaveLength(1);
    expect(rows[0].severity).toBe("ok");
    expect(d.json.data.warnings).toBe(0);
  }, T);

  it("malformed entity: warning naming line 12 and malformed-entity, with the fix", async () => {
    const root = await initWiki();
    const n = await seedLine((l, i, all) => i > all.indexOf("## Entities") + 1 && l === "" && all[i - 1]!.startsWith("<!--"));
    expect(n).toBe(12);
    await writeFile(kbFile(root), edit(await readFile(kbFile(root), "utf8"), { [n]: "risk owner, impact → risks.md Q6 and Q7" }));
    const d = await run(root, ["doctor", "--json"]);
    expect(d.code).toBe(0);
    const rows = rowsOf(d.json);
    expect(rows).toHaveLength(1);
    expect(rows[0].severity).toBe("warning");
    expect(rows[0].message).toContain(`line ${n}`);
    expect(rows[0].message).toContain("malformed-entity");
    expect(rows[0].fix).toBe("run wikeeper lint --rules");
    expect(rows[0].file).toBe(KB);
    expect(d.json.data.warnings).toBe(1);
  }, T);

  it("missing section: warning naming missing-section", async () => {
    const root = await initWiki();
    const n = await seedLine((l) => l === "## Entities");
    await writeFile(kbFile(root), edit(await readFile(kbFile(root), "utf8"), { [n]: "## Entity list" }));
    const d = await run(root, ["doctor", "--json"]);
    expect(d.code).toBe(0);
    const rows = rowsOf(d.json);
    expect(rows).toHaveLength(1);
    expect(rows[0].severity).toBe("warning");
    expect(rows[0].message).toContain("missing-section");
    expect(d.json.data.warnings).toBe(1);
  }, T);

  it("unknown entity is a lint finding, not a parse issue: ok row", async () => {
    const root = await initWiki();
    const n = await seedLine((l, i, all) => i > all.indexOf("## Source kinds") && l === "");
    await writeFile(kbFile(root), edit(await readFile(kbFile(root), "utf8"), { [n]: "status-report (v1) → project.status" }));
    const d = await run(root, ["doctor", "--json"]);
    expect(d.code).toBe(0);
    const rows = rowsOf(d.json);
    expect(rows).toHaveLength(1);
    expect(rows[0].severity).toBe("ok");
    expect(d.json.data.warnings).toBe(0);
  }, T);

  it("deleted file: no kb-instructions-valid row, 0 warnings", async () => {
    const root = await initWiki();
    await rm(kbFile(root));
    const d = await run(root, ["doctor", "--json"]);
    expect(d.code).toBe(0);
    expect(rowsOf(d.json)).toHaveLength(0);
    expect(d.json.data.warnings).toBe(0);
  }, T);
});

describe("lint --rules: missing file (S5)", () => {
  it("reports missing-file as an error and exits 1", async () => {
    const root = await initWiki();
    await rm(kbFile(root));
    const r = await lintRules(root);
    expect(r.json?.data?.scope).toBe("rules");
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ id: "missing-file", severity: "error", path: KB });
    expect(r.findings[0].message).toContain("wikeeper init");
    expect(r.code).toBe(1);
  }, T);
});
