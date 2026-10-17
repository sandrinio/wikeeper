// Contract C3 — owner STORY-003-01. The raw/ registry: immutable sources keyed by id, plus duplicate lookup.
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { compareCodeUnits } from "../core/compare.js";
import type { IngestPermission } from "../core/config.js";
import { ExitCode, WikeeperError } from "../core/exit-codes.js";
import { sha256File } from "../core/manifest.js";
import { isInside, toPosixRelative } from "../core/paths.js";
import type { ResolvedPaths } from "../core/paths.js";
import { stripBom } from "../core/text.js";
import type { WhitelistMatch } from "./permissions.js";
import { isSourceId, makeSourceId } from "./source-id.js";

export type OriginType = "file" | "url" | "stdin";
export interface SourcePermission {
  mode: IngestPermission;
  approved: boolean; // --approved was passed
  matched: WhitelistMatch | null;
  kind_pending: boolean; // whitelist kind still to be checked at `ingest facts`
}
export interface SourceMeta {
  id: string;
  origin: string; // repo-relative POSIX path | absolute POSIX path | normalized URL | "stdin"
  origin_type: OriginType;
  kind: string | null; // normalized kind id from --kind, else null
  provided_by: "user" | "agent";
  captured_at: string; // ISO-8601 UTC
  size: number; // bytes of the original, or of the text when original is null
  sha256: string; // hash of the same bytes
  rule_version: number | null;
  original: string | null; // raw file name, e.g. "src-2026-10-16-q4.pdf"
  text: string | null; // "src-2026-10-16-q4.md" when agent/excerpt text is stored
  reingest_of: string | null;
  permission: SourcePermission;
}
export interface RegisterInput {
  originType: OriginType;
  origin: string;
  label: string;
  originalPath: string | null;
  text: string | null;
  kind: string | null;
  providedBy: "user" | "agent";
  ruleVersion: number | null;
  reingestOf: string | null;
  permission: SourcePermission;
  now?: Date;
}
export interface DuplicateMatch {
  meta: SourceMeta;
  match: "sha256" | "origin";
}

const MAX_ATTEMPTS = 5;

export function fileOrigin(root: string, absPath: string): string {
  if (isInside(root, absPath)) return toPosixRelative(root, absPath);
  return absPath.split(path.sep).join("/");
}

export function normalizeUrl(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new WikeeperError(ExitCode.USAGE, "usage", `not a valid URL: ${url}`);
  }
  u.hash = "";
  return u.href;
}

export function hashText(text: string): { sha256: string; size: number } {
  const bytes = Buffer.from(text, "utf8");
  return { sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length };
}

export async function hashSource(
  input: Pick<RegisterInput, "originalPath" | "text">,
): Promise<{ sha256: string; size: number }> {
  if (input.originalPath !== null) {
    const [sha256, s] = await Promise.all([sha256File(input.originalPath), stat(input.originalPath)]);
    return { sha256, size: s.size };
  }
  return hashText(input.text ?? "");
}

export function findDuplicate(
  sources: readonly SourceMeta[],
  probe: { sha256: string; originType: OriginType; origin: string },
): DuplicateMatch | null {
  const sorted = [...sources].sort((a, b) => compareCodeUnits(a.id, b.id));
  const bySha = sorted.find((s) => s.sha256 === probe.sha256);
  if (bySha) return { meta: bySha, match: "sha256" };
  if (probe.originType === "url") {
    const url = normalizeUrl(probe.origin);
    const byOrigin = sorted.find((s) => s.origin === url);
    if (byOrigin) return { meta: byOrigin, match: "origin" };
  }
  return null;
}

function isEexist(err: unknown): boolean {
  return (err as NodeJS.ErrnoException)?.code === "EEXIST";
}

