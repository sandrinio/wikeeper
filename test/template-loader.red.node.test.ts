import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const tmpDirs: string[] = [];
async function tmp(): Promise<string> {
  const d = await mkdtemp(path.join(os.tmpdir(), "wk-tpl-"));
  tmpDirs.push(d);
  return d;
}
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});

const load = () => import("../src/core/templates.js");

async function writePkg(dir: string, name: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "package.json"), JSON.stringify({ name }));
}

describe("templates: package root resolution (Gherkin: Templates resolve from every layout)", () => {
  const layouts = ["src/core", "dist/core", "node_modules/wikeeper/dist/core"];
  for (const layout of layouts) {
    it(`templatesDir resolves from ${layout}`, async () => {
      const { templatesDir, findPackageRoot } = await load();
      const base = await tmp();
      let pkgRoot = base;
      if (layout.startsWith("node_modules")) {
        await writePkg(base, "some-other-package");
        pkgRoot = path.join(base, "node_modules", "wikeeper");
      }
      await writePkg(pkgRoot, "wikeeper");
      const modDir = path.join(base, ...layout.split("/"));
      await mkdir(modDir, { recursive: true });
      const url = pathToFileURL(path.join(modDir, "templates.js")).href;
      expect(findPackageRoot(url)).toBe(pkgRoot);
      expect(templatesDir(url)).toBe(path.join(pkgRoot, "templates"));
    });
  }

  it("findPackageRoot accepts a plain path", async () => {
    const { findPackageRoot } = await load();
    const base = await tmp();
    await writePkg(base, "wikeeper");
    const sub = path.join(base, "src", "core");
    await mkdir(sub, { recursive: true });
    expect(findPackageRoot(path.join(sub, "templates.ts"))).toBe(base);
  });

  it("skips package.json files with a different name", async () => {
    const { findPackageRoot } = await load();
    const base = await tmp();
    await writePkg(base, "wikeeper");
    const inner = path.join(base, "packages", "inner");
    await writePkg(inner, "not-wikeeper");
    expect(findPackageRoot(pathToFileURL(path.join(inner, "x.js")).href)).toBe(base);
  });

  it("throws E_PACKAGE_ROOT_NOT_FOUND when no wikeeper package.json is above", async () => {
    const { findPackageRoot } = await load();
    const base = await tmp();
    await writePkg(base, "unrelated");
    const sub = path.join(base, "a", "b");
    await mkdir(sub, { recursive: true });
    expect(() => findPackageRoot(pathToFileURL(path.join(sub, "m.js")).href)).toThrowError(
      expect.objectContaining({ code: "E_PACKAGE_ROOT_NOT_FOUND" }),
    );
  });

  it("exports PACKAGE_NAME", async () => {
    const { PACKAGE_NAME } = await load();
    expect(PACKAGE_NAME).toBe("wikeeper");
  });
});

describe("templates: listing and copying", () => {
  it("listTemplateFiles returns sorted posix paths with subdir prefix, skipping junk", async () => {
    const { listTemplateFiles } = await load();
    const base = await tmp();
    const sys = path.join(base, "system");
    await mkdir(path.join(sys, "sub"), { recursive: true });
    await writeFile(path.join(sys, "b.md"), "b");
    await writeFile(path.join(sys, "a.md"), "a");
    await writeFile(path.join(sys, "Z.md"), "Z");
    await writeFile(path.join(sys, "sub", "c.md"), "c");
    await writeFile(path.join(sys, ".DS_Store"), "x");
    await writeFile(path.join(sys, "sub", "Thumbs.db"), "x");
    await writeFile(path.join(base, "agent-block.md"), "root file");
    expect(await listTemplateFiles("system", base)).toEqual([
      "system/Z.md",
      "system/a.md",
      "system/b.md",
      "system/sub/c.md",
    ]);
  });

  it("listTemplateFiles throws E_TEMPLATE_NOT_FOUND for a missing subdir", async () => {
    const { listTemplateFiles } = await load();
    const base = await tmp();
    await expect(listTemplateFiles("nope", base)).rejects.toMatchObject({ code: "E_TEMPLATE_NOT_FOUND" });
  });

  it("copyTemplate creates parents, copies bytes, reports sha256", async () => {
    const { copyTemplate } = await load();
    const base = await tmp();
    await mkdir(path.join(base, "system"), { recursive: true });
    const bytes = Buffer.from([0xef, 0xbb, 0xbf, 0x61, 0x0d, 0x0a, 0xff, 0x00]);
    await writeFile(path.join(base, "system", "X.md"), bytes);
    const dest = path.join(await tmp(), "deep", "er", "X.md");
    const res = await copyTemplate("system/X.md", dest, base);
    expect(res.written).toBe(true);
    expect(res.sha256).toMatch(/^[0-9a-f]{64}$/);
    const { createHash } = await import("node:crypto");
    expect(res.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(Buffer.compare(await readFile(dest), bytes)).toBe(0);
  });

  it("copyTemplate does not rewrite identical bytes (mtime kept)", async () => {
    const { copyTemplate } = await load();
    const base = await tmp();
    await mkdir(path.join(base, "system"), { recursive: true });
    await writeFile(path.join(base, "system", "X.md"), "same\n");
    const dest = path.join(await tmp(), "X.md");
    await copyTemplate("system/X.md", dest, base);
    const old = new Date(2020, 0, 1);
    await utimes(dest, old, old);
    const res = await copyTemplate("system/X.md", dest, base);
    expect(res.written).toBe(false);
    expect((await stat(dest)).mtimeMs).toBe(old.getTime());
  });

  it("copyTemplate overwrites differing bytes", async () => {
    const { copyTemplate } = await load();
    const base = await tmp();
    await mkdir(path.join(base, "system"), { recursive: true });
    await writeFile(path.join(base, "system", "X.md"), "new\n");
    const dest = path.join(await tmp(), "X.md");
    await writeFile(dest, "old\n");
    const res = await copyTemplate("system/X.md", dest, base);
    expect(res.written).toBe(true);
    expect(await readFile(dest, "utf8")).toBe("new\n");
  });

  it("copyTemplate throws E_TEMPLATE_NOT_FOUND for a missing source", async () => {
    const { copyTemplate } = await load();
    const base = await tmp();
    await expect(copyTemplate("system/missing.md", path.join(base, "o.md"), base)).rejects.toMatchObject({
      code: "E_TEMPLATE_NOT_FOUND",
    });
  });
});

describe("templates: shipped placeholders (Gherkin: The published package ships the templates)", () => {
  it("listTemplateFiles('system') lists the two placeholder templates", async () => {
    const { listTemplateFiles, templatesDir } = await load();
    const files = await listTemplateFiles("system");
    expect(files).toEqual(expect.arrayContaining(["system/SETUP.md", "system/WIKI.md"]));
    for (const f of files) {
      const text = await readFile(path.join(templatesDir(), ...f.split("/")), "utf8");
      expect(text.includes("\r")).toBe(false);
      expect(text.endsWith("\n")).toBe(true);
    }
  });

  it("npm pack --dry-run lists templates/system/SETUP.md and WIKI.md", () => {
    const out = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
      cwd: path.resolve(import.meta.dirname, ".."),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 60_000,
      shell: process.platform === "win32",
    });
    const parsed = JSON.parse(out) as Array<{ files: Array<{ path: string }> }>;
    const paths = parsed[0]!.files.map((f) => f.path.replace(/\\/g, "/"));
    expect(paths).toContain("templates/system/SETUP.md");
    expect(paths).toContain("templates/system/WIKI.md");
  }, 60_000);
});
