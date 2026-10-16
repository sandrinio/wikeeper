import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  USER_HOOK_OUTPUT_LIMIT,
  USER_HOOK_TIMEOUT_MS,
  hookFailed,
  runUserHooks,
  substituteSourceId,
  type UserHookResult,
} from "../../src/ingest/user-hooks.js";

const ID = "src-2026-10-16-q4-status";
const MARKER = "… [truncated]";
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "wk-hooks-"));
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

function result(status: UserHookResult["status"]): UserHookResult {
  return { phase: "pre_ingest", command: "x", status, exitCode: null, stdout: "", stderr: "", durationMs: 0 };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("constants and unit helpers", () => {
  it("exposes the frozen constants", () => {
    expect(USER_HOOK_TIMEOUT_MS).toBe(60_000);
    expect(USER_HOOK_OUTPUT_LIMIT).toBe(65_536);
  });

  it("substituteSourceId replaces every occurrence", () => {
    expect(substituteSourceId("a {source_id} b {source_id}", ID)).toBe(`a ${ID} b ${ID}`);
    expect(substituteSourceId("none", ID)).toBe("none");
  });

  it("hookFailed is true only for failed and timed_out", () => {
    expect(hookFailed(result("failed"))).toBe(true);
    expect(hookFailed(result("timed_out"))).toBe(true);
    expect(hookFailed(result("ok"))).toBe(false);
    expect(hookFailed(result("skipped"))).toBe(false);
  });

  it("truncates on a UTF-8 boundary, counting bytes", async () => {
    const cmd = `node -e "process.stdout.write('€'.repeat(40000))"`;
    const [r] = await runUserHooks("pre_ingest", [cmd], { cwd: dir, sourceId: ID });
    expect(r!.stdout.endsWith(MARKER)).toBe(true);
    const body = r!.stdout.slice(0, -MARKER.length);
    expect(body).not.toContain("�");
    expect(Buffer.byteLength(body)).toBeLessThanOrEqual(USER_HOOK_OUTPUT_LIMIT);
    expect(body.length).toBeGreaterThan(0);
  });
});

describe("Feature: User ingest hooks", () => {
  it("Hooks run in order with the source id substituted", async () => {
    const cmds = [
      `node -e "require('fs').appendFileSync('hooks.log','{source_id}\\n')"`,
      `node -e "require('fs').appendFileSync('hooks.log',process.env.WIKEEPER_HOOK_PHASE+'\\n')"`,
    ];
    const res = await runUserHooks("pre_ingest", cmds, { cwd: dir, sourceId: ID });
    expect(readFileSync(join(dir, "hooks.log"), "utf8").split(/\r?\n/).filter(Boolean)).toEqual([ID, "pre_ingest"]);
    expect(res).toHaveLength(2);
    for (const [i, r] of res.entries()) {
      expect(r.status).toBe("ok");
      expect(r.exitCode).toBe(0);
      expect(r.phase).toBe("pre_ingest");
      expect(r.command).toBe(cmds[i]);
    }
  });

  it("exposes WIKEEPER_SOURCE_ID and merges options.env", async () => {
    const cmd = `node -e "process.stdout.write(process.env.WIKEEPER_SOURCE_ID+'|'+process.env.WK_EXTRA)"`;
    const [r] = await runUserHooks("post_ingest", [cmd], { cwd: dir, sourceId: ID, env: { WK_EXTRA: "x1" } });
    expect(r!.stdout).toBe(`${ID}|x1`);
  });

  it("The first failure skips the rest", async () => {
    const cmds = [
      `node -e "0"`,
      `node -e "process.exit(3)"`,
      `node -e "require('fs').writeFileSync('third.txt','x')"`,
    ];
    const res = await runUserHooks("post_ingest", cmds, { cwd: dir, sourceId: ID });
    expect(res.map((r) => r.status)).toEqual(["ok", "failed", "skipped"]);
    expect(res[1]!.exitCode).toBe(3);
    expect(res[2]!.exitCode).toBeNull();
    expect(res[2]!.durationMs).toBe(0);
    expect(existsSync(join(dir, "third.txt"))).toBe(false);
  });

  it("A hook that runs too long is killed", async () => {
    const cmd = `node -e "setInterval(()=>require('fs').writeFileSync('marker.txt',String(Date.now())),50)"`;
    const t0 = Date.now();
    const [r] = await runUserHooks("pre_ingest", [cmd], { cwd: dir, sourceId: ID, timeoutMs: 1200 });
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(r!.status).toBe("timed_out");
    expect(r!.exitCode).toBeNull();
    expect(hookFailed(r!)).toBe(true);
    await sleep(300);
    // The child must have booted and written at least once before the kill (1200 ms leaves headroom under load).
    expect(existsSync(join(dir, "marker.txt"))).toBe(true);
    const a = readFileSync(join(dir, "marker.txt"), "utf8");
    await sleep(400);
    expect(readFileSync(join(dir, "marker.txt"), "utf8")).toBe(a);
  });

  it("Outline: no hooks returns [] and spawns nothing", async () => {
    await expect(runUserHooks("pre_ingest", [], { cwd: dir, sourceId: ID })).resolves.toEqual([]);
  });

  it("Outline: 100 KiB stdout is cut to 64 KiB plus the marker, CLI prints nothing", async () => {
    const out = vi.spyOn(process.stdout, "write");
    const err = vi.spyOn(process.stderr, "write");
    const cmd = `node -e "process.stdout.write('a'.repeat(102400))"`;
    const [r] = await runUserHooks("pre_ingest", [cmd], { cwd: dir, sourceId: ID });
    expect(r!.stdout).toBe("a".repeat(65_536) + MARKER);
    expect(out).not.toHaveBeenCalled();
    expect(err).not.toHaveBeenCalled();
  });

  it("Error: an id that is not a source id is refused", async () => {
    const cmd = `node -e "require('fs').writeFileSync('bad.txt','x')"`;
    await expect(
      runUserHooks("pre_ingest", [cmd], { cwd: dir, sourceId: "x; rm -rf ." }),
    ).rejects.toThrow(/x; rm -rf \./);
    expect(existsSync(join(dir, "bad.txt"))).toBe(false);
  });

  it("a command that cannot be spawned fails with exitCode non-zero or null and skips the rest", async () => {
    writeFileSync(join(dir, "keep"), "");
    const res = await runUserHooks(
      "pre_ingest",
      ["definitely-not-a-real-command-wk", `node -e "0"`],
      { cwd: dir, sourceId: ID },
    );
    expect(res[0]!.status).toBe("failed");
    expect(res[1]!.status).toBe("skipped");
  });
});
