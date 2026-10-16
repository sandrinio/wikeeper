import { readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";

export const WIKI_START_PREFIX = "<!-- WIKI:START";
export const WIKI_START_V1 = "<!-- WIKI:START v1 — managed by wikeeper -->";
export const WIKI_END = "<!-- WIKI:END -->";

export type InjectStatus = "injected" | "skipped";
export type StripStatus = "stripped" | "absent" | "malformed";
export type BlockFileStatus = InjectStatus | StripStatus;

const BOM = "\uFEFF";

function fail(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

function splitBom(text: string): { bom: string; body: string } {
  return text.startsWith(BOM) ? { bom: BOM, body: text.slice(1) } : { bom: "", body: text };
}

function detectEol(body: string): string {
  const i = body.indexOf("\n");
  return i > 0 && body[i - 1] === "\r" ? "\r\n" : "\n";
}

function validateBlock(block: string): string {
  const trimmed = block.replace(/(\r?\n)+$/, "");
  const lines = trimmed.split(/\r?\n/);
  if (!trimmed.startsWith(WIKI_START_PREFIX) || lines[lines.length - 1] !== WIKI_END) {
    throw fail("E_BLOCK_INVALID", "block must start with the WIKI:START marker and end with the WIKI:END line");
  }
  return trimmed;
}

/** Index just past the EOL of the closing `---` line, or -1 when there is no frontmatter. */
function frontmatterEnd(body: string): { end: number; hasEol: boolean } | null {
  const first = /^(.*?)(\r?\n)/.exec(body);
  if (!first || first[1] !== "---") return null;
  let pos = first[0].length;
  while (pos <= body.length) {
    const m = /^([^\n]*?)(\r?\n|$)/.exec(body.slice(pos));
    if (!m) return null;
    const lineEnd = pos + m[0].length;
    if (m[1] === "---") return { end: lineEnd, hasEol: m[2] !== "" };
    if (m[2] === "") return null;
    pos = lineEnd;
  }
  return null;
}

export function injectBlock(text: string, block: string): { text: string; status: InjectStatus } {
  const trimmed = validateBlock(block);
  if (text.includes(WIKI_START_PREFIX)) return { text, status: "skipped" };
  const { bom, body } = splitBom(text);
  const eol = detectEol(body);
  const norm = trimmed.split(/\r?\n/).join(eol);
  let head = "";
  let rest = body;
  const fm = frontmatterEnd(body);
  if (fm) {
    head = body.slice(0, fm.end) + (fm.hasEol ? "" : eol);
    rest = body.slice(fm.end);
  }
  return {
    text: bom + head + norm + eol + (rest === "" ? "" : eol + rest),
    status: "injected",
  };
}

export function stripBlock(input: string): { text: string; status: StripStatus } {
  const { bom, body: text } = splitBom(input);
  const result = stripBody(text);
  return result.status === "stripped" ? { text: bom + result.text, status: "stripped" } : { text: input, status: result.status };
}

function stripBody(text: string): { text: string; status: StripStatus } {
  const start = /^<!-- WIKI:START\b.*-->$/m.exec(text);
  if (!start) return { text, status: "absent" };
  const afterStart = start.index + start[0].length;
  const endRe = /^<!-- WIKI:END -->$/m;
  const end = endRe.exec(text.slice(afterStart));
  if (!end) return { text, status: "malformed" };
  let cut = afterStart + end.index + end[0].length;
  const eol1 = /^\r?\n/.exec(text.slice(cut));
  if (eol1) {
    cut += eol1[0].length;
    const eol2 = /^\r?\n/.exec(text.slice(cut));
    if (eol2) cut += eol2[0].length;
  }
  return { text: text.slice(0, start.index) + text.slice(cut), status: "stripped" };
}

async function readUtf8(path: string): Promise<{ text: string; real: string } | null> {
  let real: string;
  try {
    real = await realpath(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  const bytes = await readFile(real);
  try {
    return { text: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes), real };
  } catch {
    throw fail("E_NOT_UTF8", `${path} is not valid UTF-8`);
  }
}

async function atomicWrite(real: string, text: string): Promise<void> {
  const tmp = `${real}.wikeeper-tmp`;
  try {
    await writeFile(tmp, text, "utf8");
    await rename(tmp, real);
  } catch (err) {
    await unlink(tmp).catch(() => undefined);
    throw err;
  }
}

export async function injectIntoFile(
  path: string,
  block: string,
): Promise<{ status: InjectStatus; created: boolean }> {
  const existing = await readUtf8(path);
  const result = injectBlock(existing?.text ?? "", block);
  if (result.status === "skipped") return { status: "skipped", created: false };
  await atomicWrite(existing?.real ?? path, result.text);
  return { status: "injected", created: existing === null };
}

export async function stripFromFile(path: string): Promise<{ status: StripStatus }> {
  const existing = await readUtf8(path);
  if (!existing) return { status: "absent" };
  const result = stripBlock(existing.text);
  if (result.status === "stripped") await atomicWrite(existing.real, result.text);
  return { status: result.status };
}
