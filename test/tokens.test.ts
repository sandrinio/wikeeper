import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/core/config.js";
import { resolvePaths } from "../src/core/paths.js";
import { estimateTokens, formatLimit, formatTokens, levelMark, levelOf, measureWiki } from "../src/core/tokens.js";

// Reference algorithm written from the story's R1, independent of the implementation.
function oracle(text: string): number {
  let runs = 0;
  const s = text.replace(/([^\sA-Za-z0-9Ⴀ-ჿЀ-ӿ])\1{2,}/g, () => {
    runs++;
    return "";
  });
  let sum = 30 * runs + 51 * (s.match(/\s+/g) ?? []).length;
  for (const ch of s) {
    if (/\s/.test(ch)) continue;
    const cp = ch.codePointAt(0)!;
    if (/[A-Za-z]/.test(ch)) sum += 32;
    else if (/[0-9]/.test(ch)) sum += 62;
    else if (cp < 128) sum += 88;
    else if (cp >= 0x400 && cp <= 0x4ff) sum += 37;
    else if (cp >= 0x10a0 && cp <= 0x10ff) sum += 74;
    else sum += 38;
  }
  return Math.round(sum / 100);
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALPHABET = ["a", "Z", "7", " ", "\n", "\t", " ", ".", "_", "-", "|", "д", "ა", "é", "—", "…", "€", "👍"];

describe("estimateTokens oracle", () => {
  it("equals the reference on 2,000 seeded strings", () => {
    const rnd = mulberry32(7);
    for (let i = 0; i < 2000; i++) {
      let s = "";
      const len = 1 + Math.floor(rnd() * 30);
      for (let j = 0; j < len; j++) s += ALPHABET[Math.floor(rnd() * ALPHABET.length)]!.repeat(1 + Math.floor(rnd() * 4));
      expect(estimateTokens(s), JSON.stringify(s)).toBe(oracle(s));
    }
  });
  it("equals the reference on fixed fixtures", () => {
    for (const s of ["", "The quick brown fox", "_".repeat(12) + " x", "👍".repeat(5), "€1?1", "﻿a", "a\uD800b"]) {
      expect(estimateTokens(s)).toBe(s.includes("\uD800") ? 1 : oracle(s));
    }
  });
  it("keeps the BOM as whitespace", () => {
    expect(estimateTokens("﻿a")).toBe(oracle("﻿a"));
  });
});

describe("levels and display", () => {
  const lim = { yellow: 4000, red: 10000 };
  it("levelOf is inclusive at both boundaries", () => {
    expect(levelOf(3999, lim)).toBe("green");
    expect(levelOf(4000, lim)).toBe("yellow");
    expect(levelOf(9999, lim)).toBe("yellow");
    expect(levelOf(10000, lim)).toBe("red");
  });
  it("levelMark", () => {
    expect(["green", "yellow", "red"].map((l) => levelMark(l as never))).toEqual(["🟢", "🟡", "🔴"]);
  });
  it("formatTokens at the rounding edges", () => {
    const f = (n: number) => formatTokens(n);
    expect([999, 1000, 1049, 1050, 9949, 9950, 999499, 999500, -1200, 870.6].map(f)).toEqual([
      "≈999",
      "≈1k",
      "≈1k",
      "≈1.1k",
      "≈9.9k",
      "≈10k",
      "≈999k",
      "≈1M",
      "≈-1.2k",
      "≈871",
    ]);
  });
  it("formatLimit", () => {
    expect([4000, 10000, 1500, 1234, 999].map(formatLimit)).toEqual(["4k", "10k", "1.5k", "1234", "999"]);
  });
});

describe("measureWiki", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    while (dirs.length) await rm(dirs.pop()!, { recursive: true, force: true });
  });
  it("sorts ties by path and tolerates missing paths", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "wk-tok-"));
    dirs.push(root);
    const paths = resolvePaths(root, DEFAULT_CONFIG);
    expect(await measureWiki(paths)).toEqual({ total: 0, page_count: 0, index: 0, pages: [] });
    await mkdir(path.join(paths.pagesDir, "z"), { recursive: true });
    await writeFile(path.join(paths.pagesDir, "z", "a.md"), "hello world");
    await writeFile(path.join(paths.pagesDir, "b.md"), "hello world");
    await writeFile(path.join(paths.pagesDir, "a.md"), "hello world and more words here");
    const size = await measureWiki(paths);
    expect(size.pages.map((p) => p.path)).toEqual(["a.md", "b.md", "z/a.md"]);
    expect(size.total).toBe(size.pages.reduce((a, p) => a + p.tokens, 0));
    expect(size.index).toBe(0);
  });
});
