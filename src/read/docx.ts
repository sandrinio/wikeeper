// src/read/docx.ts -- DOCX to markdown: mammoth -> HTML -> turndown + GFM (STORY-003-11, R2).
import { ExitCode, WikeeperError } from "../core/exit-codes.js";
import type { Converted, ReadWarning } from "./index.js";

/** Rewrites the first row of each headerless table so its cells become header cells. */
export function promoteFirstRows(html: string): string {
  let out = "";
  let pos = 0;
  const tableOpen = /<table\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = tableOpen.exec(html)) !== null) {
    const bodyStart = m.index + m[0].length;
    if (m.index < pos) continue; // nested table: left alone
    const rest = html.slice(bodyStart);
    if (/^\s*<thead\b/i.test(rest)) continue;
    const trStart = rest.search(/<tr\b/i);
    if (trStart === -1) continue;
    const trEnd = rest.slice(trStart).search(/<\/tr>/i);
    if (trEnd === -1) continue;
    const row = rest.slice(trStart, trStart + trEnd);
    if (/<th\b/i.test(row) || /<table\b/i.test(row)) continue;
    const promoted = row.replace(/<td\b/gi, "<th").replace(/<\/td>/gi, "</th>");
    out += html.slice(pos, bodyStart + trStart) + promoted;
    pos = bodyStart + trStart + row.length;
  }
  return out + html.slice(pos);
}

export async function htmlToMarkdown(html: string): Promise<string> {
  const { default: TurndownService } = await import("turndown");
  const { gfm } = await import("@joplin/turndown-plugin-gfm");
  const service = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    hr: "---",
  });
  service.use(gfm);
  service.addRule("listItem", {
    filter: "li",
    replacement(content, node) {
      const body = content.replace(/^\n+/, "").replace(/\n+$/, "\n").replace(/\n/gm, "\n\t");
      const parent = node.parentNode as HTMLElement | null;
      let prefix = "- ";
      if (parent !== null && parent.nodeName === "OL") {
        const start = parent.getAttribute("start");
        const index = Array.prototype.indexOf.call(parent.children, node) as number;
        prefix = `${(start ? Number(start) : 1) + index}. `;
      }
      const next = (node as HTMLElement).nextSibling;
      return prefix + body + (next && !/\n$/.test(body) ? "\n" : "");
    },
  });
  service.addRule("img", {
    filter: "img",
    replacement(_content, node) {
      const alt = (node.getAttribute("alt") ?? "").trim();
      return alt === "" ? "[image]" : `[image: ${alt}]`;
    },
  });
  const md = service.turndown(html);
  return md.replace(/<div class="joplin-table-wrapper">([\s\S]*?)<\/div>/g, "$1");
}

export async function readDocx(bytes: Uint8Array): Promise<Converted> {
  const { default: mammoth } = await import("mammoth");
  let html: string;
  try {
    const result = await mammoth.convertToHtml(
      { buffer: Buffer.from(bytes) },
      { convertImage: mammoth.images.imgElement(async () => ({ src: "" })) },
    );
    html = result.value;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new WikeeperError(ExitCode.ERROR, "conversion_failed", `the file is not a readable DOCX: ${message}`);
  }
  const images = (html.match(/<img\b/g) ?? []).length;
  const warnings: ReadWarning[] = [];
  if (images > 0) {
    warnings.push({
      code: "unsupported",
      message: `${images} image(s) were not converted; their places are marked [image: …]`,
    });
  }
  const body = await htmlToMarkdown(promoteFirstRows(html));
  const title = /^# (.+)$/m.exec(body)?.[1]?.trim() ?? null;
  return { body, title, author: null, date: null, warnings };
}
