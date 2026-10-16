import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PACKAGE_NAME = "wikeeper";

export interface CopyTemplateResult {
  written: boolean;
  sha256: string;
}

const SKIP = new Set([".DS_Store", "Thumbs.db"]);

function codedError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

function isWikeeperPackage(dir: string): boolean {
  const file = path.join(dir, "package.json");
  if (!existsSync(file)) return false;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { name?: unknown };
    return parsed.name === PACKAGE_NAME;
  } catch {
    return false;
  }
}

export function findPackageRoot(fromUrl: string = import.meta.url): string {
  const start = fromUrl.startsWith("file:") ? fileURLToPath(fromUrl) : fromUrl;
  let dir = path.dirname(path.resolve(start));
  for (;;) {
    if (isWikeeperPackage(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw codedError("E_PACKAGE_ROOT_NOT_FOUND", `No "${PACKAGE_NAME}" package.json found above ${start}`);
    }
    dir = parent;
  }
}

export function templatesDir(fromUrl?: string): string {
  return path.join(findPackageRoot(fromUrl), "templates");
}

async function walk(baseDir: string, rel: string, out: string[]): Promise<void> {
  const entries = await readdir(path.join(baseDir, ...rel.split("/")), { withFileTypes: true });
  for (const e of entries) {
    if (SKIP.has(e.name)) continue;
    const childRel = `${rel}/${e.name}`;
    if (e.isDirectory()) await walk(baseDir, childRel, out);
    else if (e.isFile()) out.push(childRel);
  }
}

export async function listTemplateFiles(subdir: string, baseDir: string = templatesDir()): Promise<string[]> {
  const rel = subdir.split(path.sep).join("/").replace(/\/+$/, "");
  const out: string[] = [];
  try {
    await walk(baseDir, rel, out);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT" || (err as NodeJS.ErrnoException).code === "ENOTDIR") {
      throw codedError("E_TEMPLATE_NOT_FOUND", `Template directory not found: ${rel}`);
    }
    throw err;
  }
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export async function copyTemplate(
  rel: string,
  dest: string,
  baseDir: string = templatesDir(),
): Promise<CopyTemplateResult> {
  let bytes: Buffer;
  try {
    bytes = await readFile(path.join(baseDir, ...rel.split("/")));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "EISDIR" || code === "ENOTDIR") {
      throw codedError("E_TEMPLATE_NOT_FOUND", `Template not found: ${rel}`);
    }
    throw err;
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  let existing: Buffer | null = null;
  try {
    existing = await readFile(dest);
  } catch {
    existing = null;
  }
  if (existing && existing.equals(bytes)) return { written: false, sha256 };
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, bytes);
  return { written: true, sha256 };
}
