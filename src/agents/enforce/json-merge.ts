import { constants } from "node:fs";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { ExitCode, WikeeperError } from "../../core/exit-codes.js";

export type JsonObject = Record<string, unknown>;
export interface JsonDoc {
  abs: string;
  rel: string;
  existed: boolean;
  original: Buffer | null;
  value: JsonObject;
  indent: string;
  eol: "\n" | "\r\n";
  bom: boolean;
  finalEol: boolean;
}
export interface SaveResult {
  written: boolean;
  backup: string | null; // posix rel of a .bak WE wrote
}

export function settingsError(rel: string, detail: string, invalidJson = true): WikeeperError {
  const message = invalidJson
    ? `${rel} is not valid JSON: ${detail}; nothing was changed`
    : `${rel} cannot be updated: ${detail}; nothing was changed`;
  return new WikeeperError(ExitCode.ERROR, "settings_invalid", message, { file: rel, error: detail });
}

function isPlainObject(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseStrict(buf: Buffer, rel: string): { value: JsonObject; text: string; bom: boolean } {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buf);
  } catch (err) {
    throw settingsError(rel, err instanceof Error ? err.message : String(err));
  }
  const bom = text.startsWith("\uFEFF");
  if (bom) text = text.slice(1);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (err) {
    throw settingsError(rel, err instanceof Error ? err.message : String(err));
  }
  if (!isPlainObject(value)) throw settingsError(rel, "the root must be a JSON object");
  return { value, text, bom };
}

export async function loadJsonDoc(abs: string, rel: string): Promise<JsonDoc> {
  let buf: Buffer;
  try {
    buf = await readFile(abs);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { abs, rel, existed: false, original: null, value: {}, indent: "  ", eol: "\n", bom: false, finalEol: true };
    }
    throw err;
  }
  const { value, text, bom } = parseStrict(buf, rel);
  const indentMatch = /\n([ \t]+)\S/.exec(text);
  return {
    abs,
    rel,
    existed: true,
    original: buf,
    value,
    indent: indentMatch ? indentMatch[1]! : "  ",
    eol: /\r?\n/.exec(text)?.[0] === "\r\n" ? "\r\n" : "\n",
    bom,
    finalEol: /\n$/.test(text),
  };
}

export function serializeJsonDoc(doc: JsonDoc, value: JsonObject): string {
  let text = JSON.stringify(value, null, doc.indent);
  if (doc.eol === "\r\n") text = text.replace(/\n/g, "\r\n");
  if (doc.finalEol) text += doc.eol;
  return (doc.bom ? "\uFEFF" : "") + text;
}

export function wouldWrite(doc: JsonDoc, next: JsonObject): boolean {
  if (isDeepStrictEqual(doc.value, next)) return false;
  return doc.existed || Object.keys(next).length > 0;
}

export async function saveJsonDoc(
  doc: JsonDoc,
  next: JsonObject,
  opts: { backup?: boolean } = {},
): Promise<SaveResult> {
  if (!wouldWrite(doc, next)) return { written: false, backup: null };
  let backup: string | null = null;
  if (doc.existed && opts.backup !== false) {
    try {
      await copyFile(doc.abs, doc.abs + ".bak", constants.COPYFILE_EXCL);
      backup = doc.rel + ".bak";
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
  }
  await writeFile(doc.abs, serializeJsonDoc(doc, next));
  return { written: true, backup };
}

export async function mergeJsonFile(
  abs: string,
  rel: string,
  mutate: (v: JsonObject) => void,
): Promise<SaveResult> {
  const doc = await loadJsonDoc(abs, rel);
  const next = structuredClone(doc.value);
  mutate(next);
  return saveJsonDoc(doc, next);
}

export function upsertArrayItem(
  root: JsonObject,
  container: readonly string[],
  match: (el: unknown) => boolean,
  value: unknown,
  rel: string,
): void {
  let cur: JsonObject = root;
  for (const key of container.slice(0, -1)) {
    const child = cur[key];
    if (child === undefined) {
      const fresh: JsonObject = {};
      cur[key] = fresh;
      cur = fresh;
    } else if (isPlainObject(child)) cur = child;
    else throw settingsError(rel, `"${container.join(".")}" cannot be created: "${key}" is not an object`, false);
  }
  const last = container[container.length - 1]!;
  let arr = cur[last];
  if (arr === undefined) {
    arr = [];
    cur[last] = arr;
  }
  if (!Array.isArray(arr)) throw settingsError(rel, `"${container.join(".")}" is not an array`, false);
  const first = arr.findIndex(match);
  if (first < 0) {
    arr.push(value);
    return;
  }
  if (!isDeepStrictEqual(arr[first], value)) arr[first] = value;
  for (let i = arr.length - 1; i > first; i--) if (match(arr[i])) arr.splice(i, 1);
}

export function removeArrayItems(root: JsonObject, container: readonly string[], match: (el: unknown) => boolean): boolean {
  const chain: JsonObject[] = [root];
  let cur: JsonObject = root;
  for (const key of container.slice(0, -1)) {
    const child = cur[key];
    if (!isPlainObject(child)) return false;
    cur = child;
    chain.push(cur);
  }
  const last = container[container.length - 1]!;
  const arr = cur[last];
  if (!Array.isArray(arr)) return false;
  let removed = false;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (match(arr[i])) {
      arr.splice(i, 1);
      removed = true;
    }
  }
  if (!removed) return false;
  if (arr.length === 0) delete cur[last];
  for (let i = chain.length - 1; i >= 1; i--) {
    if (Object.keys(chain[i]!).length > 0) break;
    delete chain[i - 1]![container[i - 1]!];
  }
  return true;
}

/** Deletes an empty array at `container` and every ancestor object that is left empty. Used to compare documents modulo empty containers on wikeeper's owned paths. */
export function pruneEmptyPath(root: JsonObject, container: readonly string[]): void {
  const chain: JsonObject[] = [root];
  let cur: JsonObject = root;
  for (const key of container.slice(0, -1)) {
    const child = cur[key];
    if (!isPlainObject(child)) return;
    cur = child;
    chain.push(cur);
  }
  const last = container[container.length - 1]!;
  const leaf = cur[last];
  if (Array.isArray(leaf) && leaf.length === 0) delete cur[last];
  for (let i = chain.length - 1; i >= 1; i--) {
    if (Object.keys(chain[i]!).length > 0) break;
    delete chain[i - 1]![container[i - 1]!];
  }
}
