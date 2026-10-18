import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { estimateTokens } from "../../src/core/tokens.js";
import { makeBrokenPdf, makeNoDocumentDocx, makeReportDocx, makeReportPdf, makeScannedPdf } from "../fixtures/read/make-fixtures.js";

// Recorders for "the plan extracts nothing" (literal specifiers: Vite dynamic imports).
const rec = vi.hoisted(() => ({ getPage: 0, extractTextItems: 0, loaded: [] as string[] }));
vi.mock("unpdf", async (importOriginal) => {
  const real = await importOriginal<typeof import("unpdf")>();
  return {
    ...real,
    getDocumentProxy: async (...a: Parameters<typeof real.getDocumentProxy>) => {
      const pdf = await real.getDocumentProxy(...a);
      const orig = pdf.getPage.bind(pdf);
      (pdf as any).getPage = (...x: [number]) => {
        rec.getPage++;
        return orig(...x);
      };
      return pdf;
    },
    extractTextItems: (...a: unknown[]) => {
      rec.extractTextItems++;
      return (real.extractTextItems as any)(...a);
    },
  };
});
vi.mock("mammoth", () => {
  rec.loaded.push("mammoth");
  return { default: {} };
});
vi.mock("turndown", () => {
  rec.loaded.push("turndown");
  return { default: class {} };
});
vi.mock("@joplin/turndown-plugin-gfm", () => {
  rec.loaded.push("gfm");
  return { gfm: () => {} };
});
vi.mock("linkedom", () => {
  rec.loaded.push("linkedom");
  return {};
});
vi.mock("defuddle/node", () => {
  rec.loaded.push("defuddle");
  return {};
});

const tmpDirs: string[] = [];
beforeEach(() => {
  rec.getPage = 0;
  rec.extractTextItems = 0;
  rec.loaded.length = 0;
});
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORD1000 = Array.from({ length: 1000 }, () => "word").join(" ");
const NUMBERS300 = Array.from({ length: 300 }, () => "1234567890").join(" ");

function cfg(permission: string, extra = "", origins: string[] = []): string {
  const list = origins.length === 0 ? " []" : "\n" + origins.map((x) => `      - ${JSON.stringify(x)}`).join("\n");
  return `agents: [claude]\ningest:\n  permission: ${permission}\n  whitelist:\n    origins:${list}\n    kinds: []\n${extra}`;
}
const limits = (yellow: string, red: string, confirmAt: string) =>
  `tokens:\n  source:\n    yellow: ${yellow}\n    red: ${red}\n    confirm_at: ${confirmAt}\n`;

async function repo(config: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-pest-"));
  tmpDirs.push(root);
  await mkdir(path.join(root, ".git"), { recursive: true });
  await mkdir(path.join(root, ".wiki"), { recursive: true });
  await writeFile(path.join(root, ".wiki", "config.yml"), config);
  return root;
}
async function put(root: string, rel: string, content: string | Uint8Array): Promise<void> {
  await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
  await writeFile(path.join(root, rel), content);
}
async function treeHash(dir: string): Promise<string> {
  const h = createHash("sha256");
  async function walk(d: string): Promise<void> {
    let names: string[];
    try {
      names = (await readdir(d)).sort();
    } catch {
      return;
    }
    for (const n of names) {
      const p = path.join(d, n);
      const isDir = await readdir(p).then(
        () => true,
        () => false,
      );
      h.update(path.relative(dir, p).split(path.sep).join("/") + "\0");
      if (isDir) await walk(p);
      else h.update(await readFile(p));
    }
  }
  await walk(dir);
  return h.digest("hex");
}
async function wikiState(root: string): Promise<string[]> {
  const base = path.join(root, ".wiki");
  return [await treeHash(path.join(base, "raw")), await treeHash(path.join(base, "log")), await treeHash(path.join(base, "pages"))];
}

