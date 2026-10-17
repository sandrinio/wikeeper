import { crc32 } from "node:zlib";

// Deterministic in-memory DOCX and PDF writers for the `read` tests (STORY-003-11).
// No binary file is committed: every call returns the same bytes.

// ---------------------------------------------------------------- zip (STORE)

interface ZipPart {
  name: string;
  data: Buffer;
}

function u16(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
}
function u32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
}

function writeZip(parts: ZipPart[]): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const part of parts) {
    const name = Buffer.from(part.name, "utf8");
    const crc = crc32(part.data) >>> 0;
    const local = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0x0021),
      u32(crc), u32(part.data.length), u32(part.data.length), u16(name.length), u16(0), name, part.data,
    ]);
    centrals.push(
      Buffer.concat([
        u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x0021),
        u32(crc), u32(part.data.length), u32(part.data.length), u16(name.length),
        u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name,
      ]),
    );
    locals.push(local);
    offset += local.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(parts.length), u16(parts.length), u32(cd.length), u32(offset), u16(0),
  ]);
  return new Uint8Array(Buffer.concat([...locals, cd, eocd]));
}

// ---------------------------------------------------------------- 1x1 PNG

function adler32(data: Buffer): number {
  let a = 1;
  let b = 0;
  for (const byte of data) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const t = Buffer.from(type, "latin1");
  return Buffer.concat([u32Be(data.length), t, data, u32Be(crc32(Buffer.concat([t, data])) >>> 0)]);
}
function u32Be(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0);
  return b;
}

