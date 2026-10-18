// src/ingest/source-size.ts -- counting a source in tokens for `ingest start` (STORY-007-03, contract K5).
import path from "node:path";
import { WikeeperError } from "../core/exit-codes.js";
import { estimateTokens, formatTokens, levelMark } from "../core/tokens.js";
import type { TokenLevel } from "../core/tokens.js";
import { readSource } from "../read/index.js";
import type { ReadFormat } from "../read/index.js";

/** The count of a source's text, or null when it cannot be counted (a format read refuses, a broken file). */
export async function sourceTokens(input: {
  text: string | null;
  originalPath: string | null;
  format: ReadFormat | null;
}): Promise<{ tokens: number; rough: boolean } | null> {
  if (input.text !== null) return { tokens: estimateTokens(input.text), rough: false };
  if (input.originalPath === null || input.format === null) return null;
  try {
    const r = await readSource(input.originalPath, { cwd: path.dirname(input.originalPath) });
    return { tokens: r.tokens, rough: r.tokens_rough };
  } catch (err) {
    if (err instanceof WikeeperError) return null;
    throw err;
  }
}

export function describeTokens(tokens: number, level: TokenLevel, rough: boolean): string {
  return `${rough ? "rough " : ""}${formatTokens(tokens)} tokens ${levelMark(level)}`;
}