export async function registerSource(paths: ResolvedPaths, input: RegisterInput): Promise<SourceMeta> {
  const now = input.now ?? new Date();
  const ext = input.originalPath !== null ? path.extname(input.originalPath).toLowerCase() : "";
  if (input.originalPath !== null && input.text !== null && ext === ".md") {
    throw new WikeeperError(
      ExitCode.USAGE,
      "usage",
      "the original is already markdown; drop --text-file",
    );
  }
  const origin = input.originType === "url" ? normalizeUrl(input.origin) : input.origin;
  const { sha256, size } = await hashSource(input);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await mkdir(paths.rawDir, { recursive: true });
    const names = await readdir(paths.rawDir);
    const id = makeSourceId(now, input.label, (candidate) => names.some((n) => n.startsWith(candidate + ".")));
    const originalName = input.originalPath !== null ? `${id}${ext}` : null;
    const textName = input.text !== null ? `${id}.md` : null;
    const meta: SourceMeta = {
      id,
      origin,
      origin_type: input.originType,
      kind: input.kind,
      provided_by: input.providedBy,
      captured_at: now.toISOString(),
      size,
      sha256,
      rule_version: input.ruleVersion,
      original: originalName,
      text: textName,
      reingest_of: input.reingestOf,
      permission: input.permission,
    };
    const created: string[] = [];
    try {
      if (originalName !== null && input.originalPath !== null) {
        const dest = path.join(paths.rawDir, originalName);
        await copyFile(input.originalPath, dest, constants.COPYFILE_EXCL);
        created.push(dest);
      }
      if (textName !== null && input.text !== null) {
        const dest = path.join(paths.rawDir, textName);
        await writeFile(dest, input.text, { flag: "wx" });
        created.push(dest);
      }
      const metaFile = path.join(paths.rawDir, `${id}.meta.json`);
      await writeFile(metaFile, JSON.stringify(meta, null, 2) + "\n", { flag: "wx" });
      return meta;
    } catch (err) {
      for (const f of created) await rm(f, { force: true, maxRetries: 3 });
      if (isEexist(err) && attempt < MAX_ATTEMPTS) continue;
      if (isEexist(err)) {
        throw new WikeeperError(
          ExitCode.ERROR,
          "id_collision",
          `could not find a free source id for "${input.label}" after ${MAX_ATTEMPTS} attempts`,
        );
      }
      throw err;
    }
  }
  throw new WikeeperError(ExitCode.ERROR, "id_collision", "could not register the source");
}

function parseMeta(text: string): SourceMeta | null {
  let value: unknown;
  try {
    value = JSON.parse(stripBom(text));
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string" || typeof v.sha256 !== "string") return null;
  return value as SourceMeta;
}

export async function readMeta(paths: ResolvedPaths, id: string): Promise<SourceMeta | null> {
  if (!isSourceId(id)) return null;
  let text: string;
  try {
    text = await readFile(path.join(paths.rawDir, `${id}.meta.json`), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  return parseMeta(text);
}

export async function listSources(paths: ResolvedPaths): Promise<SourceMeta[]> {
  let names: string[];
  try {
    names = await readdir(paths.rawDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const out: SourceMeta[] = [];
  for (const name of names) {
    if (!name.endsWith(".meta.json")) continue;
    let text: string;
    try {
      text = await readFile(path.join(paths.rawDir, name), "utf8");
    } catch {
      continue;
    }
    const meta = parseMeta(text);
    if (meta) out.push(meta);
  }
  return out.sort((a, b) => compareCodeUnits(a.id, b.id));
}

export async function removeSource(paths: ResolvedPaths, id: string): Promise<string[]> {
  if (!isSourceId(id)) {
    throw new WikeeperError(ExitCode.USAGE, "usage", `not a source id: ${id}`);
  }
  let names: string[];
  try {
    names = await readdir(paths.rawDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const doomed = names.filter((n) => n.startsWith(id + ".")).sort(compareCodeUnits);
  for (const n of doomed) await rm(path.join(paths.rawDir, n), { force: true, maxRetries: 3 });
  return doomed;
}
