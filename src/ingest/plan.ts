// src/ingest/plan.ts
// Contract C9 — owner STORY-003-05. Frozen exports. Read-only: hashes files, stores nothing, runs no hook.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { compareCodeUnits } from "../core/compare.js";
import type { WikeeperConfig } from "../core/config.js";
import { isInside } from "../core/paths.js";
import type { ResolvedPaths } from "../core/paths.js";
import { PDF_TOKENS_PER_PAGE } from "../core/tokens.js";
import type { TokenLevel } from "../core/tokens.js";
import { formatFromExtension } from "../read/index.js";
import type { ReadFormat } from "../read/index.js";
import { checkSourceSize, evaluatePermission, sizeLimitText } from "./permissions.js";
import { fileOrigin, findDuplicate, hashSource, listSources } from "./registry.js";
import { sourceTokens } from "./source-size.js";

export const HTML_BYTES_PER_TOKEN = 3;
export const DOCX_BYTES_PER_TOKEN = 2;

export type PlanStatus = "new" | "duplicate" | "denied";
export type PlanPrior = { id: string; captured_at: string; match: "sha256" } | { path: string; match: "in_plan" };
export interface PlanEntry {
  path: string; // the origin `ingest start` would record (fileOrigin)
  size: number;
  sha256: string;
  status: PlanStatus;
  needs_approval: boolean;
  kind_pending: boolean;
  reason: string;
  prior: PlanPrior | null;
  tokens: number | null; // null = not estimated
  tokens_rough: boolean;
  level: TokenLevel | null;
}
export interface PlanSkip {
  path: string;
  reason: "hidden" | "wiki" | "symlink";
}
export interface IngestPlan {
  dir: string; // repo-relative POSIX, or absolute when outside the repo
  mode: WikeeperConfig["ingest"]["permission"];
  kind: string | null;
  entries: PlanEntry[];
  skipped: PlanSkip[];
  totals: { new: number; duplicate: number; denied: number; needs_approval: number;
    tokens: number;
    tokens_rough: boolean;
    not_estimated: number;
  };
}

/** Page count from the PDF's page tree; loads no page and reads no text. */
export async function pdfPageCount(bytes: Uint8Array): Promise<number | null> {
  let task: { destroy(): Promise<void> } | null = null;
  try {
    const { getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes), {
      verbosity: 0,
      useSystemFonts: false,
      disableFontFace: true,
    });
    task = (pdf as unknown as { loadingTask: { destroy(): Promise<void> } }).loadingTask;
    return pdf.numPages;
  } catch {
    return null;
  } finally {
    try {
      await task?.destroy();
    } catch {
      // ignore
    }
  }
}