function onePixelPng(): Buffer {
  const raw = Buffer.from([0x00, 0x33, 0x66, 0x99, 0xff]); // filter 0 + one RGBA pixel
  const len = raw.length;
  const stored = Buffer.concat([
    Buffer.from([0x78, 0x01, 0x01, len & 0xff, len >> 8, ~len & 0xff, (~len >> 8) & 0xff]),
    raw,
    u32Be(adler32(raw)),
  ]);
  const ihdr = Buffer.concat([u32Be(1), u32Be(1), Buffer.from([8, 6, 0, 0, 0])]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", stored),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- DOCX

const NS_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const NS_PIC = "http://schemas.openxmlformats.org/drawingml/2006/picture";
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

const CONTENT_TYPES = `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`;

const ROOT_RELS = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

const DOC_RELS = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/></Relationships>`;

const STYLES = `${XML}<w:styles xmlns:w="${NS_W}"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style></w:styles>`;

const NUMBERING = `${XML}<w:numbering xmlns:w="${NS_W}"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="&#8226;"/></w:lvl></w:abstractNum><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>`;

function para(text: string, style?: string, numId?: number): string {
  const ppr = style || numId
    ? `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ""}${numId ? `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr>` : ""}</w:pPr>`
    : "";
  return `<w:p>${ppr}<w:r><w:t>${text}</w:t></w:r></w:p>`;
}

function tableRow(cells: string[]): string {
  return `<w:tr>${cells.map((c) => `<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr>${para(c)}</w:tc>`).join("")}</w:tr>`;
}

const IMAGE_PARA = `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="9525" cy="9525"/><wp:docPr id="1" name="Picture 1" descr="Org chart"/><a:graphic xmlns:a="${NS_A}"><a:graphicData uri="${NS_PIC}"><pic:pic xmlns:pic="${NS_PIC}"><pic:nvPicPr><pic:cNvPr id="0" name="image1.png" descr="Org chart"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId3"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="9525" cy="9525"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;

function reportDocumentXml(): string {
  const body = [
    para("Q4 status", "Heading1"),
    para("Risks", "Heading2"),
    para("Vendor delay", undefined, 1),
    para("Hiring", undefined, 1),
    para("Sign contract", undefined, 2),
    para("Hire QA", undefined, 2),
    `<w:tbl><w:tblPr><w:tblW w:w="7200" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="2400"/><w:gridCol w:w="2400"/><w:gridCol w:w="2400"/></w:tblGrid>${tableRow(["Item", "Owner", "Due"])}${tableRow(["Contract", "Ana", "2026-11-03"])}${tableRow(["Hire", "Ben", "2026-12-01"])}</w:tbl>`,
    IMAGE_PARA,
  ].join("");
  return `${XML}<w:document xmlns:w="${NS_W}" xmlns:r="${NS_R}" xmlns:wp="${NS_WP}"><w:body>${body}</w:body></w:document>`;
}

const part = (name: string, text: string): ZipPart => ({ name, data: Buffer.from(text, "utf8") });

/** A DOCX with two headings, a bulleted and a numbered list, a 3x3 table without a header-row flag, and an image with alt text "Org chart". */
export function makeReportDocx(): Uint8Array {
  return writeZip([
    part("[Content_Types].xml", CONTENT_TYPES),
    part("_rels/.rels", ROOT_RELS),
    part("word/document.xml", reportDocumentXml()),
    part("word/styles.xml", STYLES),
    part("word/numbering.xml", NUMBERING),
    part("word/_rels/document.xml.rels", DOC_RELS),
    { name: "word/media/image1.png", data: onePixelPng() },
  ]);
}

/** A stored zip holding only [Content_Types].xml: no main document part. */
export function makeNoDocumentDocx(): Uint8Array {
  return writeZip([part("[Content_Types].xml", CONTENT_TYPES)]);
}

// ---------------------------------------------------------------- PDF

interface TextRun {
  x: number;
  y: number;
  size: number;
  bold?: boolean;
  str: string;
}
interface PageSpec {
  runs: TextRun[];
  /** Raw content-stream operators drawn before the text. */
  ops?: string;
  /** One 8x8 DeviceGray image XObject, drawn at the bottom left. */
  image?: boolean;
}

const WIN_ANSI: Record<string, number> = { "•": 0x95, "·": 0xb7, "–": 0x96 };

function pdfString(s: string): string {
  let out = "(";
  for (const ch of s) {
    const code = WIN_ANSI[ch] ?? ch.charCodeAt(0);
    if (ch === "(" || ch === ")" || ch === "\\") out += `\\${ch}`;
    else if (code > 126 || code < 32) out += `\\${code.toString(8).padStart(3, "0")}`;
    else out += ch;
  }
  return out + ")";
}

function pageStream(page: PageSpec): string {
  const lines: string[] = [];
  if (page.ops) lines.push(page.ops);
  if (page.image) lines.push("q 8 0 0 8 40 40 cm /Im1 Do Q");
  for (const r of page.runs) {
    lines.push(`BT /${r.bold ? "F2" : "F1"} ${r.size} Tf ${r.x} ${r.y} Td ${pdfString(r.str)} Tj ET`);
  }
  return lines.join("\n") + "\n";
}

interface PdfInfo {
  title?: string;
  author?: string;
  creationDate?: string;
}

function buildPdf(pages: PageSpec[], info?: PdfInfo): Uint8Array {
  // object numbers: 1 Catalog, 2 Pages, 3 F1, 4 F2, 5 Info, then per page: Page, Content, [Image]
  const objects: string[] = [];
  const kids: number[] = [];
  let next = 6;
  const pageObjs: string[] = [];
  for (const page of pages) {
    const pageNo = next++;
    const contentNo = next++;
    const imageNo = page.image ? next++ : 0;
    kids.push(pageNo);
    const stream = pageStream(page);
    const xobj = imageNo ? ` /XObject << /Im1 ${imageNo} 0 R >>` : "";
    pageObjs.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xobj} >> /Contents ${contentNo} 0 R >>`,
      `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}endstream`,
    );
    if (imageNo) {
      const hex = Array.from({ length: 64 }, (_, i) => ((i * 4) % 256).toString(16).padStart(2, "0")).join("") + ">";
      pageObjs.push(
        `<< /Type /XObject /Subtype /Image /Width 8 /Height 8 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /ASCIIHexDecode /Length ${hex.length} >>\nstream\n${hex}\nendstream`,
      );
    }
  }
  const infoEntries: string[] = [];
  if (info?.title) infoEntries.push(`/Title ${pdfString(info.title)}`);
  if (info?.author) infoEntries.push(`/Author ${pdfString(info.author)}`);
  if (info?.creationDate) infoEntries.push(`/CreationDate ${pdfString(info.creationDate)}`);
  objects.push(
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    `<< ${infoEntries.join(" ")} >>`,
    ...pageObjs,
  );
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, "latin1"));
}

/**
 * A 2-page PDF. Info: Title "Q4 status", Author "Ana Kim", CreationDate "D:20261001090000Z".
 * Page 1: "Q4 status" 24 pt, "Risks" 16 pt, 11 pt body lines, two bullets and a numbered item.
 * Page 2: "Timeline" 16 pt and a 3-column table drawn as positioned text (38 letters on the page).
 */
export function makeReportPdf(): Uint8Array {
  const page1: PageSpec = {
    runs: [
      { x: 72, y: 740, size: 24, bold: true, str: "Q4 status" },
      { x: 72, y: 700, size: 16, bold: true, str: "Risks" },
      { x: 72, y: 672, size: 11, str: "The vendor delay moves the launch by two weeks and the" },
      { x: 72, y: 658, size: 11, str: "hiring plan still depends on the signed contract." },
      { x: 72, y: 620, size: 11, str: "• Vendor delay" },
      { x: 72, y: 606, size: 11, str: "• Hiring" },
      { x: 72, y: 592, size: 11, str: "1. Sign contract" },
    ],
  };
  const page2: PageSpec = {
    runs: [
      { x: 72, y: 740, size: 16, bold: true, str: "Timeline" },
      { x: 72, y: 700, size: 11, str: "Item" },
      { x: 200, y: 700, size: 11, str: "Owner" },
      { x: 330, y: 700, size: 11, str: "Due" },
      { x: 72, y: 686, size: 11, str: "Sign contract" },
      { x: 200, y: 686, size: 11, str: "Ana Kim" },
      { x: 330, y: 686, size: 11, str: "2026-11-03" },
    ],
  };
  return buildPdf([page1, page2], { title: "Q4 status", author: "Ana Kim", creationDate: "D:20261001090000Z" });
}

const TEXT_PARAGRAPH = [
  "The quarterly review covers every open risk and each owner",
  "in plain words, so the page counts as real text.",
];

/**
 * A PDF of `pages` pages (no Info dictionary).
 * An image-only page has one 8x8 image and only its page number as text.
 * An outlined page draws its words as filled paths and carries as text only
 * "FormaPass · 2026-10-01 · N/M · +995 555 010 203 · 49.00 / 100%" (9 letters).
 * Every other page carries a paragraph of more than 25 letters.
 */
export function makeScannedPdf(spec: { pages: number; imageOnlyPages?: number[]; outlinedPages?: number[] }): Uint8Array {
  const imageOnly = new Set(spec.imageOnlyPages ?? []);
  const outlined = new Set(spec.outlinedPages ?? []);
  const pages: PageSpec[] = [];
  for (let n = 1; n <= spec.pages; n++) {
    if (imageOnly.has(n)) {
      pages.push({ image: true, runs: [{ x: 72, y: 30, size: 11, str: String(n) }] });
    } else if (outlined.has(n)) {
      pages.push({
        ops: "0 g 72 700 40 10 re f 120 700 30 10 re f 160 700 m 170 712 180 712 190 700 c 190 694 160 694 160 700 c f 200 700 60 10 re f",
        runs: [{ x: 72, y: 30, size: 11, str: `FormaPass · 2026-10-01 · ${n}/${spec.pages} · +995 555 010 203 · 49.00 / 100%` }],
      });
    } else {
      pages.push({ runs: TEXT_PARAGRAPH.map((str, i) => ({ x: 72, y: 700 - i * 14, size: 11, str })) });
    }
  }
  return buildPdf(pages);
}

/** "%PDF-1.4" followed by a fixed pseudo-random tail: not a readable PDF. */
export function makeBrokenPdf(): Uint8Array {
  const tail = Buffer.alloc(256);
  let s = 0x2545f491;
  for (let i = 0; i < tail.length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    tail[i] = s >>> 24;
  }
  return new Uint8Array(Buffer.concat([Buffer.from("%PDF-1.4\n", "latin1"), tail]));
}
