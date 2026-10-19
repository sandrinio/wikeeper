import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { resolvePaths } from "../../src/core/paths.js";
import { FINISH_CHECKS, finishLintHook } from "../../src/commands/ingest-finish.js";
import { PAGE_CHECKS } from "../../src/lint/checks.js";
import { runLintHook } from "../../src/ingest/lint-hook.js";

describe("finish lint hook (STORY-005-03 R5)", () => {
  it("FINISH_CHECKS names existing page checks and not stale-fact", () => {
    expect([...FINISH_CHECKS]).toEqual(["broken-link", "uncited-claim", "unlogged-change", "oversized-page"]);
    const ids = PAGE_CHECKS.map((c) => c.id);
    for (const id of FINISH_CHECKS) expect(ids).toContain(id);
  });
  it("returns [] at once when nothing changed, even for a missing wiki", async () => {
    const paths = resolvePaths("/nonexistent-wikeeper-root", DEFAULT_CONFIG);
    expect(await finishLintHook({ paths, sourceId: "src-2026-10-12-x", changed: [] })).toEqual([]);
  });
  it("is registered when the module loads", async () => {
    const paths = resolvePaths("/nonexistent-wikeeper-root", DEFAULT_CONFIG);
    expect(await runLintHook({ paths, sourceId: "src-2026-10-12-x", changed: [] })).toEqual([]);
  });
});
