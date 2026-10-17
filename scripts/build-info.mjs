// Writes <out-dir>/build-info.json with the short commit the build was made from, or null when git cannot name one.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const outDir = process.argv[2];
if (!outDir) {
  console.error("usage: node scripts/build-info.mjs <out-dir>");
  process.exit(1);
}

let commit = null;
try {
  const out = execFileSync("git", ["rev-parse", "--short=7", "HEAD"], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 10_000,
    windowsHide: true,
  }).trim();
  if (/^[0-9a-f]{7,64}$/.test(out)) commit = out;
} catch {
  commit = null;
}

mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "build-info.json"), JSON.stringify({ commit }) + "\n");
