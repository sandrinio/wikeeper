// src/ingest/facts.ts
// Contract C7 — contract/S-02-facts (owner STORY-003-06). Frozen exports. Consumers: STORY-003-08, 003-09, 006-04.
// `Fact` and `FactStatus` here describe an extracted fact; src/wiki/parse-page.ts exports a page's fact line under the
// same names. A file that needs both aliases one of them on import.
import { existsSync } from "node:fs";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { DATE_RE, isCalendarDate } from "../core/dates.js";
import { ExitCode, WikeeperError } from "../core/exit-codes.js";
import { toPosixRelative } from "../core/paths.js";
import type { ResolvedPaths } from "../core/paths.js";
import { stripBom } from "../core/text.js";
import { isValidKindId } from "./kind-rules.js";
import { hashText } from "./registry.js";
import { isSourceId } from "./source-id.js";

export const FACT_STATUSES: readonly ["decided", "tentative"] = ["decided", "tentative"];
export type FactStatus = (typeof FACT_STATUSES)[number];
export interface Fact {
  entity: string; // "<type>:<name>", FACT_ENTITY_RE
  field: string; // non-empty
  value: string | number | boolean;
  status: FactStatus;
  as_of: string; // a real calendar date YYYY-MM-DD, FACT_AS_OF_RE
  anchor: string; // non-empty
  page: string; // relative to pages/, POSIX, ends in .md, FACT_PAGE_RE
  exists: boolean;
}
export interface FactsFile {
  source_id: string;
  kind: string; // isValidKindId (C2)
  rule_version: number | null; // integer >= 1, or null when no rule exists for the kind
  facts: Fact[];
  new_entities: string[]; // normalised to [] when absent
  uncovered: string[];
}
export interface FactsError {
  path: string; // "$", "notes", "facts[2].status"
  message: string;
}
export type FactsValidation = { ok: true; value: FactsFile } | { ok: false; errors: FactsError[] };

export const FACTS_SCHEMA_REL: ".wiki/system/schemas/facts.schema.json" = ".wiki/system/schemas/facts.schema.json";
export const FACTS_KEYS: readonly string[] = ["source_id", "kind", "rule_version", "facts", "new_entities", "uncovered"];
export const FACTS_REQUIRED: readonly string[] = ["source_id", "kind", "rule_version", "facts"];
export const FACT_KEYS: readonly string[] = ["entity", "field", "value", "status", "as_of", "anchor", "page", "exists"];
export const FACT_REQUIRED: readonly string[] = ["entity", "field", "value", "status", "as_of", "anchor", "page", "exists"];
export const FACT_ENTITY_RE: RegExp = /^[a-z][a-z0-9-]*:\S(?:.*\S)?$/;
export const FACT_AS_OF_RE: RegExp = DATE_RE;
export const FACT_PAGE_RE: RegExp = /^(?![/\\])(?!(?:.*\/)?\.\.(?:\/|$))[^\\]+\.md$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isText(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

function checkList(input: unknown, key: string, errors: FactsError[]): string[] {
  if (!Array.isArray(input)) {
    errors.push({ path: key, message: "must be an array of non-empty strings" });
    return [];
  }
  const out: string[] = [];
  input.forEach((item, i) => {
    if (!isText(item)) errors.push({ path: `${key}[${i}]`, message: "must be a non-empty string" });
    else out.push(item);
  });
  return out;
}

function checkFact(input: unknown, at: string, errors: FactsError[]): Fact | null {
  if (!isRecord(input)) {
    errors.push({ path: at, message: "must be an object" });
    return null;
  }
  const before = errors.length;
  const out: Record<string, unknown> = {};
  for (const key of FACT_KEYS) {
    const p = `${at}.${key}`;
    if (!(key in input)) {
      if (FACT_REQUIRED.includes(key)) errors.push({ path: p, message: "required" });
      continue;
    }
    const v = input[key];
    let ok = true;
    let msg = "";
    switch (key) {
      case "entity":
        ok = typeof v === "string" && FACT_ENTITY_RE.test(v);
        msg = "must be <type>:<name> with a lowercase type";
        break;
      case "field":
      case "anchor":
        ok = isText(v);
        msg = "must be a non-empty string";
        break;
      case "value":
        ok = typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));
        msg = "must be a string, a number or a boolean";
        break;
      case "status":
        ok = typeof v === "string" && (FACT_STATUSES as readonly string[]).includes(v);
        msg = `must be one of ${FACT_STATUSES.join(", ")}`;
        break;
      case "as_of":
        ok = typeof v === "string" && isCalendarDate(v);
        msg = "must be a real calendar date, YYYY-MM-DD";
        break;
      case "page":
        ok = typeof v === "string" && FACT_PAGE_RE.test(v);
        msg = "must be a POSIX path relative to pages/ that ends in .md";
        break;
      case "exists":
        ok = typeof v === "boolean";
        msg = "must be a boolean";
        break;
    }
    if (!ok) errors.push({ path: p, message: msg });
    else out[key] = v;
  }
  for (const key of Object.keys(input)) {
    if (!FACT_KEYS.includes(key)) {
      errors.push({ path: `${at}.${key}`, message: `unknown key "${key}"; allowed keys: ${FACT_KEYS.join(", ")}` });
    }
  }
  return errors.length === before ? (out as unknown as Fact) : null;
}

