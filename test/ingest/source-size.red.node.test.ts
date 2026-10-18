import { copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { estimateTokens, levelOf } from "../../src/core/tokens.js";
import { formatSize } from "../../src/ingest/report.js";
import { describeTokens } from "../../src/ingest/source-size.js";
import { readSource } from "../../src/read/index.js";
import { runCli } from "../../src/program.js";
import { makeReportDocx, makeScannedPdf } from "../fixtures/read/make-fixtures.js";

// Red tests for STORY-007-03 scenarios 2-5: the size approval and the count at `ingest start`.
const NOW = new Date(Date.UTC(2026, 9, 18, 9, 30, 0));
const T = 60_000;
const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const KB = "# KB\n\n## Source kinds\n\n- status-report (v2) → project.status, risk\n";
const WORDS = Array.from({ length: 1000 }, () => "word").join(" ");
const LIMITS_1K = "tokens:\n  source:\n    yellow: 1k\n    red: 3k\n";

const tmpDirs: string[] = [];
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});

async function repo(config: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-srcsize-"));
  tmpDirs.push(root);
  await mkdir(path.join(root, ".git"), { recursive: true });
  await mkdir(path.join(root, ".wiki"), { recursive: true });
  await writeFile(path.join(root, ".wiki", "config.yml"), config);
  await writeFile(path.join(root, ".wiki", "kb_instructions.md"), KB);
  return root;
}
const mode = (m: string, extra = "") => `ingest:\n  permission: ${m}\n${extra}`;
async function put(root: string, rel: string, content: string | Uint8Array): Promise<void> {
  await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
  await writeFile(path.join(root, rel), content);
}
async function rawFiles(root: string): Promise<string[]> {
  try {
    return (await readdir(path.join(root, ".wiki", "raw"))).filter((f) => f !== ".gitkeep").sort();
  } catch {
    return [];
  }
}

