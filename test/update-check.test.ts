import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/core/config.js";
import type { WikeeperConfig } from "../src/core/config.js";
import { resolvePaths } from "../src/core/paths.js";
import {
  REGISTRY_VERSION_RE,
  UPDATE_CHECK_TTL_MS,
  availableMessage,
  checkForUpdate,
  fetchLatestVersion,
  newerVersion,
  readSavedCheck,
  rememberUpdateNotice,
  runIngestUpdateCheck,
  updateCheckEnabled,
  updateCheckFile,
  updateCheckOffReason,
  updateNotice,
  versionMismatch,
  writeSavedCheck,
} from "../src/core/update-check.js";

const dirs: string[] = [];
afterEach(async () => {
  while (dirs.length) await rm(dirs.pop()!, { recursive: true, force: true });
});
const config = () => structuredClone(DEFAULT_CONFIG) as WikeeperConfig;
async function wiki() {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-uc-unit-"));
  dirs.push(root);
  await mkdir(path.join(root, ".wiki"), { recursive: true });
  return resolvePaths(root, config());
}
const reply = (body: string, status = 200) => {
  const urls: string[] = [];
  const f = (u: unknown) => {
    urls.push(String(u));
    return Promise.resolve(new Response(body, { status }));
  };
  return { f: f as unknown as typeof fetch, urls };
};
const NOW = new Date("2026-10-20T09:00:00Z");

describe("registry url", () => {
  it("joins with and without a trailing slash, and defaults to npm", async () => {
    const a = reply('{"version":"1.2.3"}');
    expect(await fetchLatestVersion({ fetch: a.f, env: {} })).toEqual({ latest: "1.2.3", error: null });
    expect(a.urls).toEqual(["https://registry.npmjs.org/wikeeper/latest"]);
    const b = reply('{"version":"1.2.3"}');
    await fetchLatestVersion({ fetch: b.f, env: { npm_config_registry: "https://npm.example.com/repo" } });
    expect(b.urls).toEqual(["https://npm.example.com/repo/wikeeper/latest"]);
    const c = reply('{"version":"1.2.3"}');
    await fetchLatestVersion({ fetch: c.f, env: { npm_config_registry: "" } });
    expect(c.urls).toEqual(["https://registry.npmjs.org/wikeeper/latest"]);
  });
  it("refuses file: and non-urls without a request", async () => {
    for (const bad of ["file:///etc/passwd", "not a url"]) {
      const r = reply("{}");
      expect(await fetchLatestVersion({ fetch: r.f, env: { npm_config_registry: bad } })).toEqual({
        latest: null,
        error: "invalid_registry",
      });
      expect(r.urls).toEqual([]);
    }
  });
  it("maps failures to causes and never throws", async () => {
    expect((await fetchLatestVersion({ fetch: reply("x", 404).f, env: {} })).error).toBe("http 404");
    expect((await fetchLatestVersion({ fetch: reply("<html>").f, env: {} })).error).toBe("invalid_answer");
    expect((await fetchLatestVersion({ fetch: reply('{"version":"0.4.1 && x"}').f, env: {} })).latest).toBeNull();
    const enotfound = () => Promise.reject(Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } }));
    expect((await fetchLatestVersion({ fetch: enotfound as never, env: {} })).error).toBe("ENOTFOUND");
    const never = () => new Promise<Response>(() => {});
    expect(await fetchLatestVersion({ fetch: never as never, env: {}, timeoutMs: 50 })).toEqual({
      latest: null,
      error: "timeout",
    });
  });
});

describe("REGISTRY_VERSION_RE", () => {
  it("accepts only x.y.z", () => {
    expect(REGISTRY_VERSION_RE.test("0.4.1")).toBe(true);
    for (const v of ["v0.4.1", "0.4.1-beta.1", "0.4.1 && x", "0.4"]) expect(REGISTRY_VERSION_RE.test(v)).toBe(false);
  });
});

describe("saved result", () => {
  it("is reused for under 24 hours and refreshed after", async () => {
    const paths = await wiki();
    const r = reply('{"version":"0.4.1"}');
    const deps = { env: {}, fetch: r.f, installed: "0.4.0" };
    await checkForUpdate(paths, config(), { ...deps, now: () => NOW });
    const minus1m = new Date(NOW.getTime() + UPDATE_CHECK_TTL_MS - 60_000);
    await checkForUpdate(paths, config(), { ...deps, now: () => minus1m });
    expect(r.urls).toHaveLength(1);
    await checkForUpdate(paths, config(), { ...deps, now: () => new Date(NOW.getTime() + UPDATE_CHECK_TTL_MS) });
    expect(r.urls).toHaveLength(2);
  });
  it("is stale when dated in the future or from another installed version", async () => {
    const paths = await wiki();
    const r = reply('{"version":"0.4.1"}');
    const deps = { env: {}, fetch: r.f };
    await checkForUpdate(paths, config(), { ...deps, installed: "0.4.0", now: () => NOW });
    await checkForUpdate(paths, config(), { ...deps, installed: "0.4.0", now: () => new Date(NOW.getTime() - 1000) });
    await checkForUpdate(paths, config(), { ...deps, installed: "0.4.1", now: () => NOW });
    expect(r.urls).toHaveLength(3);
  });
  it("counts a file of the wrong shape as none", async () => {
    const paths = await wiki();
    await mkdir(path.dirname(updateCheckFile(paths)), { recursive: true });
    for (const body of ["nope", "{}", '{"checked_at":"x","installed":"v1","latest":null}']) {
      await writeFile(updateCheckFile(paths), body);
      expect(await readSavedCheck(paths)).toBeNull();
    }
  });
  it("writes atomically with a final newline, and reports a failed write", async () => {
    const paths = await wiki();
    const saved = { checked_at: NOW.toISOString(), installed: "0.4.0", latest: null };
    expect(await writeSavedCheck(paths, saved)).toBe(true);
    const text = await readFile(updateCheckFile(paths), "utf8");
    expect(text.endsWith("}\n")).toBe(true);
    expect(JSON.parse(text)).toEqual(saved);
    const other = await wiki();
    await writeFile(path.join(other.wikiDir, ".cache"), "file");
    expect(await writeSavedCheck(other, saved)).toBe(false);
    expect(await readFile(path.join(other.wikiDir, ".cache"), "utf8")).toBe("file");
  });
});

