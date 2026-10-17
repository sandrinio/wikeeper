import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createProgram, VERSION } from "../src/program.js";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string; homepage?: string };

function run(args: string[]) {
  let out = "";
  const program = createProgram()
    .exitOverride()
    .configureOutput({ writeOut: (text) => (out += text) });
  const result = program.parseAsync(["node", "wikeeper", ...args]);
  return { result, output: () => out };
}

describe("wikeeper CLI", () => {
  it("reports the version from package.json", async () => {
    const { result, output } = run(["--version"]);
    await expect(result).rejects.toMatchObject({ code: "commander.version" });
    expect(VERSION).toBe(`${packageJson.version}+dev`);
    expect(output().trim()).toBe(`${packageJson.version}+dev`);
  });

  it("prints help with the pre-alpha notice", async () => {
    const { result, output } = run(["--help"]);
    await expect(result).rejects.toMatchObject({ code: "commander.helpDisplayed" });
    expect(output()).toContain("Usage: wikeeper");
    expect(output()).toContain("pre-alpha");
    expect(output()).toContain(`Version ${VERSION}`);
    expect(output()).toContain(packageJson.homepage!);
    expect(output()).not.toContain("Commands land");
  });

  it("prints help when run without arguments", async () => {
    const { result, output } = run([]);
    await result;
    expect(output()).toContain("Usage: wikeeper");
  });
});
