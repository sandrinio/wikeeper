import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { createUpdateCommand, formatBackupStamp, runUpdate } from "../src/commands/update.js";
import { resetIntegrations } from "../src/core/integrations.js";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const cleanup: string[] = [];
afterEach(async () => {
  resetIntegrations();
  while (cleanup.length) await rm(cleanup.pop()!, { recursive: true, force: true });
});

async function tmp(): Promise<string> {
  const d = await mkdtemp(path.join(os.tmpdir(), "wikeeper-updunit-"));
  cleanup.push(d);
  return d;
}
const sink = () => new Writable({ write: (_c, _e, cb) => cb() });
const run = (cwd: string) => ({
  flags: {},
  json: true,
  interactive: false,
  io: { cwd, stdout: sink(), stderr: sink(), stdin: Readable.from([]) as never },
});

describe("update unit", () => {
  it("formatBackupStamp is UTC digits", () => {
    expect(formatBackupStamp(new Date(Date.UTC(2026, 0, 2, 3, 4, 5)))).toBe("20260102030405");
  });

  it("computes change set and backs up an unmanaged file at a new package path", async () => {
    const root = await tmp();
    const tpl = await tmp();
    await mkdir(path.join(root, ".git"));
    await mkdir(path.join(root, ".wiki", "system"), { recursive: true });
    await mkdir(path.join(tpl, "system"), { recursive: true });
    await writeFile(path.join(tpl, "system", "NEW.md"), "new\n");
    await writeFile(path.join(root, ".wiki", "system", "NEW.md"), "mine\n");
    await writeFile(
      path.join(root, ".wiki", "system", "manifest.json"),
      JSON.stringify({ package_version: "0.0.1", files: [] }),
    );
    const now = () => new Date(Date.UTC(2026, 0, 1));
    const r = await runUpdate(root, run(root), { templatesDir: tpl, packageVersion: "1.0.0", now });
    expect(r.added).toEqual([".wiki/system/NEW.md"]);
    expect(r.backed_up).toEqual([".wiki/system/NEW.md.bak-20260101000000"]);
    expect(await readFile(path.join(root, ".wiki/system/NEW.md.bak-20260101000000"), "utf8")).toBe("mine\n");
    const m = JSON.parse(await readFile(path.join(root, ".wiki/system/manifest.json"), "utf8"));
    expect(m.files[0].sha256).toBe(sha("new\n"));
    expect(typeof createUpdateCommand().register).toBe("function");
  });
});
