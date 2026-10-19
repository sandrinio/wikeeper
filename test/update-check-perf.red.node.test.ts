// STORY-009-01 QA-Red: scenario 5, the check stays within its time budget. Run by `npm run test:perf`.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, latest041, makeWiki, never, norm, OFF, readSaved, runIngest, savedFile } from "./update-check-harness.js";

afterEach(cleanup);

describe("STORY-009-01 S5: time budget", () => {
  it("p95 of 30 checks with a fresh saved result is under 20 ms and sends no request", async () => {
    const root = await makeWiki();
    const { loadConfig } = await import("../src/core/config.js");
    const { resolvePaths } = await import("../src/core/paths.js");
    const { checkForUpdate } = await import("../src/core/update-check.js");
    const { config } = await loadConfig(root);
    const paths = resolvePaths(root, config);
    const now = new Date("2026-10-20T09:00:00Z");
    await mkdir(path.dirname(savedFile(root)), { recursive: true });
    await writeFile(
      savedFile(root),
      JSON.stringify({ checked_at: new Date(now.getTime() - 3_600_000).toISOString(), installed: "0.4.0", latest: "0.4.1" }, null, 2) + "\n",
    );
    const f = latest041();
    const times: number[] = [];
    for (let i = 0; i < 30; i++) {
      const t0 = performance.now();
      const r = await checkForUpdate(paths, config, { env: {}, fetch: f.fetch, now: () => now, installed: "0.4.0" });
      times.push(performance.now() - t0);
      expect(r?.latest).toBe("0.4.1");
    }
    times.sort((a, b) => a - b);
    expect(f.urls).toEqual([]);
    expect(times[Math.ceil(0.95 * times.length) - 1]!).toBeLessThan(20);
  }, 30_000);

  it("a fetch that never settles adds at most 1,600 ms to ingest plan, and the next run sends no request", async () => {
    const root = await makeWiki();
    const base = { env: OFF, now: () => new Date("2026-10-20T09:00:00Z"), installed: "0.4.0" };
    const durations: number[] = [];
    let first: Awaited<ReturnType<typeof runIngest>> | null = null;
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      const r = await runIngest(root, ["ingest", "plan", "docs", "--json"], base);
      durations.push(performance.now() - t0);
      expect(r.json.ok).toBe(true);
      first ??= r;
    }
    durations.sort((a, b) => a - b);
    const median = durations[2]!;
    const f = never();
    const t0 = performance.now();
    const slow = await runIngest(root, ["ingest", "plan", "docs", "--json"], { env: {}, fetch: f.fetch, now: base.now, installed: "0.4.0" });
    const elapsed = performance.now() - t0;
    expect(f.urls).toHaveLength(1);
    expect(slow.code).toBe(first!.code);
    expect(await norm(root, slow.json.data)).toBe(await norm(root, first!.json.data));
    expect(elapsed).toBeLessThanOrEqual(median + 1_600);
    expect((await readSaved(root)).latest).toBeNull();
    const g = never();
    const again = await runIngest(root, ["ingest", "plan", "docs", "--json"], { env: {}, fetch: g.fetch, now: base.now, installed: "0.4.0" });
    expect(again.json.ok).toBe(true);
    expect(g.urls).toEqual([]);
  }, 30_000);
});