async function run(root: string, args: string[]) {
  const { ingestCommand } = await import("../../src/commands/ingest.js");
  const { runCli } = await import("../../src/program.js");
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(args, {
    commands: [ingestCommand],
    io: {
      cwd: root,
      stdout: { write: (c: string) => out.push(c) },
      stderr: { write: (c: string) => err.push(c) },
      stdin: Readable.from([]),
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

/** Compressed size of word/document.xml read straight from the central directory (test-side oracle). */
function documentXmlSize(zip: Uint8Array): number {
  const b = Buffer.from(zip);
  let p = 0;
  for (;;) {
    p = b.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), p);
    if (p < 0) throw new Error("no word/document.xml");
    const n = b.readUInt16LE(p + 28);
    if (b.subarray(p + 46, p + 46 + n).toString("utf8") === "word/document.xml") return b.readUInt32LE(p + 20);
    p += 4;
  }
}

describe("STORY-007-04 estimates in ingest plan (red)", () => {
  // ---- Scenario Outline 1: each new file gets an estimate by its format
  it.each([
    { file: "notes.md", rough: false, level: "green", shown: "≈1.8k tokens 🟢" },
    { file: "report.pdf", rough: true, level: "green", shown: "rough ≈3.2k tokens 🟢", tokens: 3200 },
    { file: "scan.pdf", rough: true, level: "green", shown: "rough ≈4.8k tokens 🟢", tokens: 4800 },
    { file: "report.docx", rough: true, level: "green", shown: "rough ≈1.4k tokens 🟢" },
    { file: "article.html", rough: true, level: "green", shown: null },
    { file: "deck.pptx", rough: false, level: null, shown: "not estimated", tokens: null },
    { file: "broken.pdf", rough: false, level: null, shown: "not estimated", tokens: null },
    { file: "empty.docx", rough: false, level: null, shown: "not estimated", tokens: null },
  ] as Array<{ file: string; rough: boolean; level: string | null; shown: string | null; tokens?: number | null }>)(
    "S1: $file gets its estimate by format",
    async ({ file, rough, level, shown, tokens }) => {
      const root = await repo(cfg("ai"));
      let expected: number | null;
      switch (file) {
        case "notes.md":
          await put(root, `docs/${file}`, WORD1000);
          expected = estimateTokens(WORD1000); // what ingest start counts for a file original
          break;
        case "report.pdf":
          await put(root, `docs/${file}`, makeReportPdf());
          expected = tokens as number;
          break;
        case "scan.pdf":
          await put(root, `docs/${file}`, makeScannedPdf({ pages: 3, imageOnlyPages: [1, 2, 3] }));
          expected = tokens as number;
          break;
        case "report.docx": {
          const docx = makeReportDocx();
          await put(root, `docs/${file}`, docx);
          expected = Math.round(documentXmlSize(docx) / 2);
          break;
        }
        case "article.html": {
          const html = await readFile(path.join(HERE, "..", "fixtures", "read", "article.html"));
          await put(root, `docs/${file}`, html);
          expected = Math.round(html.byteLength / 3);
          break;
        }
        case "deck.pptx":
          await put(root, `docs/${file}`, new Uint8Array([1, 2, 3, 4]));
          expected = null;
          break;
        case "broken.pdf":
          await put(root, `docs/${file}`, makeBrokenPdf());
          expected = null;
          break;
        default:
          await put(root, `docs/${file}`, makeNoDocumentDocx());
          expected = null;
      }
      const r = await run(root, ["ingest", "plan", "docs", "--json"]);
      expect(r.code).toBe(0);
      const e = r.json.data.entries.find((x: any) => x.path === `docs/${file}`);
      expect(e.status).toBe("new");
      expect(e.tokens).toBe(expected);
      expect(e.tokens_rough).toBe(rough);
      expect(e.level).toBe(level);

      const h = await run(root, ["ingest", "plan", "docs"]);
      expect(h.code).toBe(0);
      const line = h.text.split("\n").find((l) => l.startsWith(`docs/${file}: new`));
      expect(line).toBeDefined();
      if (shown !== null) expect(line).toBe(`docs/${file}: new · ${shown}`);
      else expect(line).toMatch(/^docs\/article\.html: new · rough ≈\d+(\.\d)?k? tokens 🟢$/);
    },
  );

  // ---- Scenario Outline 2: approval at confirm_at
  it.each([
    { mode: "ai", at: "yellow", big: true, scan: true, small: false, n: 2, reason: "Its estimate is at or above the approval limit tokens.source.yellow (1k)." },
    { mode: "ai", at: "red", big: false, scan: true, small: false, n: 1, reason: "ingest.permission is ai" },
    { mode: "ai", at: "never", big: false, scan: false, small: false, n: 0, reason: "ingest.permission is ai" },
    { mode: "whitelist", at: "yellow", big: true, scan: true, small: false, n: 2, reason: 'matches the whitelist entry "docs/**". Its estimate is at or above' },
    { mode: "ask", at: "never", big: true, scan: true, small: true, n: 3, reason: "ingest.permission is ask" },
  ])("S2: $mode / confirm_at $at", async ({ mode, at, big, scan, small, n, reason }) => {
    const root = await repo(cfg(mode, limits("1k", "3k", at), mode === "whitelist" ? ["docs/**"] : []));
    await put(root, "docs/big.md", WORD1000);
    await put(root, "docs/scan.pdf", makeScannedPdf({ pages: 3, imageOnlyPages: [1, 2, 3] }));
    await put(root, "docs/small.md", "hello");
    const r = await run(root, ["ingest", "plan", "docs", "--json"]);
    expect(r.code).toBe(0);
    const by = (p: string) => r.json.data.entries.find((x: any) => x.path === `docs/${p}`);
    expect(by("big.md").needs_approval).toBe(big);
    expect(by("scan.pdf").needs_approval).toBe(scan);
    expect(by("small.md").needs_approval).toBe(small);
    expect(r.json.data.totals.needs_approval).toBe(n);
    expect(by("big.md").reason).toContain(reason);
  });

  // ---- Scenario 3: estimates and the total
  it("S3: the plan shows each estimate and the total", async () => {
    const root = await repo(cfg("ai"));
    await put(root, "docs/a.md", WORD1000);
    await put(root, "docs/b.md", WORD1000);
    await put(root, "docs/deck.pptx", new Uint8Array([1, 2, 3, 4]));
    await put(root, "docs/scan.pdf", makeScannedPdf({ pages: 3, imageOnlyPages: [1, 2, 3] }));
    const r = await run(root, ["ingest", "plan", "docs", "--json"]);
    expect(r.code).toBe(0);
    const b = r.json.data.entries.find((x: any) => x.path === "docs/b.md");
    expect(b.status).toBe("duplicate");
    expect(b.tokens).toBeNull();
    expect(b.tokens_rough).toBe(false);
    expect(b.level).toBeNull();
    expect(r.json.data.totals).toEqual({
      new: 3,
      duplicate: 1,
      denied: 0,
      needs_approval: 0,
      tokens: estimateTokens(WORD1000) + 4800,
      tokens_rough: true,
      not_estimated: 1,
    });
    const h = await run(root, ["ingest", "plan", "docs"]);
    expect(h.text.startsWith(
      [
        "docs/a.md: new · ≈1.8k tokens 🟢",
        "docs/b.md: duplicate of docs/a.md",
        "docs/deck.pptx: new · not estimated",
        "docs/scan.pdf: new · rough ≈4.8k tokens 🟢",
        "totals: 3 new (0 need approval), 1 duplicate, 0 denied",
        "new files: rough ≈6.6k tokens in total; 1 not estimated",
        "",
      ].join("\n"),
    )).toBe(true);
  });

  // ---- Scenario 4: the plan extracts nothing
  it("S4: the plan extracts nothing", async () => {
    const root = await repo(cfg("ai"));
    await put(root, "docs/report.pdf", makeReportPdf());
    await put(root, "docs/report.docx", makeReportDocx());
    await put(root, "docs/article.html", await readFile(path.join(HERE, "..", "fixtures", "read", "article.html")));
    const before = await wikiState(root);
    const r = await run(root, ["ingest", "plan", "docs", "--json"]);
    expect(r.code).toBe(0);
    expect(r.json.data.entries).toHaveLength(3);
    for (const e of r.json.data.entries) {
      expect(typeof e.tokens).toBe("number");
      expect(e.tokens_rough).toBe(true);
    }
    expect(rec.getPage).toBe(0);
    expect(rec.extractTextItems).toBe(0);
    expect(rec.loaded).toEqual([]);
    expect(await wikiState(root)).toEqual(before);
  });

  // ---- Scenario 5: ingest start counts again
  it("S5: ingest start counts again and asks although the plan stayed below the limit", async () => {
    const root = await repo(cfg("ai", limits("1.5k", "3k", "yellow")));
    const html = "<!doctype html><html><head><title>Codes</title></head><body><p>" + NUMBERS300 + "</p></body></html>";
    expect(Buffer.byteLength(html)).toBe(3380);
    await put(root, "docs/codes.html", html);
    await put(root, "codes.md", NUMBERS300);
    const p = await run(root, ["ingest", "plan", "docs", "--json"]);
    expect(p.code).toBe(0);
    const e = p.json.data.entries.find((x: any) => x.path === "docs/codes.html");
    expect(e.tokens).toBe(1127);
    expect(e.level).toBe("green");
    expect(e.needs_approval).toBe(false);

    const { createIngestCommand } = await import("../../src/commands/ingest.js");
    const { createIngestStartCommand } = await import("../../src/commands/ingest-start.js");
    const { runCli } = await import("../../src/program.js");
    const out: string[] = [];
    const code = await runCli(["ingest", "start", "docs/codes.html", "--text-file", "codes.md", "--json"], {
      commands: [createIngestCommand([createIngestStartCommand({})])],
      io: { cwd: root, stdout: { write: (c: string) => out.push(c) }, stderr: { write: () => true }, stdin: Readable.from([]) },
    } as never);
    expect(code).toBe(3);
    const j = JSON.parse(out.join("").trim().split("\n")[0]!);
    expect(j.error.details.cause).toBe("size");
    expect(j.error.details.size.level).toBe("yellow");
    expect(j.error.details.size.tokens).toBe(estimateTokens(NUMBERS300));
  });
});
