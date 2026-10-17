// Contract C1 — contract/S-02-page-parser (owner STORY-004-01). Frozen exports: the owner replaces the bodies
// and never renames or retypes an export. Consumers: STORY-003-07, 003-09, 004-02…004-06, 006-03, 006-04.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { compareCodeUnits } from "../core/compare.js";
import { isCalendarDate } from "../core/dates.js";
import { SOURCE_ID_PATTERN } from "../ingest/source-id.js";

export const CITATION_RE: RegExp = SOURCE_ID_PATTERN;

export interface PageFrontmatter {
  type: string | null;
  title: string | null;
  summary: string | null;
  aliases: string[];
  sources: string[];
  updated: string | null;
  data: Record<string, unknown>;
}
export interface PageSection {
  index: number;
  heading: string;
  level: number;
  line: number;
  endLine: number;
  parent: number | null;
  entity: boolean;
  text: string;
}
export interface TypedLink {
  key: string;
  value: string;
  targets: string[];
  line: number;
  section: number;
}
export type FactStatus = "decided" | "tentative";
export interface Fact {
  date: string;
  status: FactStatus;
  text: string;
  sources: string[];
  contradicts: string[];
  contradiction: boolean;
  line: number;
  section: number;
}
export interface WikiLink {
  target: string;
  line: number;
  section: number;
}
export interface PageError {
  line: number | null;
  code: "frontmatter_yaml" | "frontmatter_field" | "fact_status" | "fact_date";
  message: string;
}
export interface Page {
  path: string;
  title: string;
  frontmatter: PageFrontmatter;
  sections: PageSection[];
  typedLinks: TypedLink[];
  facts: Fact[];
  links: WikiLink[];
  wikilinks: string[];
  citations: string[];
  errors: PageError[];
}
export interface Entity {
  key: string;
  kind: "page" | "section";
  name: string;
  type: string | null;
  aliases: string[];
  path: string;
  section: number;
  line: number;
  summary: string | null;
  typedLinks: TypedLink[];
  facts: Fact[];
}
export interface Backlink {
  path: string;
  section: number;
  heading: string;
  line: number;
  context: string;
}


// ---------------------------------------------------------------------------------------------------------------
// Implementation

const HEADING_RE = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;
const FACT_RE = /^\s*[-*+]\s+(\d{4}-\d{2}-\d{2})\s+·\s+(\S+)\s+·\s+(.+)$/;
const DATED_ITEM_RE = /^\s*[-*+]\s+\d{4}-\d{2}-\d{2}(?:\s|$)/;
const TYPED_LINK_RE = /^\s*(?:[-*+]\s+)?([A-Za-z][A-Za-z0-9_-]*)::\s*(.*\S)\s*$/;
const WIKILINK_RE = /!?\[\[([^[\]\n]+?)\]\]/g;
const CONTRADICTS_SEP = " · contradicts::";