/** Collects every problem; never throws. */
export function validateFacts(input: unknown): FactsValidation {
  if (!isRecord(input)) return { ok: false, errors: [{ path: "$", message: "must be an object" }] };
  const errors: FactsError[] = [];
  const out: Record<string, unknown> = {};
  for (const key of FACTS_KEYS) {
    if (!(key in input)) {
      if (FACTS_REQUIRED.includes(key)) errors.push({ path: key, message: "required" });
      else out[key] = [];
      continue;
    }
    const v = input[key];
    switch (key) {
      case "source_id":
        if (typeof v !== "string") errors.push({ path: key, message: "must be a string" });
        else out[key] = v;
        break;
      case "kind":
        if (typeof v !== "string" || !isValidKindId(v)) {
          errors.push({ path: key, message: "must be a source kind id: letters, digits and hyphens" });
        } else out[key] = v;
        break;
      case "rule_version":
        if (v !== null && !(typeof v === "number" && Number.isInteger(v) && v >= 1)) {
          errors.push({ path: key, message: "must be an integer >= 1 or null" });
        } else out[key] = v;
        break;
      case "facts":
        if (!Array.isArray(v)) errors.push({ path: key, message: "must be an array" });
        else out[key] = v.map((f, i) => checkFact(f, `facts[${i}]`, errors));
        break;
      default:
        out[key] = checkList(v, key, errors);
    }
  }
  for (const key of Object.keys(input)) {
    if (!FACTS_KEYS.includes(key)) {
      errors.push({ path: key, message: `unknown key "${key}"; allowed keys: ${FACTS_KEYS.join(", ")}` });
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: out as unknown as FactsFile };
}

/** Absolute native path of raw/<id>.facts.json (under paths.rawDir). */
export function factsFilePath(paths: ResolvedPaths, sourceId: string): string {
  if (!isSourceId(sourceId)) throw new WikeeperError(ExitCode.USAGE, "usage", `not a source id: ${sourceId}`);
  return path.join(paths.rawDir, `${sourceId}.facts.json`);
}

function invalidFacts(file: string, errors: FactsError[]): WikeeperError {
  return new WikeeperError(
    ExitCode.ERROR,
    "invalid_facts",
    `${file} does not match ${FACTS_SCHEMA_REL}`,
    { errors },
  );
}

export async function readFacts(paths: ResolvedPaths, sourceId: string): Promise<FactsFile | null> {
  const target = factsFilePath(paths, sourceId);
  let text: string;
  try {
    text = await readFile(target, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripBom(text));
  } catch (err) {
    throw invalidFacts(target, [{ path: "$", message: `invalid JSON: ${err instanceof Error ? err.message : String(err)}` }]);
  }
  const r = validateFacts(parsed);
  if (!r.ok) throw invalidFacts(target, r.errors);
  return r.value;
}

/** `file` is relative to paths.root, POSIX; `sha256` is the hash of the written file. */
export async function writeFacts(
  paths: ResolvedPaths,
  facts: FactsFile,
): Promise<{ file: string; replaced: boolean; sha256: string }> {
  const target = factsFilePath(paths, facts.source_id);
  const text = JSON.stringify(facts, null, 2) + "\n";
  const replaced = existsSync(target);
  const tmp = `${target}.tmp-${process.pid}`;
  try {
    await writeFile(tmp, text, "utf8");
    await rename(tmp, target);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
  return { file: toPosixRelative(paths.root, target), replaced, sha256: hashText(text).sha256 };
}
