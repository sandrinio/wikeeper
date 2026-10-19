import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import {
  OWN_LINE_RE,
  appendExclude,
  defaultUserSettingsFile,
  installCommand,
  pickDir,
  readBounded,
  shownUserFile,
} from "../src/commands/statusline.js";

const dirs: string[] = [];
afterEach(async () => {
  while (dirs.length) await rm(dirs.pop()!, { recursive: true, force: true });
});

describe("pickDir", () => {
  const cwd = path.resolve("/base/cwd");
  it("prefers workspace.current_dir, then cwd, else ctx.cwd", () => {
    expect(pickDir(JSON.stringify({ workspace: { current_dir: "/a" }, cwd: "/b" }), cwd)).toBe(path.resolve("/a"));
    expect(pickDir(JSON.stringify({ cwd: "/b" }), cwd)).toBe(path.resolve("/b"));
    expect(pickDir(JSON.stringify({ workspace: { current_dir: "" }, cwd: "/b" }), cwd)).toBe(path.resolve("/b"));
    expect(pickDir(JSON.stringify({ other: 1 }), cwd)).toBe(cwd);
    expect(pickDir("not json", cwd)).toBe(cwd);
    expect(pickDir(null, cwd)).toBe(cwd);
  });
  it("resolves a relative current_dir against ctx.cwd", () => {
    expect(pickDir(JSON.stringify({ workspace: { current_dir: "notes" } }), cwd)).toBe(path.join(cwd, "notes"));
  });
});

describe("readBounded", () => {
  it("stops after the timeout on a stream that never ends", async () => {
    const s = new PassThrough();
    const t0 = Date.now();
    expect(await readBounded(s, 1024, 50)).toBeNull();
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(s.destroyed).toBe(true);
  });
  it("returns the text when the stream ends in time", async () => {
    const s = new PassThrough();
    s.end("{}");
    expect(await readBounded(s, 1024, 500)).toBe("{}");
  });
});

describe("installCommand", () => {
  it("spells each form", () => {
    expect(installCommand("path", "/r", "0.4.0")).toBe("wikeeper statusline");
    expect(installCommand("local", "/my root", "0.4.0")).toBe('"/my root/node_modules/.bin/wikeeper" statusline');
    expect(installCommand("npx", "/r", "0.4.0+abc123")).toBe("npx -y wikeeper@0.4.0 statusline");
  });
});

describe("OWN_LINE_RE", () => {
  it("accepts wikeeper's own forms and rejects others", () => {
    for (const c of ["wikeeper statusline", "npx -y wikeeper@0.4.0 statusline", '"/x/node_modules/.bin/wikeeper" statusline']) {
      expect(OWN_LINE_RE.test(c)).toBe(true);
    }
    for (const c of ["~/.claude/statusline.sh", "wikeeper status"]) expect(OWN_LINE_RE.test(c)).toBe(false);
  });
});

describe("user settings file", () => {
  it("shows the home directory as ~", () => {
    expect(shownUserFile(path.join("/h", ".claude", "settings.json"), path.join("/h"))).toBe("~/.claude/settings.json");
    expect(shownUserFile("/elsewhere/settings.json", "/h")).toBe("/elsewhere/settings.json");
  });
  it("honours CLAUDE_CONFIG_DIR", () => {
    expect(defaultUserSettingsFile({ CLAUDE_CONFIG_DIR: "/cfg" })).toBe(path.join("/cfg", "settings.json"));
    expect(defaultUserSettingsFile({ CLAUDE_CONFIG_DIR: "" })).toBe(path.join(os.homedir(), ".claude", "settings.json"));
  });
});

describe("appendExclude", () => {
  it("appends with and without a final newline", async () => {
    const d = await mkdtemp(path.join(os.tmpdir(), "wikeeper-sl-unit-"));
    dirs.push(d);
    const a = path.join(d, "info", "a");
    await appendExclude(a, "/x");
    expect(await readFile(a, "utf8")).toBe("/x\n");
    const b = path.join(d, "b");
    await writeFile(b, "keep");
    await appendExclude(b, "/x");
    expect(await readFile(b, "utf8")).toBe("keep\n/x\n");
    const c = path.join(d, "c");
    await writeFile(c, "keep\n");
    await appendExclude(c, "/x");
    expect(await readFile(c, "utf8")).toBe("keep\n/x\n");
  });
});