export function linkTarget(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^!?\[\[/, "").replace(/\]\]$/, "");
  const cut = s.search(/[|#]/);
  if (cut >= 0) s = s.slice(0, cut);
  s = s.replace(/\.md$/, "");
  return s.trim();
}

export function normalizeName(name: string): string {
  return name.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

function blankInlineCode(line: string): string {
  return line.replace(/`[^`]*`/g, (m) => " ".repeat(m.length));
}

function targetsIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(WIKILINK_RE)) {
    const t = linkTarget(m[1]!);
    if (t !== "") out.push(t);
  }
  return out;
}

function distinct(items: readonly string[]): string[] {
  return [...new Set(items)];
}

function emptyFrontmatter(): PageFrontmatter {
  return { type: null, title: null, summary: null, aliases: [], sources: [], updated: null, data: {} };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof Date);
}

function readFrontmatter(src: string, errors: PageError[]): PageFrontmatter {
  const fm = emptyFrontmatter();
  let raw: unknown;
  try {
    const doc = YAML.parseDocument(src);
    if (doc.errors.length > 0) {
      const e = doc.errors[0]!;
      const l = e.linePos?.[0]?.line;
      errors.push({ line: (l ?? 1) + 1, code: "frontmatter_yaml", message: `invalid frontmatter YAML: ${e.message}` });
      return fm;
    }
    raw = doc.toJS();
  } catch (err) {
    errors.push({ line: 1, code: "frontmatter_yaml", message: `invalid frontmatter YAML: ${(err as Error).message}` });
    return fm;
  }
  if (raw === null || raw === undefined) return fm;
  if (!isRecord(raw)) {
    errors.push({ line: 1, code: "frontmatter_field", message: "frontmatter must be a mapping" });
    return fm;
  }
  fm.data = raw;

  const bad = (key: string, want: string): void => {
    errors.push({ line: null, code: "frontmatter_field", message: `frontmatter field "${key}" must be ${want}` });
  };
  const str = (key: string): string | null => {
    const v = raw[key];
    if (v === undefined || v === null) return null;
    if (typeof v === "string") return v;
    bad(key, "a string or null");
    return null;
  };
  const list = (key: string, map: (s: string) => string): string[] => {
    const v = raw[key];
    if (v === undefined || v === null) return [];
    const items = Array.isArray(v) ? v : [v];
    const out: string[] = [];
    for (let item of items) {
      while (Array.isArray(item) && item.length === 1) item = item[0];
      if (typeof item !== "string") {
        bad(key, "a string or a list of strings");
        return [];
      }
      const s = map(item);
      if (s !== "") out.push(s);
    }
    return out;
  };

  fm.type = str("type");
  fm.title = str("title");
  fm.summary = str("summary");
  fm.aliases = list("aliases", (s) => s.trim());
  fm.sources = list("sources", linkTarget);
  const updated = raw["updated"];
  if (updated instanceof Date) fm.updated = Number.isNaN(updated.getTime()) ? null : updated.toISOString().slice(0, 10);
  else fm.updated = str("updated");
  return fm;
}

export function parsePage(text: string, relPath: string): Page {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const errors: PageError[] = [];
  let frontmatter = emptyFrontmatter();
  let bodyStart = 0; // index of the first body line

  if (lines[0]?.trimEnd() === "---") {
    let close = -1;
    for (let i = 1; i < lines.length; i++) {
      const l = lines[i]!.trimEnd();
      if (l === "---" || l === "...") {
        close = i;
        break;
      }
    }
    if (close < 0) {
      errors.push({ line: 1, code: "frontmatter_yaml", message: "frontmatter has no closing --- line" });
    } else {
      frontmatter = readFrontmatter(lines.slice(1, close).join("\n"), errors);
      bodyStart = close + 1;
    }
  }

  let lastIdx = lines.length - 1;
  if (lastIdx > bodyStart && lines[lastIdx] === "") lastIdx--;

  interface Draft {
    heading: string;
    level: number;
    line: number;
    parent: number | null;
    lines: string[];
  }
  const drafts: Draft[] = [{ heading: "", level: 0, line: bodyStart + 1, parent: null, lines: [] }];
  const typedLinks: TypedLink[] = [];
  const facts: Fact[] = [];
  const links: WikiLink[] = [];

  let fence: string | null = null;
  for (let idx = bodyStart; idx < lines.length; idx++) {
    const orig = lines[idx]!;
    const lineNo = idx + 1;
    let cur = drafts[drafts.length - 1]!;

    const fm = FENCE_RE.exec(orig);
    if (fence !== null) {
      cur.lines.push(orig);
      if (fm && fm[1]![0] === fence[0] && fm[1]!.length >= fence.length && /^\s*$/.test(orig.slice(fm[0].length))) fence = null;
      continue;
    }
    if (fm) {
      fence = fm[1]!;
      cur.lines.push(orig);
      continue;
    }

    const line = blankInlineCode(orig);
    const h = HEADING_RE.exec(orig);
    if (h) {
      const level = h[1]!.length;
      let parent: number | null = null;
      for (let i = drafts.length - 1; i >= 0; i--) {
        if (drafts[i]!.level < level) {
          parent = i;
          break;
        }
      }
      const heading = (h[2] ?? "").replace(/[ \t]+#+$/, "").replace(/^#+$/, "").trim();
      drafts.push({ heading, level, line: lineNo, parent, lines: [] });
      cur = drafts[drafts.length - 1]!;
    } else {
      cur.lines.push(orig);
      const section = drafts.length - 1;
      const f = FACT_RE.exec(line);
      if (f) {
        const [, date, status] = f as unknown as [string, string, string, string];
        const rest = orig.slice(orig.length - f[3]!.length);
        if (!isCalendarDate(date)) {
          errors.push({ line: lineNo, code: "fact_date", message: `fact has an impossible date "${date}"` });
        } else if (status !== "decided" && status !== "tentative") {
          errors.push({
            line: lineNo,
            code: "fact_status",
            message: `fact status "${status}" must be "decided" or "tentative"`,
          });
        } else {
          const restBlank = line.slice(line.length - f[3]!.length);
          const sep = restBlank.indexOf(CONTRADICTS_SEP);
          const textPart = (sep >= 0 ? rest.slice(0, sep) : rest).trim();
          const tail = sep >= 0 ? restBlank.slice(sep + CONTRADICTS_SEP.length) : "";
          const contradicts = distinct(targetsIn(tail));
          facts.push({
            date,
            status,
            text: textPart,
            sources: distinct(targetsIn(blankInlineCode(textPart))).filter((t) => CITATION_RE.test(t)),
            contradicts,
            contradiction: sep >= 0,
            line: lineNo,
            section,
          });
        }
      } else if (DATED_ITEM_RE.test(line)) {
        errors.push({
          line: lineNo,
          code: "fact_status",
          message: "list item starts with a date but is not `- YYYY-MM-DD · decided|tentative · text`",
        });
      } else {
        const t = TYPED_LINK_RE.exec(line);
        if (t) {
          const start = line.indexOf("::") + 2;
          typedLinks.push({
            key: t[1]!.toLowerCase(),
            value: orig.slice(start).trim(),
            targets: targetsIn(line.slice(start)),
            line: lineNo,
            section,
          });
        }
      }
    }
    const section = drafts.length - 1;
    for (const target of targetsIn(line)) links.push({ target, line: lineNo, section });
  }

  const entityOwners = new Set<number>();
  for (const t of typedLinks) if ((t.key === "type" || t.key === "aliases") && drafts[t.section]!.level >= 2) entityOwners.add(t.section);

  const sections: PageSection[] = drafts.map((d, index) => {
    const next = drafts[index + 1];
    const endLine = Math.max(d.line, next ? next.line - 1 : lastIdx + 1);
    return {
      index,
      heading: d.heading,
      level: d.level,
      line: d.line,
      endLine,
      parent: d.parent,
      entity: entityOwners.has(index),
      text: d.lines.join("\n"),
    };
  });

  const wikilinks = distinct(links.map((l) => l.target));
  const firstH1 = sections.find((s) => s.level === 1 && s.heading !== "");
  const base = relPath.split("/").pop()!.replace(/\.md$/, "");
  return {
    path: relPath,
    title: frontmatter.title ?? firstH1?.heading ?? base,
    frontmatter,
    sections,
    typedLinks,
    facts,
    links,
    wikilinks,
    citations: wikilinks.filter((w) => CITATION_RE.test(w)),
    errors,
  };
}

export function owningEntityKey(page: Page, section: number): string {
  let s: number | null = section;
  while (s !== null && s >= 0 && s < page.sections.length) {
    const sec: PageSection = page.sections[s]!;
    if (sec.entity) return `${page.path}#L${sec.line}`;
    s = sec.parent;
  }
  return page.path;
}

function splitAliases(value: string): string[] {
  return value
    .split(",")
    .map((a) => a.trim().replace(/^\[\[(.*)\]\]$/, "$1").trim())
    .filter((a) => a !== "");
}

export function pageEntities(page: Page): Entity[] {
  const owned = (key: string) => ({
    typedLinks: page.typedLinks.filter((t) => owningEntityKey(page, t.section) === key),
    facts: page.facts.filter((f) => owningEntityKey(page, f.section) === key),
  });
  const entities: Entity[] = [
    {
      key: page.path,
      kind: "page",
      name: page.title,
      type: page.frontmatter.type,
      aliases: [...page.frontmatter.aliases],
      path: page.path,
      section: 0,
      line: page.sections[0]?.line ?? 1,
      summary: page.frontmatter.summary,
      ...owned(page.path),
    },
  ];
  for (const sec of page.sections) {
    if (!sec.entity) continue;
    const key = `${page.path}#L${sec.line}`;
    const own = page.typedLinks.filter((t) => t.section === sec.index);
    const type = own.find((t) => t.key === "type");
    const summary = own.find((t) => t.key === "summary");
    entities.push({
      key,
      kind: "section",
      name: sec.heading,
      type: type ? type.value.toLowerCase() : null,
      aliases: own.filter((t) => t.key === "aliases").flatMap((t) => splitAliases(t.value)),
      path: page.path,
      section: sec.index,
      line: sec.line,
      summary: summary ? summary.value : null,
      ...owned(key),
    });
  }
  return entities;
}

async function walk(dir: string, prefix: string, out: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const rel = prefix === "" ? e.name : `${prefix}/${e.name}`;
    if (e.isDirectory()) await walk(path.join(dir, e.name), rel, out);
    else if (e.isFile() && e.name.endsWith(".md")) out.push(rel);
  }
}