async function run(root: string, args: string[], stdin?: string) {
  const { createIngestCommand } = await import("../../src/commands/ingest.js");
  const { createIngestStartCommand } = await import("../../src/commands/ingest-start.js");
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(args, {
    commands: [createIngestCommand([createIngestStartCommand({ now: () => NOW })])],
    io: {
      cwd: root,
      stdout: { write: (c: string) => out.push(c) },
      stderr: { write: (c: string) => err.push(c) },
      stdin: Readable.from(stdin === undefined ? [] : [Buffer.from(stdin)]),
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

// ---------- S2 ----------
describe("STORY-007-03 S2: ingest start asks at confirm_at in every permission mode (red)", () => {
  type Row = { m: string; at: string; file: string; approved: boolean; exit: number; check: (r: any, e: number) => void };
  const rows: Row[] = [
    { m: "ai", at: "yellow", file: "docs/notes.txt", approved: false, exit: 3, check: (r) => {
      expect(r.json.error.code).toBe("needs_approval");
      expect(r.json.error.details.cause).toBe("size");
    } },
    { m: "ai", at: "yellow", file: "docs/notes.txt", approved: true, exit: 0, check: (r) => {
      expect(r.json.data.status).toBe("registered");
      expect(r.json.data.source.level).toBe("yellow");
    } },
    { m: "ai", at: "red", file: "docs/notes.txt", approved: false, exit: 0, check: (r) => {
      expect(r.json.data.status).toBe("registered");
    } },
    { m: "ai", at: "never", file: "docs/notes.txt", approved: false, exit: 0, check: (r, e) => {
      expect(r.json.data.status).toBe("registered");
      expect(r.json.data.source.tokens).toBe(e);
    } },
    { m: "whitelist", at: "yellow", file: "docs/notes.txt", approved: false, exit: 3, check: (r) => {
      expect(r.json.error.details.cause).toBe("size");
      expect(r.json.error.details.matched.entry).toBe("docs/**");
    } },
    { m: "whitelist", at: "yellow", file: "other/notes.txt", approved: true, exit: 4, check: (r) => {
      expect(r.json.error.code).toBe("denied");
      expect(r.json.error.details).not.toHaveProperty("size");
      expect(r.json.error.details).not.toHaveProperty("cause");
    } },
    { m: "ask", at: "yellow", file: "docs/notes.txt", approved: false, exit: 3, check: (r) => {
      expect(r.json.error.details.cause).toBe("both");
    } },
    { m: "ask", at: "never", file: "docs/notes.txt", approved: false, exit: 3, check: (r) => {
      expect(r.json.error.details.cause).toBe("permission");
      expect(r.json.error.details.size.level).toBe("yellow");
    } },
    { m: "ask", at: "yellow", file: "docs/notes.txt", approved: true, exit: 0, check: (r) => {
      expect(r.json.data.status).toBe("registered");
    } },
  ];
  it.each(rows.map((r) => [`${r.m} / ${r.at} / ${r.file} / ${r.approved ? "with" : "without"} --approved`, r] as const))("%s", async (_n, row) => {
    const wl = row.m === "whitelist" ? "  whitelist:\n    origins:\n      - docs/**\n    kinds: []\n" : "";
    const root = await repo(mode(row.m, wl) + LIMITS_1K + `    confirm_at: ${row.at}\n`);
    await put(root, row.file, WORDS);
    const r = await run(root, ["ingest", "start", row.file, "--json", ...(row.approved ? ["--approved"] : [])]);
    expect(r.code).toBe(row.exit);
    expect(r.json.command).toBe("ingest start");
    row.check(r, estimateTokens(WORDS));
    if (row.exit === 3 || row.exit === 4) expect(await rawFiles(root)).toEqual([]);
  }, T);
});

// ---------- S3 ----------
describe("STORY-007-03 S3: what ingest start counts (red)", () => {
  type Row = {
    name: string;
    args: string[];
    stdin?: string;
    setup: (root: string) => Promise<void>;
    expected: (root: string) => Promise<{ tokens: number | null; rough: boolean; bytes: number; level: string | null }>;
  };
  const textRow = (name: string, args: string[], text: string, setup: (root: string) => Promise<void>, stdin?: string): Row => ({
    name,
    args,
    stdin,
    setup,
    expected: async () => {
      const tokens = estimateTokens(text);
      return { tokens, rough: false, bytes: Buffer.byteLength(text), level: levelOf(tokens, { yellow: 20000, red: 60000 }) };
    },
  });
  const rows: Row[] = [
    textRow("URL with --text-file", ["https://acme.example.com/q4", "--text-file", "page.md"], WORDS, (r) => put(r, "page.md", WORDS)),
    textRow(
      "stdin",
      ["-", "--title", "vendor-decision"],
      "We decided to drop vendor X",
      async () => {},
      "We decided to drop vendor X",
    ),
    {
      name: "CSV original",
      args: ["docs/table.csv"],
      setup: async (r) => {
        await mkdir(path.join(r, "docs"), { recursive: true });
        await copyFile(path.join(PKG_ROOT, "test", "fixtures", "read", "table.csv"), path.join(r, "docs", "table.csv"));
      },
      expected: async (r) => {
        const read = (await readSource(path.join(r, "docs", "table.csv"), { cwd: r })) as unknown as { tokens: number };
        const bytes = (await import("node:fs")).statSync(path.join(r, "docs", "table.csv")).size;
        return { tokens: read.tokens, rough: false, bytes, level: levelOf(read.tokens, { yellow: 20000, red: 60000 }) };
      },
    },
    {
      name: "DOCX original",
      args: ["docs/report.docx"],
      setup: (r) => put(r, "docs/report.docx", makeReportDocx()),
      expected: async (r) => {
        const read = (await readSource(path.join(r, "docs", "report.docx"), { cwd: r })) as unknown as { tokens: number };
        return { tokens: read.tokens, rough: false, bytes: makeReportDocx().length, level: levelOf(read.tokens, { yellow: 20000, red: 60000 }) };
      },
    },
    {
      name: "scanned PDF original (rough page estimate)",
      args: ["docs/scan.pdf"],
      setup: (r) => put(r, "docs/scan.pdf", makeScannedPdf({ pages: 3, imageOnlyPages: [1, 2, 3] })),
      expected: async () => ({
        tokens: 4800,
        rough: true,
        bytes: makeScannedPdf({ pages: 3, imageOnlyPages: [1, 2, 3] }).length,
        level: "green",
      }),
    },
    {
      name: ".pptx is not counted",
      args: ["docs/deck.pptx"],
      setup: (r) => put(r, "docs/deck.pptx", Uint8Array.from([1, 2, 3, 4])),
      expected: async () => ({ tokens: null, rough: false, bytes: 4, level: null }),
    },
    {
      name: "broken .pdf is not counted",
      args: ["docs/q4.pdf"],
      setup: (r) => put(r, "docs/q4.pdf", Uint8Array.from([1, 2, 3, 4])),
      expected: async () => ({ tokens: null, rough: false, bytes: 4, level: null }),
    },
  ];
  it.each(rows.map((r) => [r.name, r] as const))("%s", async (_n, row) => {
    const root = await repo(mode("ai"));
    await row.setup(root);
    const exp = await row.expected(root);
    const r = await run(root, ["ingest", "start", ...row.args, "--json"], row.stdin);
    expect(r.code).toBe(0);
    expect(r.json.warnings ?? []).toEqual([]);
    expect(r.json.data.source.tokens).toBe(exp.tokens);
    expect(r.json.data.source.tokens_rough).toBe(exp.rough);
    expect(r.json.data.source.level).toBe(exp.level);

    const ending =
      exp.tokens === null
        ? `(${formatSize(exp.bytes)}, not counted in tokens)`
        : `(${describeTokens(exp.tokens, exp.level as never, exp.rough)} · ${formatSize(exp.bytes)})`;
    const again = await run(root, ["ingest", "start", ...row.args, "--reingest"], row.stdin);
    expect(again.code).toBe(0);
    expect(again.text.split("\n")[0]!.endsWith(ending)).toBe(true);
  }, T);
});

// ---------- S4 ----------
describe("STORY-007-03 S4: a duplicate is not counted; a re-ingest is counted and asks again (red)", () => {
  it("duplicate returns without a count; --reingest asks; --reingest --approved registers", async () => {
    const root = await repo(mode("ai") + LIMITS_1K + "    confirm_at: yellow\n");
    await put(root, "docs/notes.txt", WORDS);
    const first = await run(root, ["ingest", "start", "docs/notes.txt", "--approved", "--json"]);
    expect(first.code).toBe(0);
    const id = first.json.data.id as string;

    const dup = await run(root, ["ingest", "start", "docs/notes.txt", "--json"]);
    expect(dup.code).toBe(0);
    expect(dup.json.data.status).toBe("duplicate");
    expect(dup.json.data.source).toBeNull();

    const asks = await run(root, ["ingest", "start", "docs/notes.txt", "--reingest", "--json"]);
    expect(asks.code).toBe(3);
    expect(asks.json.command).toBe("ingest start");
    expect(asks.json.error.details.cause).toBe("size");

    const ok = await run(root, ["ingest", "start", "docs/notes.txt", "--reingest", "--approved", "--json"]);
    expect(ok.code).toBe(0);
    expect(ok.json.data.source.reingest_of).toBe(id);
  }, T);
});

// ---------- S5 ----------
describe("STORY-007-03 S5: the approval request names the estimate, the level and the limit (red)", () => {
  const sizeReason = "it is at or above the approval limit tokens.source.yellow (1k): show the user the estimate and rerun with --approved once they agree.";
  const askReason = (f: string) => `ingest.permission is ask: show the user the source "${f}" and rerun with --approved once they agree.`;
  type Row = { m: string; file: string; text: string; cause: string; level: string; line: string };
  const rows: Row[] = [
    {
      m: "ai",
      file: "notes.txt",
      text: WORDS,
      cause: "size",
      level: "yellow",
      line: `notes.txt needs approval (≈1.8k tokens 🟡 · 4.9 KB, no kind yet): ${sizeReason}`,
    },
    {
      m: "ask",
      file: "notes.txt",
      text: WORDS,
      cause: "both",
      level: "yellow",
      line: `notes.txt needs approval (≈1.8k tokens 🟡 · 4.9 KB, no kind yet): ${askReason("notes.txt")} It is also at or above the approval limit tokens.source.yellow (1k).`,
    },
    {
      m: "ask",
      file: "small.md",
      text: "hello\n",
      cause: "permission",
      level: "green",
      line: `small.md needs approval (≈2 tokens 🟢 · 6 B, no kind yet): ${askReason("small.md")}`,
    },
  ];
  it.each(rows.map((r) => [`${r.m} / ${r.file} / ${r.cause}`, r] as const))("%s", async (_n, row) => {
    const root = await repo(mode(row.m) + LIMITS_1K + "    confirm_at: yellow\n");
    await put(root, row.file, row.text);
    const human = await run(root, ["ingest", "start", row.file]);
    expect(human.code).toBe(3);
    expect(human.err).toBe(`${row.line}\n`);
    expect(human.err.startsWith("error:")).toBe(false);

    const j = await run(root, ["ingest", "start", row.file, "--json"]);
    expect(j.code).toBe(3);
    const d = j.json.error.details;
    expect(d.cause).toBe(row.cause);
    expect(d.size).toEqual({ tokens: estimateTokens(row.text.replace(/\n$/, "")), rough: false, level: row.level, limit: 1000, confirm_at: "yellow" });
    expect(d.reason).toBe(row.line.slice(row.line.indexOf("): ") + 3));
  }, T);
});
