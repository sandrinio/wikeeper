// STORY-009-01 QA-Red: acceptance scenarios 1-4 (§2.1), driven through runCli with injected env, fetch and clock.
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MSG,
  START,
  OFF,
  answers,
  cleanup,
  fake,
  latest041,
  makeWiki,
  never,
  norm,
  readSaved,
  runDefault,
  runDoctor,
  runIngest,
  runStatus,
  savedFile,
  type Fake,
} from "./update-check-harness.js";

afterEach(async () => {
  vi.unstubAllGlobals();
  await cleanup();
});

const at = (iso: string) => () => new Date(iso);
const REGISTRY = "https://registry.npmjs.org/wikeeper/latest";
const T = 30_000;

describe("STORY-009-01 S1: a newer version is reported, and npm is asked once a day", () => {
  it("reports, saves, reuses for a day, re-asks when stale, honours npm_config_registry", async () => {
    const root = await makeWiki();
    const twin = await makeWiki();
    const f = latest041();
    const on = (iso: string, extra: Record<string, unknown> = {}) => ({ env: {}, fetch: f.fetch, now: at(iso), installed: "0.4.0", ...extra });
    const off = (iso: string) => ({ env: OFF, fetch: latest041().fetch, now: at(iso), installed: "0.4.0" });

    // 1. first run
    const a = await runIngest(root, ["ingest", "start", "notes.md", "--json"], on("2026-10-20T09:00:00Z"));
    const b = await runIngest(twin, ["ingest", "start", "notes.md", "--json"], off("2026-10-20T09:00:00Z"));
    expect(a.json.ok).toBe(true);
    expect(b.json.ok).toBe(true);
    expect(f.urls).toEqual([REGISTRY]);
    expect(a.json.warnings.at(-1)).toBe(MSG);
    expect(a.json.warnings.slice(0, -1)).toEqual(b.json.warnings ?? []);
    expect(await norm(root, a.json.data)).toBe(await norm(twin, b.json.data));
    expect(await readSaved(root)).toEqual({ checked_at: "2026-10-20T09:00:00.000Z", installed: "0.4.0", latest: "0.4.1" });
    expect((await readFile(savedFile(root), "utf8")).endsWith("\n")).toBe(true);
    const id = a.json.data.id as string;
    expect(b.json.data.id).toBe(id);

    // 2. an hour later: no request
    const plan = await runIngest(root, ["ingest", "plan", "docs", "--json"], on("2026-10-20T10:00:00Z"));
    const abort = await runIngest(root, ["ingest", "abort", id, "--json"], on("2026-10-20T10:00:00Z"));
    const humanPlan = await runIngest(root, ["ingest", "plan", "docs"], on("2026-10-20T10:00:00Z"));
    const twinPlan = await runIngest(twin, ["ingest", "plan", "docs", "--json"], off("2026-10-20T10:00:00Z"));
    await runIngest(twin, ["ingest", "abort", id, "--json"], off("2026-10-20T10:00:00Z"));
    const twinHuman = await runIngest(twin, ["ingest", "plan", "docs"], off("2026-10-20T10:00:00Z"));
    expect(plan.json.ok).toBe(true);
    expect(abort.json.ok).toBe(true);
    expect(f.urls).toEqual([REGISTRY]);
    expect(plan.json.warnings).toEqual([MSG]);
    expect(twinPlan.json.warnings ?? []).toEqual([]);
    expect((abort.json.warnings ?? []).some((w: string) => w.includes("is available"))).toBe(false);
    expect(humanPlan.err).toContain(`warning: ${MSG}`);
    expect(await norm(root, humanPlan.text)).toBe(await norm(twin, twinHuman.text));

    // 3. 24 hours later and another installed version: one more request each
    const p3 = await runIngest(root, ["ingest", "plan", "docs", "--json"], on("2026-10-21T09:00:00Z"));
    expect(p3.json.ok).toBe(true);
    expect(f.urls).toHaveLength(2);
    const p4 = await runIngest(root, ["ingest", "plan", "docs", "--json"], on("2026-10-21T09:00:00Z", { installed: "0.4.1" }));
    expect(p4.json.ok).toBe(true);
    expect(f.urls).toHaveLength(3);
    expect((p4.json.warnings ?? []).some((w: string) => w.includes("is available"))).toBe(false);

    // 4. custom registry
    await rm(savedFile(root), { force: true });
    const g = latest041();
    const p5 = await runIngest(root, ["ingest", "plan", "docs", "--json"], {
      env: { npm_config_registry: "https://npm.example.com/repo" },
      fetch: g.fetch,
      now: at("2026-10-21T10:00:00Z"),
      installed: "0.4.0",
    });
    expect(p5.json.ok).toBe(true);
    expect(g.urls).toEqual(["https://npm.example.com/repo/wikeeper/latest"]);
  }, T);
});

