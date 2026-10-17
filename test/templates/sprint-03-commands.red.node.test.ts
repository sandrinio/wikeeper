// STORY-006-09 QA-Red: instructions for read, lint, status and rules. Immutable after QA-Red.
// Text rows read WIKI.md, SETUP.md and the wiki-ingest skill; live rows read the CLI forms out of the text
// (form() / argv()) and run them in-process in temp git repos, so text and CLI cannot drift apart. No network.
import { appendFile, copyFile, cp, mkdir, mkdtemp, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { createRulesCommand } from "../../src/commands/rules.js";
import { setConfigValue } from "../../src/core/config.js";
import { templatesDir } from "../../src/core/templates.js";
import { runCli } from "../../src/program.js";
import { makeReportDocx } from "../fixtures/read/make-fixtures.js";
import { doctorCheckIds, runAllChecks } from "./structure.js";

const T = 30_000;
const LONG = 60_000;

const tmpDirs: string[] = [];
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});
async function tmp(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

// ---------- text readers ----------
async function readTemplate(rel: string): Promise<string> {
  try {
    return (await readFile(path.join(templatesDir(), ...rel.split("/")), "utf8")).replace(/\r\n/g, "\n");
  } catch (e) {
    throw new Error(`not yet implemented: templates/${rel} (${(e as Error).message})`);
  }
}

/** Sections split on `## ` headings outside fenced code (copy of wiki-protocol.red's splitSections). */
function splitSections(text: string): Array<{ name: string; text: string }> {
  const sections: Array<{ name: string; text: string }> = [];
  let cur: { name: string; text: string } | null = null;
  let fenced = false;
  for (const line of text.split("\n")) {
    if (line.startsWith("```")) {
      fenced = !fenced;
      if (cur) cur.text += line + "\n";
      continue;
    }
    const m = !fenced ? /^## (.+)$/.exec(line) : null;
    if (m) {
      cur = { name: m[1]!.trim(), text: "" };
      sections.push(cur);
      continue;
    }
    if (cur) cur.text += line + "\n";
  }
  return sections;
}
async function wikiSection(name: string): Promise<string> {
  const s = splitSections(await readTemplate("system/WIKI.md")).find((x) => x.name === name);
  if (!s) throw new Error(`not yet implemented: section "${name}"`);
  return s.text;
}
async function setupStep(n: number): Promise<string> {
  const out: Array<{ n: number; body: string }> = [];
  let fenced = false;
  for (const line of (await readTemplate("system/SETUP.md")).split("\n")) {
    if (/^```/.test(line)) fenced = !fenced;
    const m = !fenced ? /^## (\d+)\. /.exec(line) : null;
    if (m) out.push({ n: Number(m[1]), body: "" });
    else if (out.length > 0) out[out.length - 1]!.body += line + "\n";
  }
  const s = out.find((x) => x.n === n);
  if (!s) throw new Error(`not yet implemented: SETUP.md step ${n}`);
  return s.body;
}
async function skillBody(): Promise<string> {
  const raw = await readTemplate("skills/wiki-ingest/SKILL.md");
  const m = /^---\n[\s\S]*?\n---\n/.exec(raw);
  return m ? raw.slice(m[0].length) : raw;
}

/** Rows (cells) of the table whose header line starts with `header`; stops at the first line that is not a table row. */
function firstTable(text: string, header: string): string[][] {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.startsWith(header));
  if (start < 0) throw new Error(`not yet implemented: table ${header}`);
  const rows: string[][] = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.startsWith("|")) break;
    rows.push(line.replace(/^\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim()));
  }
  return rows;
}
/** Field names that open a column-0 status bullet: "- `a`: " or "- `a` and `b`: ". */
function statusFields(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const m = /^- `([a-z_]+)`(?: and `([a-z_]+)`)?: /.exec(line);
    if (m) out.push(m[1]!, ...(m[2] ? [m[2]] : []));
  }
  return out;
}
/** The first code span that starts with `prefix`. */
function form(text: string, prefix: string): string {
  for (const m of text.matchAll(/`([^`\n]+)`/g)) if (m[1]!.startsWith(prefix)) return m[1]!;
  throw new Error(`not yet implemented: form ${prefix}`);
}
/** CLI arguments of a form: split on spaces, keep a quoted "<one line>" together, drop `wikeeper`, fill placeholders. */
function argv(span: string, subs: Record<string, string>): string[] {
  const tokens = span.match(/"[^"]*"|\S+/g) ?? [];
  const out = tokens.map((t) => (t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t));
  expect(out[0]).toBe("wikeeper");
  return out.slice(1).map((t) => (t in subs ? subs[t]! : t));
}
const lineStarting = (text: string, start: string): string => {
  const l = text.split("\n").find((x) => x.startsWith(start));
  if (l === undefined) throw new Error(`not yet implemented: line starting ${start}`);
  return l;
};

// ---------- live helpers ----------
async function run(root: string, args: string[], o: { stdin?: string; commands?: unknown[] } = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(args, {
    ...(o.commands ? { commands: o.commands } : {}),
    io: {
      cwd: root,
      stdout: { write: (c: string) => out.push(c) },
      stderr: { write: (c: string) => err.push(c) },
      stdin: Object.assign(Readable.from(o.stdin === undefined ? [] : [Buffer.from(o.stdin)]), { isTTY: false }),
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
async function repo(mode: "ai" | "ask" = "ai"): Promise<string> {
  const root = await tmp("wk-s03cmd-");
  await mkdir(path.join(root, ".git"), { recursive: true });
  expect((await run(root, ["init", "--yes", "--agents", "claude", "--json"])).code).toBe(0);
  await setConfigValue(root, "ingest.permission", mode);
  return root;
}
async function put(root: string, rel: string, text: string): Promise<void> {
  await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
  await writeFile(path.join(root, rel), text);
}
const factsJson = (id: string, kind: string, rel: string, value: string, anchor: string, exists: boolean) =>
  JSON.stringify({
    source_id: id,
    kind,
    rule_version: null,
    facts: [
      { entity: "project:atlas", field: "status", value, status: "decided", as_of: "2026-10-17", anchor, page: rel, exists },
    ],
  });
/**
 * start (kind) -> facts (one fact on `rel`, anchor a quote) -> apply -> write(id) + source page -> finish. Returns the id.
 * Every page the write phase changes cites [[<id>]].
 */
async function ingestFull(
  root: string,
  startArgs: string[],
  stdin: string | undefined,
  kind: string,
  rel: string,
  exists: boolean,
  anchor: string,
  write: (id: string) => Promise<void>,
): Promise<string> {
  const s = await run(root, ["ingest", "start", ...startArgs, "--kind", kind, "--json"], { stdin });
  expect(s.code, `${s.text} ${s.err}`).toBe(0);
  const id = s.json.data.id as string;
  const dir = await tmp("wk-s03facts-");
  const file = path.join(dir, "facts.json");
  await writeFile(file, factsJson(id, kind, rel, "green", anchor, exists));
  const f = await run(root, ["ingest", "facts", id, "--file", file, "--json"]);
  expect(f.code, `${f.text} ${f.err}`).toBe(0);
  const a = await run(root, ["ingest", "apply", id, "--json"]);
  expect(a.code, `${a.text} ${a.err}`).toBe(0);
  await write(id);
  await put(root, `.wiki/pages/sources/${id}.md`, `---\ntype: source\ntitle: ${id}\nsources: [${id}]\n---\n# ${id}\n`);
  const fin = await run(root, ["ingest", "finish", id, "--json"]);
  expect(fin.code, `${fin.text} ${fin.err}`).toBe(0);
  return id;
}
const page = (title: string, id: string) =>
  `---\ntype: project\ntitle: ${title}\nsummary: ${title} project\n---\n# ${title}\n\n## Facts\n\n- 2026-10-17 · decided · ${title} is green [[${id}]]\n`;

// ---------- §4.1 unit: the table-row reader ----------
describe("STORY-006-09 §4.1 unit: firstTable", () => {
  it("returns the rows after the header and separator, up to the first non-table line", () => {
    const text = ["intro", "| Finding | What to do |", "|---|---|", "| `a` | do a |", "| `b` | do b |", "after the table", "| `c` | not a row |"].join("\n");
    expect(firstTable(text, "| Finding | What to do |")).toEqual([
      ["`a`", "do a"],
      ["`b`", "do b"],
    ]);
  });
});

// ---------- S1: each new command form lands in its file and part ----------
type Row = [item: string, source: "wiki" | "setup" | "skill", part: string, phrases: string[]];
const ROWS: Row[] = [
  [
    "read (R1)",
    "wiki",
    "Register",
    ["wikeeper read <file|url> --out <file>", "wikeeper ingest start <file|url> --text-file <file>", "$env:TEMP", "fresh name", ".tsv"],
  ],
  [
    "read codes (R1)",
    "wiki",
    "Register",
    ["`needs_browser`", "`likely_scanned`", "`not_found`", "`timeout`", "`fetch_failed`", "`too_large`", "`http_error`", "`conversion_failed`", ".pptx", "CSV export"],
  ],
  ["link row (R1)", "wiki", "Delegation", ["wikeeper read"]],
  [
    "status (R2)",
    "wiki",
    "Lint and status",
    [
      "wikeeper status",
      "once per session",
      "`origin`",
      "wikeeper ingest start - --reingest",
      "`pending_rule_suggestions`",
      "wikeeper ingest start <copy> --kind <kind> --reingest",
      "--text-file .wiki/raw/<source_id>.md",
      "`ingest.whitelist.kinds`",
    ],
  ],
  ["lint (R3)", "wiki", "Lint and status", ["wikeeper lint", "wikeeper lint --check unlogged-change", "never changes", "post_ingest"]],
  ["lint --rules (R4)", "wiki", "Lint and status", ["wikeeper lint --rules", "`kb-instructions-valid` check", "`ambiguous-line` finding"]],
  ["finish (R5)", "wiki", "Write phase", ["Lint and status"]],
  [
    "rules (R6)",
    "wiki",
    "Proposing rule changes",
    ["wikeeper rules list", "wikeeper rules record --accepted", "wikeeper rules record --rejected", "--from", "every item"],
  ],
  ["dry run (R6)", "wiki", "Proposing rule changes", ["--dry-run", "stores nothing", "quote"]],
  ["merge (R7)", "wiki", "Log and index", ["wikeeper index rebuild", "wikeeper lint", "`unlogged-change`"]],
  ["setup (R8)", "setup", "2", ["wikeeper read", "`likely_scanned`"]],
  ["setup (R8)", "setup", "3", ["wikeeper lint --rules"]],
  ["skill (R9)", "skill", "body", ['"Lint and status"', "wikeeper read"]],
];

describe("STORY-006-09 S1: each new command form lands in its file and part", () => {
  it.each(ROWS)("%s: %s %s", async (_item, source, part, phrases) => {
    const text =
      source === "wiki" ? await wikiSection(part) : source === "setup" ? await setupStep(Number(part)) : await skillBody();
    for (const p of phrases) expect(text, `missing ${p}`).toContain(p);
  });
});

// ---------- S2: a source reaches ingest start through read, or directly ----------
describe("STORY-006-09 S2: a source reaches ingest start through read, or directly", () => {
  it("text: URL, DOCX and local HTML go through read; a PDF too; text files are registered directly; no truncated", async () => {
    const reg = await wikiSection("Register");
    const every = lineStarting(reg, "- Every URL");
    expect(every).toContain("`wikeeper read <file|url> --out <file>`");
    expect(every.indexOf("wikeeper read <file|url> --out <file>")).toBeLessThan(every.indexOf("--text-file <file>"));
    const pdf = lineStarting(reg, "- A PDF goes through");
    expect(pdf).toContain("`read` first");
    expect(pdf).toContain("`likely_scanned`");
    expect(lineStarting(reg, "- Markdown, plain-text, `.csv` and `.tsv`")).toContain("without `read`");
    expect(firstTable(reg, "| `read` reports | What to do |").length).toBeGreaterThan(0);
    expect(reg).not.toContain("truncated");
  });

  it("live: read a DOCX to a new file, ingest start with --text-file, and a second read of the same --out refuses", async () => {
    const root = await repo("ask");
    const docx = path.join(root, "report.docx");
    await writeFile(docx, makeReportDocx());
    const outDir = await tmp("wk-s03out-");
    const out = path.join(outDir, "report.md");
    const r1 = await run(root, ["read", docx, "--out", out, "--json"]);
    expect(r1.code, `${r1.text} ${r1.err}`).toBe(0);
    const text1 = await readFile(out);
    const s = await run(root, ["ingest", "start", docx, "--text-file", out, "--approved", "--json"]);
    expect(s.code, `${s.text} ${s.err}`).toBe(0);
    const id = s.json.data.id as string;
    const raw = await readdir(path.join(root, ".wiki", "raw"));
    expect(raw).toContain(`${id}.docx`);
    expect(raw).toContain(`${id}.md`);
    const r2 = await run(root, ["read", docx, "--out", out, "--json"]);
    expect(r2.code).toBe(2);
    expect(r2.json.error.code).toBe("usage");
    expect((await readFile(out)).equals(text1)).toBe(true);
  }, T);
});

// ---------- S3: the status and lint guidance matches what the commands report ----------
describe("STORY-006-09 S3: the status and lint guidance matches what the commands report", () => {
  it("status: the fields that open a bullet are exactly the keys of status --json, and origin is named", async () => {
    const section = await wikiSection("Lint and status");
    const root = await repo();
    const st = await run(root, ["status", "--json"]);
    expect(st.json?.ok, `${st.text} ${st.err}`).toBe(true);
    expect([...new Set(statusFields(section))].sort()).toEqual(Object.keys(st.json.data).sort());
    expect(lineStarting(section, "- `reingest_candidates`:")).toContain("`origin`");
  }, T);

  it("table: finding rows name the action; index-drift rebuilds the index; unlogged-change names its causes", async () => {
    const rows = firstTable(await wikiSection("Lint and status"), "| Finding | What to do |");
    expect(rows.length).toBeGreaterThan(0);
    const drift = rows.find((r) => r[0] === "`index-drift`");
    expect(drift?.[1]).toContain("wikeeper index rebuild");
    for (const r of rows.filter((x) => x[0] !== "`index-drift`")) expect(r[1], r[0]).toMatch(/write phase|ingest|the user/);
    const unl = rows.find((r) => r[0] === "`unlogged-change`")?.[1] ?? "";
    for (const p of ["shell write", 'section "Write phase"', "merge", "`hooks.post_ingest`", "updates that page"]) {
      expect(unl, `missing ${p}`).toContain(p);
    }
  });

  it("keep path: an ingest that leaves the edited page alone does not clear unlogged-change; one that updates it does", async () => {
    const root = await repo("ai");
    const lintUnl = async () => {
      const res = await run(root, ["lint", "--check", "unlogged-change", "--json"]);
      expect(res.json?.ok, `${res.text} ${res.err}`).toBe(true);
      return (res.json.data.findings as any[]).filter((f) => f.id === "unlogged-change").map((f) => f.path as string);
    };
    const atlas = ".wiki/pages/projects/atlas.md";
    await put(root, "docs/a.txt", "atlas is green\n");
    await ingestFull(root, ["docs/a.txt"], undefined, "status-report", "projects/atlas.md", false, "atlas is green", (id) =>
      put(root, atlas, page("atlas", id)),
    );
    expect(await lintUnl()).not.toContain(atlas);
    await appendFile(path.join(root, atlas), "- 2026-10-17 · decided · edited by a shell write\n");
    await ingestFull(root, ["-"], "We decided notes are kept", "chat-excerpt", "notes.md", false, "notes are kept", (id) =>
      put(root, ".wiki/pages/notes.md", page("notes", id)),
    );
    expect(await lintUnl()).toContain(atlas);
    await ingestFull(root, ["-"], "We confirm atlas is still green", "chat-excerpt", "projects/atlas.md", true, "atlas is still green", async (id) => {
      await appendFile(path.join(root, atlas), `- 2026-10-18 · decided · atlas is still green [[${id}]]\n`);
    });
    expect(await lintUnl()).not.toContain(atlas);
  }, LONG);

  it("re-ingest: the stored original copied to the temp directory re-ingests with the section's form", async () => {
    const root = await repo("ai");
    await put(root, "docs/notes.txt", "atlas is green\n");
    const a = await ingestFull(root, ["docs/notes.txt"], undefined, "meeting-notes", "projects/atlas.md", false, "atlas is green", (id) =>
      put(root, ".wiki/pages/projects/atlas.md", page("atlas", id)),
    );
    await unlink(path.join(root, "docs", "notes.txt"));
    const meta = JSON.parse(await readFile(path.join(root, ".wiki", "raw", `${a}.meta.json`), "utf8"));
    const copyDir = await tmp("wk-s03copy-");
    const copy = path.join(copyDir, "notes.txt");
    await copyFile(path.join(root, ".wiki", "raw", meta.original as string), copy);
    const args = argv(form(await wikiSection("Lint and status"), "wikeeper ingest start <copy>"), { "<copy>": copy, "<kind>": "meeting-notes" });
    const res = await run(root, [...args, "--json"]);
    expect(res.code, `${res.text} ${res.err}`).toBe(0);
    expect(res.json.data.source.reingest_of).toBe(a);
    expect(res.json.data.source.origin).toBe(copy.split(path.sep).join("/"));
  }, LONG);
});

// ---------- S4: rule decisions are listed first, recorded every time, and previewed without storing ----------
describe("STORY-006-09 S4: rule decisions are listed first, recorded every time, and previewed without storing", () => {
  it("text: rules list comes before rules record; approved bumps, logs and records; rejected records it and adds no changelog line", async () => {
    const s = await wikiSection("Proposing rule changes");
    const list = s.indexOf("wikeeper rules list");
    expect(list).toBeGreaterThanOrEqual(0);
    expect(list).toBeLessThan(s.indexOf("wikeeper rules record"));
    const approved = lineStarting(s, "- Approved:");
    for (const p of ["(vN)", "changelog", "wikeeper lint --rules", "--accepted"]) expect(approved, p).toContain(p);
    const rejected = lineStarting(s, "- Rejected:");
    expect(rejected).toContain("--rejected");
    expect(rejected).not.toContain("changelog");
  });

  it("live: the --rejected form run twice with the same kind and summary marks the second previously_rejected", async () => {
    const root = await repo("ai");
    const s = await run(root, ["ingest", "start", "-", "--kind", "meeting-notes", "--json"], { stdin: "We met about owners" });
    expect(s.code, `${s.text} ${s.err}`).toBe(0);
    const id = s.json.data.id as string;
    const span = form(await wikiSection("Proposing rule changes"), "wikeeper rules record --rejected");
    for (const t of ["2026-10-20T10:00:00Z", "2026-10-20T10:00:01Z"]) {
      const args = argv(span, { "<kind>": "meeting-notes", "<one line>": "also capture owners", "<source-id>": id });
      const rec = await run(root, [...args, "--json"], { commands: [createRulesCommand({ now: () => new Date(t) })] });
      expect(rec.code, `${rec.text} ${rec.err}`).toBe(0);
    }
    const list = await run(root, ["rules", "list", "--json"]);
    expect(list.code, `${list.text} ${list.err}`).toBe(0);
    expect((list.json.data.decisions as any[]).map((d) => d.previously_rejected)).toEqual([false, true]);
  }, T);

  it("live: the dry-run form on a finished ingest exits 0 and leaves raw/<id>.facts.json byte-identical", async () => {
    const root = await repo("ai");
    await put(root, "docs/a.txt", "atlas is green and on track\n");
    const id = await ingestFull(root, ["docs/a.txt"], undefined, "status-report", "projects/atlas.md", false, "atlas is green", (i) =>
      put(root, ".wiki/pages/projects/atlas.md", page("atlas", i)),
    );
    const factsPath = path.join(root, ".wiki", "raw", `${id}.facts.json`);
    const before = await readFile(factsPath);
    const dir = await tmp("wk-s03dry-");
    const file = path.join(dir, "facts.json");
    await writeFile(file, factsJson(id, "status-report", "projects/atlas.md", "amber", "atlas is green", true));
    const args = argv(form(await wikiSection("Proposing rule changes"), "wikeeper ingest facts <id>"), { "<id>": id, "<facts.json>": file });
    const res = await run(root, [...args, "--json"]);
    expect(res.code, `${res.text} ${res.err}`).toBe(0);
    expect((await readFile(factsPath)).equals(before)).toBe(true);
  }, LONG);
});

// ---------- S5: a form the CLI does not have fails the checks ----------
describe("STORY-006-09 S5: a form the CLI does not have fails the checks", () => {
  it.each([
    ["`wikeeper status --all`", '"--all" is not an option of "status"'],
    ["`wikeeper read <url> --output <file>`", '"--output" is not an option of "read"'],
  ])("section Lint and status containing %s fails naming %s", async (text, named) => {
    const copy = await tmp("wk-s03tpl-");
    await cp(templatesDir(), copy, { recursive: true });
    const wiki = path.join(copy, "system", "WIKI.md");
    const lines = (await readFile(wiki, "utf8")).replace(/\r\n/g, "\n").split("\n");
    const h = lines.findIndex((l) => l === "## Lint and status");
    if (h < 0) throw new Error('not yet implemented: section "Lint and status"');
    lines.splice(h + 2, 0, `Never run ${text}.`, "");
    await writeFile(wiki, lines.join("\n"));
    const findings = await runAllChecks(copy, await doctorCheckIds());
    expect(findings.some((f) => f.file === "system/WIKI.md" && f.line === h + 3 && f.message.includes(named)), JSON.stringify(findings)).toBe(true);
  }, LONG);
});
