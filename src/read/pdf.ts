// src/read/pdf.ts -- PDF to markdown: unpdf text items, a font-size layout pass (STORY-003-11, R3).
import { ExitCode, WikeeperError } from "../core/exit-codes.js";
import type { Converted, ReadWarning } from "./index.js";

/** A page with fewer letters (\p{L}) than this is near-empty. */
export const NEAR_EMPTY_PAGE_LETTERS = 25 as const;

export interface PdfLine {
  text: string;
  fontSize: number;
  y: number;
}

const HEADING_RATIO = 1.15;
const HEADING_MAX_CHARS = 120;
const PARAGRAPH_GAP = 1.5;
const SPACE_GAP = 0.15;
const BULLET_RE = /^[•●▪◦‣–\-*]\s+(.*)$/u;
const NUMBER_RE = /^(\d{1,3})[.)]\s+(.*)$/u;

const letterCount = (text: string): number => (text.match(/\p{L}/gu) ?? []).length;

/** 1-based pages with fewer than NEAR_EMPTY_PAGE_LETTERS letters. */
export function scannedPages(pages: ReadonlyArray<ReadonlyArray<PdfLine>>): number[] {
  const out: number[] = [];
  pages.forEach((lines, i) => {
    const letters = lines.reduce((n, l) => n + letterCount(l.text), 0);
    if (letters < NEAR_EMPTY_PAGE_LETTERS) out.push(i + 1);
  });
  return out;
}

/** [1, 2, 3, 7] -> "1–3, 7" */
export function formatPageList(pages: readonly number[]): string {
  const parts: string[] = [];
  let i = 0;
  while (i < pages.length) {
    let j = i;
    while (j + 1 < pages.length && pages[j + 1] === pages[j]! + 1) j++;
    parts.push(j > i ? `${pages[i]}–${pages[j]}` : String(pages[i]));
    i = j + 1;
  }
  return parts.join(", ");
}

/** "D:20261001090000Z" -> "2026-10-01" */
export function pdfDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = /^D:(\d{4})(\d{2})(\d{2})/.exec(value.trim());
  if (m === null) return null;
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function bodySize(pages: ReadonlyArray<ReadonlyArray<PdfLine>>): number {
  const counts = new Map<number, number>();
  for (const lines of pages) {
    for (const l of lines) {
      const size = Math.round(l.fontSize * 2) / 2;
      counts.set(size, (counts.get(size) ?? 0) + l.text.length);
    }
  }
  let best = 0;
  let bestCount = -1;
  for (const [size, n] of counts) {
    if (n > bestCount || (n === bestCount && size > best)) {
      best = size;
      bestCount = n;
    }
  }
  return best;
}

type Kind = "heading" | "list" | "text";

export function linesToMarkdown(pages: ReadonlyArray<ReadonlyArray<PdfLine>>): string {
  const body = bodySize(pages);
  const isHeading = (l: PdfLine): boolean =>
    body > 0 && l.text.length <= HEADING_MAX_CHARS && l.fontSize >= HEADING_RATIO * body;
  const sizes = [...new Set(pages.flat().filter(isHeading).map((l) => l.fontSize))].sort((a, b) => b - a);
  const levelOf = (size: number): number => Math.min(sizes.indexOf(size) + 1, 3);

  const out: string[] = [];
  const blank = (): void => {
    if (out.length > 0 && out[out.length - 1] !== "") out.push("");
  };

  pages.forEach((lines, pageIndex) => {
    if (pageIndex > 0) {
      blank();
      out.push(`<!-- page ${pageIndex + 1} -->`, "");
    }
    let prev: PdfLine | null = null;
    let prevKind: Kind | null = null;
    let headingAt = -1;
    for (const line of lines) {
      let kind: Kind = "text";
      let rendered = line.text;
      if (isHeading(line)) {
        kind = "heading";
      } else {
        const bullet = BULLET_RE.exec(line.text);
        const number = NUMBER_RE.exec(line.text);
        if (bullet !== null) {
          kind = "list";
          rendered = `- ${bullet[1]}`;
        } else if (number !== null) {
          kind = "list";
          rendered = `${number[1]}. ${number[2]}`;
        }
      }
      if (kind === "heading" && prevKind === "heading" && prev !== null && prev.fontSize === line.fontSize && headingAt >= 0) {
        out[headingAt] += ` ${line.text}`;
        prev = line;
        continue;
      }
      if (prev !== null && prevKind !== null) {
        const gap = Math.abs(prev.y - line.y) > PARAGRAPH_GAP * body;
        if (kind === "heading" || prevKind === "heading" || kind !== prevKind || gap) blank();
      }
      if (kind === "heading") {
        out.push(`${"#".repeat(levelOf(line.fontSize))} ${rendered}`);
        headingAt = out.length - 1;
      } else {
        out.push(rendered);
      }
      prev = line;
      prevKind = kind;
    }
  });
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out.join("\n");
}

interface Item {
  str: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  hasEOL: boolean;
}

function buildLines(items: ReadonlyArray<Item>): PdfLine[] {
  const lines: PdfLine[] = [];
  let text = "";
  let size = 0;
  let y: number | null = null;
  let prev: Item | null = null;
  const flush = (): void => {
    const t = text.trim();
    if (t !== "" && y !== null) lines.push({ text: t, fontSize: size, y });
    text = "";
    size = 0;
    y = null;
    prev = null;
  };
  for (const item of items) {
    if (item.str.trim() !== "") {
      if (y === null) y = item.y;
      size = Math.max(size, item.fontSize);
      if (prev !== null && item.x - (prev.x + prev.width) > SPACE_GAP * item.fontSize) {
        if (!/\s$/.test(text) && !/^\s/.test(item.str)) text += " ";
      }
    }
    text += item.str;
    if (item.str.trim() !== "") prev = item;
    if (item.hasEOL) flush();
  }
  flush();
  return lines;
}

export async function readPdf(bytes: Uint8Array): Promise<Converted> {
  const { getDocumentProxy, extractTextItems, getMeta } = await import("unpdf");
  let pdf;
  try {
    pdf = await getDocumentProxy(new Uint8Array(bytes), { verbosity: 0, useSystemFonts: false, disableFontFace: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new WikeeperError(ExitCode.ERROR, "conversion_failed", `the file is not a readable PDF: ${message}`);
  }
  let pages: PdfLine[][];
  let info: Record<string, unknown>;
  try {
    const { items } = await extractTextItems(pdf);
    pages = items.map((page) => buildLines(page));
    info = (await getMeta(pdf)).info;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new WikeeperError(ExitCode.ERROR, "conversion_failed", `the file is not a readable PDF: ${message}`);
  } finally {
    await pdf.loadingTask.destroy();
  }

  const markdown = linesToMarkdown(pages);
  const clean = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
  const heading = /^# (.+)$/m.exec(markdown)?.[1]?.trim() ?? null;
  const warnings: ReadWarning[] = [];
  const near = scannedPages(pages);
  if (pages.length > 0 && near.length * 2 >= pages.length) {
    warnings.push({
      code: "likely_scanned",
      message: `likely scanned: ${near.length} of ${pages.length} pages have almost no extractable text (pages ${formatPageList(near)}); read the PDF yourself, wikeeper does not do OCR`,
    });
  }
  return {
    body: markdown,
    title: clean(info["Title"]) ?? heading,
    author: clean(info["Author"]),
    date: pdfDate(info["CreationDate"]),
    warnings,
  };
}
