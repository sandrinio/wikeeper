// src/core/version.ts — Contract C4 (owner STORY-001-10). Consumer: STORY-003-10.
import { readFileSync } from "node:fs";
import { readPackageVersion } from "./templates.js";

const COMMIT = /^[0-9a-f]{7,64}$/;

/** The commit stamped into dist/build-info.json by scripts/build-info.mjs, or null. Never throws. */
export function buildCommit(file: URL = new URL("../build-info.json", import.meta.url)): string | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (parsed === null || typeof parsed !== "object") return null;
    const commit = (parsed as { commit?: unknown }).commit;
    return typeof commit === "string" && COMMIT.test(commit) ? commit : null;
  } catch {
    return null;
  }
}

export function versionString(pkg: string, commit: string | null): string {
  return `${pkg}+${commit ?? "dev"}`;
}

export function fullVersion(): string {
  return versionString(readPackageVersion(), buildCommit());
}

/** The registry version: v without its "+…" build part. */
export function npmVersion(v: string): string {
  return v.replace(/\+.*$/, "");
}

export function compareVersions(a: string, b: string): number | null {
  const re = /^v?(\d+)\.(\d+)\.(\d+)/;
  const ma = re.exec(a);
  const mb = re.exec(b);
  if (!ma || !mb) return null;
  for (let i = 1; i <= 3; i++) {
    const d = Number(ma[i]) - Number(mb[i]);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}
