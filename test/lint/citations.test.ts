import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { resolvePaths } from "../../src/core/paths.js";
import { claimBlocks, uncitedClaimCheck } from "../../src/lint/citations.js";
import { parsePage } from "../../src/wiki/parse-page.js";

const Q4 = "[[src-2026-10-16-q4]]";
const blocks = (body: string) => claimBlocks(parsePage(body, "a.md"));
const uncited = (body: string) => blocks(body).filter((b) => !b.cited).map((b) => b.line);

describe("claimBlocks", () => {
  it("a fact whose only source follows contradicts:: is uncited", () => {
    const b = blocks(`# T\n\n- 2026-10-15 · decided · The product lead decides. · contradicts:: ${Q4}\n- 2026-10-15 · decided · Tester. ${Q4}\n`);
    expect(b).toEqual([
      { line: 3, kind: "fact", cited: false },
      { line: 4, kind: "fact", cited: true },
    ]);
  });

  it("a wrapped paragraph needs one citation", () => {
    expect(uncited(`# T\n\nAtlas relaunches\nin November ${Q4}.\n\nOther claim\nhere.\n`)).toEqual([6]);
  });

  it("a list item continues over following lines; each item is its own block", () => {
    expect(uncited(`# T\n\n- first item\n  continues ${Q4}\n- second item\n`)).toEqual([5]);
    expect(uncited(`# T\n\n1. one\n2) two ${Q4}\n`)).toEqual([3]);
  });

  it("typed-link lines with and without a value, fences, comments and thematic breaks are structural", () => {
    const body =
      "# T\n\nowner:: [[Product Lead]]\naliases::\n- type:: risk\n\n```\ncode line\n```\n\n<!-- a\nmultiline comment\n-->\n\n---\n***\n<!-- one -->\n";
    expect(blocks(body)).toEqual([]);
  });

  it("pages with an unclosed frontmatter are skipped", () => {
    expect(blocks("---\ntype: x\nsome yaml line\n\n# T\n")).toEqual([]);
  });

  it("frontmatter is never judged", () => {
    expect(blocks("---\ntype: project\n---\n# T\n")).toEqual([]);
  });
});

describe("uncited-claim", () => {
  it("reports prose and fact findings at the block's first line with repository paths", async () => {
    const page = parsePage("# T\n\nA claim.\n\n- 2026-10-15 · decided · Fact.\n", "a.md");
    const f = await uncitedClaimCheck.run({
      paths: resolvePaths("/repo", DEFAULT_CONFIG),
      config: DEFAULT_CONFIG,
      pages: [page],
      kb: null,
      log: [],
      now: new Date(0),
    });
    expect(f).toEqual([
      { id: "uncited-claim", severity: "error", message: "claim has no [[src-…]] citation", path: ".wiki/pages/a.md", line: 3 },
      { id: "uncited-claim", severity: "error", message: "fact line has no [[src-…]] citation", path: ".wiki/pages/a.md", line: 5 },
    ]);
  });
});