describe("STORY-009-01 S2: when npm can't answer, ingest works as before and asks again only the next day", () => {
  const enotfound = () =>
    fake(() => Promise.reject(Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } })));
  const rows: Array<[string, () => Fake, NodeJS.ProcessEnv, number]> = [
    ["rejects with ENOTFOUND", enotfound, {}, 0],
    ["never settles", never, {}, 0],
    ["answers 404", () => answers("{}", 404), {}, 0],
    ["answers 200 with html", () => answers("<html></html>"), {}, 0],
    ["answers a malformed version", () => answers(JSON.stringify({ version: "0.4.1 && rm -rf ~" })), {}, 0],
    ["answers a body padded to 70,000 bytes", () => answers(JSON.stringify({ version: "0.4.1", pad: "x".repeat(70_000) })), {}, 0],
    ["is never called with a file: registry", latest041, { npm_config_registry: "file:///etc/passwd" }, 0],
    ["rejects with ENOTFOUND while .wiki/.cache is a regular file", enotfound, {}, 1],
  ];
  it.each(rows)("%s", async (name, make, envExtra, again) => {
    const root = await makeWiki();
    const twin = await makeWiki();
    const cacheIsFile = name.includes("regular file");
    if (cacheIsFile) {
      await rm(path.join(root, ".wiki", ".cache"), { recursive: true, force: true });
      await writeFile(path.join(root, ".wiki", ".cache"), "not a folder\n");
    }
    const f = make();
    const uc = (iso: string) => ({ env: envExtra, fetch: f.fetch, now: at(iso), installed: "0.4.0", timeoutMs: 200 });
    const a = await runIngest(root, ["ingest", "start", "notes.md", "--json"], uc("2026-10-20T09:00:00Z"));
    const b = await runIngest(twin, ["ingest", "start", "notes.md", "--json"], { env: OFF, now: at("2026-10-20T09:00:00Z"), installed: "0.4.0" });
    expect(a.json.ok).toBe(true);
    expect(a.code).toBe(b.code);
    expect(await norm(root, a.json.data)).toBe(await norm(twin, b.json.data));
    expect(a.json.warnings ?? []).toEqual(b.json.warnings ?? []);
    const callsAfterStart = f.urls.length;
    if (name.includes("file:")) expect(f.urls).toEqual([]);
    else expect(callsAfterStart).toBe(1);
    if (cacheIsFile) {
      expect(await readSaved(root)).toBeNull();
      expect(await readFile(path.join(root, ".wiki", ".cache"), "utf8")).toBe("not a folder\n");
    } else {
      const saved = await readSaved(root);
      expect(saved).not.toBeNull();
      expect(saved.latest).toBeNull();
    }
    const p = await runIngest(root, ["ingest", "plan", "docs", "--json"], uc("2026-10-20T10:00:00Z"));
    expect(p.json.ok).toBe(true);
    expect(f.urls.length - callsAfterStart).toBe(again);
    expect((p.json.warnings ?? []).some((w: string) => w.includes("is available"))).toBe(false);
  }, T);
});

describe("STORY-009-01 S3: the check is off", () => {
  type Row = { name: string; env: NodeJS.ProcessEnv; config?: string; set?: boolean; n: number; latest: string | null };
  const rows: Row[] = [
    { name: "config set update_check false", env: {}, set: true, n: 0, latest: null },
    { name: "config.yml has update_check: no", env: {}, config: "update_check: no\n", n: 0, latest: null },
    { name: "WIKEEPER_NO_UPDATE_CHECK=1", env: { WIKEEPER_NO_UPDATE_CHECK: "1" }, n: 0, latest: null },
    { name: "NO_UPDATE_NOTIFIER empty", env: { NO_UPDATE_NOTIFIER: "" }, n: 0, latest: null },
    { name: "CI=true", env: { CI: "true" }, n: 0, latest: null },
    { name: "CI=false and WIKEEPER_NO_UPDATE_CHECK=0 keep it on", env: { CI: "false", WIKEEPER_NO_UPDATE_CHECK: "0" }, n: 1, latest: "0.4.1" },
  ];
  it.each(rows)("$name", async (row) => {
    const root = await makeWiki(row.config ?? "");
    if (row.set) {
      const s = await runDefault(root, ["config", "set", "update_check", "false", "--json"]);
      expect(s.json.ok).toBe(true);
    }
    const f = latest041();
    const uc = { env: row.env, fetch: f.fetch, now: at("2026-10-20T09:00:00Z"), installed: "0.4.0" };
    const plan = await runIngest(root, ["ingest", "plan", "docs", "--json"], uc);
    const start = await runIngest(root, ["ingest", "start", "notes.md", "--json"], uc);
    if (row.config === undefined) {
      expect(plan.json.ok).toBe(true);
      expect(start.json.ok).toBe(true);
    }
    expect(f.urls).toHaveLength(row.n);
    if (row.n === 0) expect(await readSaved(root)).toBeNull();
    else expect((await readSaved(root)).latest).toBe("0.4.1");
    const st = await runStatus(root, ["status", "--json"], { installed: "0.4.0", env: row.env });
    expect(st.json.ok).toBe(true);
    expect(st.json.data.version.latest).toBe(row.latest);
  }, T);
});

