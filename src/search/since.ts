// src/search/since.ts
// Contract C12 — contract/S-02-since (owner STORY-004-04). Frozen exports: parseSince and SinceBound only; the owner
// adds toFactView, factsSince and pagesChangedSince in its own story. Consumer: STORY-004-05 (--misses --since).

function stub(name: string): never {
  throw new Error(`contract stub: ${name} (C12)`);
}

export interface SinceBound {
  date: string; // YYYY-MM-DD, compared with fact dates
  instant: string; // ISO-8601 UTC instant, passed to readLogEvents({ since })
}

/** Throws WikeeperError(ExitCode.USAGE, "invalid_since", …, { expected: "YYYY-MM-DD", got }). */
export function parseSince(raw: string): SinceBound {
  return stub("parseSince");
}
