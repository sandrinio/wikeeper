import { describe, expect, it } from "vitest";
import { hookFailed, runUserHooks, substituteSourceId } from "../../src/ingest/user-hooks.js";

describe("user hooks (unit)", () => {
  it("substituteSourceId replaces several occurrences", () => {
    expect(substituteSourceId("{source_id}-{source_id}", "src-2026-10-16-a")).toBe("src-2026-10-16-a-src-2026-10-16-a");
  });

  it("hookFailed flags failed and timed_out only", () => {
    const base = { phase: "pre_ingest", command: "x", exitCode: null, stdout: "", stderr: "", durationMs: 0 } as const;
    expect(hookFailed({ ...base, status: "failed" })).toBe(true);
    expect(hookFailed({ ...base, status: "timed_out" })).toBe(true);
    expect(hookFailed({ ...base, status: "skipped" })).toBe(false);
  });

  it("an empty command list returns []", async () => {
    await expect(runUserHooks("post_ingest", [], { cwd: ".", sourceId: "src-2026-10-16-a" })).resolves.toEqual([]);
  });

  it("an invalid source id throws before running", async () => {
    await expect(runUserHooks("pre_ingest", ["echo hi"], { cwd: ".", sourceId: "bad id" })).rejects.toThrow(/bad id/);
  });
});
