import { mkdtemp, copyFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startFixtureServer, type FixtureServer } from "../read/http-server.js";
import { traceCli } from "./module-trace.js";
import { packCli } from "./pack.js";

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "read");
let cli = "";
let cleanup: () => Promise<void> = async () => {};
let server: FixtureServer;
const dirs: string[] = [];

beforeAll(async () => {
  const packed = await packCli();
  cli = packed.cli;
  cleanup = packed.cleanup;
  server = await startFixtureServer();
}, 180_000);

afterAll(async () => {
  await server.close();
  await cleanup();
  for (const d of dirs) await rm(d, { recursive: true, force: true, maxRetries: 3 });
}, 120_000);

describe("STORY-003-10 S3: the read libraries load only for HTML; the packed package declares them", () => {
  it("--help and ingest --help load none; read article.html loads linkedom and defuddle", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "wk-e2e-read-"));
    dirs.push(cwd);
    await copyFile(path.join(FIXTURES, "article.html"), path.join(cwd, "article.html"));
    const banned = ["node_modules/linkedom/", "node_modules/defuddle/", "node_modules/turndown/"];
    for (const args of [["--help"], ["ingest", "--help"]]) {
      const r = await traceCli(cli, args, cwd);
      expect(r.code).toBe(0);
      const paths = r.resolved.map((u) => u.replace(/\\/g, "/"));
      for (const b of banned) expect(paths.some((p) => p.includes(b)), `${args.join(" ")} loaded ${b}`).toBe(false);
    }
    const read = await traceCli(cli, ["read", "article.html"], cwd);
    expect(read.code).toBe(0);
    expect(read.stdout.startsWith("# Q4 status")).toBe(true);
    const paths = read.resolved.map((u) => u.replace(/\\/g, "/"));
    expect(paths.some((p) => p.includes("node_modules/linkedom/"))).toBe(true);
    expect(paths.some((p) => p.includes("node_modules/defuddle/"))).toBe(true);
  }, 120_000);

  it("the packed package.json lists the three libraries under dependencies", async () => {
    const pkg = JSON.parse(await readFile(path.join(path.dirname(cli), "..", "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies).toMatchObject({ linkedom: "^0.18.13", defuddle: "^0.19.5", turndown: "^7.2.4" });
  });
});
