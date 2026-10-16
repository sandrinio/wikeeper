import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export type ManifestKind =
  | "system"
  | "file"
  | "dir"
  | "block"
  | "skill"
  | "subagent"
  | "link"
  | "gitignore"
  | "hook"
  | "rule";

export interface ManifestEntry {
  path: string;
  sha256: string | null;
  kind: ManifestKind;
  agent?: string;
  mode?: "symlink" | "copy";
  created?: boolean;
  identity?: string;
}

export interface Manifest {
  package_version: string;
  files: ManifestEntry[];
}

export type DriftStatus = "ok" | "modified" | "missing";
export interface ManifestDiffEntry extends ManifestEntry {
  status: DriftStatus;
}

const KINDS: readonly string[] = [
  "system", "file", "dir", "block", "skill", "subagent", "link", "gitignore", "hook", "rule",
];

function invalid(message: string): Error {
  return Object.assign(new Error(`Invalid manifest: ${message}`), { code: "E_MANIFEST_INVALID" });
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(file);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function canonicalEntry(e: ManifestEntry): ManifestEntry {
  const out: ManifestEntry = { path: e.path, sha256: e.sha256, kind: e.kind };
  if (e.agent !== undefined) out.agent = e.agent;
  if (e.mode !== undefined) out.mode = e.mode;
  if (e.created !== undefined) out.created = e.created;
  if (e.identity !== undefined) out.identity = e.identity;
  return out;
}

export function serializeManifest(manifest: Manifest): string {
  const files = manifest.files
    .map(canonicalEntry)
    .sort((a, b) => cmp(a.path, b.path) || cmp(a.kind, b.kind) || cmp(a.identity ?? "", b.identity ?? ""));
  return JSON.stringify({ package_version: manifest.package_version, files }, null, 2) + "\n";
}

export async function writeManifest(manifest: Manifest, file: string): Promise<boolean> {
  const text = serializeManifest(manifest);
  const bytes = Buffer.from(text, "utf8");
  try {
    if ((await readFile(file)).equals(bytes)) return false;
  } catch {
    // absent or unreadable: write below
  }
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
  return true;
}

function parseEntry(raw: unknown, i: number): ManifestEntry {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw invalid(`files[${i}] is not an object`);
  const r = raw as Record<string, unknown>;
  if (typeof r.path !== "string") throw invalid(`files[${i}].path must be a string`);
  if (r.sha256 !== null && (typeof r.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(r.sha256))) {
    throw invalid(`files[${i}].sha256 must be null or 64 lowercase hex characters`);
  }
  if (typeof r.kind !== "string" || !KINDS.includes(r.kind)) throw invalid(`files[${i}].kind is unknown`);
  const entry: ManifestEntry = { path: r.path, sha256: r.sha256, kind: r.kind as ManifestKind };
  if (r.agent !== undefined) {
    if (typeof r.agent !== "string") throw invalid(`files[${i}].agent must be a string`);
    entry.agent = r.agent;
  }
  if (r.mode !== undefined) {
    if (r.mode !== "symlink" && r.mode !== "copy") throw invalid(`files[${i}].mode must be symlink or copy`);
    entry.mode = r.mode;
  }
  if (r.created !== undefined) {
    if (typeof r.created !== "boolean") throw invalid(`files[${i}].created must be a boolean`);
    entry.created = r.created;
  }
  if (r.identity !== undefined) {
    if (typeof r.identity !== "string") throw invalid(`files[${i}].identity must be a string`);
    entry.identity = r.identity;
  }
  return entry;
}

export async function readManifest(file: string): Promise<Manifest | null> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw invalid((err as Error).message);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw invalid("root is not an object");
  const p = parsed as Record<string, unknown>;
  if (typeof p.package_version !== "string") throw invalid("package_version must be a string");
  if (!Array.isArray(p.files)) throw invalid("files must be an array");
  return { package_version: p.package_version, files: p.files.map(parseEntry) };
}

export async function diffManifest(manifest: Manifest, root: string): Promise<ManifestDiffEntry[]> {
  const out: ManifestDiffEntry[] = [];
  for (const entry of manifest.files) {
    const abs = path.join(root, ...entry.path.split("/"));
    let status: DriftStatus;
    if (entry.sha256 === null) {
      try {
        await lstat(abs);
        status = "ok";
      } catch {
        status = "missing";
      }
    } else {
      try {
        const s = await stat(abs);
        if (!s.isFile()) status = "modified";
        else status = (await sha256File(abs)) === entry.sha256 ? "ok" : "modified";
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "ENOTDIR") status = "missing";
        else throw err;
      }
    }
    out.push({ ...entry, status });
  }
  return out;
}