/** Compressed size of word/document.xml from the zip central directory; nothing is decompressed. */
export function docxDocumentBytes(bytes: Uint8Array): number | null {
  const len = bytes.length;
  if (len < 22) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, len);
  let eocd = -1;
  for (let i = len - 22; i >= Math.max(0, len - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = dv.getUint16(eocd + 10, true);
  let pos = dv.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  for (let k = 0; k < count; k++) {
    if (pos + 46 > len || dv.getUint32(pos, true) !== 0x02014b50) return null;
    const compressed = dv.getUint32(pos + 20, true);
    const n = dv.getUint16(pos + 28, true);
    const e = dv.getUint16(pos + 30, true);
    const c = dv.getUint16(pos + 32, true);
    if (pos + 46 + n > len) return null;
    if (decoder.decode(bytes.subarray(pos + 46, pos + 46 + n)) === "word/document.xml") {
      return compressed === 0xffffffff ? null : compressed;
    }
    pos += 46 + n + e + c;
  }
  return null;
}

export async function estimateFile(
  abs: string,
  format: ReadFormat | null,
  size: number,
): Promise<{ tokens: number; rough: boolean } | null> {
  switch (format) {
    case "markdown":
    case "text":
      return sourceTokens({ text: null, originalPath: abs, format });
    case "html":
      return { tokens: Math.round(size / HTML_BYTES_PER_TOKEN), rough: true };
    case "pdf": {
      const n = await pdfPageCount(new Uint8Array(await readFile(abs)));
      return n === null ? null : { tokens: n * PDF_TOKENS_PER_PAGE, rough: true };
    }
    case "docx": {
      const b = docxDocumentBytes(new Uint8Array(await readFile(abs)));
      return b === null ? null : { tokens: Math.round(b / DOCX_BYTES_PER_TOKEN), rough: true };
    }
    default:
      return null;
  }
}

function inWiki(paths: ResolvedPaths, abs: string): boolean {
  return (
    abs === paths.wikiDir ||
    abs === paths.contentDir ||
    isInside(paths.wikiDir, abs) ||
    isInside(paths.contentDir, abs)
  );
}

export async function planDirectory(
  paths: ResolvedPaths,
  config: WikeeperConfig,
  dirAbs: string,
  options: { kind: string | null },
): Promise<IngestPlan> {
  const root = paths.root;
  const dir = dirAbs === root ? "." : fileOrigin(root, dirAbs);
  const kind = options.kind;
  const plan: IngestPlan = {
    dir,
    mode: config.ingest.permission,
    kind,
    entries: [],
    skipped: [],
    totals: { new: 0, duplicate: 0, denied: 0, needs_approval: 0, tokens: 0, tokens_rough: false, not_estimated: 0 },
  };
  if (inWiki(paths, dirAbs)) {
    plan.skipped.push({ path: dir, reason: "wiki" });
    return plan;
  }

  const candidates: Array<{ abs: string; origin: string }> = [];
  async function walk(d: string): Promise<void> {
    const dirents = await readdir(d, { withFileTypes: true });
    for (const e of dirents) {
      const abs = path.join(d, e.name);
      if (inWiki(paths, abs)) {
        plan.skipped.push({ path: fileOrigin(root, abs), reason: "wiki" });
      } else if (e.isSymbolicLink()) {
        plan.skipped.push({ path: fileOrigin(root, abs), reason: "symlink" });
      } else if (e.name.startsWith(".")) {
        plan.skipped.push({ path: fileOrigin(root, abs), reason: "hidden" });
      } else if (e.isDirectory()) {
        await walk(abs);
      } else if (e.isFile()) {
        candidates.push({ abs, origin: fileOrigin(root, abs) });
      }
    }
  }
  await walk(dirAbs);
  candidates.sort((a, b) => compareCodeUnits(a.origin, b.origin));
  plan.skipped.sort((a, b) => compareCodeUnits(a.path, b.path));

  const sources = await listSources(paths);
  const firstNew = new Map<string, string>();
  for (const { abs, origin } of candidates) {
    const { sha256, size } = await hashSource({ originalPath: abs, text: null });
    const base = { path: origin, size, sha256, needs_approval: false, kind_pending: false, tokens: null, tokens_rough: false, level: null };
    const dup = findDuplicate(sources, { sha256, originType: "file", origin });
    if (dup !== null) {
      plan.entries.push({
        ...base,
        status: "duplicate",
        reason: `already ingested as ${dup.meta.id}`,
        prior: { id: dup.meta.id, captured_at: dup.meta.captured_at, match: "sha256" },
      });
      continue;
    }
    const earlier = firstNew.get(sha256);
    if (earlier !== undefined) {
      plan.entries.push({
        ...base,
        status: "duplicate",
        reason: `same content as ${earlier}, earlier in this plan`,
        prior: { path: earlier, match: "in_plan" },
      });
      continue;
    }
    const r = evaluatePermission(config.ingest, { origin, originType: "file", kind, approved: false });
    if (r.decision === "denied") {
      plan.entries.push({ ...base, status: "denied", kind_pending: r.kind_pending, reason: r.reason, prior: null });
    } else {
      firstNew.set(sha256, origin);
      const est = await estimateFile(abs, formatFromExtension(path.extname(abs)), size);
      const check = est === null ? null : checkSourceSize(est, config.tokens.source);
      plan.entries.push({
        ...base,
        status: "new",
        needs_approval: r.decision === "needs_approval" || check?.reached === true,
        kind_pending: r.kind_pending,
        reason: check?.reached === true ? `${r.reason} Its estimate is ${sizeLimitText(check)}.` : r.reason,
        prior: null,
        tokens: check === null ? null : check.tokens,
        tokens_rough: check === null ? false : check.rough,
        level: check === null ? null : check.level,
      });
    }
  }
  for (const e of plan.entries) {
    plan.totals[e.status] += 1;
    if (e.status !== "new") continue;
    if (e.needs_approval) plan.totals.needs_approval += 1;
    if (e.tokens === null) plan.totals.not_estimated += 1;
    else {
      plan.totals.tokens += e.tokens;
      if (e.tokens_rough) plan.totals.tokens_rough = true;
    }
  }
  return plan;
}