export async function listPageFiles(pagesDir: string): Promise<string[]> {
  const out: string[] = [];
  try {
    await walk(pagesDir, "", out);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT" && out.length === 0) return [];
    throw err;
  }
  return out.sort(compareCodeUnits);
}

export async function loadPages(pagesDir: string): Promise<Page[]> {
  const files = await listPageFiles(pagesDir);
  const pages: Page[] = [];
  for (const rel of files) {
    const text = await readFile(path.join(pagesDir, ...rel.split("/")), "utf8");
    pages.push(parsePage(text, rel));
  }
  return pages;
}

function lineOf(page: Page, link: WikiLink): string {
  const sec = page.sections[link.section]!;
  if (link.section > 0 && link.line === sec.line) return `${"#".repeat(sec.level)} ${sec.heading}`;
  const first = link.section === 0 ? sec.line : sec.line + 1;
  return sec.text.split("\n")[link.line - first] ?? "";
}

export function buildBacklinks(pages: readonly Page[]): Map<string, Backlink[]> {
  const map = new Map<string, Backlink[]>();
  for (const page of pages) {
    for (const link of page.links) {
      const key = normalizeName(link.target);
      const list = map.get(key) ?? [];
      list.push({
        path: page.path,
        section: link.section,
        heading: page.sections[link.section]!.heading,
        line: link.line,
        context: lineOf(page, link).trim().slice(0, 160),
      });
      map.set(key, list);
    }
  }
  for (const list of map.values()) list.sort((a, b) => compareCodeUnits(a.path, b.path) || a.line - b.line);
  return map;
}