describe("STORY-009-01 S4: status and doctor report versions from the manifest and the saved result, with no network", () => {
  type Row = {
    files: string;
    saved: "none" | "three-days" | "hour";
    latestSaved?: string;
    line: string | null;
    version: { installed: string; latest: string | null; files: string };
    mismatch: { severity: string; message?: string; fix?: string };
    available: { severity: string; message?: string; fix?: string };
  };
  const rows: Row[] = [
    {
      files: "0.3.0+a1b2c3d",
      saved: "none",
      line: "version: this project's wikeeper files are from 0.3.0 (installed 0.4.0): run wikeeper update",
      version: { installed: "0.4.0", latest: null, files: "0.3.0" },
      mismatch: { severity: "warning", message: "this project's wikeeper files are from 0.3.0 (installed 0.4.0)", fix: "run wikeeper update" },
      available: { severity: "info", message: "not checked yet: ingest commands ask npm at most once a day" },
    },
    {
      files: "0.5.0+dev",
      saved: "none",
      line: "version: this project was updated by wikeeper 0.5.0 (installed 0.4.0): run wikeeper upgrade",
      version: { installed: "0.4.0", latest: null, files: "0.5.0" },
      mismatch: { severity: "warning", message: "this project was updated by wikeeper 0.5.0 (installed 0.4.0)", fix: "run wikeeper upgrade" },
      available: { severity: "info" },
    },
    {
      files: "0.4.0+dev",
      saved: "three-days",
      latestSaved: "0.4.1",
      line: `version: ${MSG}`,
      version: { installed: "0.4.0", latest: "0.4.1", files: "0.4.0" },
      mismatch: { severity: "ok" },
      available: { severity: "warning", message: "wikeeper 0.4.1 is available (installed 0.4.0)", fix: "run wikeeper upgrade" },
    },
    {
      files: "0.4.0+abc1234",
      saved: "hour",
      latestSaved: "0.4.0",
      line: null,
      version: { installed: "0.4.0", latest: null, files: "0.4.0" },
      mismatch: { severity: "ok" },
      available: { severity: "ok" },
    },
  ];
  it.each(rows)("manifest $files, saved $saved", async (row) => {
    const root = await makeWiki();
    const manifestFile = path.join(root, ".wiki", "system", "manifest.json");
    const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
    manifest.package_version = row.files;
    await writeFile(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
    let checkedAt = "";
    if (row.saved !== "none") {
      const ms = row.saved === "hour" ? 3_600_000 : 3 * 86_400_000;
      checkedAt = new Date(Date.now() - ms).toISOString();
      await mkdir(path.dirname(savedFile(root)), { recursive: true });
      await writeFile(savedFile(root), JSON.stringify({ checked_at: checkedAt, installed: "0.4.0", latest: row.latestSaved }, null, 2) + "\n");
    }
    const throwing = vi.fn(() => {
      throw new Error("network used");
    });
    vi.stubGlobal("fetch", throwing);
    const deps = { installed: "0.4.0", env: {} };

    const human = await runStatus(root, ["status"], deps);
    expect(human.code).toBe(0);
    const lines = human.text.trimEnd().split("\n");
    if (row.line !== null) expect(lines.at(-1)).toBe(row.line);
    else expect(lines.some((l) => l.startsWith("version: "))).toBe(false);
    const st = await runStatus(root, ["status", "--json"], deps);
    expect(st.json.ok).toBe(true);
    expect(st.json.data.version).toEqual(row.version);

    const doc = await runDoctor(root, ["doctor", "--json"], deps);
    expect(doc.code).toBe(0);
    const checks = doc.json.data.checks as Array<{ id: string; severity: string; message: string; fix?: string }>;
    const ids = checks.map((c) => c.id);
    expect(ids.slice(-2)).toEqual(["version-mismatch", "update-available"]);
    const mm = checks.find((c) => c.id === "version-mismatch")!;
    const av = checks.find((c) => c.id === "update-available")!;
    expect(mm.severity).toBe(row.mismatch.severity);
    if (row.mismatch.message) expect(mm.message).toBe(row.mismatch.message);
    if (row.mismatch.fix) expect(mm.fix).toBe(row.mismatch.fix);
    expect(av.severity).toBe(row.available.severity);
    if (row.available.message) expect(av.message).toBe(row.available.message);
    if (row.available.fix) expect(av.fix).toBe(row.available.fix);
    if (row.saved === "hour") expect(av.message).toBe(`no newer version known (checked ${checkedAt})`);
    if (row.files.startsWith("0.4.0")) expect(mm.message).toBe("the project's files are from 0.4.0, the installed version");
    expect(throwing).not.toHaveBeenCalled();
    await stat(root);
  }, T);
});
