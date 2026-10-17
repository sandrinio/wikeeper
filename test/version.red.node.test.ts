import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProgram } from "../src/program.js";

// STORY-001-10 QA-Red. src/core/version.ts does not exist yet: literal dynamic import.
async function loadVersion() {
  return await import("../src/core/version.js");
}
async function loadGuard() {
  return await import("../src/agents/enforce/guard-command.js");
}

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
  homepage?: string;
};

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "wk-version-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function runProgram(args: string[]) {
  let out = "";
  const program = createProgram()
    .exitOverride()
    .configureOutput({ writeOut: (t) => (out += t) });
  const result = program.parseAsync(["node", "wikeeper", ...args]);
  return { result, output: () => out };
}

describe("version string (R3)", () => {
  it("versionString joins version and commit, or +dev for null", async () => {
    const v = await loadVersion();
    expect(v.versionString("0.3.0", "a0f0550")).toBe("0.3.0+a0f0550");
    expect(v.versionString("0.3.0", null)).toBe("0.3.0+dev");
  });

  it("buildCommit reads a valid stamp", async () => {
    const v = await loadVersion();
    const file = path.join(dir, "build-info.json");
    await writeFile(file, '{"commit":"a0f0550"}\n');
    expect(v.buildCommit(pathToFileURL(file))).toBe("a0f0550");
  });

  it.each([
    ["is missing", null],
    ["contains { not json", "{ not json"],
    ["contains an invalid commit", '{"commit":"../../x"}'],
    ["is a JSON null", "null"],
    ["has a non-string commit", '{"commit":42}'],
  ])("buildCommit gives null when the stamp %s", async (_name, content) => {
    const v = await loadVersion();
    const file = path.join(dir, "build-info.json");
    if (content !== null) await writeFile(file, content);
    expect(v.buildCommit(pathToFileURL(file))).toBeNull();
  });

  it("fullVersion from source is <package.json version>+dev", async () => {
    const v = await loadVersion();
    expect(v.fullVersion()).toBe(`${pkg.version}+dev`);
  });

  it("wikeeper --version prints <package.json version>+dev from source", async () => {
    const { result, output } = runProgram(["--version"]);
    await expect(result).rejects.toMatchObject({ code: "commander.version" });
    expect(output().trim()).toBe(`${pkg.version}+dev`);
  });
});

describe("npx pin (R5)", () => {
  it("npmVersion drops the build part", async () => {
    const v = await loadVersion();
    expect(v.npmVersion("0.3.0+a0f0550")).toBe("0.3.0");
    expect(v.npmVersion("0.3.0+dev")).toBe("0.3.0");
    expect(v.npmVersion("0.3.0")).toBe("0.3.0");
  });

  it("guardCommand pins the npx version without the build part", async () => {
    const g = await loadGuard();
    expect(g.guardCommand("npx", "claude", "0.3.0+a0f0550")).toBe(
      "npx -y wikeeper@0.3.0 hook guard --agent claude",
    );
    expect(g.guardCommand("npx", "codex", "1.2.3")).toBe("npx -y wikeeper@1.2.3 hook guard --agent codex");
  });
});

describe("help footer (R6)", () => {
  it("ends with the version and docs line, without the old phrase", async () => {
    const { result, output } = runProgram(["--help"]);
    await expect(result).rejects.toMatchObject({ code: "commander.helpDisplayed" });
    const text = output();
    expect(text).not.toContain("Commands land in upcoming releases");
    const last = text.trimEnd().split("\n").pop();
    expect(last).toBe(
      `Status: pre-alpha. Version ${pkg.version}+dev. Docs: https://github.com/sandrinio/wikeeper#readme`,
    );
    expect(/^[\x00-\x7f]*$/.test(text)).toBe(true);
  });
});
