import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { estimateTokens, levelOf } from "../../src/core/tokens.js";
import { formatSize } from "../../src/ingest/report.js";
import { describeTokens } from "../../src/ingest/source-size.js";
import { runCli } from "../../src/program.js";
import { makeReportPdf, makeScannedPdf } from "../fixtures/read/make-fixtures.js";

// Red tests for STORY-007-03 scenario 1: read reports the estimate and the level.
const T = 60_000;
const LIMITS = { yellow: 4000, red: 10000 };
const tmpDirs: string[] = [];
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});

async function folder(withWiki: boolean): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-readtok-"));
  tmpDirs.push(root);
  if (withWiki) {
    await mkdir(path.join(root, ".git"), { recursive: true });
    await mkdir(path.join(root, ".wiki"), { recursive: true });
    await writeFile(path.join(root, ".wiki", "config.yml"), "tokens:\n  source:\n    yellow: 4k\n    red: 10k\n");
  }
  return root;
}

async function readCli(cwd: string, args: string[]) {
  const { createReadCommand } = await import("../../src/commands/read.js");
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(["read", ...args], {
    commands: [createReadCommand()],
    io: {
      cwd,
      stdout: { write: (c: string) => out.push(c) },
      stderr: { write: (c: string) => err.push(c) },
      stdin: Object.assign(Readable.from([]), { isTTY: false }),
    },
  } as never);
  const stdout = out.join("");
  let json: any = null;
  try {
    json = JSON.parse(stdout.trim().split("\n")[0]!);
  } catch {
    json = null;
  }
  return { code, stdout, stderr: err.join(""), json };
}

type Row = {
  name: string;
  wiki: boolean;
  file: string;
  build: () => string | Uint8Array;
  tokens: ((markdown: string) => number) | number;
  rough: boolean;
  level: string;
  literal: string | null;
  format: string;
};
const rows: Row[] = [
  {
    name: "markdown under a 4k/10k wiki",
    wiki: true,
    file: "notes.md",
    build: () => Array.from({ length: 1000 }, () => "word").join(" "),
    tokens: (md) => estimateTokens(md),
    rough: false,
    level: "green",
    literal: "≈1.8k tokens 🟢",
    format: "markdown",
  },
  {
    name: "a PDF with text",
    wiki: true,
    file: "report.pdf",
    build: () => makeReportPdf(),
    tokens: (md) => estimateTokens(md),
    rough: false,
    level: "",
    literal: null,
    format: "pdf",
  },
  {
    name: "a scanned PDF under a 4k/10k wiki",
    wiki: true,
    file: "scan.pdf",
    build: () => makeScannedPdf({ pages: 3, imageOnlyPages: [1, 2, 3] }),
    tokens: 4800,
    rough: true,
    level: "yellow",
    literal: "rough ≈4.8k tokens 🟡",
    format: "pdf",
  },
  {
    name: "a scanned PDF in a folder with no wiki",
    wiki: false,
    file: "scan.pdf",
    build: () => makeScannedPdf({ pages: 3, imageOnlyPages: [1, 2, 3] }),
    tokens: 4800,
    rough: true,
    level: "green",
    literal: "rough ≈4.8k tokens 🟢",
    format: "pdf",
  },
];

describe("STORY-007-03 S1: read reports the estimate and the level (red)", () => {
  it.each(rows.map((r) => [r.name, r] as const))("%s", async (_n, row) => {
    const cwd = await folder(row.wiki);
    await writeFile(path.join(cwd, row.file), row.build());

    const j = await readCli(cwd, [row.file, "--out", "out.md", "--json"]);
    expect(j.code).toBe(0);
    expect(j.json.ok).toBe(true);
    expect(j.json.command).toBe("read");
    const d = j.json.data;
    const tokens = typeof row.tokens === "number" ? row.tokens : row.tokens(d.markdown);
    expect(d.tokens).toBe(tokens);
    expect(d.tokens_rough).toBe(row.rough);
    const limits = row.wiki ? LIMITS : { yellow: 20000, red: 60000 };
    const level = row.level || levelOf(tokens, limits);
    expect(d.level).toBe(level);
    expect(d.format).toBe(row.format);

    const estimate = describeTokens(tokens, level as never, row.rough);
    if (row.literal !== null) expect(estimate).toBe(row.literal);
    const h = await readCli(cwd, [row.file, "--out", "out2.md"]);
    expect(h.code).toBe(0);
    const size = (await stat(path.join(cwd, "out2.md"))).size;
    expect(h.stdout).toBe(`wrote out2.md (${estimate} · ${formatSize(size)} · ${row.format})\n`);

    const plain = await readCli(cwd, [row.file]);
    expect(plain.code).toBe(0);
    expect(plain.stdout).toBe(d.markdown + "\n");
  }, T);
});
