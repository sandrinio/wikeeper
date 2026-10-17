// src/lint/unlogged.ts
// STORY-005-03: `unlogged-change` — a page whose text no longer matches what the ingest log recorded for it.
// Imports ./checks.js with `import type` only, and takes pagePath from ./paths.js (load-cycle rule).
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { compareCodeUnits } from "../core/compare.js";
import { isPageHashes } from "../ingest/log.js";
import { readLock } from "../ingest/lock.js";
import { readSnapshot, snapshotDir } from "../ingest/snapshot.js";
import type { LintFinding } from "../ingest/lint-hook.js";
import type { IngestLogEvent, StoredLogEvent } from "../ingest/log.js";
import type { LintCheck, LintContext } from "./checks.js";
import { pagePath } from "./paths.js";

/** sha256 hex of the text without a leading BOM and with CRLF changed to LF. */
export function pageHash(text: string): string {
  return createHash("sha256").update(text.replace(/^﻿/, "").replace(/\r\n/g, "\n"), "utf8").digest("hex");
}

type Change = "created" | "updated" | "deleted";
interface Touch {
  stored: StoredLogEvent;
  change: Change;
}

const hasDotSegment = (rel: string): boolean => rel.split("/").some((seg) => seg.startsWith("."));

function isPrivate(ctx: LintContext, rel: string): boolean {
  for (const entry of ctx.config.private) {
    const abs = path.resolve(ctx.paths.pagesDir, entry);
    const r = path.relative(ctx.paths.pagesDir, abs);
    if (r === "" || r === ".." || r.startsWith(".." + path.sep) || path.isAbsolute(r)) continue;
    const posix = r.split(path.sep).join("/");
    if (rel === posix || rel.startsWith(posix + "/")) return true;
  }
  return false;
}

async function readText(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export const unloggedChangeCheck: LintCheck = {
  id: "unlogged-change",
  severity: "error",
  scope: "pages",
  async run(ctx: LintContext): Promise<LintFinding[]> {
    // Mode (R4): an open write phase is judged as it was at apply.
    let snapSource: string | null = null;
    let snapTakenMs = 0;
    let snapPages: string[] | null = null;
    const lock = await readLock(ctx.paths);
    if (lock.held && lock.lock !== null) {
      const snap = await readSnapshot(ctx.paths, lock.lock.source_id);
      if (snap !== null) {
        snapSource = lock.lock.source_id;
        snapTakenMs = Date.parse(snap.taken_at);
        snapPages = Object.keys(snap.pages).filter((k) => k.endsWith(".md") && !hasDotSegment(k));
      }
    }
    const suffix = snapSource === null ? "" : `, before ingest ${snapSource} was applied`;
    const baseDir = snapSource === null ? ctx.paths.pagesDir : path.join(snapshotDir(ctx.paths, snapSource), "pages");

    const lastTouch = new Map<string, Touch>();
    for (const stored of ctx.log) {
      const ev = stored.event as unknown as Record<string, unknown>;
      if (ev["type"] !== "ingest") continue;
      if (snapSource !== null) {
        if (ev["source_id"] === snapSource) continue;
        const ms = typeof ev["at"] === "string" ? Date.parse(ev["at"]) : NaN;
        if (!Number.isNaN(ms) && ms >= snapTakenMs) continue;
      }
      for (const change of ["created", "updated", "deleted"] as const) {
        const list = ev[change];
        if (!Array.isArray(list)) continue;
        for (const p of list) if (typeof p === "string") lastTouch.set(p, { stored, change });
      }
    }

    const pageSet = new Set<string>(snapPages ?? ctx.pages.map((p) => p.path));
    const all = new Set<string>([...pageSet, ...lastTouch.keys()]);
    const judged = [...all].filter((p) => p.endsWith(".md") && !isPrivate(ctx, p)).sort(compareCodeUnits);

    const findings: LintFinding[] = [];
    let baseline = 0;
    const err = (p: string, message: string): void => {
      findings.push({ id: "unlogged-change", severity: "error", path: pagePath(ctx.paths, p), message: message + suffix });
    };
    for (const p of judged) {
      const exists = pageSet.has(p);
      const touch = lastTouch.get(p);
      if (touch === undefined) {
        if (exists) err(p, "in no ingest log event");
        continue;
      }
      const ev = touch.stored.event as IngestLogEvent;
      const hashes = (ev as unknown as Record<string, unknown>)["page_hashes"];
      if (!isPageHashes(hashes)) {
        if (exists) baseline++;
        continue;
      }
      const src = ev.source_id;
      const file = touch.stored.file;
      if (touch.change === "deleted") {
        if (exists) err(p, `deleted by ingest ${src} (${file}) and created again without a log entry`);
        continue;
      }
      if (!exists) {
        err(p, `deleted without a log entry (last recorded by ingest ${src}, ${file})`);
        continue;
      }
      const recorded = hashes[p];
      if (recorded === undefined) {
        baseline++;
        continue;
      }
      const text = await readText(path.join(baseDir, ...p.split("/")));
      if (text === null) {
        err(p, `deleted without a log entry (last recorded by ingest ${src}, ${file})`);
        continue;
      }
      if (pageHash(text) !== recorded) err(p, `changed since ingest ${src} recorded it (${file})`);
    }
    if (baseline > 0) {
      findings.push({
        id: "unlogged-change",
        severity: "info",
        message: `${baseline} page(s) were last recorded by an ingest without page hashes (before wikeeper 0.3.0); unlogged-change checks them after their next ingest`,
      });
    }
    return findings;
  },
};
