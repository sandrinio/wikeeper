import type { TokenLevel } from "../core/tokens.js";
import type { ReadFormat } from "../read/index.js";

// Contract C2 (K5, frozen). STORY-007-03 replaces the bodies; names and types stay.
export function sourceTokens(_input: {
  text: string | null;
  originalPath: string | null;
  format: ReadFormat | null;
}): Promise<{ tokens: number; rough: boolean } | null> {
  throw new Error("contract stub C2");
}

export function describeTokens(_tokens: number, _level: TokenLevel, _rough: boolean): string {
  throw new Error("contract stub C2");
}
