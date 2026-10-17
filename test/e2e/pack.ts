import { execFileSync } from "node:child_process";
import { cp, mkdtemp, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Builds the package into a staging directory (never the repository's dist/, so parallel e2e files cannot race),
 * packs it with npm, extracts the tarball and returns the path to the packed cli.js.
 */
export async function packCli(): Promise<{ cli: string; cleanup(): Promise<void> }> {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "wikeeper-pack-"));
  const cleanup = async (): Promise<void> => {
    await rm(tmp, { recursive: true, force: true, maxRetries: 3 });
  };
  try {
    const build = path.join(tmp, "build");
    execFileSync(
      process.execPath,
      [path.join(PKG_ROOT, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.build.json", "--outDir", build],
      { cwd: PKG_ROOT, stdio: "pipe" },
    );
    execFileSync(process.execPath, [path.join(PKG_ROOT, "scripts", "build-info.mjs"), build], {
      cwd: PKG_ROOT,
      stdio: "pipe",
    });
    const stage = path.join(tmp, "stage");
    await cp(build, path.join(stage, "dist"), { recursive: true });
    await cp(path.join(PKG_ROOT, "templates"), path.join(stage, "templates"), { recursive: true });
    await cp(path.join(PKG_ROOT, "package.json"), path.join(stage, "package.json"));
    // Never spawn npm / npm.cmd directly: Node >= 20 rejects .cmd without a shell on Windows (EINVAL).
    const npmExec = process.env["npm_execpath"];
    const packArgs = ["pack", "--json", "--pack-destination", tmp];
    const packed = npmExec
      ? execFileSync(process.execPath, [npmExec, ...packArgs], { cwd: stage, encoding: "utf8" })
      : execFileSync("npm", packArgs, { cwd: stage, encoding: "utf8", shell: true });
    const info = JSON.parse(packed) as Array<{ filename: string }>;
    execFileSync("tar", ["-xzf", path.join(tmp, info[0]!.filename), "-C", tmp]);
    await symlink(path.join(PKG_ROOT, "node_modules"), path.join(tmp, "package", "node_modules"), "junction");
    return { cli: path.join(tmp, "package", "dist", "cli.js"), cleanup };
  } catch (err) {
    await cleanup();
    throw err;
  }
}
