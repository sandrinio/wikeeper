import { describe, expect, it } from "vitest";
import { pagesChangedSince, parseSince } from "../../src/search/since.js";
import type { StoredLogEvent } from "../../src/ingest/log.js";

describe("parseSince", () => {
  it("accepts a bare date", () => {
    expect(parseSince("2026-10-11")).toEqual({ date: "2026-10-11", instant: "2026-10-11T00:00:00.000Z" });
  });
  it("keeps the date as written for a date-time with an offset", () => {
    expect(parseSince("2026-10-11T22:00:00-05:00")).toEqual({
      date: "2026-10-11",
      instant: "2026-10-12T03:00:00.000Z",
    });
  });
  it.each(["2026-02-29", "2026-10-11T24:00:00Z", "2026-10-11T10:00:00", "yesterday", "2026-13-01"])(
    "rejects %s",
    (raw) => {
      expect(() => parseSince(raw)).toThrowError(expect.objectContaining({ code: "invalid_since", exitCode: 2 }));
    },
  );
});

describe("pagesChangedSince", () => {
  it("skips malformed and non-ingest events", () => {
    const events = [
      { file: "a", event: { type: "ingest", at: "2026-10-12T09:00:00Z", source_id: "s", created: ["a.md", 7], updated: "b.md", deleted: [] } },
      { file: "b", event: { type: "abort", at: "2026-10-13T09:00:00Z", created: ["z.md"] } },
    ] as unknown as StoredLogEvent[];
    expect(pagesChangedSince(events)).toEqual([
      { path: "a.md", change: "created", source_id: "s", at: "2026-10-12T09:00:00Z" },
    ]);
  });
});