describe("off switches", () => {
  const on = (env: NodeJS.ProcessEnv) => updateCheckEnabled(config(), env);
  it("honours each switch and its exceptions", () => {
    expect(on({})).toBe(true);
    expect(on({ WIKEEPER_NO_UPDATE_CHECK: "1" })).toBe(false);
    expect(on({ WIKEEPER_NO_UPDATE_CHECK: "0" })).toBe(true);
    expect(on({ WIKEEPER_NO_UPDATE_CHECK: "False" })).toBe(true);
    expect(on({ WIKEEPER_NO_UPDATE_CHECK: "" })).toBe(true);
    expect(on({ NO_UPDATE_NOTIFIER: "" })).toBe(false);
    expect(on({ CI: "true" })).toBe(false);
    expect(on({ CI: "" })).toBe(false);
    expect(on({ CI: "FALSE" })).toBe(true);
    expect(on({ CI: "0" })).toBe(true);
  });
  it("turns off for update_check false and for an invalid value", () => {
    expect(updateCheckEnabled({ ...config(), update_check: false }, {})).toBe(false);
    const issue = [{ key: "update_check", value: "no", message: "x" }];
    expect(updateCheckEnabled(config(), {}, issue)).toBe(false);
    expect(updateCheckOffReason(config(), {}, issue)).toBe('update_check: "no"');
  });
  it("names the reason", () => {
    expect(updateCheckOffReason({ ...config(), update_check: false }, {})).toBe("update_check: false");
    expect(updateCheckOffReason(config(), { WIKEEPER_NO_UPDATE_CHECK: "1" })).toBe("WIKEEPER_NO_UPDATE_CHECK");
    expect(updateCheckOffReason(config(), { NO_UPDATE_NOTIFIER: "1" })).toBe("NO_UPDATE_NOTIFIER");
    expect(updateCheckOffReason(config(), { CI: "1" })).toBe("CI");
    expect(updateCheckOffReason(config(), {})).toBeNull();
  });
  it("sends no request and writes no file when off, but force asks", async () => {
    const paths = await wiki();
    const r = reply('{"version":"0.4.1"}');
    expect(await checkForUpdate(paths, config(), { env: { CI: "1" }, fetch: r.f, installed: "0.4.0" })).toBeNull();
    expect(r.urls).toEqual([]);
    expect(await readSavedCheck(paths)).toBeNull();
    const forced = await checkForUpdate(paths, config(), { env: { CI: "1" }, fetch: r.f, installed: "0.4.0", force: true });
    expect(forced?.latest).toBe("0.4.1");
  });
});

describe("messages", () => {
  it("newerVersion", () => {
    const s = (latest: string | null) => ({ checked_at: "x", installed: "0.4.0", latest });
    expect(newerVersion(s("0.4.1"), "0.4.0")).toBe("0.4.1");
    expect(newerVersion(s("0.4.0"), "0.4.0")).toBeNull();
    expect(newerVersion(s("0.3.0"), "0.4.0")).toBeNull();
    expect(newerVersion(s(null), "0.4.0")).toBeNull();
    expect(newerVersion(null, "0.4.0")).toBeNull();
  });
  it("availableMessage", () => {
    expect(availableMessage("0.4.1", "0.4.0")).toBe("wikeeper 0.4.1 is available (installed 0.4.0): run wikeeper upgrade");
  });
  it("versionMismatch", () => {
    expect(versionMismatch("0.4.0", "0.3.0+a1b2c3d")).toEqual({
      kind: "files-older",
      files: "0.3.0",
      installed: "0.4.0",
      message: "this project's wikeeper files are from 0.3.0 (installed 0.4.0): run wikeeper update",
    });
    expect(versionMismatch("0.4.0", "0.5.0")?.message).toBe(
      "this project was updated by wikeeper 0.5.0 (installed 0.4.0): run wikeeper upgrade",
    );
    expect(versionMismatch("0.4.0+dev", "0.4.0+abc1234")).toBeNull();
    expect(versionMismatch("0.4.0", "garbage")).toBeNull();
    expect(versionMismatch("0.4.0", null)).toBeNull();
  });
});

describe("per-run notice and hook", () => {
  it("keeps the notice per program", () => {
    const a = new Command();
    const b = new Command();
    const sub = a.command("ingest");
    rememberUpdateNotice(sub, "hello");
    expect(updateNotice(a)).toBe("hello");
    expect(updateNotice(sub)).toBe("hello");
    expect(updateNotice(b)).toBeNull();
  });
  it("does nothing outside an initialised wiki", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "wk-uc-none-"));
    dirs.push(root);
    await mkdir(path.join(root, ".git"));
    const r = reply('{"version":"0.4.1"}');
    const cmd = new Command();
    await runIngestUpdateCheck(cmd, { env: {}, fetch: r.f, installed: "0.4.0" });
    expect(r.urls).toEqual([]);
    expect(updateNotice(cmd)).toBeNull();
  });
});
