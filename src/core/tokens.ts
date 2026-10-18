import type { ResolvedPaths } from "./paths.js";

// Contract C1 (K1, frozen). STORY-007-01 replaces the bodies; names and types stay.
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

export function estimateTokens(_text: string): number {
  throw new Error("contract stub C1");
}

export function levelOf(_tokens: number, _limits: TokenLimits): TokenLevel {
  throw new Error("contract stub C1");
}

export function levelMark(_level: TokenLevel): string {
  throw new Error("contract stub C1");
}

export function formatTokens(_n: number): string {
  throw new Error("contract stub C1");
}

export function formatLimit(_n: number): string {
  throw new Error("contract stub C1");
}

export function measureWiki(_paths: ResolvedPaths): Promise<WikiSize> {
  throw new Error("contract stub C1");
}
