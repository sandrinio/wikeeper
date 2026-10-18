import { readFile } from "node:fs/promises";
import path from "node:path";
import { compareCodeUnits } from "./compare.js";
import { listPageFiles } from "../wiki/parse-page.js";
import type { ResolvedPaths } from "./paths.js";

// Contract C1 (K1, frozen): names and types stay.
export type TokenLevel = "green" | "yellow" | "red";
export interface TokenLimits {
  yellow: number;
  red: number;
}
export interface WikiSize {
  total: number;
  page_count: number;
  index: number;
  pages: Array<{ path: string; tokens: number }>;
}

export const PDF_TOKENS_PER_PAGE = 1600;

const RUNS = /([^\sA-Za-z0-9\u10A0-\u10FF\u0400-\u04FF])\1{2,}/g;

function isSpace(c: number): boolean {
  return (
    (c >= 9 && c <= 13) ||
    c === 32 ||
    c === 0xa0 ||
    c === 0x1680 ||
    (c >= 0x2000 && c <= 0x200a) ||
    c === 0x2028 ||
    c === 0x2029 ||
    c === 0x202f ||
    c === 0x205f ||
    c === 0x3000 ||
    c === 0xfeff
  );
}

/** Offline token estimate in integer hundredths (SPIKE-003 weights). */
export function estimateTokens(text: string): number {
  let runs = 0;
  const s = text.replace(RUNS, () => {
    runs++;
    return "";
  });
  let sum = 30 * runs;
  let prevSpace = false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (isSpace(c)) {
      if (!prevSpace) sum += 51;
      prevSpace = true;
      continue;
    }
    prevSpace = false;
    if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) sum += 32;
    else if (c >= 48 && c <= 57) sum += 62;
    else if (c < 128) sum += 88;
    else if (c >= 0x400 && c <= 0x4ff) sum += 37;
    else if (c >= 0x10a0 && c <= 0x10ff) sum += 74;
    else {
      sum += 38;
      if (c >= 0xd800 && c <= 0xdbff) {
        const d = s.charCodeAt(i + 1);
        if (d >= 0xdc00 && d <= 0xdfff) i++;
      }
    }
  }
  return Math.round(sum / 100);
}

export function levelOf(tokens: number, limits: TokenLimits): TokenLevel {
  if (tokens >= limits.red) return "red";
  if (tokens >= limits.yellow) return "yellow";
  return "green";
}

export function levelMark(level: TokenLevel): string {
  return level === "red" ? "\u{1F534}" : level === "yellow" ? "\u{1F7E1}" : "\u{1F7E2}";
}

export function formatTokens(n: number): string {
  n = Math.round(n);
  if (n < 0) return "\u2248-" + formatTokens(-n).slice(1);
  if (n < 1000) return `\u2248${n}`;
  const t = Math.round(n / 100);
  if (t < 100) return `\u2248${Math.floor(t / 10)}${t % 10 ? "." + (t % 10) : ""}k`;
  const k = Math.round(n / 1000);
  if (k < 1000) return `\u2248${k}k`;
  const m = Math.round(n / 100000);
  return `\u2248${Math.floor(m / 10)}${m % 10 ? "." + (m % 10) : ""}M`;
}

export function formatLimit(n: number): string {
  if (n >= 1000 && n % 100 === 0) {
    const d = (n % 1000) / 100;
    return `${Math.floor(n / 1000)}${d ? "." + d : ""}k`;
  }
  return String(n);
}

export async function measureWiki(paths: ResolvedPaths): Promise<WikiSize> {
  const rels = await listPageFiles(paths.pagesDir);
  const pages = await Promise.all(
    rels.map(async (rel) => ({
      path: rel,
      tokens: estimateTokens(await readFile(path.join(paths.pagesDir, ...rel.split("/")), "utf8")),
    })),
  );
  pages.sort((a, b) => b.tokens - a.tokens || compareCodeUnits(a.path, b.path));
  let index = 0;
  try {
    index = estimateTokens(await readFile(paths.indexFile, "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  return { total: pages.reduce((a, p) => a + p.tokens, 0), page_count: pages.length, index, pages };
}
