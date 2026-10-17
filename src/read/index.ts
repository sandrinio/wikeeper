// src/read/index.ts -- contract K7: turn a URL or a file into markdown (STORY-003-10).
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ExitCode, WikeeperError } from "../core/exit-codes.js";
import { readHtml } from "./html.js";
import { fetchSource } from "./url.js";

export type ReadFormat = "html" | "docx" | "pdf" | "markdown" | "text";
export interface ReadWarning {
  code: "likely_scanned" | "needs_browser" | "unsupported";
  message: string;
}
export interface ReadResult {
  markdown: string;
  title: string | null;
  author: string | null;
  date: string | null;
  format: ReadFormat;
  warnings: ReadWarning[];
}
export interface ReadOptions {
  cwd: string;
  timeoutMs?: number;
  maxBytes?: number;
  fetch?: typeof fetch;
}
/** What a converter branch returns; readSource adds the header (R5). */
export interface Converted {
  body: string;
  title: string | null;
  author: string | null;
  date: string | null;
  warnings: ReadWarning[];
}

export const DEFAULT_TIMEOUT_MS = 20_000 as const;
export const DEFAULT_MAX_BYTES: number = 10 * 1024 * 1024;

export const UNSUPPORTED_HINTS: Readonly<Record<".doc" | ".pptx" | ".xlsx", string>> = {
  ".doc": "`.doc` (Word 97–2003) is not supported: save it as .docx",
  ".pptx": "`.pptx` is not supported: export it to PDF and read the PDF",
  ".xlsx": "`.xlsx` is not supported: export the sheet as CSV and read the CSV",
};

const SUPPORTED_LIST = "web pages and .html, .htm, .md, .markdown, .txt, .csv, .tsv, .docx and .pdf files";

const EXTENSION_FORMATS: Readonly<Record<string, ReadFormat>> = {
  ".html": "html",
  ".htm": "html",
  ".md": "markdown",
  ".markdown": "markdown",
  ".txt": "text",
  ".csv": "text",
  ".tsv": "text",
  ".docx": "docx",
  ".pdf": "pdf",
};

const CONTENT_TYPE_FORMATS: Readonly<Record<string, ReadFormat>> = {
  "text/html": "html",
  "application/xhtml+xml": "html",
  "text/markdown": "markdown",
  "text/plain": "text",
  "text/csv": "text",
  "text/tab-separated-values": "text",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

export function formatFromExtension(ext: string): ReadFormat | null {
  return EXTENSION_FORMATS[ext.toLowerCase()] ?? null;
}

export function formatFromContentType(contentType: string | null): ReadFormat | null {
  if (contentType === null) return null;
  const type = (contentType.split(";")[0] ?? "").trim().toLowerCase();
  return CONTENT_TYPE_FORMATS[type] ?? null;
}

export async function convertDocx(_bytes: Uint8Array): Promise<Converted> {
  throw new WikeeperError(ExitCode.USAGE, "unsupported", "reading .docx files is not available yet");
}

export async function convertPdf(_bytes: Uint8Array): Promise<Converted> {
  throw new WikeeperError(ExitCode.USAGE, "unsupported", "reading .pdf files is not available yet");
}

export function withHeader(c: Converted): string {
  const lines = c.body.split("\n");
  const firstAt = lines.findIndex((l) => l.trim() !== "");
  const first = firstAt === -1 ? "" : lines[firstAt]!;
  const headingText = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(first)?.[1]?.trim().toLowerCase();
  const keepsTitle = c.title !== null && headingText !== undefined && headingText === c.title.trim().toLowerCase();
  const meta = [c.author && `Author: ${c.author}`, c.date && `Date: ${c.date}`].filter(Boolean).join(" · ");
  const blocks: string[] = [];
  if (keepsTitle) {
    blocks.push(first.trim());
    if (meta !== "") blocks.push(meta);
    const rest = lines.slice(firstAt + 1).join("\n").replace(/^\s*\n/, "");
    if (rest.trim() !== "") blocks.push(rest);
  } else {
    if (c.title !== null) blocks.push(`# ${c.title}`);
    if (meta !== "") blocks.push(meta);
    if (c.body.trim() !== "") blocks.push(c.body);
  }
  return blocks.join("\n\n");
}

function decodeText(bytes: Uint8Array): string {
  const label = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le" : bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be" : "utf-8";
  return new TextDecoder(label).decode(bytes);
}

const normalise = (md: string): string => md.replace(/\r\n?/g, "\n").replace(/\s+$/, "");

export async function readSource(input: string, opts: ReadOptions): Promise<ReadResult> {
  let bytes: Uint8Array;
  let format: ReadFormat | null;
  let url: string;
  let contentType: string | null = null;
  let what: string;

  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(input)) {
    let parsed: URL;
    try {
      parsed = new URL(input);
    } catch {
      throw new WikeeperError(ExitCode.USAGE, "usage", `not a valid URL: ${input}`);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new WikeeperError(ExitCode.USAGE, "usage", "only http and https URLs can be read");
    }
    const fetched = await fetchSource(parsed, {
      timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxBytes: opts.maxBytes ?? DEFAULT_MAX_BYTES,
      fetch: opts.fetch ?? globalThis.fetch,
    });
    bytes = fetched.bytes;
    contentType = fetched.contentType;
    url = fetched.finalUrl;
    const ext = path.posix.extname(new URL(url).pathname);
    format = formatFromContentType(contentType) ?? formatFromExtension(ext);
    what = (contentType ?? "").split(";")[0]!.trim() || ext || "an unknown type";
  } else {
    const abs = path.resolve(opts.cwd, input);
    let st;
    try {
      st = await stat(abs);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new WikeeperError(ExitCode.USAGE, "not_found", `no such file: ${input}`);
      }
      throw err;
    }
    if (st.isDirectory()) {
      throw new WikeeperError(ExitCode.USAGE, "usage", `${input} is a directory: read takes one file`);
    }
    const ext = path.extname(abs).toLowerCase();
    const hint = (UNSUPPORTED_HINTS as Readonly<Record<string, string>>)[ext];
    if (hint !== undefined) throw new WikeeperError(ExitCode.USAGE, "unsupported", hint);
    format = formatFromExtension(ext);
    what = ext === "" ? "a file with no extension" : ext;
    if (format === null) {
      throw new WikeeperError(ExitCode.USAGE, "unsupported", `cannot read ${what}: read takes ${SUPPORTED_LIST}`);
    }
    bytes = await readFile(abs);
    url = pathToFileURL(abs).href;
  }

  if (format === null) {
    const ext = path.posix.extname(new URL(url).pathname).toLowerCase();
    const hint = (UNSUPPORTED_HINTS as Readonly<Record<string, string>>)[ext];
    if (hint !== undefined) throw new WikeeperError(ExitCode.USAGE, "unsupported", hint);
    throw new WikeeperError(ExitCode.USAGE, "unsupported", `cannot read ${what}: read takes ${SUPPORTED_LIST}`);
  }

  let converted: Converted;
  switch (format) {
    case "markdown":
    case "text":
      converted = { body: decodeText(bytes), title: null, author: null, date: null, warnings: [] };
      break;
    case "html":
      converted = await readHtml(bytes, { url, contentType });
      break;
    case "docx":
      converted = await convertDocx(bytes);
      break;
    case "pdf":
      converted = await convertPdf(bytes);
      break;
  }
  const markdown = normalise(format === "markdown" || format === "text" ? converted.body : withHeader(converted));
  return {
    markdown,
    title: converted.title,
    author: converted.author,
    date: converted.date,
    format,
    warnings: converted.warnings,
  };
}
