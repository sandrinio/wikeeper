import { describe, expect, it } from "vitest";
import { parsePage } from "../../src/wiki/parse-page.js";
import { countContradictions, formatReport, formatSize } from "../../src/ingest/report.js";
import type { IngestReport } from "../../src/ingest/report.js";

const ID = "src-2026-10-16-notes";

describe("report", () => {
  it("formats sizes in B, KB and MB", () => {
    expect(formatSize(0)).toBe("0 B");
    expect(formatSize(1023)).toBe("1023 B");
    expect(formatSize(1024)).toBe("1.0 KB");
    expect(formatSize(1536)).toBe("1.5 KB");
    expect(formatSize(1024 * 1024)).toBe("1.0 MB");
    expect(formatSize(5 * 1024 * 1024 + 524288)).toBe("5.5 MB");
  });

  it("counts only contradiction-flagged facts that cite the source", () => {
    const page = parsePage(
      `---\ntype: project\ntitle: A\n---\n# A\n\n## Facts\n\n` +
        `- 2026-10-16 · decided · a [[${ID}]]\n` +
        `- 2026-10-16 · decided · b [[${ID}]] · contradicts:: [[src-2026-10-01-old]]\n` +
        `- 2026-10-16 · decided · c [[src-2026-10-02-other]] · contradicts:: [[src-2026-10-01-old]]\n`,
      "a.md",
    );
    expect(countContradictions([page], ID)).toBe(1);
    expect(countContradictions([], ID)).toBe(0);
  });

  const base: IngestReport = {
    source_id: ID,
    kind: "meeting-notes",
    rule_version: 3,
    permission: "ai",
    origin: "docs/notes.md",
    size: 2048,
    sha256: "abcd1234",
    created: ["a.md"],
    updated: [],
    deleted: ["b.md", "c.md"],
    contradictions: 1,
    rule_suggestions: 2,
    log_file: ".wiki/log/x.md",
    index_changed: true,
    hooks: [],
    lint: [],
  };

  it("renders the four report lines", () => {
    expect(formatReport(base)).toEqual([
      `✅ Ingested ${ID}`,
      "   kind meeting-notes · origin docs/notes.md · 2.0 KB · sha abcd…",
      "   rule meeting-notes v3 · permission ai",
      "   created 1 · updated 0 · deleted 2 · contradictions 1 · rule suggestions 2",
    ]);
  });

  it("says no rule when rule_version is null", () => {
    expect(formatReport({ ...base, rule_version: null })[2]).toBe("   no rule for meeting-notes · permission ai");
  });
});
