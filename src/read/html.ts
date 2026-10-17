// src/read/html.ts -- HTML to markdown through linkedom + defuddle, loaded only when HTML is read (STORY-003-10 R4, R9).
import { isCalendarDate } from "../core/dates.js";
import type { Converted } from "./index.js";

export const NEEDS_BROWSER_MIN_WORDS = 20 as const;

export function decodeHtml(bytes: Uint8Array, contentType: string | null): string {
  let label = /charset\s*=\s*["']?([\w.:-]+)/i.exec(contentType ?? "")?.[1];
  if (label === undefined) {
    const head = Buffer.from(bytes.subarray(0, 1024)).toString("latin1");
    label = /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head)?.[1];
  }
  try {
    return new TextDecoder(label ?? "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

export function countWords(markdown: string): number {
  return (markdown.match(/[\p{L}\p{N}]+/gu) ?? []).length;
}

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t === "" ? null : t;
}

function toDate(published: unknown): string | null {
  const s = clean(published);
  if (s === null) return null;
  const prefix = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}/.test(s) && isCalendarDate(prefix)) return prefix;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
}

export async function readHtml(
  bytes: Uint8Array,
  opts: { url: string; contentType: string | null },
): Promise<Converted> {
  const { parseHTML } = await import("linkedom");
  const { Defuddle } = await import("defuddle/node");
  const { document } = parseHTML(decodeHtml(bytes, opts.contentType));
  const r = await Defuddle(document as never, opts.url, { markdown: true, useAsync: false });
  const body = String(r.content ?? "").replace(/!\[([^\]]*)\]\(data:[^)]*\)/g, (_m, alt: string) =>
    alt ? `[image: ${alt}]` : "[image]",
  );
  const words = countWords(body);
  return {
    body,
    title: clean(r.title),
    author: clean(r.author),
    date: toDate(r.published),
    warnings:
      words < NEEDS_BROWSER_MIN_WORDS
        ? [
            {
              code: "needs_browser",
              message: `the page has almost no main content (${words} words); it probably needs JavaScript or a login. Open it in your own browser and pass the text to \`wikeeper ingest start <url> --text-file <file>\``,
            },
          ]
        : [],
  };
}
